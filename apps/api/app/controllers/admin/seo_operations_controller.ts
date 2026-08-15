import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { seoOperationsService } from "#services/seo/operations_service";
import {
    seoActionCreateValidator,
    seoActionReviewValidator,
    seoCrawlCreateValidator,
    seoExportCreateValidator,
    seoMediaBulkAltValidator,
} from "#validators/admin/seo_operations_validator";

function id(ctx: HttpContext): number {
    const value = Number(ctx.params.id);
    if (!Number.isSafeInteger(value) || value < 1)
        throw new Exception("Invalid SEO operation identifier", { status: 422, code: "E_SEO_OPERATION_ID" });
    return value;
}

async function actorId(ctx: HttpContext): Promise<number | null> {
    const user = await ctx.auth.authenticate();
    return user ? Number(user.id) : null;
}

export default class SeoOperationsController {
    async actions(ctx: HttpContext) {
        return seoOperationsService.listActions({
            status: ctx.request.input("status"),
            action_type: ctx.request.input("action_type"),
            entity_kind: ctx.request.input("entity_kind"),
            limit: Number(ctx.request.input("limit", 100)),
        });
    }

    async actionStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(seoActionCreateValidator);
        const result = await seoOperationsService.createAction(payload, await actorId(ctx));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "seo.action.propose",
            entityKind: "seo_action",
            entityId: Number(result.data.id),
            payload: { action_type: payload.action_type, entity_kind: payload.entity_kind, entity_id: payload.entity_id ?? null },
        });
        return result;
    }

    async actionReview(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(seoActionReviewValidator);
        const result = await seoOperationsService.reviewAction(id(ctx), payload.decision, payload.note, await actorId(ctx));
        await recordAudit({
            ctx,
            action: `seo.action.${payload.decision}`,
            entityKind: "seo_action",
            entityId: id(ctx),
            payload: { note: payload.note ?? null },
        });
        return result;
    }

    async actionApply(ctx: HttpContext) {
        const result = await seoOperationsService.applyAction(id(ctx), await actorId(ctx));
        await recordAudit({ ctx, action: "seo.action.apply", entityKind: "seo_action", entityId: id(ctx), payload: {} });
        return result;
    }

    async actionRollback(ctx: HttpContext) {
        const result = await seoOperationsService.rollbackAction(id(ctx), await actorId(ctx));
        await recordAudit({ ctx, action: "seo.action.rollback", entityKind: "seo_action", entityId: id(ctx), payload: {} });
        return result;
    }

    async mediaBulkAlt(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(seoMediaBulkAltValidator);
        const result = await seoOperationsService.createMediaAltActions(payload.items, await actorId(ctx));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "seo.media.alt.bulk_propose",
            entityKind: "media",
            entityId: null,
            payload: { count: payload.items.length },
        });
        return result;
    }

    async crawls() {
        return seoOperationsService.crawlRuns();
    }

    async crawlShow(ctx: HttpContext) {
        return seoOperationsService.crawlRun(id(ctx));
    }

    async crawlStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(seoCrawlCreateValidator);
        const result = await seoOperationsService.createCrawl(payload.urls, await actorId(ctx));
        ctx.response.status(202);
        await recordAudit({
            ctx,
            action: "seo.crawl.queue",
            entityKind: "seo_crawl_run",
            entityId: Number(result.data.id),
            payload: { count: payload.urls.length },
        });
        return result;
    }

    async exportStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(seoExportCreateValidator);
        const result = await seoOperationsService.createExport(payload, await actorId(ctx));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "seo.export.create",
            entityKind: "seo_export",
            entityId: Number(result.data.id),
            payload: { report_kind: payload.report_kind, format: payload.format },
        });
        return result;
    }

    async exportData(ctx: HttpContext) {
        const result = await seoOperationsService.exportData(id(ctx));
        ctx.response.header("Content-Type", result.contentType);
        ctx.response.header("Content-Disposition", `attachment; filename="${result.filename}"`);
        return result.body;
    }
}
