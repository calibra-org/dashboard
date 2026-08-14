import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import AdminOrdersController from "#controllers/admin/orders_controller";
import { recordAudit } from "#services/admin_audit_log_service";
import { legacyMarkShippedService } from "#services/legacy_mark_shipped_service";
import { phase5OrderOperationsService } from "#services/phase5_order_operations_service";
import { phase5ReturnPolicyService } from "#services/phase5_return_policy_service";
import { adminOrderMarkShippedValidator } from "#validators/admin/order_validator";
import {
    approveReturnValidator,
    createFulfillmentValidator,
    createReturnValidator,
    createShipmentValidator,
    receiveReturnValidator,
    refundReturnValidator,
    shipmentEventValidator,
    transitionFulfillmentValidator,
    transitionReturnValidator,
} from "#validators/admin/phase5_operations_validator";

function id(value: unknown, code: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Exception("Invalid identifier", { status: 422, code });
    return parsed;
}

async function actor(ctx: HttpContext) {
    return ctx.auth.authenticate();
}

export default class OrderOperationsController {
    async summary() {
        return phase5OrderOperationsService.summary();
    }

    async show(ctx: HttpContext) {
        return phase5OrderOperationsService.orderOperations(id(ctx.params.orderId, "E_ORDER_ID"));
    }

    async legacyMarkShipped(ctx: HttpContext) {
        const orderId = id(ctx.params.id, "E_ORDER_ID");
        const payload = await ctx.request.validateUsing(adminOrderMarkShippedValidator);
        await legacyMarkShippedService.execute(orderId, payload, await actor(ctx));
        await recordAudit({
            ctx,
            action: "order.shipment.legacy_mark_shipped",
            entityKind: "order",
            entityId: orderId,
            payload: {
                carrier: payload.carrier ?? null,
                tracking_number: payload.tracking_number ?? null,
                notification_requested: payload.notify_customer !== false,
                notification_queued: false,
            },
        });
        return new AdminOrdersController().show(ctx);
    }

    async createFulfillment(ctx: HttpContext) {
        const orderId = id(ctx.params.orderId, "E_ORDER_ID");
        const payload = await ctx.request.validateUsing(createFulfillmentValidator);
        const result = await phase5OrderOperationsService.createFulfillment(
            orderId,
            payload,
            await actor(ctx),
            ctx.request.header("idempotency-key"),
        );
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "order.fulfillment.create",
            entityKind: "order_fulfillment",
            entityId: Number(result.data.id),
            payload: { order_id: orderId, item_count: payload.items.length },
        });
        return result;
    }

    async transitionFulfillment(ctx: HttpContext) {
        const fulfillmentId = id(ctx.params.id, "E_FULFILLMENT_ID");
        const payload = await ctx.request.validateUsing(transitionFulfillmentValidator);
        const result = await phase5OrderOperationsService.transitionFulfillment(
            fulfillmentId,
            payload.status,
            payload.expected_version,
            await actor(ctx),
        );
        await recordAudit({
            ctx,
            action: "order.fulfillment.transition",
            entityKind: "order_fulfillment",
            entityId: fulfillmentId,
            payload: { status: payload.status, expected_version: payload.expected_version },
        });
        return result;
    }

    async createShipment(ctx: HttpContext) {
        const fulfillmentId = id(ctx.params.fulfillmentId, "E_FULFILLMENT_ID");
        const payload = await ctx.request.validateUsing(createShipmentValidator);
        const result = await phase5OrderOperationsService.createShipment(fulfillmentId, payload, await actor(ctx));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "order.shipment.create",
            entityKind: "order_shipment",
            entityId: Number(result.data.id),
            payload: { fulfillment_id: fulfillmentId, carrier: payload.carrier ?? null },
        });
        return result;
    }

    async shipmentEvent(ctx: HttpContext) {
        const shipmentId = id(ctx.params.shipmentId, "E_SHIPMENT_ID");
        const payload = await ctx.request.validateUsing(shipmentEventValidator);
        const result = await phase5OrderOperationsService.appendShipmentEvent(shipmentId, payload, await actor(ctx));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "order.shipment.event",
            entityKind: "order_shipment",
            entityId: shipmentId,
            payload: { status: payload.status, occurred_at: payload.occurred_at ?? null },
        });
        return result;
    }

    async createReturn(ctx: HttpContext) {
        const orderId = id(ctx.params.orderId, "E_ORDER_ID");
        const payload = await ctx.request.validateUsing(createReturnValidator);
        const idempotencyKey = ctx.request.header("idempotency-key");
        const prepared = await phase5ReturnPolicyService.prepareCreate(orderId, payload, idempotencyKey);
        const result = await phase5OrderOperationsService.createReturn(orderId, prepared, await actor(ctx), idempotencyKey);
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "order.return.create",
            entityKind: "order_return",
            entityId: Number(result.data.id),
            payload: { order_id: orderId, item_count: prepared.items.length },
        });
        return result;
    }

    async approveReturn(ctx: HttpContext) {
        const returnId = id(ctx.params.id, "E_RETURN_ID");
        const payload = await ctx.request.validateUsing(approveReturnValidator);
        const result = await phase5OrderOperationsService.approveReturn(returnId, payload, await actor(ctx));
        await recordAudit({
            ctx,
            action: "order.return.approve",
            entityKind: "order_return",
            entityId: returnId,
            payload: { expected_version: payload.expected_version },
        });
        return result;
    }

    async receiveReturn(ctx: HttpContext) {
        const returnId = id(ctx.params.id, "E_RETURN_ID");
        const payload = await ctx.request.validateUsing(receiveReturnValidator);
        const result = await phase5OrderOperationsService.receiveReturn(returnId, payload);
        await recordAudit({
            ctx,
            action: "order.return.receive",
            entityKind: "order_return",
            entityId: returnId,
            payload: { expected_version: payload.expected_version, item_count: payload.items.length },
        });
        return result;
    }

    async transitionReturn(ctx: HttpContext) {
        const returnId = id(ctx.params.id, "E_RETURN_ID");
        const payload = await ctx.request.validateUsing(transitionReturnValidator);
        const result = await phase5OrderOperationsService.transitionReturn(returnId, payload.status, payload.expected_version);
        await recordAudit({
            ctx,
            action: "order.return.transition",
            entityKind: "order_return",
            entityId: returnId,
            payload: { status: payload.status, expected_version: payload.expected_version },
        });
        return result;
    }

    async refundReturn(ctx: HttpContext) {
        const returnId = id(ctx.params.id, "E_RETURN_ID");
        const payload = await ctx.request.validateUsing(refundReturnValidator);
        await phase5ReturnPolicyService.refundReceivedReturn(returnId, payload, await actor(ctx));
        const result = await phase5OrderOperationsService.returnDetail(returnId);
        await recordAudit({
            ctx,
            action: "order.return.refund",
            entityKind: "order_return",
            entityId: returnId,
            payload: { refund_id: result.data.refund_id, expected_version: payload.expected_version },
        });
        return result;
    }
}
