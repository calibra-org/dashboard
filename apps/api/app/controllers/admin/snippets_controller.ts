import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { requireRecentIdentityStepUp } from "#services/identity/step_up";
import { requireSnippetsPermission } from "#services/snippets/permissions";
import * as snippets from "#services/snippets/snippets_service";
import {
    snippetActionValidator,
    snippetCreateValidator,
    snippetExecutionObservationValidator,
    snippetPublishValidator,
    snippetRollbackValidator,
    snippetSafeModeValidator,
    snippetSettingsValidator,
    snippetSimulationValidator,
    snippetUpdateValidator,
} from "#validators/snippets/snippets_validator";

export default class SnippetsController {
    async overview(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.view");
        return { data: await snippets.overview() };
    }

    async index(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.view");
        return {
            data: await snippets.listSnippets(Number(ctx.request.input("limit", 150)), String(ctx.request.input("q", ""))),
        };
    }

    async create(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.create");
        const payload = await ctx.request.validateUsing(snippetCreateValidator);
        const data = await snippets.createSnippet(payload, Number(user.id));
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "snippets.create",
            entityKind: "snippet",
            entityId: Number(data.id),
            payload: {
                public_id: data.public_id,
                snippet_key: payload.snippet_key,
                language: payload.language,
                runtime: payload.runtime,
                risk_level: payload.risk_level,
                reason: payload.reason,
            },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async show(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.view");
        return { data: await snippets.getSnippet(ctx.params.publicId) };
    }

    async update(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.edit");
        const payload = await ctx.request.validateUsing(snippetUpdateValidator);
        const result = await snippets.updateSnippet(ctx.params.publicId, payload, Number(user.id));
        if (result.changed) {
            await recordAudit({
                ctx,
                actorUserId: Number(user.id),
                action: "snippets.update",
                entityKind: "snippet",
                entityId: Number(result.data.id),
                payload: { public_id: ctx.params.publicId, version: result.data.version, reason: payload.reason },
                strict: true,
            });
        }
        return { data: result.data, changed: result.changed };
    }

    async validate(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.validate");
        const data = await snippets.validateSnippet(ctx.params.publicId);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "snippets.validate",
            entityKind: "snippet",
            entityId: null,
            payload: { public_id: ctx.params.publicId, publishable: data.publishable, checksum: data.checksum },
            strict: true,
        });
        return { data };
    }

    async simulate(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.validate");
        const payload = await ctx.request.validateUsing(snippetSimulationValidator);
        return { data: await snippets.simulateSnippet(ctx.params.publicId, payload.context) };
    }

    async publish(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.publish");
        const payload = await ctx.request.validateUsing(snippetPublishValidator);
        if (await snippets.publicationRequiresStepUp(ctx.params.publicId, payload.environment)) {
            await requireRecentIdentityStepUp(Number(user.id), "snippets.publish");
        }
        const data = await snippets.publishSnippet(ctx.params.publicId, payload, Number(user.id));
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "snippets.publish",
            entityKind: "snippet_deployment",
            entityId: Number(data.id),
            payload: {
                snippet_public_id: ctx.params.publicId,
                environment: payload.environment,
                rollout_percent: payload.rollout_percent,
                reason: payload.reason,
            },
            strict: true,
        });
        return { data };
    }

    async pause(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.publish");
        const payload = await ctx.request.validateUsing(snippetActionValidator);
        const result = await snippets.pauseSnippet(ctx.params.publicId, Number(user.id), payload.reason);
        if (result.changed) {
            await recordAudit({
                ctx,
                actorUserId: Number(user.id),
                action: "snippets.pause",
                entityKind: "snippet",
                entityId: Number(result.data.id),
                payload: { public_id: ctx.params.publicId, reason: payload.reason },
                strict: true,
            });
        }
        return { data: result.data, changed: result.changed };
    }

    async resume(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.publish");
        const payload = await ctx.request.validateUsing(snippetActionValidator);
        const result = await snippets.resumeSnippet(ctx.params.publicId, Number(user.id), payload.reason);
        if (result.changed) {
            await recordAudit({
                ctx,
                actorUserId: Number(user.id),
                action: "snippets.resume",
                entityKind: "snippet",
                entityId: Number(result.data.id),
                payload: { public_id: ctx.params.publicId, reason: payload.reason },
                strict: true,
            });
        }
        return { data: result.data, changed: result.changed };
    }

    async rollback(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.rollback");
        await requireRecentIdentityStepUp(Number(user.id), "snippets.rollback");
        const payload = await ctx.request.validateUsing(snippetRollbackValidator);
        const data = await snippets.rollbackSnippet(ctx.params.publicId, payload, Number(user.id));
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "snippets.rollback",
            entityKind: "snippet_deployment",
            entityId: Number(data.id),
            payload: {
                snippet_public_id: ctx.params.publicId,
                revision: payload.revision,
                environment: payload.environment,
                rollout_percent: payload.rollout_percent,
                reason: payload.reason,
            },
            strict: true,
        });
        return { data };
    }

    async revisions(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.view");
        return { data: await snippets.listRevisions(ctx.params.publicId) };
    }

    async deployments(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.view");
        return { data: await snippets.listDeployments(ctx.params.publicId) };
    }

    async executions(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.view");
        return { data: await snippets.listExecutions(Number(ctx.request.input("limit", 200))) };
    }

    async observeExecution(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.execution.observe");
        const payload = await ctx.request.validateUsing(snippetExecutionObservationValidator);
        const data = await snippets.observeExecution(payload, Number(user.id));
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "snippets.execution.observe",
            entityKind: "snippet_execution",
            entityId: Number(data.execution.id),
            payload: {
                snippet_public_id: payload.snippet_public_id,
                consumer_key: payload.consumer_key,
                outcome: payload.outcome,
                quarantined: data.quarantined,
            },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async settings(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.view");
        return { data: await snippets.getSettings() };
    }

    async updateSettings(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.settings.manage");
        const payload = await ctx.request.validateUsing(snippetSettingsValidator);
        const { reason, ...input } = payload;
        const result = await snippets.updateSettings(input, Number(user.id));
        if (result.changed) {
            await recordAudit({
                ctx,
                actorUserId: Number(user.id),
                action: "snippets.settings.update",
                entityKind: "snippet_settings",
                entityId: Number(result.data.id),
                payload: { ...input, reason },
                strict: true,
            });
        }
        return { data: result.data, changed: result.changed };
    }

    async enableSafeMode(ctx: HttpContext) {
        return this.setSafeMode(ctx, true);
    }

    async disableSafeMode(ctx: HttpContext) {
        return this.setSafeMode(ctx, false);
    }

    private async setSafeMode(ctx: HttpContext, enabled: boolean) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.safe_mode.manage");
        await requireRecentIdentityStepUp(Number(user.id), "snippets.safe_mode.manage");
        const payload = await ctx.request.validateUsing(snippetSafeModeValidator);
        const result = await snippets.setSafeMode(enabled, Number(user.id));
        if (result.changed) {
            await recordAudit({
                ctx,
                actorUserId: Number(user.id),
                action: enabled ? "snippets.safe_mode.enable" : "snippets.safe_mode.disable",
                entityKind: "snippet_settings",
                entityId: Number(result.data.id),
                payload: { enabled, reason: payload.reason },
                strict: true,
            });
        }
        return { data: result.data, changed: result.changed };
    }

    async library(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireSnippetsPermission(user, "snippets.view");
        return { data: snippets.library() };
    }
}
