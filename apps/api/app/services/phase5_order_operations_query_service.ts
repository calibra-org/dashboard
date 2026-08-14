import { Exception } from "@adonisjs/core/exceptions";

import { OrderStatus } from "#enums/order_status";
import { currentTrx } from "#services/tenant_context";

type DbRow = Record<string, unknown>;

type FulfillmentStatus = "pending" | "packed" | "shipped" | "delivered" | "cancelled";
type ShipmentStatus = "label_created" | "in_transit" | "out_for_delivery" | "delivered" | "exception" | "returned";

interface FulfillmentRow extends DbRow {
    id: number;
    order_id: number;
    created_by_user_id: number | null;
    version: number;
    status: FulfillmentStatus;
}

interface FulfillmentItemRow extends DbRow {
    id: number;
    fulfillment_id: number;
    order_line_item_id: number;
    quantity: number;
}

interface ShipmentRow extends DbRow {
    id: number;
    fulfillment_id: number;
    version: number;
    status: ShipmentStatus;
    carrier: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
}

interface ShipmentEventRow extends DbRow {
    id: number;
    shipment_id: number;
    created_by_user_id: number | null;
    evidence: object;
}

interface ReturnRow extends DbRow {
    id: number;
    order_id: number;
    refund_id: number | null;
    created_by_user_id: number | null;
    approved_by_user_id: number | null;
    version: number;
}

interface ReturnItemRow extends DbRow {
    id: number;
    return_id: number;
    order_line_item_id: number;
    requested_quantity: number;
    approved_quantity: number;
    received_quantity: number;
    damaged_quantity: number;
    restock_quantity: number;
    refund_amount_minor: number | null;
}

function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function numberValue(value: unknown): number {
    return numberOrNull(value) ?? 0;
}

function fulfillmentRow(row: DbRow): FulfillmentRow {
    return {
        ...row,
        id: numberValue(row.id),
        order_id: numberValue(row.order_id),
        created_by_user_id: numberOrNull(row.created_by_user_id),
        version: numberValue(row.version),
        status: String(row.status ?? "pending") as FulfillmentStatus,
    };
}

function fulfillmentItemRow(row: DbRow): FulfillmentItemRow {
    return {
        ...row,
        id: numberValue(row.id),
        fulfillment_id: numberValue(row.fulfillment_id),
        order_line_item_id: numberValue(row.order_line_item_id),
        quantity: numberValue(row.quantity),
    };
}

function shipmentRow(row: DbRow): ShipmentRow {
    return {
        ...row,
        id: numberValue(row.id),
        fulfillment_id: numberValue(row.fulfillment_id),
        version: numberValue(row.version),
        status: String(row.status ?? "label_created") as ShipmentStatus,
        carrier: row.carrier === null || row.carrier === undefined ? null : String(row.carrier),
        tracking_number: row.tracking_number === null || row.tracking_number === undefined ? null : String(row.tracking_number),
        tracking_url: row.tracking_url === null || row.tracking_url === undefined ? null : String(row.tracking_url),
    };
}

function shipmentEventRow(row: DbRow): ShipmentEventRow {
    return {
        ...row,
        id: numberValue(row.id),
        shipment_id: numberValue(row.shipment_id),
        created_by_user_id: numberOrNull(row.created_by_user_id),
        evidence: typeof row.evidence === "object" && row.evidence !== null ? row.evidence : {},
    };
}

function returnRow(row: DbRow): ReturnRow {
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

function returnItemRow(row: DbRow): ReturnItemRow {
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

/** Read-only projection for the existing Orders detail surface. */
export class Phase5OrderOperationsQueryService {
    async orderOperations(orderId: number) {
        const trx = currentTrx();
        const order = await trx.from("orders").where("id", orderId).whereNull("deleted_at").first();
        if (!order) throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });

        const lines = await trx
            .from("order_line_items")
            .where("order_id", orderId)
            .select("id", "product_id", "variation_id", "name_snapshot as name", "sku_snapshot as sku", "quantity")
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
        const delivered = new Map<number, number>();
        for (const item of fulfillmentItems) {
            const fulfillment = fulfillments.find((candidate) => Number(candidate.id) === Number(item.fulfillment_id));
            if (!fulfillment || fulfillment.status === "cancelled") continue;
            const lineId = Number(item.order_line_item_id);
            allocated.set(lineId, (allocated.get(lineId) ?? 0) + Number(item.quantity));
            if (fulfillment.status === "delivered") delivered.set(lineId, (delivered.get(lineId) ?? 0) + Number(item.quantity));
        }

        const returned = new Map<number, number>();
        for (const item of returnItems) {
            const returnRecord = returns.find((candidate) => Number(candidate.id) === Number(item.return_id));
            if (!returnRecord || returnRecord.status === "cancelled") continue;
            const lineId = Number(item.order_line_item_id);
            returned.set(lineId, (returned.get(lineId) ?? 0) + Number(item.requested_quantity));
        }

        const legacyDelivered =
            fulfillments.length === 0 && (order.status === OrderStatus.Completed || order.status === OrderStatus.Refunded);

        return {
            data: {
                order_id: orderId,
                order_status: String(order.status),
                lines: lines.map((line) => {
                    const lineId = Number(line.id);
                    const orderedQuantity = numberValue(line.quantity);
                    const fulfilledQuantity = allocated.get(lineId) ?? 0;
                    const deliveredQuantity = legacyDelivered ? orderedQuantity : (delivered.get(lineId) ?? 0);
                    const returnedQuantity = returned.get(lineId) ?? 0;
                    return {
                        id: numberValue(line.id),
                        product_id: numberOrNull(line.product_id),
                        variation_id: numberOrNull(line.variation_id),
                        name: String(line.name),
                        sku: line.sku === null ? null : String(line.sku),
                        quantity: orderedQuantity,
                        fulfilled_quantity: fulfilledQuantity,
                        remaining_quantity: Math.max(0, orderedQuantity - fulfilledQuantity),
                        delivered_quantity: deliveredQuantity,
                        returned_quantity: returnedQuantity,
                        returnable_quantity: Math.max(0, deliveredQuantity - returnedQuantity),
                    };
                }),
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
}

export const phase5OrderOperationsQueryService = new Phase5OrderOperationsQueryService();
