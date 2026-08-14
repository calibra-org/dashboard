import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import type User from "#models/user";
import { phase5OrderOperationsQueryService } from "#services/phase5_order_operations_query_service";
import { phase5OrderOperationsService } from "#services/phase5_order_operations_service";
import { currentTrx } from "#services/tenant_context";

interface LegacyMarkShippedInput {
    tracking_number?: string | null;
    tracking_url?: string | null;
    carrier?: string | null;
    notify_customer?: boolean;
}

/**
 * Compatibility bridge for the historical `mark-shipped` endpoint.
 * It creates one canonical fulfillment + shipment instead of directly completing the order.
 * Delivery remains an explicit later event; notification delivery is not claimed while no real mail transport is bound.
 */
export class LegacyMarkShippedService {
    async execute(orderId: number, input: LegacyMarkShippedInput, actor: User): Promise<void> {
        const trx = currentTrx();
        const order = await trx.from("orders").where("id", orderId).whereNull("deleted_at").first();
        if (!order) throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        if (order.status === OrderStatus.Completed) {
            await this.updateCompatibilityProjection(orderId, input, true);
            return;
        }
        if (order.status !== OrderStatus.Processing) {
            throw new Exception("Only processing orders can be marked shipped", {
                status: 422,
                code: "E_FULFILLMENT_ORDER_STATE",
            });
        }

        const key = `legacy-mark-shipped:${orderId}`;
        let fulfillment = await trx.from("order_fulfillments").where("order_id", orderId).where("idempotency_key", key).first();
        if (!fulfillment) {
            const operations = (await phase5OrderOperationsQueryService.orderOperations(orderId)).data;
            const active = operations.fulfillments.filter((item) => item.status !== "cancelled" && item.status !== "delivered");
            const alreadyAllocated = operations.lines.some((line) => line.fulfilled_quantity > 0);
            if (active.length > 0 || alreadyAllocated) {
                throw new Exception("This order already has fulfillment activity; use Order Operations for shipment control", {
                    status: 409,
                    code: "E_FULFILLMENT_USE_OPERATIONS",
                });
            }
            const remaining = operations.lines
                .filter((line) => line.remaining_quantity > 0)
                .map((line) => ({ order_line_item_id: line.id, quantity: line.remaining_quantity }));
            if (remaining.length === 0) {
                throw new Exception("Order has no remaining items to ship", { status: 422, code: "E_FULFILLMENT_EMPTY" });
            }
            const created = await phase5OrderOperationsService.createFulfillment(
                orderId,
                { items: remaining, note: "Created by legacy mark-shipped compatibility action" },
                actor,
                key,
            );
            fulfillment = created.data;
        }

        let operations = (await phase5OrderOperationsQueryService.orderOperations(orderId)).data;
        let current = operations.fulfillments.find((item) => item.id === Number(fulfillment.id));
        if (!current) {
            throw new Exception("Compatibility fulfillment could not be projected", {
                status: 409,
                code: "E_FULFILLMENT_PROJECTION_MISSING",
            });
        }
        if (current.status === "pending") {
            await phase5OrderOperationsService.transitionFulfillment(current.id, "packed", current.version, actor);
            operations = (await phase5OrderOperationsQueryService.orderOperations(orderId)).data;
            current = operations.fulfillments.find((item) => item.id === Number(fulfillment.id));
            if (!current) {
                throw new Exception("Compatibility fulfillment could not be projected after transition", {
                    status: 409,
                    code: "E_FULFILLMENT_PROJECTION_MISSING",
                });
            }
        }
        if (current.status === "cancelled") {
            throw new Exception("Compatibility fulfillment was cancelled", { status: 409, code: "E_FULFILLMENT_CANCELLED" });
        }

        let shipment = current.shipments[0];
        if (!shipment) {
            await phase5OrderOperationsService.createShipment(
                current.id,
                {
                    carrier: input.carrier ?? null,
                    tracking_number: input.tracking_number ?? null,
                    tracking_url: input.tracking_url ?? null,
                },
                actor,
            );
            operations = (await phase5OrderOperationsQueryService.orderOperations(orderId)).data;
            current = operations.fulfillments.find((item) => item.id === Number(fulfillment.id));
            shipment = current?.shipments[0];
            if (!shipment) {
                throw new Exception("Compatibility shipment could not be projected", {
                    status: 409,
                    code: "E_SHIPMENT_PROJECTION_MISSING",
                });
            }
        } else {
            await trx
                .from("order_shipments")
                .where("id", shipment.id)
                .update({
                    carrier: input.carrier ?? shipment.carrier,
                    tracking_number: input.tracking_number ?? shipment.tracking_number,
                    tracking_url: input.tracking_url ?? shipment.tracking_url,
                    updated_at: new Date(),
                });
            operations = (await phase5OrderOperationsQueryService.orderOperations(orderId)).data;
            current = operations.fulfillments.find((item) => item.id === Number(fulfillment.id));
            shipment = current?.shipments.find((item) => item.id === shipment!.id);
            if (!shipment) {
                throw new Exception("Compatibility shipment could not be projected after update", {
                    status: 409,
                    code: "E_SHIPMENT_PROJECTION_MISSING",
                });
            }
        }

        if (shipment.status === "label_created") {
            await phase5OrderOperationsService.appendShipmentEvent(
                shipment.id,
                {
                    status: "in_transit",
                    expected_version: shipment.version,
                    message: "Shipment accepted through the legacy mark-shipped compatibility action",
                    evidence: { source: "legacy_mark_shipped", notify_customer_requested: input.notify_customer !== false },
                },
                actor,
            );
        }
        await this.updateCompatibilityProjection(orderId, input, false);
    }

    private async updateCompatibilityProjection(orderId: number, input: LegacyMarkShippedInput, preserveTimestamp: boolean) {
        const trx = currentTrx();
        const order = await trx.from("orders").where("id", orderId).forUpdate().first();
        if (!order) return;
        const attributes = typeof order.attributes === "object" && order.attributes !== null ? order.attributes : {};
        const previous = typeof attributes.shipping === "object" && attributes.shipping !== null ? attributes.shipping : {};
        const shipping = {
            ...previous,
            tracking_number: input.tracking_number ?? previous.tracking_number ?? null,
            tracking_url: input.tracking_url ?? previous.tracking_url ?? null,
            carrier: input.carrier ?? previous.carrier ?? null,
            shipped_at: preserveTimestamp && previous.shipped_at ? previous.shipped_at : DateTime.utc().toISO(),
        };
        await trx
            .from("orders")
            .where("id", orderId)
            .update({ attributes: JSON.stringify({ ...attributes, shipping }), updated_at: new Date() });
    }
}

export const legacyMarkShippedService = new LegacyMarkShippedService();
