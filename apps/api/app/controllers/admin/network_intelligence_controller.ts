import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { requireRecentIdentityStepUp } from "#services/identity/step_up";
import { acquireNetworkConfigurationLock } from "#services/network_intelligence/locks";
import {
    assertAggregateOnlyNetworkPayload,
    contributeAggregate,
    listBenchmarks,
    listContributions,
    listMetricDefinitions,
    networkOverview,
    recordSecurityReview,
    requestOwnExport,
    saveMetricDefinition,
    setParticipation,
} from "#services/network_intelligence/network_service";
import {
    applyNetworkAccessPreset,
    listNetworkAccess,
    requireNetworkIntelligencePermission,
} from "#services/network_intelligence/permissions";
import {
    contributionValidator,
    exportValidator,
    metricValidator,
    networkAccessPresetValidator,
    participationValidator,
    securityReviewValidator,
} from "#validators/network_intelligence/network_validator";

export default class AdminNetworkIntelligenceController {
    async overview({ auth }: HttpContext) {
        const user = auth.getUserOrFail();
        await requireNetworkIntelligencePermission(user, "network_intelligence.view");
        return { data: await networkOverview() };
    }

    async participation(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireNetworkIntelligencePermission(user, "network_intelligence.participation.manage");
        await requireRecentIdentityStepUp(Number(user.id), "network_intelligence.participation");
        const payload = await ctx.request.validateUsing(participationValidator);
        await acquireNetworkConfigurationLock();
        const data = await setParticipation({ ...payload, actorUserId: Number(user.id) });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "network_intelligence.participation.set",
            entityKind: "network_participation_policy",
            entityId: data.id,
            payload: { opted_in: data.opted_in, version: data.version, policy_digest: data.policy_digest },
            strict: true,
        });
        return { data };
    }

    async metrics({ auth }: HttpContext) {
        const user = auth.getUserOrFail();
        await requireNetworkIntelligencePermission(user, "network_intelligence.view");
        return { data: await listMetricDefinitions() };
    }

    async metric(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireNetworkIntelligencePermission(user, "network_intelligence.metrics.manage");
        await requireRecentIdentityStepUp(Number(user.id), "network_intelligence.metrics.manage");
        const payload = await ctx.request.validateUsing(metricValidator);
        await acquireNetworkConfigurationLock();
        const data = await saveMetricDefinition({ ...payload, actorUserId: Number(user.id) });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "network_intelligence.metric_definition.create",
            entityKind: "network_metric_definition",
            entityId: data.id,
            payload: { metric_key: data.metric_key, version: data.version, definition_digest: data.definition_digest },
            strict: true,
        });
        return { data };
    }

    async contribution(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireNetworkIntelligencePermission(user, "network_intelligence.contribute");
        const payload = await ctx.request.validateUsing(contributionValidator);
        const data = await contributeAggregate(payload);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "network_intelligence.contribution.upsert",
            entityKind: "network_contribution",
            entityId: data.id,
            payload: {
                metric_key: data.metric_key,
                metric_version: data.metric_version,
                period_key: data.period_key,
                contribution_digest: data.contribution_digest,
                record_count: data.record_count,
            },
            strict: true,
        });
        return { data };
    }

    async contributions({ auth }: HttpContext) {
        const user = auth.getUserOrFail();
        await requireNetworkIntelligencePermission(user, "network_intelligence.view");
        return { data: await listContributions() };
    }

    async benchmarks({ auth }: HttpContext) {
        const user = auth.getUserOrFail();
        await requireNetworkIntelligencePermission(user, "network_intelligence.view");
        return { data: await listBenchmarks() };
    }

    async export(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireNetworkIntelligencePermission(user, "network_intelligence.export");
        await requireRecentIdentityStepUp(Number(user.id), "network_intelligence.export");
        const payload = await ctx.request.validateUsing(exportValidator);
        const data = await requestOwnExport({ scope: payload.scope, actorUserId: Number(user.id) });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "network_intelligence.export.create",
            entityKind: "network_export",
            entityId: data.id,
            payload: { scope: payload.scope, manifest_digest: data.manifest_digest },
            strict: true,
        });
        return { data };
    }

    async securityReview(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireNetworkIntelligencePermission(user, "network_intelligence.security_review");
        await requireRecentIdentityStepUp(Number(user.id), "network_intelligence.security_review");
        const payload = await ctx.request.validateUsing(securityReviewValidator);
        assertAggregateOnlyNetworkPayload({ artifact_ref: payload.artifact_ref, findings: payload.findings ?? [] });
        const data = await recordSecurityReview({ ...payload, actorUserId: Number(user.id) });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "network_intelligence.security_review.record",
            entityKind: "network_security_review",
            entityId: data.id,
            payload: { review_type: data.review_type, status: data.status, artifact_ref: data.artifact_ref },
            strict: true,
        });
        return { data };
    }

    async access({ auth }: HttpContext) {
        const user = auth.getUserOrFail();
        await requireNetworkIntelligencePermission(user, "network_intelligence.access.manage");
        return { data: await listNetworkAccess() };
    }

    async applyAccessPreset(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireNetworkIntelligencePermission(user, "network_intelligence.access.manage");
        await requireRecentIdentityStepUp(Number(user.id), "network_intelligence.access.manage");
        const payload = await ctx.request.validateUsing(networkAccessPresetValidator);
        const data = await applyNetworkAccessPreset(Number(user.id), payload.user_id, payload.preset);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "network_intelligence.access.preset.apply",
            entityKind: "admin_user",
            entityId: payload.user_id,
            payload: { preset: payload.preset, reason: payload.reason },
            strict: true,
        });
        return { data };
    }
}
