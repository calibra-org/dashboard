import type { HttpContext } from "@adonisjs/core/http";
import { customerForUser, ensureId, socialCommerceService } from "#services/social/social_commerce_service";
import { socialMediaPipelineService } from "#services/social/social_media_pipeline_service";
import { socialReviewService } from "#services/social/social_review_service";
import {
    accountSocialAppealValidator,
    accountSocialFollowValidator,
    accountSocialInteractionValidator,
    accountSocialMediaUploadIntentValidator,
    accountSocialMessageValidator,
    accountSocialReportValidator,
    accountSocialReviewHelpfulValidator,
    accountSocialReviewMediaValidator,
    accountSocialReviewReportValidator,
    accountSocialThreadCreateValidator,
} from "#validators/account/social_commerce_validator";

async function userId(ctx: HttpContext) {
    return Number((await ctx.auth.authenticate()).id);
}
export default class AccountSocialCommerceController {
    async follow(ctx: HttpContext) {
        return socialCommerceService.follow(await userId(ctx), await ctx.request.validateUsing(accountSocialFollowValidator));
    }
    async interaction(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(accountSocialInteractionValidator);
        return socialCommerceService.recordInteraction({ ...payload, user_id: await userId(ctx) });
    }
    async channels(ctx: HttpContext) {
        return socialCommerceService.listVisibleChannels(await userId(ctx));
    }
    async threads(ctx: HttpContext) {
        return socialCommerceService.listMyThreads(await userId(ctx));
    }
    async threadStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(accountSocialThreadCreateValidator);
        ctx.response.status(201);
        return socialCommerceService.createThread(await userId(ctx), payload);
    }
    async messageStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(accountSocialMessageValidator);
        ctx.response.status(201);
        return socialCommerceService.addCustomerMessage(
            await userId(ctx),
            ensureId(ctx.params.threadId),
            payload.body,
            payload.media_ids ?? [],
        );
    }
    async report(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(accountSocialReportValidator);
        ctx.response.status(201);
        return socialCommerceService.report(await userId(ctx), payload);
    }
    async mediaUploadIntent(ctx: HttpContext) {
        const actor = await userId(ctx);
        const customer = await customerForUser(actor);
        const payload = await ctx.request.validateUsing(accountSocialMediaUploadIntentValidator);
        const result = await socialMediaPipelineService.createUploadIntent({
            filename: payload.filename,
            mime: payload.mime,
            sizeBytes: payload.size_bytes,
            purpose: payload.purpose,
            ownerActorType: "customer",
            ownerActorRef: String(customer.id),
            accessPolicy: payload.access_policy,
        });
        ctx.response.status(201);
        return result;
    }
    async reviewVerification(ctx: HttpContext) {
        return socialReviewService.verificationForUser(await userId(ctx), ensureId(ctx.params.productId));
    }
    async reviewMedia(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(accountSocialReviewMediaValidator);
        return socialReviewService.attachMedia(
            await userId(ctx),
            ensureId(ctx.params.reviewId),
            payload.media_id,
            payload.sequence ?? 0,
        );
    }
    async reviewHelpful(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(accountSocialReviewHelpfulValidator);
        return socialReviewService.helpful(await userId(ctx), ensureId(ctx.params.reviewId), payload.helpful);
    }
    async reviewReport(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(accountSocialReviewReportValidator);
        ctx.response.status(201);
        return socialReviewService.report(await userId(ctx), ensureId(ctx.params.reviewId), {
            reasonCode: payload.reason_code,
            details: payload.details,
        });
    }
    async appeal(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(accountSocialAppealValidator);
        ctx.response.status(201);
        return socialCommerceService.appealModeration(await userId(ctx), ensureId(ctx.params.caseId), payload.reason);
    }
    async reputation(ctx: HttpContext) {
        return socialCommerceService.reputation(await userId(ctx));
    }
}
