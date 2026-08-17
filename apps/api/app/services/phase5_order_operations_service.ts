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
const SHIPMENT_TRANSITIONS: Record<string, readonly string[]> = {
    label_created: ["in_transit", "exception", "returned"],
    in_transit: ["out_for_delivery", "delivered", "exception", "returned"],
    out_for_delivery: ["delivered", "exception", "returned"],
    exception: ["in_transit", "out_for_delivery", "delivered", "returned"],
    delivered: [],
    returned: [],
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
function fingerprint(value: unknown): string {
    const canonical = JSON.stringify(value, (_key, item) =>
        item && typeof item === "object" && !Array.isArray(item)
            ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
            : item,
    );
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
function normalizeIdempotencyKey(raw: string | null | undefined): string | null {
    const value = raw?.trim() || null;
    if (value && value.length > 64)
        throw new Exception("Idempotency-Key must be at most 64 characters", { status: 422, code: "E_IDEMPOTENCY_KEY_INVALID" });
    return value;
}
function fulfillmentRow(row: DbRow) {
    return {
        ...row,
        id: numberValue(row.id),
        order_id: numberValue(row.order_id),
        created_by_user_id: numberOrNull(row.created_by_user_id),
        status: String(row.status ?? "pending"),
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
    return {
        ...row,
        id: numberValue(row.id),
        fulfillment_id: numberValue(row.fulfillment_id),
        status: String(row.status ?? "label_created"),
        carrier: row.carrier === null || row.carrier === undefined ? null : String(row.carrier),
        service: row.service === null || row.service === undefined ? null : String(row.service),
        tracking_number: row.tracking_number === null || row.tracking_number === undefined ? null : String(row.tracking_number),
        tracking_url: row.tracking_url === null || row.tracking_url === undefined ? null : String(row.tracking_url),
        version: numberValue(row.version),
    };
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
            .from("order_line_items")
            .where("order_id", orderId)
            .select("id", "product_id", "variation_id", "name", "sku", "quantity")
            .orderBy("id", "asc");
        const fulfillments = await trx.from("order_fulfillments").where("order_id", orderId).orderBy("created_at", "asc");
        const fulfillmentIds = fulfillments.map((row) => Number(row.id));
        const fulfillmentItems = fulfillmentIds.length
            ? await trx.from("order_fulfillment_items").whereIn("fulfillment_id", fulfillmentIds).orderBy("id", "asc")
            : [];
        const shipments = fulfillmentIds.length
            ? await trx.from("order_shipments").whereIn("fulfillment_id", fulfillmentIds).orderBy("created_at", "asc")
            : [];
        const shipmentIds = shipments.map((row) => Number(row.id));
        const events = shipmentIds.length
            ? await trx.from("order_shipment_events").whereIn("shipment_id", shipmentIds).orderBy("occurred_at", "asc")
            : [];
        const returns = await trx.from("order_returns").where("order_id", orderId).orderBy("created_at", "asc");
        const returnIds = returns.map((row) => Number(row.id));
        const returnItems = returnIds.length
            ? await trx.from("order_return_items").whereIn("return_id", returnIds).orderBy("id", "asc")
            : [];
        const allocated = new Map<number, number>();
        for (const item of fulfillmentItems) {
            const fulfillment = fulfillments.find((candidate) => Number(candidate.id) === Number(item.fulfillment_id));
            if (!fulfillment || fulfillment.status === "cancelled") continue;
            const lineId = Number(item.order_line_item_id);
            allocated.set(lineId, (allocated.get(lineId) ?? 0) + Number(item.quantity));
        }
        return {
            data: {
                order_id: orderId,
                order_status: String(order.status),
                lines: lines.map((line) => ({
                    id: numberValue(line.id),
                    product_id: numberOrNull(line.product_id),
                    variation_id: numberOrNull(line.variation_id),
                    name: String(line.name),
                    sku: line.sku === null ? null : String(line.sku),
                    quantity: numberValue(line.quantity),
                    fulfilled_quantity: allocated.get(Number(line.id)) ?? 0,
                    remaining_quantity: Math.max(0, numberValue(line.quantity) - (allocated.get(Number(line.id)) ?? 0)),
                })),
                fulfillments: fulfillments.map((row) => ({
                    ...fulfillmentRow(row),
                    items: fulfillmentItems
                        .filter((item) => Number(item.fulfillment_id) === Number(row.id))
                        .map(fulfillmentItemRow),
                    shipments: shipments
                        .filter((shipment) => Number(shipment.fulfillment_id) === Number(row.id))
                        .map((shipment) => ({
                            ...shipmentRow(shipment),
                            events: events
                                .filter((event) => Number(event.shipment_id) === Number(shipment.id))
                                .map(shipmentEventRow),
                        })),
                })),
                returns: returns.map((row) => ({
                    ...returnRow(row),
                    items: returnItems.filter((item) => Number(item.return_id) === Number(row.id)).map(returnItemRow),
                })),
            },
        };
    }

    async createFulfillment(
        orderId: number,
        input: { items: FulfillmentItemInput[]; note?: string | null },
        actor: User,
        rawKey?: string | null,
    ) {
        const key = normalizeIdempotencyKey(rawKey);
        const items = normalizeFulfillmentItems(input.items);
        assertUniqueLineIds(items, "E_FULFILLMENT_DUPLICATE_LINE");
        const bodyFingerprint = fingerprint({ items, note: input.note ?? null });
        const [acquired, value] = await lock.createLock(`order:${orderId}`, "30s").runImmediately(async () => {
            const trx = currentTrx();
            const order = await trx.from("orders").where("id", orderId).whereNull("deleted_at").forUpdate().first();
            if (!order) throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
            if (order.status !== OrderStatus.Processing)
                throw new Exception("Only processing orders can be fulfilled", {
                    status: 422,
                    code: "E_FULFILLMENT_ORDER_STATE",
                });
            if (key) {
                const replay = await trx
                    .from("order_fulfillments")
                    .where("order_id", orderId)
                    .where("idempotency_key", key)
                    .first();
                if (replay) {
                    if (replay.idempotency_fingerprint !== bodyFingerprint)
                        throw new Exception("Idempotency key was already used for a different fulfillment", {
                            status: 409,
                            code: "E_FULFILLMENT_IDEMPOTENCY_MISMATCH",
                        });
                    return this.fulfillment(Number(replay.id));
                }
            }
            const lineIds = items.map((item) => item.order_line_item_id);
            const orderLines = await trx.from("order_line_items").where("order_id", orderId).whereIn("id", lineIds).forUpdate();
            if (orderLines.length !== lineIds.length)
                throw new Exception("Fulfillment contains a line outside the order", {
                    status: 422,
                    code: "E_FULFILLMENT_LINE_INVALID",
                });
            const existing = await trx
                .from("order_fulfillment_items as item")
                .join("order_fulfillments as fulfillment", "fulfillment.id", "item.fulfillment_id")
                .where("fulfillment.order_id", orderId)
                .whereNot("fulfillment.status", "cancelled")
                .whereIn("item.order_line_item_id", lineIds)
                .groupBy("item.order_line_item_id")
                .select("item.order_line_item_id")
                .sum("item.quantity as allocated_quantity");
            const allocated = new Map(
                existing.map((row) => [Number(row.order_line_item_id), Number(row.allocated_quantity ?? 0)]),
            );
            for (const item of items) {
                const line = orderLines.find((candidate) => Number(candidate.id) === item.order_line_item_id)!;
                if (item.quantity > Number(line.quantity) - (allocated.get(item.order_line_item_id) ?? 0))
                    throw new Exception("Fulfillment quantity exceeds the remaining quantity", {
                        status: 409,
                        code: "E_FULFILLMENT_OVERFULFILL",
                    });
            }
            const [created] = await trx
                .table("order_fulfillments")
                .insert({
                    order_id: orderId,
                    status: "pending",
                    idempotency_key: key,
                    idempotency_fingerprint: key ? bodyFingerprint : null,
                    note: input.note ?? null,
                    created_by_user_id: actor.id,
                })
                .returning("*");
            await trx.table("order_fulfillment_items").insert(
                items.map((item) => ({
                    fulfillment_id: created.id,
                    order_line_item_id: item.order_line_item_id,
                    quantity: item.quantity,
                })),
            );
            return this.fulfillment(Number(created.id));
        });
        if (!acquired)
            throw new Exception("Order is being processed concurrently", { status: 409, code: "E_CONCURRENT_PROCESSING" });
        return value;
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
        this.assertVersion(row, expectedVersion, "E_FULFILLMENT_VERSION_CONFLICT");
        if (row.status === status) return this.fulfillment(id);
        if (!(FULFILLMENT_TRANSITIONS[String(row.status)] ?? []).includes(status))
            throw new Exception("Illegal fulfillment transition", { status: 422, code: "E_FULFILLMENT_TRANSITION" });
        const shipments = await trx.from("order_shipments").where("fulfillment_id", id);
        if (status === "shipped" && shipments.length === 0)
            throw new Exception("A shipment is required before the fulfillment can be shipped", {
                status: 422,
                code: "E_FULFILLMENT_SHIPMENT_REQUIRED",
            });
        if (status === "delivered" && (shipments.length === 0 || shipments.some((shipment) => shipment.status !== "delivered")))
            throw new Exception("Every shipment must be delivered first", {
                status: 422,
                code: "E_FULFILLMENT_SHIPMENT_UNDELIVERED",
            });
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
        if (["cancelled", "delivered"].includes(String(fulfillment.status)))
            throw new Exception("Fulfillment cannot accept a shipment in its current state", {
                status: 422,
                code: "E_SHIPMENT_FULFILLMENT_STATE",
            });
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
        this.assertVersion(shipment, input.expected_version, "E_SHIPMENT_VERSION_CONFLICT");
        const current = String(shipment.status);
        if (current !== input.status && !(SHIPMENT_TRANSITIONS[current] ?? []).includes(input.status))
            throw new Exception("Illegal shipment transition", { status: 422, code: "E_SHIPMENT_TRANSITION" });
        if (["delivered", "returned"].includes(current) && current === input.status)
            throw new Exception("Terminal shipment state cannot be replayed as a new event", {
                status: 409,
                code: "E_SHIPMENT_TERMINAL",
            });
        const occurredAt = input.occurred_at ? DateTime.fromISO(input.occurred_at, { setZone: true }) : DateTime.utc();
        if (!occurredAt.isValid)
            throw new Exception("Invalid shipment event timestamp", { status: 422, code: "E_SHIPMENT_EVENT_TIME" });
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
        const shipmentPatch: Record<string, unknown> = {
            status: input.status,
            version: Number(shipment.version) + 1,
            updated_at: new Date(),
        };
        if (["in_transit", "out_for_delivery", "delivered"].includes(input.status) && !shipment.shipped_at)
            shipmentPatch.shipped_at = occurredAt.toJSDate();
        if (input.status === "delivered") shipmentPatch.delivered_at = occurredAt.toJSDate();
        await trx.from("order_shipments").where("id", shipmentId).update(shipmentPatch);
        const fulfillment = await trx.from("order_fulfillments").where("id", shipment.fulfillment_id).forUpdate().first();
        if (fulfillment && !["cancelled", "delivered"].includes(String(fulfillment.status))) {
            if (
                ["in_transit", "out_for_delivery"].includes(input.status) &&
                ["pending", "packed"].includes(String(fulfillment.status))
            )
                await trx
                    .from("order_fulfillments")
                    .where("id", fulfillment.id)
                    .update({
                        status: "shipped",
                        shipped_at: fulfillment.shipped_at ?? occurredAt.toJSDate(),
                        version: Number(fulfillment.version) + 1,
                        updated_at: new Date(),
                    });
            if (input.status === "delivered") {
                const undelivered = await trx
                    .from("order_shipments")
                    .where("fulfillment_id", fulfillment.id)
                    .whereNot("id", shipmentId)
                    .whereNot("status", "delivered")
                    .first();
                if (!undelivered) {
                    await trx
                        .from("order_fulfillments")
                        .where("id", fulfillment.id)
                        .update({
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
        rawKey?: string | null,
    ) {
        const key = normalizeIdempotencyKey(rawKey);
        const items = normalizeReturnItems(input.items);
        assertUniqueLineIds(items, "E_RETURN_DUPLICATE_LINE");
        const bodyFingerprint = fingerprint({ ...input, items });
        const [acquired, value] = await lock.createLock(`order:${orderId}`, "30s").runImmediately(async () => {
            const trx = currentTrx();
            const order = await trx.from("orders").where("id", orderId).whereNull("deleted_at").forUpdate().first();
            if (!order) throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
            if (![OrderStatus.Processing, OrderStatus.Completed, OrderStatus.Refunded].includes(order.status as OrderStatus))
                throw new Exception("Order is not returnable in its current state", {
                    status: 422,
                    code: "E_RETURN_ORDER_STATE",
                });
            if (key) {
                const replay = await trx.from("order_returns").where("order_id", orderId).where("idempotency_key", key).first();
                if (replay) {
                    if (replay.idempotency_fingerprint !== bodyFingerprint)
                        throw new Exception("Idempotency key was already used for a different return", {
                            status: 409,
                            code: "E_RETURN_IDEMPOTENCY_MISMATCH",
                        });
                    return this.returnDetail(Number(replay.id));
                }
            }
            const lineIds = items.map((item) => item.order_line_item_id);
            const orderLines = await trx.from("order_line_items").where("order_id", orderId).whereIn("id", lineIds).forUpdate();
            if (orderLines.length !== lineIds.length)
                throw new Exception("Return contains a line outside the order", { status: 422, code: "E_RETURN_LINE_INVALID" });
            const existing = await trx
                .from("order_return_items as item")
                .join("order_returns as return_record", "return_record.id", "item.return_id")
                .where("return_record.order_id", orderId)
                .whereNot("return_record.status", "cancelled")
                .whereIn("item.order_line_item_id", lineIds)
                .groupBy("item.order_line_item_id")
                .select("item.order_line_item_id")
                .sum("item.requested_quantity as returned_quantity");
            const returned = new Map(existing.map((row) => [Number(row.order_line_item_id), Number(row.returned_quantity ?? 0)]));
            for (const item of items) {
                const line = orderLines.find((candidate) => Number(candidate.id) === item.order_line_item_id)!;
                if (item.quantity > Number(line.quantity) - (returned.get(item.order_line_item_id) ?? 0))
                    throw new Exception("Return quantity exceeds the returnable quantity", {
                        status: 409,
                        code: "E_RETURN_OVER_RETURN",
                    });
            }
            const [created] = await trx
                .table("order_returns")
                .insert({
                    order_id: orderId,
                    status: "requested",
                    idempotency_key: key,
                    idempotency_fingerprint: key ? bodyFingerprint : null,
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
        if (!acquired)
            throw new Exception("Order is being processed concurrently", { status: 409, code: "E_CONCURRENT_PROCESSING" });
        return value;
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
        if (row.status !== "requested")
            throw new Exception("Only requested returns can be approved", { status: 422, code: "E_RETURN_APPROVE_STATE" });
        const items = await trx.from("order_return_items").where("return_id", id).forUpdate();
        if (new Set(input.items.map((item) => item.order_line_item_id)).size !== input.items.length)
            throw new Exception("Duplicate return line", { status: 422, code: "E_RETURN_DUPLICATE_LINE" });
        if (input.items.reduce((total, item) => total + item.approved_quantity, 0) <= 0)
            throw new Exception("At least one return item must be approved", { status: 422, code: "E_RETURN_APPROVED_EMPTY" });
        for (const patch of input.items) {
            const item = items.find((candidate) => Number(candidate.order_line_item_id) === patch.order_line_item_id);
            if (!item || patch.approved_quantity > Number(item.requested_quantity))
                throw new Exception("Approved return quantity is invalid", { status: 422, code: "E_RETURN_APPROVED_QUANTITY" });
            await trx
                .from("order_return_items")
                .where("id", item.id)
                .update({ approved_quantity: patch.approved_quantity, updated_at: new Date() });
        }
        await trx
            .from("order_returns")
            .where("id", id)
            .update({
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
            items: Array<{
                order_line_item_id: number;
                received_quantity: number;
                damaged_quantity: number;
                restock_quantity: number;
            }>;
        },
    ) {
        const trx = currentTrx();
        const row = await trx.from("order_returns").where("id", id).forUpdate().first();
        if (!row) throw new Exception("Return not found", { status: 404, code: "E_RETURN_NOT_FOUND" });
        this.assertVersion(row, input.expected_version, "E_RETURN_VERSION_CONFLICT");
        if (!["approved", "in_transit"].includes(String(row.status)))
            throw new Exception("Return cannot be received in its current state", {
                status: 422,
                code: "E_RETURN_RECEIVE_STATE",
            });
        const items = await trx.from("order_return_items").where("return_id", id).forUpdate();
        const lineIds = input.items.map((item) => item.order_line_item_id);
        if (new Set(lineIds).size !== lineIds.length)
            throw new Exception("Duplicate return line", { status: 422, code: "E_RETURN_DUPLICATE_LINE" });
        const orderLines = await trx.from("order_line_items").whereIn("id", lineIds);
        for (const patch of input.items) {
            const item = items.find((candidate) => Number(candidate.order_line_item_id) === patch.order_line_item_id);
            if (
                !item ||
                patch.received_quantity > Number(item.approved_quantity) ||
                patch.damaged_quantity > patch.received_quantity ||
                patch.restock_quantity > patch.received_quantity - patch.damaged_quantity
            )
                throw new Exception("Received return quantities are invalid", {
                    status: 422,
                    code: "E_RETURN_RECEIVED_QUANTITY",
                });
            const restockDelta = patch.restock_quantity - Number(item.restock_quantity ?? 0);
            if (restockDelta < 0)
                throw new Exception("Restock quantity cannot be reduced after stock was credited", {
                    status: 409,
                    code: "E_RETURN_RESTOCK_REVERSAL",
                });
            if (restockDelta > 0) {
                const line = orderLines.find((candidate) => Number(candidate.id) === patch.order_line_item_id);
                if (!line?.product_id)
                    throw new Exception("Return line has no inventory target", {
                        status: 422,
                        code: "E_RETURN_INVENTORY_TARGET",
                    });
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
        const refreshed = await trx.from("order_return_items").where("return_id", id);
        const approved = refreshed.filter((item) => Number(item.approved_quantity) > 0);
        const fullyReceived =
            approved.length > 0 && approved.every((item) => Number(item.received_quantity) === Number(item.approved_quantity));
        await trx
            .from("order_returns")
            .where("id", id)
            .update({
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
        if (!(RETURN_TRANSITIONS[String(row.status)] ?? []).includes(status))
            throw new Exception("Illegal return transition", { status: 422, code: "E_RETURN_TRANSITION" });
        if (status === "received") {
            const incomplete = await trx
                .from("order_return_items")
                .where("return_id", id)
                .whereRaw("received_quantity < approved_quantity")
                .first();
            if (incomplete)
                throw new Exception("All approved quantities must be received first", {
                    status: 422,
                    code: "E_RETURN_NOT_RECEIVED",
                });
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
        if (row.status !== "received")
            throw new Exception("Only received returns can be refunded", { status: 422, code: "E_RETURN_REFUND_STATE" });
        const items = await trx.from("order_return_items").where("return_id", id).orderBy("id", "asc");
        const lineItems = items
            .filter((item) => Number(item.received_quantity) > 0)
            .map((item) => {
                const received = Number(item.received_quantity);
                const requested = Math.max(1, Number(item.requested_quantity));
                const amount = numberOrNull(item.refund_amount_minor);
                return {
                    orderLineItemId: Number(item.order_line_item_id),
                    quantity: received,
                    refundAmountMinor: amount === null ? undefined : Math.floor((amount * received) / requested),
                };
            });
        if (lineItems.length === 0)
            throw new Exception("Return has no received quantity to refund", { status: 422, code: "E_RETURN_REFUND_EMPTY" });
        const refund = await this.refunds.create(
            Number(row.order_id),
            { lineItems, reason: reason ?? String(row.reason ?? "Return refund"), restockRequested: false },
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
        return this.returnDetail(id);
    }

    async summary() {
        const trx = currentTrx();
        const [unfulfilled, shipmentExceptions, approval, refund] = await Promise.all([
            trx
                .from("orders as order_record")
                .where("order_record.status", OrderStatus.Processing)
                .where("order_record.updated_at", "<", trx.raw("now() - interval '24 hours'"))
                .whereNotExists((builder) =>
                    builder
                        .from("order_fulfillments as fulfillment")
                        .whereColumn("fulfillment.order_id", "order_record.id")
                        .whereNot("fulfillment.status", "cancelled"),
                )
                .count("order_record.id as total")
                .first(),
            trx.from("order_shipments").where("status", "exception").count("id as total").first(),
            trx.from("order_returns").where("status", "requested").count("id as total").first(),
            trx.from("order_returns").where("status", "received").whereNull("refund_id").count("id as total").first(),
        ]);
        return {
            data: {
                paid_unfulfilled_over_24h: numberValue(unfulfilled?.total),
                shipment_exceptions: numberValue(shipmentExceptions?.total),
                returns_awaiting_approval: numberValue(approval?.total),
                returns_awaiting_refund: numberValue(refund?.total),
            },
        };
    }

    private assertVersion(row: DbRow, expected: number, code: string): void {
        if (Number(row.version) !== expected) throw new Exception("Resource changed by another operator", { status: 409, code });
    }

    /** Completes the order only when every sold line quantity is covered by delivered fulfillments. */
    private async maybeCompleteOrder(orderId: number, actor: User): Promise<void> {
        const trx = currentTrx();
        const lines = await trx.from("order_line_items").where("order_id", orderId).select("id", "quantity");
        const deliveredRows = await trx
            .from("order_fulfillment_items as item")
            .join("order_fulfillments as fulfillment", "fulfillment.id", "item.fulfillment_id")
            .where("fulfillment.order_id", orderId)
            .where("fulfillment.status", "delivered")
            .groupBy("item.order_line_item_id")
            .select("item.order_line_item_id")
            .sum("item.quantity as delivered_quantity");
        const delivered = new Map(
            deliveredRows.map((row) => [Number(row.order_line_item_id), Number(row.delivered_quantity ?? 0)]),
        );
        const allDelivered =
            lines.length > 0 && lines.every((line) => (delivered.get(Number(line.id)) ?? 0) >= Number(line.quantity));
        if (!allDelivered) return;
        const order = await Order.query({ client: trx }).where("id", orderId).forUpdate().first();
        if (order?.status === OrderStatus.Processing)
            await orderStateMachine.transition(order, OrderStatus.Completed, {
                actor,
                reason: "All order line quantities were delivered through fulfillment operations",
                trx,
            });
    }
}

export const phase5OrderOperationsService = new Phase5OrderOperationsService();
