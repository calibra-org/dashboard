import { createHash } from "node:crypto";

import { Exception } from "@adonisjs/core/exceptions";
import lock from "@adonisjs/lock/services/main";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import type User from "#models/user";
import InventoryService from "#services/inventory_service";
import { orderStateMachine } from "#services/order_state_machine";
import { RefundService } from "#services/refund_service";
import { currentTrx } from "#services/tenant_context";

interface FulfillmentItemInput {
    order_line_item_id: number;
    quantity: number;
}

interface ReturnItemInput {
    order_line_item_id: number;
    quantity: number;
    reason?: string | null;
    refund_amount_minor?: number | null;
}

interface ShipmentInput {
    carrier?: string | null;
    service?: string | null;
    tracking_number?: string | null;
    tracking_url?: string | null;
}

interface ShipmentEventInput {
    status: "label_created" | "in_transit" | "out_for_delivery" | "delivered" | "exception" | "returned";
    expected_version: number;
    occurred_at?: string;
    location?: string | null;
    message?: string | null;
    evidence?: Record<string, unknown>;
}

type DbRow = Record<string, unknown>;

const FULFILLMENT_TRANSITIONS: Record<string, readonly string[]> = {
    pending: ["packed", "cancelled"],
    packed: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: [],
};

const RETURN_TRANSITIONS: Record<string, readonly string[]> = {
    requested: ["approved", "cancelled"],
    approved: ["in_transit", "received", "cancelled"],
    in_transit: ["received", "cancelled"],
    received: ["completed"],
    completed: [],
    cancelled: [],
};

function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function numberValue(value: unknown): number {
    return numberOrNull(value) ?? 0;
}

function canonicalFingerprint(value: unknown): string {
    const canonical = JSON.stringify(value, (_key, item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
            return Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
        }
        return item;
    });
    return createHash("sha256").update(canonical).digest("hex");
}

function normalizeFulfillmentItems(items: FulfillmentItemInput[]) {
    return [...items]
        .map((item) => ({ order_line_item_id: Number(item.order_line_item_id), quantity: Number(item.quantity) }))
        .sort((a, b) => a.order_line_item_id - b.order_line_item_id);
}

function normalizeReturnItems(items: ReturnItemInput[]) {
    return [...items]
        .map((item) => ({
            order_line_item_id: Number(item.order_line_item_id),
            quantity: Number(item.quantity),
            reason: item.reason ?? null,
            refund_amount_minor: item.refund_amount_minor ?? null,
        }))
        .sort((a, b) => a.order_line_item_id - b.order_line_item_id);
}

function assertUniqueLineIds(items: Array<{ order_line_item_id: number }>, code: string): void {
    const ids = items.map((item) => item.order_line_item_id);
    if (new Set(ids).size !== ids.length) throw new Exception("Duplicate order line item", { status: 422, code });
}

function idempotencyKey(raw: string | null | undefined): string | null {
    const value = raw?.trim() || null;
    if (value && value.length > 64) {
        throw new Exception("Idempotency-Key must be at most 64 characters", { status: 422, code: "E_IDEMPOTENCY_KEY_INVALID" });
    }
    return value;
}

function fulfillmentRow(row: DbRow) {
    return {
        ...row,
        id: numberValue(row.id),
        order_id: numberValue(row.order_id),
        created_by_user_id: numberOrNull(row.created_by_user_id),
        version: numberValue(row.version),
    };
}

function fulfillmentItemRow(row: DbRow) {
    return {
        ...row,
        id: numberValue(row.id),
        fulfillment_id: numberValue(row.fulfillment_id),
        order_line_item_id: numberValue(row.order_line_item_id),
        quantity: numberValue(row.quantity),
    };
}

function shipmentRow(row: DbRow) {
    return { ...row, id: numberValue(row.id), fulfillment_id: numberValue(row.fulfillment_id), version: numberValue(row.version) };
}

function shipmentEventRow(row: DbRow) {
    return {
        ...row,
        id: numberValue(row.id),
        shipment_id: numberValue(row.shipment_id),
        created_by_user_id: numberOrNull(row.created_by_user_id),
        evidence: typeof row.evidence === "object" && row.evidence !== null ? row.evidence : {},
    };
}

function returnRow(row: DbRow) {
    return {
        ...row,
        id: numberValue(row.id),
        order_id: numberValue(row.order_id),
        refund_id: numberOrNull(row.refund_id),
        created_by_user_id: numberOrNull(row.created_by_user_id),
        approved_by_user_id: numberOrNull(row.approved_by_user_id),
        version: numberValue(row.version),
    };
}

function returnItemRow(row: DbRow) {
    return {
        ...row,
        id: numberValue(row.id),
        return_id: numberValue(row.return_id),
        order_line_item_id: numberValue(row.order_line_item_id),
        requested_quantity: numberValue(row.requested_quantity),
        approved_quantity: numberValue(row.approved_quantity),
        received_quantity: numberValue(row.received_quantity),
        damaged_quantity: numberValue(row.damaged_quantity),
        restock_quantity: numberValue(row.restock_quantity),
        refund_amount_minor: numberOrNull(row.refund_amount_minor),
    };
}

export class Phase5OrderOperationsService {
    constructor(
        private readonly inventory = new InventoryService(),
        private readonly refunds = new RefundService(),
    ) {}

    async orderOperations(orderId: number) {
        const trx = currentTrx();
        const order = await trx.from("orders").where("id", orderId).whereNull("deleted_at").first();
        if (!order) throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });

        const lines = await trx
            .from("order_line_items as oli")
            .where("oli.order_id", orderId)
            .select("oli.id", "oli.product_id", "oli.variation_id", "oli.name", "oli.sku", "oli.quantity")
            .orderBy("oli.id", "asc");
        const fulfillmentRows = await trx.from("order_fulfillments").where("order_id", orderId).orderBy("created_at", "asc");
        const fulfillmentIds = fulfillmentRows.map((row) => Number(row.id));
        const fulfillmentItems = fulfillmentIds.length
            ? await trx.from("order_fulfillment_items").whereIn("fulfillment_id", fulfillmentIds).orderBy("id", "asc")
            : [];
        const shipments = fulfillmentIds.length
            ? await trx.from("order_shipments").whereIn("fulfillment_id", fulfillmentIds).orderBy("created_at", "asc")
            : [];
        const shipmentIds = shipments.map((row) => Number(row.id));
        const shipmentEvents = shipmentIds.length
            ? await trx.from("order_shipment_events").whereIn("shipment_id", shipmentIds).orderBy("occurred_at", "asc")
            : [];
        const returnRows = await trx.from("order_returns").where("order_id", orderId).orderBy("created_at", "asc");
        const returnIds = returnRows.map((row) => Number(row.id));
        const returnItems = returnIds.length
            ? await trx.from("order_return_items").whereIn("return_id", returnIds).orderBy("id", "asc")
            : [];

        const activeFulfilled = new Map<number, number>();
        for (const item of fulfillmentItems) {
            const fulfillment = fulfillmentRows.find((row) => Number(row.id) === Number(item.fulfillment_id));
            if (!fulfillment || fulfillment.status === "cancelled") continue;
            const lineId = Number(item.order_line_item_id);
            activeFulfilled.set(lineId, (activeFulfilled.get(lineId) ?? 0) + Number(item.quantity));
        }

        return {
            data: {
                order_id: orderId,
                order_status: order.status,
                lines: lines.map((line) => {
                    const fulfilled = activeFulfilled.get(Number(line.id)) ?? 0;
                    return {
                        id: numberValue(line.id),
                        product_id: numberOrNull(line.product_id),
                        variation_id: numberOrNull(line.variation_id),
                        name: line.name,
                        sku: line.sku,
                        quantity: numberValue(line.quantity),
                        fulfilled_quantity: fulfilled,
                        remaining_quantity: Math.max(0, numberValue(line.quantity) - fulfilled),
                    };
                }),
                fulfillments: fulfillmentRows.map((fulfillment) => ({
                    ...fulfillmentRow(fulfillment),
                    items: fulfillmentItems
                        .filter((item) => Number(item.fulfillment_id) === Number(fulfillment.id))
                        .map(fulfillmentItemRow),
                    shipments: shipments
                        .filter((shipment) => Number(shipment.fulfillment_id) === Number(fulfillment.id))
                        .map((shipment) => ({
                            ...shipmentRow(shipment),
                            events: shipmentEvents
                                .filter((event) => Number(event.shipment_id) === Number(shipment.id))
                                .map(shipmentEventRow),
                        })),
                })),
                returns: returnRows.map((returnRecord) => ({
                    ...returnRow(returnRecord),
                    items: returnItems.filter((item) => Number(item.return_id) === Number(returnRecord.id)).map(returnItemRow),
                })),
            },
        };
    }

    async createFulfillment(
        orderId: number,
        input: { items: FulfillmentItemInput[]; note?: string | null },
        actor: User,
        rawIdempotencyKey?: string | null,
    ) {
        const key = idempotencyKey(rawIdempotencyKey);
        const items = normalizeFulfillmentItems(input.items);
        assertUniqueLineIds(items, "E_FULFILLMENT_DUPLICATE_LINE");
        const fingerprint = canonicalFingerprint({ items, note: input.note ?? null });
        const [acquired, result] = await lock.createLock(`order:${orderId}`, "30s").runImmediately(async () => {
            const trx = currentTrx();
            const order = await trx.from("orders").where("id", orderId).whereNull("deleted_at").forUpdate().first();
            if (!order) throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
            if (order.status !== OrderStatus.Processing) {
                throw new Exception("Only processing orders can be fulfilled", { status: 422, code: "E_FULFILLMENT_ORDER_STATE" });
            }
            if (key) {
                const replay = await trx.from("order_fulfillments").where("order_id", orderId).where("idempotency_key", key).first();
                if (replay) {
                    if (replay.idempotency_fingerprint !== fingerprint) {
                        throw new Exception("Idempotency key was already used for a different fulfillment", {
                            status: 409,
                            code: "E_FULFILLMENT_IDEMPOTENCY_MISMATCH",
                        });
                    }
                    return this.fulfillment(Number(replay.id));
                }
            }

            const lineIds = items.map((item) => item.order_line_item_id);
            const orderLines = await trx.from("order_line_items").where("order_id", orderId).whereIn("id", lineIds).forUpdate();
            if (orderLines.length !== lineIds.length) {
                throw new Exception("Fulfillment contains an order line that does not belong to the order", {
                    status: 422,
                    code: "E_FULFILLMENT_LINE_INVALID",
                });
            }
            const committed = await trx
                .from("order_fulfillment_items as ofi")
                .join("order_fulfillments as of", "of.id", "ofi.fulfillment_id")
                .where("of.order_id", orderId)
                .whereNot("of.status", "cancelled")
                .whereIn("ofi.order_line_item_id", lineIds)
                .groupBy("ofi.order_line_item_id")
                .select("ofi.order_line_item_id")
                .sum("ofi.quantity as fulfilled_quantity");
            const committedByLine = new Map(
                committed.map((row) => [Number(row.order_line_item_id), Number(row.fulfilled_quantity ?? 0)]),
            );
            for (const item of items) {
                const line = orderLines.find((row) => Number(row.id) === item.order_line_item_id)!;
                const remaining = Number(line.quantity) - (committedByLine.get(item.order_line_item_id) ?? 0);
                if (item.quantity > remaining) {
                    throw new Exception("Fulfillment quantity exceeds remaining quantity", {
                        status: 409,
                        code: "E_FULFILLMENT_OVERFULFILL",
                    });
                }
            }

            const [created] = await trx
                .table("order_fulfillments")
                .insert({
                    order_id: orderId,
                    status: "pending",
                    idempotency_key: key,
                    idempotency_fingerprint: key ? fingerprint : null,
                    note: input.note ?? null,
                    created_by_user_id: actor.id,
                })
                .returning("*");
            await trx.table("order_fulfillment_items").insert(
                items.map((item) => ({ fulfillment_id: created.id, order_line_item_id: item.order_line_item_id, quantity: item.quantity })),
            );
            return this.fulfillment(Number(created.id));
        });
        if (!acquired) throw new Exception("Order is being processed concurrently", { status: 409, code: "E_CONCURRENT_PROCESSING" });
        return result;
    }

    async fulfillment(id: number) {
        const trx = currentTrx();
        const row = await trx.from("order_fulfillments").where("id", id).first();
        if (!row) throw new Exception("Fulfillment not found", { status: 404, code: "E_FULFILLMENT_NOT_FOUND" });
        const items = await trx.from("order_fulfillment_items").where("fulfillment_id", id).orderBy("id", "asc");
        const shipments = await trx.from("order_shipments").where("fulfillment_id", id).orderBy("created_at", "asc");
        const shipmentIds = shipments.map((shipment) => Number(shipment.id));
        const events = shipmentIds.length
            ? await trx.from("order_shipment_events").whereIn("shipment_id", shipmentIds).orderBy("occurred_at", "asc")
            : [];
        return {
            data: {
                ...fulfillmentRow(row),
                items: items.map(fulfillmentItemRow),
                shipments: shipments.map((shipment) => ({
                    ...shipmentRow(shipment),
                    events: events.filter((event) => Number(event.shipment_id) === Number(shipment.id)).map(shipmentEventRow),
                })),
            },
        };
    }

    async transitionFulfillment(id: number, status: string, expectedVersion: number, actor: User) {
        const trx = currentTrx();
        const row = await trx.from("order_fulfillments").where("id", id).forUpdate().first();
        if (!row) throw new Exception("Fulfillment not found", { status: 404, code: "E_FULFILLMENT_NOT_FOUND" });
        if (Number(row.version) !== expectedVersion) {
            throw new Exception("Fulfillment changed by another operator", { status: 409, code: "E_FULFILLMENT_VERSION_CONFLICT" });
        }
        if (row.status === status) return this.fulfillment(id);
        if (!(FULFILLMENT_TRANSITIONS[String(row.status)] ?? []).includes(status)) {
            throw new Exception("Illegal fulfillment transition", { status: 422, code: "E_FULFILLMENT_TRANSITION" });
        }
        const shipments = await trx.from("order_shipments").where("fulfillment_id", id);
        if (status === "shipped" && shipments.length === 0) {
            throw new Exception("A shipment is required before marking fulfillment shipped", {
                status: 422,
                code: "E_FULFILLMENT_SHIPMENT_REQUIRED",
            });
        }
        if (status === "delivered" && (shipments.length === 0 || shipments.some((shipment) => shipment.status !== "delivered"))) {
            throw new Exception("All shipments must be delivered before fulfillment can be delivered", {
                status: 422,
                code: "E_FULFILLMENT_SHIPMENT_UNDELIVERED",
            });
        }
        const patch: Record<string, unknown> = { status, version: Number(row.version) + 1, updated_at: new Date() };
        if (status === "packed") patch.packed_at = new Date();
        if (status === "shipped") patch.shipped_at = new Date();
        if (status === "delivered") patch.delivered_at = new Date();
        if (status === "cancelled") patch.cancelled_at = new Date();
        await trx.from("order_fulfillments").where("id", id).update(patch);
        if (status === "delivered") await this.maybeCompleteOrder(Number(row.order_id), actor);
        return this.fulfillment(id);
    }

    async createShipment(fulfillmentId: number, input: ShipmentInput, actor: User) {
        const trx = currentTrx();
        const fulfillment = await trx.from("order_fulfillments").where("id", fulfillmentId).forUpdate().first();
        if (!fulfillment) throw new Exception("Fulfillment not found", { status: 404, code: "E_FULFILLMENT_NOT_FOUND" });
        if (["cancelled", "delivered"].includes(String(fulfillment.status))) {
            throw new Exception("Fulfillment cannot accept a shipment in its current state", {
                status: 422,
                code: "E_SHIPMENT_FULFILLMENT_STATE",
            });
        }
        const [shipment] = await trx
            .table("order_shipments")
            .insert({
                fulfillment_id: fulfillmentId,
                status: "label_created",
                carrier: input.carrier ?? null,
                service: input.service ?? null,
                tracking_number: input.tracking_number ?? null,
                tracking_url: input.tracking_url ?? null,
            })
            .returning("*");
        await trx.table("order_shipment_events").insert({
            shipment_id: shipment.id,
            status: "label_created",
            evidence: JSON.stringify({ source: "admin" }),
            created_by_user_id: actor.id,
        });
        return { data: shipmentRow(shipment) };
    }

    async appendShipmentEvent(shipmentId: number, input: ShipmentEventInput, actor: User) {
        const trx = currentTrx();
        const shipment = await trx.from("order_shipments").where("id", shipmentId).forUpdate().first();
        if (!shipment) throw new Exception("Shipment not found", { status: 404, code: "E_SHIPMENT_NOT_FOUND" });
        if (Number(shipment.version) !== input.expected_version) {
            throw new Exception("Shipment changed by another operator", { status: 409, code: "E_SHIPMENT_VERSION_CONFLICT" });
        }
        const occurredAt = input.occurred_at ? DateTime.fromISO(input.occurred_at, { setZone: true }) : DateTime.utc();
        if (!occurredAt.isValid) throw new Exception("Invalid shipment event timestamp", { status: 422, code: "E_SHIPMENT_EVENT_TIME" });
        const [event] = await trx
            .table("order_shipment_events")
            .insert({
                shipment_id: shipmentId,
                status: input.status,
                occurred_at: occurredAt.toJSDate(),
                location: input.location ?? null,
                message: input.message ?? null,
                evidence: JSON.stringify(input.evidence ?? {}),
                created_by_user_id: actor.id,
            })
            .returning("*");
        const patch: Record<string, unknown> = {
            status: input.status,
            version: Number(shipment.version) + 1,
            updated_at: new Date(),
        };
        if (["in_transit", "out_for_delivery", "delivered"].includes(input.status) && !shipment.shipped_at) {
            patch.shipped_at = occurredAt.toJSDate();
        }
        if (input.status === "delivered") patch.delivered_at = occurredAt.toJSDate();
        await trx.from("order_shipments").where("id", shipmentId).update(patch);

        const fulfillment = await trx.from("order_fulfillments").where("id", shipment.fulfillment_id).forUpdate().first();
        if (fulfillment && !["cancelled", "delivered"].includes(String(fulfillment.status))) {
            if (["in_transit", "out_for_delivery"].includes(input.status)) {
                await trx.from("order_fulfillments").where("id", fulfillment.id).update({
                    status: "shipped",
                    shipped_at: fulfillment.shipped_at ?? occurredAt.toJSDate(),
                    version: Number(fulfillment.version) + 1,
                    updated_at: new Date(),
                });
            }
            if (input.status === "delivered") {
                const undelivered = await trx
                    .from("order_shipments")
                    .where("fulfillment_id", fulfillment.id)
                    .whereNot("status", "delivered")
                    .whereNot("id", shipmentId)
                    .first();
                if (!undelivered) {
                    await trx.from("order_fulfillments").where("id", fulfillment.id).update({
                        status: "delivered",
                        delivered_at: occurredAt.toJSDate(),
                        shipped_at: fulfillment.shipped_at ?? occurredAt.toJSDate(),
                        version: Number(fulfillment.version) + 1,
                        updated_at: new Date(),
                    });
                    await this.maybeCompleteOrder(Number(fulfillment.order_id), actor);
                }
            }
        }
        return { data: shipmentEventRow(event) };
    }

    async createReturn(
        orderId: number,
        input: {
            items: ReturnItemInput[];
            reason?: string | null;
            customer_note?: string | null;
            internal_note?: string | null;
            carrier?: string | null;
            tracking_number?: string | null;
        },
        actor: User,
        rawIdempotencyKey?: string | null,
    ) {
        const key = idempotencyKey(rawIdempotencyKey);
        const items = normalizeReturnItems(input.items);
        assertUniqueLineIds(items, "E_RETURN_DUPLICATE_LINE");
        const fingerprint = canonicalFingerprint({ ...input, items });
        const [acquired, result] = await lock.createLock(`order:${orderId}`, "30s").runImmediately(async () => {
            const trx = currentTrx();
            const order = await trx.from("orders").where("id", orderId).whereNull("deleted_at").forUpdate().first();
            if (!order) throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
            if (![OrderStatus.Processing, OrderStatus.Completed, OrderStatus.Refunded].includes(order.status as OrderStatus)) {
                throw new Exception("Order is not returnable in its current state", { status: 422, code: "E_RETURN_ORDER_STATE" });
            }
            if (key) {
                const replay = await trx.from("order_returns").where("order_id", orderId).where("idempotency_key", key).first();
                if (replay) {
                    if (replay.idempotency_fingerprint !== fingerprint) {
                        throw new Exception("Idempotency key was already used for a different return", {
                            status: 409,
                            code: "E_RETURN_IDEMPOTENCY_MISMATCH",
                        });
                    }
                    return this.returnDetail(Number(replay.id));
                }
            }

            const lineIds = items.map((item) => item.order_line_item_id);
            const orderLines = await trx.from("order_line_items").where("order_id", orderId).whereIn("id", lineIds).forUpdate();
            if (orderLines.length !== lineIds.length) {
                throw new Exception("Return contains an order line that does not belong to the order", {
                    status: 422,
                    code: "E_RETURN_LINE_INVALID",
                });
            }
            const activeReturned = await trx
                .from("order_return_items as ori")
                .join("order_returns as orr", "orr.id", "ori.return_id")
                .where("orr.order_id", orderId)
                .whereNot("orr.status", "cancelled")
                .whereIn("ori.order_line_item_id", lineIds)
                .groupBy("ori.order_line_item_id")
                .select("ori.order_line_item_id")
                .sum("ori.requested_quantity as returned_quantity");
            const returnedByLine = new Map(
                activeReturned.map((row) => [Number(row.order_line_item_id), Number(row.returned_quantity ?? 0)]),
            );
            for (const item of items) {
                const line = orderLines.find((row) => Number(row.id) === item.order_line_item_id)!;
                const available = Number(line.quantity) - (returnedByLine.get(item.order_line_item_id) ?? 0);
                if (item.quantity > available) {
                    throw new Exception("Return quantity exceeds returnable quantity", {
                        status: 409,
                        code: "E_RETURN_OVER_RETURN",
                    });
                }
            }

            const [created] = await trx
                .table("order_returns")
                .insert({
                    order_id: orderId,
                    status: "requested",
                    idempotency_key: key,
                    idempotency_fingerprint: key ? fingerprint : null,
                    reason: input.reason ?? null,
                    customer_note: input.customer_note ?? null,
                    internal_note: input.internal_note ?? null,
                    carrier: input.carrier ?? null,
                    tracking_number: input.tracking_number ?? null,
                    created_by_user_id: actor.id,
                })
                .returning("*");
            await trx.table("order_return_items").insert(
                items.map((item) => ({
                    return_id: created.id,
                    order_line_item_id: item.order_line_item_id,
                    requested_quantity: item.quantity,
                    reason: item.reason ?? null,
                    refund_amount_minor: item.refund_amount_minor ?? null,
                })),
            );
            return this.returnDetail(Number(created.id));
        });
        if (!acquired) throw new Exception("Order is being processed concurrently", { status: 409, code: "E_CONCURRENT_PROCESSING" });
        return result;
    }

    async returnDetail(id: number) {
        const trx = currentTrx();
        const row = await trx.from("order_returns").where("id", id).first();
        if (!row) throw new Exception("Return not found", { status: 404, code: "E_RETURN_NOT_FOUND" });
        const items = await trx.from("order_return_items").where("return_id", id).orderBy("id", "asc");
        return { data: { ...returnRow(row), items: items.map(returnItemRow) } };
    }

    async approveReturn(
        id: number,
        input: { expected_version: number; items: Array<{ order_line_item_id: number; approved_quantity: number }> },
        actor: User,
    ) {
        const trx = currentTrx();
        const row = await trx.from("order_returns").where("id", id).forUpdate().first();
        if (!row) throw new Exception("Return not found", { status: 404, code: "E_RETURN_NOT_FOUND" });
        this.assertVersion(row, input.expected_version, "E_RETURN_VERSION_CONFLICT");
        if (row.status !== "requested") {
            throw new Exception("Only requested returns can be approved", { status: 422, code: "E_RETURN_APPROVE_STATE" });
        }
        const items = await trx.from("order_return_items").where("return_id", id).forUpdate();
        if (new Set(input.items.map((item) => item.order_line_item_id)).size !== input.items.length) {
            throw new Exception("Duplicate return line item", { status: 422, code: "E_RETURN_DUPLICATE_LINE" });
        }
        if (input.items.reduce((sum, item) => sum + item.approved_quantity, 0) <= 0) {
            throw new Exception("At least one return item must be approved", { status: 422, code: "E_RETURN_APPROVED_EMPTY" });
        }
        for (const patch of input.items) {
            const item = items.find((candidate) => Number(candidate.order_line_item_id) === patch.order_line_item_id);
            if (!item || patch.approved_quantity > Number(item.requested_quantity)) {
                throw new Exception("Approved return quantity is invalid", { status: 422, code: "E_RETURN_APPROVED_QUANTITY" });
            }
            await trx
                .from("order_return_items")
                .where("id", item.id)
                .update({ approved_quantity: patch.approved_quantity, updated_at: new Date() });
        }
        await trx.from("order_returns").where("id", id).update({
            status: "approved",
            approved_by_user_id: actor.id,
            approved_at: new Date(),
            version: Number(row.version) + 1,
            updated_at: new Date(),
        });
        return this.returnDetail(id);
    }

    async receiveReturn(
        id: number,
        input: {
            expected_version: number;
            items: Array<{ order_line_item_id: number; received_quantity: number; damaged_quantity: number; restock_quantity: number }>;
        },
    ) {
        const trx = currentTrx();
        const row = await trx.from("order_returns").where("id", id).forUpdate().first();
        if (!row) throw new Exception("Return not found", { status: 404, code: "E_RETURN_NOT_FOUND" });
        this.assertVersion(row, input.expected_version, "E_RETURN_VERSION_CONFLICT");
        if (!["approved", "in_transit"].includes(String(row.status))) {
            throw new Exception("Return cannot be received in its current state", { status: 422, code: "E_RETURN_RECEIVE_STATE" });
        }
        const items = await trx.from("order_return_items").where("return_id", id).forUpdate();
        const lineIds = input.items.map((item) => item.order_line_item_id);
        if (new Set(lineIds).size !== lineIds.length) {
            throw new Exception("Duplicate return line item", { status: 422, code: "E_RETURN_DUPLICATE_LINE" });
        }
        const orderLines = await trx.from("order_line_items").whereIn("id", lineIds);
        for (const patch of input.items) {
            const item = items.find((candidate) => Number(candidate.order_line_item_id) === patch.order_line_item_id);
            if (
                !item ||
                patch.received_quantity > Number(item.approved_quantity) ||
                patch.damaged_quantity > patch.received_quantity ||
                patch.restock_quantity > patch.received_quantity - patch.damaged_quantity
            ) {
                throw new Exception("Received return quantities are invalid", { status: 422, code: "E_RETURN_RECEIVED_QUANTITY" });
            }
            const previousRestock = Number(item.restock_quantity ?? 0);
            const restockDelta = patch.restock_quantity - previousRestock;
            if (restockDelta < 0) {
                throw new Exception("Restock quantity cannot be reduced after inventory was credited", {
                    status: 409,
                    code: "E_RETURN_RESTOCK_REVERSAL",
                });
            }
            if (restockDelta > 0) {
                const line = orderLines.find((candidate) => Number(candidate.id) === patch.order_line_item_id);
                if (!line?.product_id) {
                    throw new Exception("Return line has no inventory target", { status: 422, code: "E_RETURN_INVENTORY_TARGET" });
                }
                await this.inventory.returnItems(
                    { productId: line.product_id, variationId: line.variation_id ?? null },
                    restockDelta,
                    { kind: "return", id },
                    trx,
                );
            }
            await trx.from("order_return_items").where("id", item.id).update({
                received_quantity: patch.received_quantity,
                damaged_quantity: patch.damaged_quantity,
                restock_quantity: patch.restock_quantity,
                updated_at: new Date(),
            });
        }
        const refreshedItems = await trx.from("order_return_items").where("return_id", id);
        const fullyReceived = refreshedItems
            .filter((item) => Number(item.approved_quantity) > 0)
            .every((item) => Number(item.received_quantity) === Number(item.approved_quantity));
        await trx.from("order_returns").where("id", id).update({
            status: fullyReceived ? "received" : "in_transit",
            received_at: fullyReceived ? new Date() : row.received_at,
            version: Number(row.version) + 1,
            updated_at: new Date(),
        });
        return this.returnDetail(id);
    }

    async transitionReturn(id: number, status: string, expectedVersion: number) {
        const trx = currentTrx();
        const row = await trx.from("order_returns").where("id", id).forUpdate().first();
        if (!row) throw new Exception("Return not found", { status: 404, code: "E_RETURN_NOT_FOUND" });
        this.assertVersion(row, expectedVersion, "E_RETURN_VERSION_CONFLICT");
        if (row.status === status) return this.returnDetail(id);
        if (!(RETURN_TRANSITIONS[String(row.status)] ?? []).includes(status)) {
            throw new Exception("Illegal return transition", { status: 422, code: "E_RETURN_TRANSITION" });
        }
        if (status === "received") {
            const incomplete = await trx
                .from("order_return_items")
                .where("return_id", id)
                .whereRaw("received_quantity < approved_quantity")
                .first();
            if (incomplete) {
                throw new Exception("All approved return quantities must be received", { status: 422, code: "E_RETURN_NOT_RECEIVED" });
            }
        }
        const patch: Record<string, unknown> = { status, version: Number(row.version) + 1, updated_at: new Date() };
        if (status === "cancelled") patch.cancelled_at = new Date();
        if (status === "completed") patch.completed_at = new Date();
        if (status === "received") patch.received_at = new Date();
        await trx.from("order_returns").where("id", id).update(patch);
        return this.returnDetail(id);
    }

    async refundReturn(id: number, expectedVersion: number, reason: string | null | undefined, actor: User) {
        const trx = currentTrx();
        const row = await trx.from("order_returns").where("id", id).forUpdate().first();
        if (!row) throw new Exception("Return not found", { status: 404, code: "E_RETURN_NOT_FOUND" });
        this.assertVersion(row, expectedVersion, "E_RETURN_VERSION_CONFLICT");
        if (row.refund_id) return this.returnDetail(id);
        if (row.status !== "received") {
            throw new Exception("Only received returns can be refunded", { status: 422, code: "E_RETURN_REFUND_STATE" });
        }
        const items = await trx.from("order_return_items").where("return_id", id).orderBy("id", "asc");
        const refundLines = items
            .filter((item) => Number(item.received_quantity) > 0)
            .map((item) => {
                const requested = Math.max(1, Number(item.requested_quantity));
                const received = Number(item.received_quantity);
                const requestedRefund = numberOrNull(item.refund_amount_minor);
                return {
                    orderLineItemId: Number(item.order_line_item_id),
                    quantity: received,
                    refundAmountMinor:
                        requestedRefund === null ? undefined : Math.floor((requestedRefund * received) / requested),
                };
            });
        if (refundLines.length === 0) {
            throw new Exception("Return has no received quantity to refund", { status: 422, code: "E_RETURN_REFUND_EMPTY" });
        }
        const refund = await this.refunds.create(
            Number(row.order_id),
            { lineItems: refundLines, reason: reason ?? String(row.reason ?? "Return refund"), restockRequested: false },
            { actor, idempotencyKey: `rma:${id}:refund` },
        );
        await trx.from("order_returns").where("id", id).update({
            refund_id: refund.id,
            status: "completed",
            completed_at: new Date(),
            version: Number(row.version) + 1,
            updated_at: new Date(),
        });
        return this.returnDetail(id);
    }

    async summary() {
        const trx = currentTrx();
        const [unfulfilled, shipmentExceptions, returnsAwaitingApproval, returnsAwaitingRefund] = await Promise.all([
            trx
                .from("orders as o")
                .where("o.status", OrderStatus.Processing)
                .where("o.updated_at", "<", trx.raw("now() - interval '24 hours'"))
                .whereNotExists((builder) =>
                    builder.from("order_fulfillments as of").whereColumn("of.order_id", "o.id").whereNot("of.status", "cancelled"),
                )
                .count("o.id as total")
                .first(),
            trx.from("order_shipments").where("status", "exception").count("id as total").first(),
            trx.from("order_returns").where("status", "requested").count("id as total").first(),
            trx.from("order_returns").where("status", "received").whereNull("refund_id").count("id as total").first(),
        ]);
        return {
            data: {
                paid_unfulfilled_over_24h: numberValue(unfulfilled?.total),
                shipment_exceptions: numberValue(shipmentExceptions?.total),
                returns_awaiting_approval: numberValue(returnsAwaitingApproval?.total),
                returns_awaiting_refund: numberValue(returnsAwaitingRefund?.total),
            },
        };
    }

    private assertVersion(row: DbRow, expected: number, code: string): void {
        if (Number(row.version) !== expected) {
            throw new Exception("Resource changed by another operator", { status: 409, code });
        }
    }

    private async maybeCompleteOrder(orderId: number, actor: User): Promise<void> {
        const trx = currentTrx();
        const lines = await trx.from("order_line_items").where("order_id", orderId).select("id", "quantity");
        const fulfilledRows = await trx
            .from("order_fulfillment_items as ofi")
            .join("order_fulfillments as of", "of.id", "ofi.fulfillment_id")
            .where("of.order_id", orderId)
            .whereNot("of.status", "cancelled")
            .groupBy("ofi.order_line_item_id")
            .select("ofi.order_line_item_id")
            .sum("ofi.quantity as fulfilled_quantity");
        const fulfilledByLine = new Map(
            fulfilledRows.map((row) => [Number(row.order_line_item_id), Number(row.fulfilled_quantity ?? 0)]),
        );
        const allFulfilled = lines.every((line) => (fulfilledByLine.get(Number(line.id)) ?? 0) >= Number(line.quantity));
        if (!allFulfilled) return;
        const order = await Order.query({ client: trx }).where("id", orderId).forUpdate().first();
        if (order?.status === OrderStatus.Processing) {
            await orderStateMachine.transition(order, OrderStatus.Completed, {
                actor,
                reason: "All order lines delivered through fulfillment operations",
                trx,
            });
        }
    }
}

export const phase5OrderOperationsService = new Phase5OrderOperationsService();
