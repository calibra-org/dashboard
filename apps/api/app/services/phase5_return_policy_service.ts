import { Exception } from "@adonisjs/core/exceptions";

import { OrderStatus } from "#enums/order_status";
import type User from "#models/user";
import { RefundService } from "#services/refund_service";
import { currentTrx } from "#services/tenant_context";

interface ReturnItemInput {
    order_line_item_id: number;
    quantity: number;
    reason?: string | null;
    refund_amount_minor?: number | null;
}

interface ReturnCreateInput {
    items: ReturnItemInput[];
    reason?: string | null;
    customer_note?: string | null;
    internal_note?: string | null;
    carrier?: string | null;
    tracking_number?: string | null;
}

interface ReturnRefundInput {
    expected_version: number;
    reason?: string | null;
}

function numberValue(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function prorate(total: number, quantity: number, sourceQuantity: number): number {
    if (sourceQuantity <= 0 || quantity <= 0 || total <= 0) return 0;
    return Math.floor((total * quantity) / sourceQuantity);
}

/**
 * Return/RMA policy that sits in front of the generic Phase 5 persistence service.
 *
 * Physical returnability is based on delivered quantity, not merely sold quantity. Historical
 * completed/refunded orders created before the fulfillment ledger existed are treated as delivered
 * only when they have no fulfillment rows at all. Financial defaults are derived server-side from
 * immutable order-line snapshots so the Admin UI never has to invent refund money.
 */
export class Phase5ReturnPolicyService {
    constructor(private readonly refunds = new RefundService()) {}

    async prepareCreate(
        orderId: number,
        input: ReturnCreateInput,
        idempotencyKey?: string | null,
    ): Promise<ReturnCreateInput> {
        const trx = currentTrx();
        const order = await trx.from("orders").where("id", orderId).whereNull("deleted_at").first();
        if (!order) throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });

        const lineIds = input.items.map((item) => Number(item.order_line_item_id));
        const lines = await trx
            .from("order_line_items")
            .where("order_id", orderId)
            .whereIn("id", lineIds)
            .select("id", "quantity", "total", "total_tax");
        if (lines.length !== lineIds.length) {
            throw new Exception("Return contains a line outside the order", { status: 422, code: "E_RETURN_LINE_INVALID" });
        }

        const fulfillmentCount = await trx.from("order_fulfillments").where("order_id", orderId).count("id as total").first();
        const deliveredRows = await trx
            .from("order_fulfillment_items as item")
            .join("order_fulfillments as fulfillment", "fulfillment.id", "item.fulfillment_id")
            .where("fulfillment.order_id", orderId)
            .where("fulfillment.status", "delivered")
            .whereIn("item.order_line_item_id", lineIds)
            .groupBy("item.order_line_item_id")
            .select("item.order_line_item_id")
            .sum("item.quantity as delivered_quantity");
        const delivered = new Map(deliveredRows.map((row) => [Number(row.order_line_item_id), numberValue(row.delivered_quantity)]));

        let priorQuery = trx
            .from("order_return_items as item")
            .join("order_returns as return_record", "return_record.id", "item.return_id")
            .where("return_record.order_id", orderId)
            .whereNot("return_record.status", "cancelled")
            .whereIn("item.order_line_item_id", lineIds);
        const normalizedKey = idempotencyKey?.trim() || null;
        if (normalizedKey) {
            priorQuery = priorQuery.where((query) => {
                query.whereNull("return_record.idempotency_key").orWhereNot("return_record.idempotency_key", normalizedKey);
            });
        }
        const priorRows = await priorQuery
            .groupBy("item.order_line_item_id")
            .select("item.order_line_item_id")
            .sum("item.requested_quantity as returned_quantity");
        const alreadyReturned = new Map(
            priorRows.map((row) => [Number(row.order_line_item_id), numberValue(row.returned_quantity)]),
        );

        const noFulfillmentHistory = numberValue(fulfillmentCount?.total) === 0;
        const legacyDelivered =
            noFulfillmentHistory && (order.status === OrderStatus.Completed || order.status === OrderStatus.Refunded);

        const enriched = input.items.map((item) => {
            const line = lines.find((candidate) => Number(candidate.id) === Number(item.order_line_item_id));
            if (!line) throw new Exception("Return line not found", { status: 422, code: "E_RETURN_LINE_INVALID" });
            const soldQuantity = numberValue(line.quantity);
            const deliveredQuantity = legacyDelivered ? soldQuantity : delivered.get(Number(line.id)) ?? 0;
            const remainingReturnable = Math.max(0, deliveredQuantity - (alreadyReturned.get(Number(line.id)) ?? 0));
            if (item.quantity > remainingReturnable) {
                throw new Exception("Return quantity exceeds delivered returnable quantity", {
                    status: 409,
                    code: "E_RETURN_EXCEEDS_DELIVERED",
                });
            }

            const grossLineTotal = numberValue(line.total) + numberValue(line.total_tax);
            const maximumRefund = prorate(grossLineTotal, item.quantity, soldQuantity);
            const requestedRefund = item.refund_amount_minor;
            if (requestedRefund !== undefined && requestedRefund !== null && requestedRefund > maximumRefund) {
                throw new Exception("Return refund amount exceeds the sold line value", {
                    status: 422,
                    code: "E_RETURN_REFUND_AMOUNT_EXCEEDS_LINE",
                });
            }
            return {
                ...item,
                refund_amount_minor: requestedRefund ?? maximumRefund,
            };
        });

        return { ...input, items: enriched };
    }

    async refundReceivedReturn(id: number, input: ReturnRefundInput, actor: User): Promise<void> {
        const trx = currentTrx();
        const row = await trx.from("order_returns").where("id", id).forUpdate().first();
        if (!row) throw new Exception("Return not found", { status: 404, code: "E_RETURN_NOT_FOUND" });
        if (Number(row.version) !== input.expected_version) {
            throw new Exception("Resource changed by another operator", { status: 409, code: "E_RETURN_VERSION_CONFLICT" });
        }
        if (row.refund_id) return;
        if (row.status !== "received") {
            throw new Exception("Only received returns can be refunded", { status: 422, code: "E_RETURN_REFUND_STATE" });
        }

        const items = await trx.from("order_return_items").where("return_id", id).orderBy("id", "asc");
        const lineIds = items.map((item) => Number(item.order_line_item_id));
        const sourceLines = await trx
            .from("order_line_items")
            .where("order_id", row.order_id)
            .whereIn("id", lineIds)
            .select("id", "quantity", "total", "total_tax");

        const lineItems = items
            .filter((item) => numberValue(item.received_quantity) > 0)
            .map((item) => {
                const source = sourceLines.find((line) => Number(line.id) === Number(item.order_line_item_id));
                if (!source) {
                    throw new Exception("Return source line is missing", { status: 409, code: "E_RETURN_SOURCE_LINE_MISSING" });
                }
                const received = numberValue(item.received_quantity);
                const requested = Math.max(1, numberValue(item.requested_quantity));
                const soldQuantity = Math.max(1, numberValue(source.quantity));
                const storedGross = numberValue(item.refund_amount_minor);
                const gross =
                    storedGross > 0
                        ? prorate(storedGross, received, requested)
                        : prorate(numberValue(source.total) + numberValue(source.total_tax), received, soldQuantity);
                const tax = prorate(numberValue(source.total_tax), received, soldQuantity);
                if (gross <= 0) {
                    throw new Exception("Return refund amount is not positive", {
                        status: 422,
                        code: "E_RETURN_REFUND_AMOUNT_INVALID",
                    });
                }
                return {
                    orderLineItemId: Number(item.order_line_item_id),
                    quantity: received,
                    refundAmountMinor: gross,
                    refundTaxMinor: Math.min(tax, gross),
                };
            });
        if (lineItems.length === 0) {
            throw new Exception("Return has no received quantity to refund", { status: 422, code: "E_RETURN_REFUND_EMPTY" });
        }

        const refund = await this.refunds.create(
            Number(row.order_id),
            {
                lineItems,
                reason: input.reason ?? String(row.reason ?? "Return refund"),
                restockRequested: false,
            },
            { actor, idempotencyKey: `rma:${id}:refund` },
        );
        await trx
            .from("order_returns")
            .where("id", id)
            .update({
                refund_id: refund.id,
                status: "completed",
                completed_at: new Date(),
                version: Number(row.version) + 1,
                updated_at: new Date(),
            });
    }
}

export const phase5ReturnPolicyService = new Phase5ReturnPolicyService();
