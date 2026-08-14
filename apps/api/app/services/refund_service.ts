import { Exception } from "@adonisjs/core/exceptions";
import emitter from "@adonisjs/core/services/emitter";
import lock from "@adonisjs/lock/services/main";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import * as Sentry from "@sentry/node";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import { ResourceConflictException } from "#exceptions/domain_exceptions";
import Order from "#models/order";
import OrderLineItem from "#models/order_line_item";
import OrderNote from "#models/order_note";
import OrderRefund from "#models/order_refund";
import OrderRefundLineItem from "#models/order_refund_line_item";
import type User from "#models/user";
import InventoryService from "#services/inventory_service";
import { orderStateMachine } from "#services/order_state_machine";
import { paymentService } from "#services/payment_service";
import { withTenantTransaction } from "#services/tenant_context";

export interface RefundLineItemInput {
    orderLineItemId: number | bigint;
    quantity: number;
    refundAmountMinor?: number | null;
    refundTaxMinor?: number | null;
}

export interface RefundInput {
    amountMinor?: number | null;
    lineItems?: RefundLineItemInput[] | null;
    reason?: string | null;
    restockRequested?: boolean;
}

export interface RefundCreateOptions {
    actor?: User | null;
    idempotencyKey?: string | null;
}

interface ComparableRefundLine {
    orderLineItemId: number;
    quantity: number;
    refundAmountMinor: number;
    refundTaxMinor: number;
}

/**
 * Issues refunds against an existing order. Every mutation runs inside a single transaction:
 *
 *  1. `SELECT … FOR UPDATE` on the order (so two parallel refund requests serialize).
 *  2. Idempotency-Key short-circuit — if a refund row with `(order_id, idempotency_key)` already
 *     exists, return it only when the replay payload is semantically identical; otherwise fail 409.
 *  3. Validate the request body: `amount_minor` XOR `line_items[]`, both > 0, both ≤ outstanding.
 *  4. Allocate the refund_number from `refund_number_seq`.
 *  5. Insert `order_refunds` + (optionally) `order_refund_line_items` rows.
 *  6. If `restock_requested` → call {@link InventoryService.increment} per explicitly refunded line.
 *  7. PSP refund hook — `paymentService.refund()` dispatches to the gateway adapter; failures are
 *     recorded as bounded status codes on `attributes.gateway_refund` but do not block booking.
 *  8. If `sum(refunds.amount_minor) >= order.grand_total` → transition the order to `refunded`.
 *  9. Append an internal audit note (`"Refund #{number} for {amount} {currency}. Reason: {reason}"`).
 * 10. Commit, then emit `order:refunded` exactly once for a newly-created refund.
 */
export class RefundService {
    constructor(private readonly inventory = new InventoryService()) {}

    async create(orderId: number | bigint, payload: RefundInput, opts: RefundCreateOptions = {}): Promise<OrderRefund> {
        const numericOrderId = Number(orderId);
        if (!Number.isFinite(numericOrderId)) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }

        const idempotencyKey = opts.idempotencyKey?.trim() || null;
        if (idempotencyKey && idempotencyKey.length > 64) {
            throw new Exception("Idempotency-Key must be at most 64 characters", {
                status: 422,
                code: "E_REFUND_IDEMPOTENCY_KEY_INVALID",
            });
        }
        const normalizedOpts: RefundCreateOptions = { ...opts, idempotencyKey };

        /**
         * Order-scoped distributed lock. Serialises concurrent admin refunds AND any in-flight
         * `payment_service.verifyCallback` on the same order. The DB-level `FOR UPDATE` row lock
         * inside the transaction still applies (defence-in-depth); this lock gives a faster fail
         * path with a 409 instead of blocking on a transaction queue.
         */
        const [acquired, value] = await lock
            .createLock(`order:${numericOrderId}`, "30s")
            .runImmediately(() => this.createInsideLock(numericOrderId, payload, normalizedOpts));
        if (!acquired) {
            throw new ResourceConflictException("order is being processed concurrently", {
                resource: "orders",
                id: numericOrderId,
                code: "E_CONCURRENT_PROCESSING",
            });
        }
        const { refund, customerId, created } = value;

        /** Fire after commit only for the first booking; retries must not duplicate side effects. */
        if (created) {
            await emitter.emit("order:refunded", {
                tenantId: Number(refund.tenantId),
                orderId: Number(refund.orderId),
                refundId: Number(refund.id),
                amountMinor: Number(refund.amountMinor),
                customerId,
            });
        }

        return refund;
    }

    /**
     * The inner half of `create`, run inside both the per-order `@adonisjs/lock` mutex and the
     * Lucid transaction. Pulled out so the public `create` keeps the lock + post-commit emit
     * shell readable.
     */
    private async createInsideLock(
        numericOrderId: number,
        payload: RefundInput,
        opts: RefundCreateOptions,
    ): Promise<{ refund: OrderRefund; customerId: number | null; created: boolean }> {
        return withTenantTransaction(async (trx) => {
            /** Row-lock the order — concurrent refunds on the same order serialize here. */
            const orderRow = await trx.from("orders").where("id", numericOrderId).forUpdate().first();
            if (!orderRow) {
                throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
            }
            const order = await Order.findOrFail(numericOrderId, { client: trx });

            if (opts.idempotencyKey) {
                const existing = await OrderRefund.query({ client: trx })
                    .where("order_id", numericOrderId)
                    .where("idempotency_key", opts.idempotencyKey)
                    .first();
                if (existing) {
                    await existing.load("lineItems");
                    this.assertIdempotentReplayMatches(existing, payload);
                    return {
                        refund: existing,
                        customerId: order.customerId === null || order.customerId === undefined ? null : Number(order.customerId),
                        created: false,
                    };
                }
            }

            this.assertOrderRefundable(order);

            const amountInput = payload.amountMinor;
            const hasAmount = amountInput !== undefined && amountInput !== null;
            const hasLines = (payload.lineItems?.length ?? 0) > 0;
            if (hasAmount === hasLines) {
                throw new Exception("Refund body must contain either amount_minor or line_items, never both", {
                    status: 422,
                    code: "E_REFUND_INPUT_INVALID",
                });
            }
            if (payload.restockRequested && !hasLines) {
                throw new Exception("Restocking requires line_items so inventory quantities are explicit", {
                    status: 422,
                    code: "E_REFUND_RESTOCK_REQUIRES_LINES",
                });
            }
            if (hasAmount && !Number.isSafeInteger(amountInput)) {
                throw new Exception("Refund amount must be an integer minor-unit value", {
                    status: 422,
                    code: "E_REFUND_AMOUNT_INVALID",
                });
            }

            const priorTotal = await this.sumPriorRefundAmount(numericOrderId, trx);
            const grandTotal = Number(order.grandTotal);
            const outstanding = grandTotal - priorTotal;
            if (outstanding <= 0) {
                throw new Exception("Order has no remaining outstanding to refund", {
                    status: 422,
                    code: "E_REFUND_FULLY_REFUNDED",
                });
            }

            const lineInputs = hasLines ? (payload.lineItems as RefundLineItemInput[]) : [];
            if (hasLines) {
                await this.validateLineQuantities(numericOrderId, lineInputs, trx);
            }
            const resolvedAmount = hasAmount ? amountInput : this.sumLineAmounts(lineInputs);

            if (resolvedAmount <= 0) {
                throw new Exception("Refund amount must be positive", {
                    status: 422,
                    code: "E_REFUND_AMOUNT_NONPOSITIVE",
                });
            }
            if (resolvedAmount > outstanding) {
                throw new Exception(`Refund exceeds remaining outstanding (${outstanding})`, {
                    status: 422,
                    code: "E_REFUND_EXCEEDS_OUTSTANDING",
                });
            }

            let lineTaxTotal = 0;
            for (const line of lineInputs) {
                lineTaxTotal += Number(line.refundTaxMinor ?? 0);
            }

            const refundNumber = await this.allocateRefundNumber(trx);
            const refund = new OrderRefund();
            refund.useTransaction(trx);
            refund.orderId = order.id;
            refund.refundNumber = refundNumber;
            refund.amountMinor = resolvedAmount;
            refund.taxAmountMinor = lineTaxTotal;
            refund.reason = payload.reason ?? null;
            refund.refundedByUserId = opts.actor?.id ?? null;
            refund.restockRequested = payload.restockRequested ?? false;
            refund.gatewayRefundId = null;
            refund.idempotencyKey = opts.idempotencyKey ?? null;
            refund.processedAt = DateTime.utc();
            refund.attributes = {};
            await refund.save();

            if (hasLines) {
                for (const line of lineInputs) {
                    await this.writeRefundLine(trx, refund.id, line);
                }
            }

            if (refund.restockRequested) {
                await this.restock(refund.id, numericOrderId, lineInputs, trx);
            }

            await this.callGatewayRefund(order, refund, trx);

            const newPriorTotal = priorTotal + resolvedAmount;
            const fullyRefunded = newPriorTotal >= grandTotal;
            if (fullyRefunded) {
                await orderStateMachine.transition(order, OrderStatus.Refunded, {
                    actor: opts.actor ?? null,
                    reason: `Refund #${refundNumber}`,
                    trx,
                });
            }

            await this.writeAuditNote(trx, order, refund);

            return {
                refund,
                customerId: order.customerId === null || order.customerId === undefined ? null : Number(order.customerId),
                created: true,
            };
        });
    }

    /**
     * An idempotency key names one logical request, not merely one refund row. Reusing the same
     * key with a different amount, reason, restock flag, or line allocation must fail closed;
     * otherwise a caller can receive a 201 response for a refund different from the payload it
     * just sent. Existing rows are compared directly so this also protects refunds created before
     * this invariant was introduced, without a schema migration or stored request fingerprint.
     */
    private assertIdempotentReplayMatches(existing: OrderRefund, payload: RefundInput): void {
        const requestedLines = this.comparableRequestedLines(payload.lineItems ?? []);
        const existingLines = this.comparableExistingLines(existing.lineItems ?? []);
        const requestedHasAmount = payload.amountMinor !== undefined && payload.amountMinor !== null;
        const existingIsAmountOnly = existingLines.length === 0;
        const sameReason = (existing.reason ?? null) === (payload.reason ?? null);
        const sameRestock = Boolean(existing.restockRequested) === Boolean(payload.restockRequested ?? false);

        let matches = sameReason && sameRestock;
        if (requestedHasAmount) {
            matches =
                matches &&
                existingIsAmountOnly &&
                requestedLines.length === 0 &&
                Number(existing.amountMinor) === Number(payload.amountMinor);
        } else {
            matches = matches && !existingIsAmountOnly && this.sameComparableLines(existingLines, requestedLines);
        }

        if (!matches) {
            throw new Exception("Idempotency-Key was already used with a different refund payload", {
                status: 409,
                code: "E_REFUND_IDEMPOTENCY_MISMATCH",
            });
        }
    }

    private comparableRequestedLines(lines: RefundLineItemInput[]): ComparableRefundLine[] {
        return lines
            .map((line) => ({
                orderLineItemId: Number(line.orderLineItemId),
                quantity: Number(line.quantity),
                refundAmountMinor: Number(line.refundAmountMinor ?? 0),
                refundTaxMinor: Number(line.refundTaxMinor ?? 0),
            }))
            .sort((a, b) => a.orderLineItemId - b.orderLineItemId);
    }

    private comparableExistingLines(lines: OrderRefundLineItem[]): ComparableRefundLine[] {
        return lines
            .map((line) => ({
                orderLineItemId: Number(line.orderLineItemId),
                quantity: Number(line.quantity),
                refundAmountMinor: Number(line.refundAmountMinor),
                refundTaxMinor: Number(line.refundTaxMinor),
            }))
            .sort((a, b) => a.orderLineItemId - b.orderLineItemId);
    }

    private sameComparableLines(left: ComparableRefundLine[], right: ComparableRefundLine[]): boolean {
        if (left.length !== right.length || left.length === 0) return false;
        return left.every((line, index) => {
            const other = right[index];
            return (
                other !== undefined &&
                line.orderLineItemId === other.orderLineItemId &&
                line.quantity === other.quantity &&
                line.refundAmountMinor === other.refundAmountMinor &&
                line.refundTaxMinor === other.refundTaxMinor
            );
        });
    }

    /**
     * Sum every prior refund's `amount_minor` for the given order (uses raw SUM so we don't load
     * rows just to count their total). Called inside the same transaction as the new refund so the
     * tally reflects the locked state.
     */
    private async sumPriorRefundAmount(orderId: number, trx: TransactionClientContract): Promise<number> {
        const row = (await trx.from("order_refunds").where("order_id", orderId).sum({ sum: "amount_minor" }).first()) as
            | { sum: string | number | null }
            | undefined;
        return Number(row?.sum ?? 0);
    }

    /** Sum the explicit money allocation declared for a line-item refund. */
    private sumLineAmounts(lines: RefundLineItemInput[]): number {
        let sum = 0;
        for (const line of lines) {
            sum += Number(line.refundAmountMinor ?? 0);
        }
        return sum;
    }

    /**
     * For each refunded line, verify it belongs to the order, appears only once in this request,
     * carries integer minor-unit values, and does not exceed the remaining refundable quantity.
     */
    private async validateLineQuantities(
        orderId: number,
        lines: RefundLineItemInput[],
        trx: TransactionClientContract,
    ): Promise<void> {
        const seenLineIds = new Set<number>();
        for (const requested of lines) {
            const sourceId = Number(requested.orderLineItemId);
            if (!Number.isSafeInteger(sourceId) || sourceId <= 0) {
                throw new Exception("Refund line item id must be a positive integer", {
                    status: 422,
                    code: "E_REFUND_LINE_INVALID",
                });
            }
            if (seenLineIds.has(sourceId)) {
                throw new Exception(`Line item ${sourceId} appears more than once in the same refund`, {
                    status: 422,
                    code: "E_REFUND_LINE_DUPLICATE",
                });
            }
            seenLineIds.add(sourceId);

            if (!Number.isSafeInteger(requested.quantity) || requested.quantity <= 0) {
                throw new Exception("Refund quantity must be a positive integer", {
                    status: 422,
                    code: "E_REFUND_LINE_QUANTITY_INVALID",
                });
            }
            if (
                requested.refundAmountMinor !== undefined &&
                requested.refundAmountMinor !== null &&
                (!Number.isSafeInteger(requested.refundAmountMinor) || requested.refundAmountMinor < 0)
            ) {
                throw new Exception("refund_amount_minor must be a non-negative integer minor-unit value", {
                    status: 422,
                    code: "E_REFUND_LINE_AMOUNT_INVALID",
                });
            }
            if (
                requested.refundTaxMinor !== undefined &&
                requested.refundTaxMinor !== null &&
                (!Number.isSafeInteger(requested.refundTaxMinor) || requested.refundTaxMinor < 0)
            ) {
                throw new Exception("refund_tax_minor must be a non-negative integer minor-unit value", {
                    status: 422,
                    code: "E_REFUND_LINE_AMOUNT_INVALID",
                });
            }

            const source = await OrderLineItem.query({ client: trx }).where("id", sourceId).where("order_id", orderId).first();
            if (!source) {
                throw new Exception(`Line item ${sourceId} does not belong to this order`, {
                    status: 422,
                    code: "E_REFUND_LINE_INVALID",
                });
            }
            const priorRow = (await trx
                .from("order_refund_line_items as rli")
                .innerJoin("order_refunds as r", "r.id", "rli.refund_id")
                .where("r.order_id", orderId)
                .where("rli.order_line_item_id", sourceId)
                .sum({ sum: "rli.quantity" })
                .first()) as { sum: string | number | null } | undefined;
            const priorQuantity = Number(priorRow?.sum ?? 0);
            const remaining = source.quantity - priorQuantity;
            if (requested.quantity > remaining) {
                throw new Exception(`Refund quantity ${requested.quantity} exceeds remaining ${remaining} for line ${sourceId}`, {
                    status: 422,
                    code: "E_REFUND_LINE_QUANTITY_EXCEEDS",
                });
            }
        }
    }

    private async writeRefundLine(
        trx: TransactionClientContract,
        refundId: bigint | number,
        line: RefundLineItemInput,
    ): Promise<void> {
        const row = new OrderRefundLineItem();
        row.useTransaction(trx);
        row.refundId = refundId;
        row.orderLineItemId = line.orderLineItemId;
        row.quantity = line.quantity;
        row.refundAmountMinor = Number(line.refundAmountMinor ?? 0);
        row.refundTaxMinor = Number(line.refundTaxMinor ?? 0);
        await row.save();
    }

    /**
     * Restock loop. A restock is always line-item-scoped: amount-only refunds have no inventory
     * quantity mapping and are rejected before this method is reached.
     */
    private async restock(
        refundId: bigint | number,
        orderId: number,
        lines: RefundLineItemInput[],
        trx: TransactionClientContract,
    ): Promise<void> {
        const sources = await Promise.all(
            lines.map(async (line) => ({
                line: await OrderLineItem.query({ client: trx })
                    .where("id", Number(line.orderLineItemId))
                    .where("order_id", orderId)
                    .first(),
                quantity: line.quantity,
            })),
        );

        for (const entry of sources) {
            const sourceLine = entry.line;
            if (!sourceLine?.productId) continue;
            await this.inventory.increment(
                {
                    productId: sourceLine.productId,
                    variationId: sourceLine.variationId,
                },
                entry.quantity,
                { kind: "refund", id: Number(refundId) },
                trx,
            );
        }
    }

    /**
     * PSP refund hook. Looks up the order's verified `payment_attempts` row and calls the
     * adapter's `refund()`. On success, persists the PSP-side identifier in
     * `refund.gateway_refund_id`. Provider failures are represented by bounded codes only; raw
     * diagnostics go to Sentry and never enter the refund row where they could later leak through
     * an unrelated administrative/debug surface.
     *
     * Failures are intentionally NOT re-thrown — for cod / bank_transfer orders there's no PSP to
     * refund against, and for redirect gateways an offline reconcile is expected when the PSP is
     * unreachable. Callers see the ledger booking either way and the Admin transformer projects a
     * `manual_action_required` settlement state.
     */
    private async callGatewayRefund(order: Order, refund: OrderRefund, trx: TransactionClientContract): Promise<void> {
        try {
            const result = await paymentService.refund(order, Number(refund.amountMinor), refund.reason ?? undefined);
            refund.useTransaction(trx);
            if (result.ok && result.gateway_refund_id) {
                refund.gatewayRefundId = result.gateway_refund_id;
                refund.attributes = {
                    ...((refund.attributes as Record<string, unknown>) ?? {}),
                    gateway_refund: { ok: true, gateway_refund_id: result.gateway_refund_id },
                };
            } else {
                refund.attributes = {
                    ...((refund.attributes as Record<string, unknown>) ?? {}),
                    gateway_refund: { ok: false, error_code: result.error_code ?? "unknown" },
                };
                Sentry.captureMessage("refund_psp_returned_failure", {
                    level: "warning",
                    tags: {
                        order_id: String(order.id),
                        refund_id: String(refund.id),
                        error_code: result.error_code ?? "unknown",
                    },
                    extra: { error_message: result.error_message },
                });
            }
            await refund.save();
        } catch (error) {
            refund.useTransaction(trx);
            refund.attributes = {
                ...((refund.attributes as Record<string, unknown>) ?? {}),
                gateway_refund: { ok: false, error_code: "exception" },
            };
            await refund.save();
            Sentry.captureException(error, {
                tags: { order_id: String(order.id), refund_id: String(refund.id), phase: "gateway_refund" },
            });
        }
    }

    private async writeAuditNote(trx: TransactionClientContract, order: Order, refund: OrderRefund): Promise<void> {
        const reasonSuffix = refund.reason ? ` Reason: ${refund.reason}.` : "";
        const note = new OrderNote();
        note.useTransaction(trx);
        note.orderId = order.id;
        note.body = `Refund #${refund.refundNumber} for ${Number(refund.amountMinor)} ${order.currencyDisplay}.${reasonSuffix}`;
        note.visibility = "internal";
        note.authorUserId = refund.refundedByUserId ?? null;
        note.attributes = { source: "refund_service", refund_id: Number(refund.id) };
        await note.save();
    }

    private async allocateRefundNumber(trx: TransactionClientContract): Promise<number> {
        const result = (await trx.rawQuery("SELECT nextval('refund_number_seq') as next")) as {
            rows?: Array<{ next: unknown }>;
        };
        return Number(result.rows?.[0]?.next ?? 0);
    }

    private assertOrderRefundable(order: Order): void {
        const status = order.status;
        if (status === OrderStatus.Refunded) {
            throw new Exception("Order is already fully refunded", {
                status: 409,
                code: "E_ORDER_ALREADY_REFUNDED",
            });
        }
        if (status === OrderStatus.Draft || status === OrderStatus.Cancelled || status === OrderStatus.Failed) {
            throw new Exception(`Cannot refund order in status '${status}'`, {
                status: 409,
                code: "E_ORDER_NOT_REFUNDABLE",
            });
        }
    }
}

export const refundService = new RefundService();

declare module "@adonisjs/core/types" {
    interface EventsList {
        "order:refunded": { tenantId: number; orderId: number; refundId: number; amountMinor: number; customerId: number | null };
    }
}
