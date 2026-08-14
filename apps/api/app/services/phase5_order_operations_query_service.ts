import { Exception } from "@adonisjs/core/exceptions";

import { currentTrx } from "#services/tenant_context";

type DbRow = Record<string, unknown>;

function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function numberValue(value: unknown): number {
    return numberOrNull(value) ?? 0;
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
    return {
        ...row,
        id: numberValue(row.id),
        fulfillment_id: numberValue(row.fulfillment_id),
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

/** Read-only projection for the existing Orders detail surface. */
export class Phase5OrderOperationsQueryService {
    async orderOperations(orderId: number) {
        const trx = currentTrx();
        const order = await trx.from("orders").where("id", orderId).whereNull("deleted_at").first();
        if (!order) throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });

        const lines = await trx
            .from("order_line_items")
            .where("order_id", orderId)
            .select(
                "id",
                "product_id",
                "variation_id",
                "name_snapshot as name",
                "sku_snapshot as sku",
                "quantity",
            )
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
}

export const phase5OrderOperationsQueryService = new Phase5OrderOperationsQueryService();
