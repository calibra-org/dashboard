import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import {
    applyFulfillmentPromiseAccessPreset,
    listFulfillmentPromiseAccess,
    requireFulfillmentPromisePermission,
} from "#services/fulfillment_promise/permissions";
import * as fulfillmentPromise from "#services/fulfillment_promise/promise_service";
import { requireRecentIdentityStepUp } from "#services/identity/step_up";
import {
    fulfillmentPromiseAccessPresetValidator,
    fulfillmentPromiseCapacityValidator,
    fulfillmentPromiseInventorySourceValidator,
    fulfillmentPromiseNodeCreateValidator,
    fulfillmentPromiseServiceProfileValidator,
    fulfillmentPromiseTransferLaneValidator,
} from "#validators/fulfillment_promise/fulfillment_promise_validator";

export default class FulfillmentPromiseController {
    async overview(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireFulfillmentPromisePermission(user, "fulfillment_promise.view");
        return { data: await fulfillmentPromise.overview() };
    }

    async nodes(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireFulfillmentPromisePermission(user, "fulfillment_promise.view");
        return { data: await fulfillmentPromise.listNodes() };
    }

    async createNode(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireFulfillmentPromisePermission(user, "fulfillment_promise.node.manage");
        await requireRecentIdentityStepUp(Number(user.id), "fulfillment.promise.node.manage");
        const payload = await ctx.request.validateUsing(fulfillmentPromiseNodeCreateValidator);
        const data = await fulfillmentPromise.createNode(payload, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "fulfillment_promise.node.create",
            entityKind: "fulfillment_network_node",
            entityId: data.id,
            payload: { public_id: data.public_id, node_code: payload.node_code, node_type: payload.node_type, reason: payload.reason },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async mapInventorySource(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireFulfillmentPromisePermission(user, "fulfillment_promise.node.manage");
        const payload = await ctx.request.validateUsing(fulfillmentPromiseInventorySourceValidator);
        const data = await fulfillmentPromise.mapInventorySource(ctx.params.publicId, payload.inventory_item_id);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "fulfillment_promise.node.inventory_source.map",
            entityKind: "fulfillment_node_inventory_source",
            entityId: data.id,
            payload: { node_public_id: ctx.params.publicId, inventory_item_id: payload.inventory_item_id, reason: payload.reason },
            strict: true,
        });
        return { data };
    }

    async upsertCapacity(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireFulfillmentPromisePermission(user, "fulfillment_promise.capacity.manage");
        const payload = await ctx.request.validateUsing(fulfillmentPromiseCapacityValidator);
        const data = await fulfillmentPromise.upsertCapacity(ctx.params.publicId, payload);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "fulfillment_promise.capacity.upsert",
            entityKind: "fulfillment_capacity_window",
            entityId: data.id,
            payload: {
                node_public_id: ctx.params.publicId,
                service_date: payload.service_date,
                window_start_local: payload.window_start_local,
                window_end_local: payload.window_end_local,
                capacity_units: payload.capacity_units,
                reason: payload.reason,
            },
            strict: true,
        });
        return { data };
    }

    async serviceProfiles(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireFulfillmentPromisePermission(user, "fulfillment_promise.view");
        return { data: await fulfillmentPromise.listServiceProfiles() };
    }

    async upsertServiceProfile(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireFulfillmentPromisePermission(user, "fulfillment_promise.service.manage");
        await requireRecentIdentityStepUp(Number(user.id), "fulfillment.promise.service.calibration");
        const payload = await ctx.request.validateUsing(fulfillmentPromiseServiceProfileValidator);
        const data = await fulfillmentPromise.upsertServiceProfile(ctx.params.publicId, payload);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "fulfillment_promise.service_profile.upsert",
            entityKind: "fulfillment_service_profile",
            entityId: data.id,
            payload: {
                node_public_id: ctx.params.publicId,
                shipping_zone_method_id: payload.shipping_zone_method_id,
                calibration_sample_count: payload.calibration_sample_count,
                confidence_bps: payload.confidence_bps,
                last_calibrated_at: payload.last_calibrated_at ?? null,
                reason: payload.reason,
            },
            strict: true,
        });
        return { data };
    }

    async upsertTransferLane(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireFulfillmentPromisePermission(user, "fulfillment_promise.service.manage");
        const payload = await ctx.request.validateUsing(fulfillmentPromiseTransferLaneValidator);
        const data = await fulfillmentPromise.upsertTransferLane(payload);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "fulfillment_promise.transfer_lane.upsert",
            entityKind: "fulfillment_transfer_lane",
            entityId: data.id,
            payload: {
                from_node_public_id: payload.from_node_public_id,
                to_node_public_id: payload.to_node_public_id,
                calibration_sample_count: payload.calibration_sample_count,
                reason: payload.reason,
            },
            strict: true,
        });
        return { data };
    }

    async promises(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireFulfillmentPromisePermission(user, "fulfillment_promise.view");
        return { data: await fulfillmentPromise.listRecentPromises(Number(ctx.request.input("limit", 100))) };
    }

    async allocations(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireFulfillmentPromisePermission(user, "fulfillment_promise.allocation.view");
        return { data: await fulfillmentPromise.listAllocationRecommendations(Number(ctx.request.input("limit", 100))) };
    }

    async accuracy(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireFulfillmentPromisePermission(user, "fulfillment_promise.view");
        return { data: await fulfillmentPromise.promiseAccuracy() };
    }

    async syncOutcomes(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireFulfillmentPromisePermission(user, "fulfillment_promise.outcome.manage");
        const data = await fulfillmentPromise.syncDeliveryOutcomes();
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "fulfillment_promise.outcomes.sync",
            entityKind: "fulfillment_promise_outcome",
            entityId: null,
            payload: { synchronized: data.synchronized },
            strict: true,
        });
        return { data };
    }

    async access(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireFulfillmentPromisePermission(user, "fulfillment_promise.access.manage");
        return { data: await listFulfillmentPromiseAccess() };
    }

    async accessPreset(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireFulfillmentPromisePermission(user, "fulfillment_promise.access.manage");
        await requireRecentIdentityStepUp(Number(user.id), "fulfillment.promise.access");
        const payload = await ctx.request.validateUsing(fulfillmentPromiseAccessPresetValidator);
        const data = await applyFulfillmentPromiseAccessPreset(Number(user.id), payload.user_id, payload.preset);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "fulfillment_promise.access.preset.apply",
            entityKind: "admin_user",
            entityId: payload.user_id,
            payload: { preset: payload.preset, reason: payload.reason },
            strict: true,
        });
        return { data };
    }
}
