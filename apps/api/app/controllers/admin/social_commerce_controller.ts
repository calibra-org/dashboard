import type { HttpContext } from "@adonisjs/core/http";
import { recordAudit } from "#services/admin_audit_log_service";
import { ensureId, socialCommerceService } from "#services/social/social_commerce_service";
import { socialMediaPipelineService } from "#services/social/social_media_pipeline_service";
import { socialReviewService } from "#services/social/social_review_service";
import { socialSearchService } from "#services/social/social_search_service";
import {
    adminSocialAttributionValidator,
    adminSocialChannelMembershipValidator,
    adminSocialChannelValidator,
    adminSocialContentCreateValidator,
    adminSocialContentListValidator,
    adminSocialContentUpdateValidator,
    adminSocialFrameValidator,
    adminSocialLiveChatFreezeValidator,
    adminSocialLiveCreateValidator,
    adminSocialLiveEmergencyStopValidator,
    adminSocialLiveParticipantControlValidator,
    adminSocialLiveReplayValidator,
    adminSocialLiveUpdateValidator,
    adminSocialMarkerValidator,
    adminSocialMediaRightsValidator,
    adminSocialMediaSecurityScanValidator,
    adminSocialMediaTrackReviewValidator,
    adminSocialMediaTrackValidator,
    adminSocialMediaUploadIntentValidator,
    adminSocialMessageValidator,
    adminSocialModerationActionValidator,
    adminSocialModerationListValidator,
    adminSocialReviewResponseValidator,
    adminSocialSearchValidator,
    adminSocialThreadListValidator,
    adminSocialTransitionValidator,
} from "#validators/admin/social_commerce_validator";

async function actorId(ctx: HttpContext) {
    return Number((await ctx.auth.authenticate()).id);
}
function routeId(ctx: HttpContext, key = "id") {
    return ensureId(ctx.params[key]);
}
async function audit(
    ctx: HttpContext,
    action: string,
    entityKind: string,
    entityId: number | null,
    payload: Record<string, unknown> = {},
) {
    await recordAudit({ ctx, action, entityKind, entityId, payload });
}

export default class AdminSocialCommerceController {
    async summary() {
        return socialCommerceService.adminSummary();
    }
    async contentIndex(ctx: HttpContext) {
        return socialCommerceService.listContent(await ctx.request.validateUsing(adminSocialContentListValidator));
    }
    async contentShow(ctx: HttpContext) {
        return socialCommerceService.findContent(routeId(ctx));
    }
    async contentStore(ctx: HttpContext) {
        const p = await ctx.request.validateUsing(adminSocialContentCreateValidator);
        const r = await socialCommerceService.createContent(p, await actorId(ctx));
        ctx.response.status(201);
        await audit(ctx, "social.content.create", "social_content", Number(r.data.id ?? 0), { kind: p.kind });
        return r;
    }
    async contentUpdate(ctx: HttpContext) {
        const id = routeId(ctx);
        const p = await ctx.request.validateUsing(adminSocialContentUpdateValidator);
        const r = await socialCommerceService.updateContent(id, p as never);
        await audit(ctx, "social.content.update", "social_content", id, { expected_version: p.expected_version });
        return r;
    }
    async contentTransition(ctx: HttpContext) {
        const id = routeId(ctx);
        const p = await ctx.request.validateUsing(adminSocialTransitionValidator);
        const r = await socialCommerceService.transitionContent(id, p.expected_version, p.status);
        await audit(ctx, "social.content.transition", "social_content", id, p);
        return r;
    }
    async frameStore(ctx: HttpContext) {
        const id = routeId(ctx, "contentId");
        const p = await ctx.request.validateUsing(adminSocialFrameValidator);
        const r = await socialCommerceService.addFrame(id, p);
        ctx.response.status(201);
        await audit(ctx, "social.frame.create", "social_content", id);
        return r;
    }
    async markerStore(ctx: HttpContext) {
        const id = routeId(ctx, "contentId");
        const p = await ctx.request.validateUsing(adminSocialMarkerValidator);
        const r = await socialCommerceService.addProductMarker(id, p);
        ctx.response.status(201);
        await audit(ctx, "social.marker.create", "social_content", id, { product_id: p.product_id });
        return r;
    }
    async attributionStore(ctx: HttpContext) {
        const p = await ctx.request.validateUsing(adminSocialAttributionValidator);
        const r = await socialCommerceService.recordAttribution(p);
        ctx.response.status(201);
        await audit(ctx, "social.attribution.record", "order", p.order_id);
        return r;
    }
    async channelStore(ctx: HttpContext) {
        const p = await ctx.request.validateUsing(adminSocialChannelValidator);
        const r = await socialCommerceService.createChannel(p);
        ctx.response.status(201);
        await audit(ctx, "social.channel.create", "social_channel", Number(r.data.id ?? 0));
        return r;
    }
    async channelMembership(ctx: HttpContext) {
        const p = await ctx.request.validateUsing(adminSocialChannelMembershipValidator);
        const r = await socialCommerceService.setChannelMembership(routeId(ctx, "channelId"), p);
        await audit(ctx, "social.channel.membership", "social_channel", routeId(ctx, "channelId"));
        return r;
    }
    async threads(ctx: HttpContext) {
        return socialCommerceService.listThreads(await ctx.request.validateUsing(adminSocialThreadListValidator));
    }
    async threadMessage(ctx: HttpContext) {
        const p = await ctx.request.validateUsing(adminSocialMessageValidator);
        const r = await socialCommerceService.addAdminMessage(routeId(ctx, "threadId"), await actorId(ctx), p.body);
        ctx.response.status(201);
        return r;
    }
    async threadConvertToTicket(ctx: HttpContext) {
        const r = await socialCommerceService.convertThreadToTicket(routeId(ctx, "threadId"), await actorId(ctx));
        await audit(ctx, "social.thread.convert_to_ticket", "social_thread", routeId(ctx, "threadId"));
        return r;
    }
    async moderation(ctx: HttpContext) {
        return socialCommerceService.listModeration(await ctx.request.validateUsing(adminSocialModerationListValidator));
    }
    async moderationAction(ctx: HttpContext) {
        const id = routeId(ctx);
        const p = await ctx.request.validateUsing(adminSocialModerationActionValidator);
        const r = await socialCommerceService.moderateCase(id, await actorId(ctx), p);
        await audit(ctx, "social.moderation.action", "social_moderation_case", id, { action: p.action });
        return r;
    }
    async liveStore(ctx: HttpContext) {
        const id = routeId(ctx, "contentId");
        const p = await ctx.request.validateUsing(adminSocialLiveCreateValidator);
        const r = await socialCommerceService.createLiveSession(id, p);
        ctx.response.status(201);
        await audit(ctx, "social.live.create", "social_content", id);
        return r;
    }
    async liveUpdate(ctx: HttpContext) {
        const id = routeId(ctx, "contentId");
        const p = await ctx.request.validateUsing(adminSocialLiveUpdateValidator);
        const r = await socialCommerceService.updateLiveSession(id, p);
        await audit(ctx, "social.live.update", "social_content", id, { status: p.status });
        return r;
    }
    async liveChatFreeze(ctx: HttpContext) {
        const id = routeId(ctx, "contentId");
        const p = await ctx.request.validateUsing(adminSocialLiveChatFreezeValidator);
        const r = await socialCommerceService.freezeLiveChat(id, await actorId(ctx), p);
        await audit(ctx, "social.live.chat_freeze", "social_content", id, { frozen: p.frozen });
        return r;
    }
    async liveParticipantControl(ctx: HttpContext) {
        const id = routeId(ctx, "contentId");
        const p = await ctx.request.validateUsing(adminSocialLiveParticipantControlValidator);
        const r = await socialCommerceService.moderateLiveParticipant(id, await actorId(ctx), p);
        await audit(ctx, "social.live.participant_control", "social_content", id, { control: p.control, active: p.active });
        return r;
    }
    async liveReplay(ctx: HttpContext) {
        const id = routeId(ctx, "contentId");
        const p = await ctx.request.validateUsing(adminSocialLiveReplayValidator);
        const r = await socialCommerceService.attachLiveReplay(id, await actorId(ctx), p);
        await audit(ctx, "social.live.replay", "social_content", id, { media_id: p.media_id });
        return r;
    }
    async liveEmergencyStop(ctx: HttpContext) {
        const id = routeId(ctx, "contentId");
        const p = await ctx.request.validateUsing(adminSocialLiveEmergencyStopValidator);
        const r = await socialCommerceService.emergencyStopLive(id, await actorId(ctx), p);
        await audit(ctx, "social.live.emergency_stop", "social_content", id, { reason: p.reason });
        return r;
    }
    async mediaUploadIntent(ctx: HttpContext) {
        const p = await ctx.request.validateUsing(adminSocialMediaUploadIntentValidator);
        const actor = await actorId(ctx);
        const r = await socialMediaPipelineService.createUploadIntent({
            filename: p.filename,
            mime: p.mime,
            sizeBytes: p.size_bytes,
            purpose: p.purpose,
            ownerActorType: "user",
            ownerActorRef: String(actor),
            accessPolicy: p.access_policy,
        });
        ctx.response.status(201);
        await audit(ctx, "social.media.upload_intent", "media", Number(r.data.media_id), { purpose: p.purpose });
        return r;
    }
    async mediaAcknowledge(ctx: HttpContext) {
        const mediaId = routeId(ctx, "mediaId");
        const r = await socialMediaPipelineService.acknowledgeUpload(mediaId);
        await audit(ctx, "social.media.upload_acknowledge", "media", mediaId);
        return r;
    }
    async mediaShow(ctx: HttpContext) {
        return socialMediaPipelineService.inspect(routeId(ctx, "mediaId"));
    }
    async mediaTrackStore(ctx: HttpContext) {
        const mediaId = routeId(ctx, "mediaId");
        const p = await ctx.request.validateUsing(adminSocialMediaTrackValidator);
        const r = await socialMediaPipelineService.addTrack(mediaId, {
            kind: p.kind,
            locale: p.locale,
            textContent: p.text_content,
            providerRef: p.provider_ref,
            storageKey: p.storage_key,
            evidence: p.evidence,
        });
        ctx.response.status(201);
        await audit(ctx, "social.media.track.create", "media", mediaId, { track_id: r.data.id, kind: p.kind });
        return r;
    }
    async mediaTrackReview(ctx: HttpContext) {
        const trackId = routeId(ctx, "trackId");
        const p = await ctx.request.validateUsing(adminSocialMediaTrackReviewValidator);
        const r = await socialMediaPipelineService.reviewTrack(trackId, await actorId(ctx), p.decision);
        await audit(ctx, "social.media.track.review", "media_track", trackId, p);
        return r;
    }
    async mediaRightsStore(ctx: HttpContext) {
        const mediaId = routeId(ctx, "mediaId");
        const p = await ctx.request.validateUsing(adminSocialMediaRightsValidator);
        const r = await socialMediaPipelineService.recordRights(mediaId, await actorId(ctx), {
            rightsBasis: p.rights_basis,
            holderRef: p.holder_ref,
            consentConfirmed: p.consent_confirmed,
            validUntil: p.valid_until,
            evidence: p.evidence,
        });
        ctx.response.status(201);
        await audit(ctx, "social.media.rights.record", "media", mediaId, { rights_basis: p.rights_basis });
        return r;
    }
    async mediaSecurityScan(ctx: HttpContext) {
        const mediaId = routeId(ctx, "mediaId");
        const p = await ctx.request.validateUsing(adminSocialMediaSecurityScanValidator);
        const r = await socialMediaPipelineService.recordSecurityScan(mediaId, await actorId(ctx), {
            scanner: p.scanner,
            scannerRef: p.scanner_ref,
            verdict: p.verdict,
            contentHash: p.content_hash,
            evidence: p.evidence,
        });
        await audit(ctx, "social.media.security_scan", "media", mediaId, { scanner: p.scanner, verdict: p.verdict });
        return r;
    }
    async mediaRetry(ctx: HttpContext) {
        const mediaId = routeId(ctx, "mediaId");
        const r = await socialMediaPipelineService.retryFailed(mediaId, await actorId(ctx));
        await audit(ctx, "social.media.retry", "media", mediaId, { retry_count: r.data.retry_count });
        return r;
    }
    async mediaPublishable(ctx: HttpContext) {
        const mediaId = routeId(ctx, "mediaId");
        const r = await socialMediaPipelineService.markPublishable(mediaId, await actorId(ctx));
        await audit(ctx, "social.media.publishable", "media", mediaId);
        return r;
    }
    async reviewShow(ctx: HttpContext) {
        return socialReviewService.detail(routeId(ctx, "reviewId"));
    }
    async reviewResponse(ctx: HttpContext) {
        const reviewId = routeId(ctx, "reviewId");
        const p = await ctx.request.validateUsing(adminSocialReviewResponseValidator);
        const r = await socialReviewService.sellerResponse(await actorId(ctx), reviewId, p.body);
        ctx.response.status(201);
        await audit(ctx, "social.review.seller_response", "product_review", reviewId);
        return r;
    }
    async search(ctx: HttpContext) {
        return socialSearchService.search(await ctx.request.validateUsing(adminSocialSearchValidator));
    }
    async analytics() {
        return socialCommerceService.analytics();
    }
    async contract() {
        return socialCommerceService.contract();
    }
}
