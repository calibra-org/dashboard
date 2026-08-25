import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { requireRecentIdentityStepUp } from "#services/identity/step_up";
import {
    applyRetailMediaAccessPreset,
    listRetailMediaAccess,
    requireRetailMediaPermission,
} from "#services/retail_media/permissions";
import * as retailMedia from "#services/retail_media/retail_media_service";
import {
    retailMediaAccessPresetValidator,
    retailMediaAdvertiserCreateValidator,
    retailMediaAffiliateLinkValidator,
    retailMediaCampaignCreateValidator,
    retailMediaCampaignPlacementValidator,
    retailMediaCampaignProductValidator,
    retailMediaCampaignStateValidator,
    retailMediaCampaignUpdateValidator,
    retailMediaCreatorCreateValidator,
    retailMediaFundingValidator,
    retailMediaPayoutValidator,
    retailMediaPlacementCreateValidator,
    retailMediaPlacementStateValidator,
} from "#validators/retail_media/retail_media_validator";

export default class RetailMediaController {
    async overview(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.view");
        return { data: await retailMedia.overview() };
    }

    async advertisers(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.view");
        return { data: await retailMedia.listAdvertisers() };
    }

    async createAdvertiser(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.campaign.manage");
        const payload = await ctx.request.validateUsing(retailMediaAdvertiserCreateValidator);
        const data = await retailMedia.createAdvertiser(payload, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "retail_media.advertiser.create",
            entityKind: "retail_media_advertiser",
            entityId: data.id,
            payload: { public_id: data.public_id, kind: payload.kind, supplier_id: payload.supplier_id ?? null, reason: payload.reason },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async campaigns(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.view");
        return { data: await retailMedia.listCampaigns() };
    }

    async campaign(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.view");
        return { data: await retailMedia.campaignDetail(ctx.params.publicId) };
    }

    async createCampaign(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.campaign.manage");
        const payload = await ctx.request.validateUsing(retailMediaCampaignCreateValidator);
        const data = await retailMedia.createCampaign(payload, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "retail_media.campaign.create",
            entityKind: "retail_media_campaign",
            entityId: data.id,
            payload: { public_id: data.public_id, advertiser_public_id: payload.advertiser_public_id, reason: payload.reason },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async updateCampaign(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.campaign.manage");
        const payload = await ctx.request.validateUsing(retailMediaCampaignUpdateValidator);
        const data = await retailMedia.updateCampaign(ctx.params.publicId, payload, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "retail_media.campaign.update",
            entityKind: "retail_media_campaign",
            entityId: data.id,
            payload: { public_id: ctx.params.publicId, previous_version: payload.version, reason: payload.reason },
            strict: true,
        });
        return { data };
    }

    async setCampaignStatus(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.campaign.manage");
        await requireRecentIdentityStepUp(Number(user.id), "retail.media.campaign.status");
        const payload = await ctx.request.validateUsing(retailMediaCampaignStateValidator);
        const data = await retailMedia.setCampaignStatus(ctx.params.publicId, payload.status, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "retail_media.campaign.status",
            entityKind: "retail_media_campaign",
            entityId: data.id,
            payload: { public_id: ctx.params.publicId, status: payload.status, reason: payload.reason },
            strict: true,
        });
        return { data };
    }

    async addCampaignProduct(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.campaign.manage");
        const payload = await ctx.request.validateUsing(retailMediaCampaignProductValidator);
        const data = await retailMedia.addCampaignProduct(ctx.params.publicId, payload);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "retail_media.campaign.product.upsert",
            entityKind: "retail_media_campaign_product",
            entityId: data?.id ?? null,
            payload: {
                campaign_public_id: ctx.params.publicId,
                product_id: payload.product_id,
                variation_id: payload.variation_id ?? null,
                safety_status: payload.safety_status,
                reason: payload.reason,
            },
            strict: true,
        });
        return { data };
    }

    async placements(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.view");
        return { data: await retailMedia.listPlacements() };
    }

    async createPlacement(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.placement.manage");
        const payload = await ctx.request.validateUsing(retailMediaPlacementCreateValidator);
        const data = await retailMedia.createPlacement(payload, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "retail_media.placement.create",
            entityKind: "retail_media_placement",
            entityId: data.id,
            payload: { public_id: data.public_id, surface: payload.surface, disclosure_text: payload.disclosure_text, reason: payload.reason },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async setPlacementStatus(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.placement.manage");
        const payload = await ctx.request.validateUsing(retailMediaPlacementStateValidator);
        const data = await retailMedia.setPlacementStatus(ctx.params.publicId, payload.status);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "retail_media.placement.status",
            entityKind: "retail_media_placement",
            entityId: data?.id ?? null,
            payload: { public_id: ctx.params.publicId, status: payload.status, reason: payload.reason },
            strict: true,
        });
        return { data };
    }

    async attachCampaignPlacement(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.placement.manage");
        const payload = await ctx.request.validateUsing(retailMediaCampaignPlacementValidator);
        const data = await retailMedia.attachCampaignPlacement(ctx.params.publicId, payload);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "retail_media.campaign.placement.upsert",
            entityKind: "retail_media_campaign_placement",
            entityId: data?.id ?? null,
            payload: { campaign_public_id: ctx.params.publicId, placement_public_id: payload.placement_public_id, reason: payload.reason },
            strict: true,
        });
        return { data };
    }

    async fundCampaign(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.budget.manage");
        await requireRecentIdentityStepUp(Number(user.id), "retail.media.budget.fund");
        const payload = await ctx.request.validateUsing(retailMediaFundingValidator);
        const data = await retailMedia.fundCampaign(ctx.params.publicId, payload, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "retail_media.campaign.fund",
            entityKind: "retail_media_budget_ledger",
            entityId: data.id,
            payload: {
                campaign_public_id: ctx.params.publicId,
                amount_minor: payload.amount_minor,
                funding_source: payload.funding_source,
                source_ref: payload.source_ref ?? null,
                reason: payload.reason,
            },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async creators(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.view");
        return { data: await retailMedia.listCreators() };
    }

    async createCreator(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.creator.manage");
        const payload = await ctx.request.validateUsing(retailMediaCreatorCreateValidator);
        const data = await retailMedia.createCreator(payload, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "retail_media.creator.create",
            entityKind: "retail_media_creator",
            entityId: data.id,
            payload: { public_id: data.public_id, holding_days: payload.holding_days, reason: payload.reason },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async createAffiliateLink(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.creator.manage");
        const payload = await ctx.request.validateUsing(retailMediaAffiliateLinkValidator);
        const data = await retailMedia.createAffiliateLink(ctx.params.publicId, payload);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "retail_media.creator.link.create",
            entityKind: "retail_media_affiliate_link",
            entityId: data.id,
            payload: {
                creator_public_id: ctx.params.publicId,
                campaign_public_id: payload.campaign_public_id ?? null,
                product_id: payload.product_id ?? null,
                attribution_window_days: payload.attribution_window_days,
                reason: payload.reason,
            },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async commissions(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.view");
        return { data: await retailMedia.listCommissionLedger() };
    }

    async payout(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.payout.manage");
        await requireRecentIdentityStepUp(Number(user.id), "retail.media.creator.payout");
        const payload = await ctx.request.validateUsing(retailMediaPayoutValidator);
        const data = await retailMedia.recordCreatorPayout(ctx.params.publicId, payload, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "retail_media.creator.payout.record",
            entityKind: "retail_media_commission_ledger",
            entityId: data.id,
            payload: {
                creator_public_id: ctx.params.publicId,
                amount_minor: payload.amount_minor,
                currency: payload.currency,
                payout_ref: payload.payout_ref,
                reason: payload.reason,
            },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async measurement(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.measurement.view");
        return { data: await retailMedia.measurement() };
    }

    async access(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.access.manage");
        return { data: await listRetailMediaAccess() };
    }

    async accessPreset(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireRetailMediaPermission(user, "retail_media.access.manage");
        await requireRecentIdentityStepUp(Number(user.id), "retail.media.access");
        const payload = await ctx.request.validateUsing(retailMediaAccessPresetValidator);
        const data = await applyRetailMediaAccessPreset(Number(user.id), payload.user_id, payload.preset);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "retail_media.access.preset.apply",
            entityKind: "admin_user",
            entityId: payload.user_id,
            payload: { preset: payload.preset, reason: payload.reason },
            strict: true,
        });
        return { data };
    }
}
