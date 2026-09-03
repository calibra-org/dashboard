import type { HttpContext } from "@adonisjs/core/http";
import { ensureId, socialCommerceService } from "#services/social/social_commerce_service";
import { socialMediaPipelineService } from "#services/social/social_media_pipeline_service";
import { socialReviewService } from "#services/social/social_review_service";
import { socialSearchService } from "#services/social/social_search_service";
import {
    storefrontAskVideoValidator,
    storefrontSocialFeedValidator,
    storefrontSocialInteractionValidator,
    storefrontSocialSearchValidator,
} from "#validators/storefront/social_commerce_validator";

export default class StorefrontSocialCommerceController {
    async storyRail(ctx: HttpContext) {
        const p = await ctx.request.validateUsing(storefrontSocialFeedValidator);
        return socialCommerceService.storyRail(p.locale ?? "fa", p.limit ?? 16);
    }
    async discover(ctx: HttpContext) {
        const p = await ctx.request.validateUsing(storefrontSocialFeedValidator);
        return socialCommerceService.discover(p);
    }
    async interaction(ctx: HttpContext) {
        const p = await ctx.request.validateUsing(storefrontSocialInteractionValidator);
        ctx.response.status(201);
        return socialCommerceService.recordInteraction(p);
    }
    async contract() {
        return socialCommerceService.contract();
    }
    async search(ctx: HttpContext) {
        return socialSearchService.search(await ctx.request.validateUsing(storefrontSocialSearchValidator));
    }
    async playback(ctx: HttpContext) {
        return socialMediaPipelineService.playback(ensureId(ctx.params.mediaId), Boolean(ctx.auth.user));
    }
    async askVideo(ctx: HttpContext) {
        const p = await ctx.request.validateUsing(storefrontAskVideoValidator);
        return socialMediaPipelineService.askVideo(ensureId(ctx.params.contentId), p.question, p.locale ?? "fa");
    }
    async reviewShow(ctx: HttpContext) {
        return socialReviewService.detail(ensureId(ctx.params.reviewId));
    }
    async liveAccess(ctx: HttpContext) {
        return socialCommerceService.liveParticipantAccess(ensureId(ctx.params.contentId), {
            anonymous_id: String(ctx.request.input("anonymous_id", "") || "") || null,
        });
    }
    async providerWebhook(ctx: HttpContext) {
        const rawBody = ctx.request.raw() ?? JSON.stringify(ctx.request.all() ?? {});
        return socialMediaPipelineService.consumeProviderWebhook({ signature: ctx.request.header("webhook-signature"), rawBody });
    }
}
