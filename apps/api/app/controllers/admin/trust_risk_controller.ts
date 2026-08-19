import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { requireRecentIdentityStepUp } from "#services/identity/step_up";
import {
    createTrustPolicyVersion,
    listTrustCases,
    listTrustModels,
    listTrustPolicies,
    listTrustSignals,
    registerTrustModel,
    simulateTrustPolicy,
    trustCaseDetail,
    trustGraph,
    trustOutcomeSummary,
    trustOverview,
    updateTrustModelRollout,
} from "#services/trust/admin_service";
import { appealTrustCase, assignTrustCase, decideTrustCase, recordTrustOutcome } from "#services/trust/case_service";
import { applyTrustPreset, hasTrustPermission, listTrustAccess, requireTrustPermission } from "#services/trust/permissions";
import { scanCanonicalTrustSources } from "#services/trust/signal_service";
import {
    trustAccessPresetValidator,
    trustAppealValidator,
    trustCaseAssignValidator,
    trustCaseDecisionValidator,
    trustCaseListValidator,
    trustGraphValidator,
    trustModelRegisterValidator,
    trustModelRolloutValidator,
    trustOutcomeValidator,
    trustPolicySimulationValidator,
    trustPolicyValidator,
    trustSignalListValidator,
} from "#validators/admin/phase20_trust_risk_validator";

export default class AdminTrustController {
    async overview(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.view");
        return { data: await trustOverview() };
    }

    async cases(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.view");
        const payload = await ctx.request.validateUsing(trustCaseListValidator);
        return await listTrustCases({
            status: payload.status,
            riskBand: payload.risk_band,
            q: payload.q,
            page: payload.page,
            limit: payload.limit,
        });
    }

    async caseDetail(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.view");
        const includeSensitive = await hasTrustPermission(user, "trust.sensitive.view");
        return { data: await trustCaseDetail(String(ctx.params.publicId), includeSensitive) };
    }

    async assignCase(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.cases.assign");
        const payload = await ctx.request.validateUsing(trustCaseAssignValidator);
        return {
            data: await assignTrustCase({
                ctx,
                publicId: String(ctx.params.publicId),
                assigneeUserId: payload.assignee_user_id,
                expectedVersion: payload.expected_version,
                actor: user,
                reason: payload.reason,
            }),
        };
    }

    async decideCase(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.cases.review");
        const payload = await ctx.request.validateUsing(trustCaseDecisionValidator);
        if (["hold", "block"].includes(payload.action)) await requireRecentIdentityStepUp(Number(user.id), "trust.case.enforce");
        return {
            data: await decideTrustCase({
                ctx,
                publicId: String(ctx.params.publicId),
                action: payload.action,
                reasonCode: payload.reason_code,
                reason: payload.reason,
                expectedVersion: payload.expected_version,
                actor: user,
                idempotencyKey: payload.idempotency_key,
            }),
        };
    }

    async overrideCase(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.cases.override");
        await requireRecentIdentityStepUp(Number(user.id), "trust.case.override");
        const payload = await ctx.request.validateUsing(trustCaseDecisionValidator);
        return {
            data: await decideTrustCase({
                ctx,
                publicId: String(ctx.params.publicId),
                action: payload.action,
                reasonCode: payload.reason_code,
                reason: payload.reason,
                expectedVersion: payload.expected_version,
                actor: user,
                isOverride: true,
                idempotencyKey: payload.idempotency_key,
            }),
        };
    }

    async appealCase(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.cases.review");
        const payload = await ctx.request.validateUsing(trustAppealValidator);
        return {
            data: await appealTrustCase({
                ctx,
                publicId: String(ctx.params.publicId),
                reason: payload.reason,
                expectedVersion: payload.expected_version,
                actor: user,
            }),
        };
    }

    async outcome(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.outcomes.record");
        const payload = await ctx.request.validateUsing(trustOutcomeValidator);
        return {
            data: await recordTrustOutcome({
                ctx,
                publicId: String(ctx.params.publicId),
                outcome: payload.outcome,
                isFalsePositive: payload.is_false_positive,
                appealOutcome: payload.appeal_outcome,
                baseline: payload.baseline,
                predictedP10Minor: payload.predicted_p10_minor,
                predictedP50Minor: payload.predicted_p50_minor,
                predictedP90Minor: payload.predicted_p90_minor,
                actualLossMinor: payload.actual_loss_minor,
                incrementalEffectMinor: payload.incremental_effect_minor,
                preventedLossMinor: payload.prevented_loss_minor,
                guardrails: payload.guardrails,
                finalAssessment: payload.final_assessment,
                measurementConfidenceBp: payload.measurement_confidence_bp,
                unexpectedEffects: payload.unexpected_effects,
                notes: payload.notes,
                actor: user,
            }),
        };
    }

    async graph(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.view");
        const payload = await ctx.request.validateUsing(trustGraphValidator);
        return {
            data: await trustGraph({
                subjectType: payload.subject_type,
                subjectId: payload.subject_id,
                casePublicId: payload.case_id,
                depth: payload.depth,
            }),
        };
    }

    async signals(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.view");
        const payload = await ctx.request.validateUsing(trustSignalListValidator);
        return {
            data: await listTrustSignals({
                riskBand: payload.risk_band,
                source: payload.source,
                signalType: payload.signal_type,
                limit: payload.limit,
            }),
        };
    }

    async scan(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.scan.run");
        const result = await scanCanonicalTrustSources();
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "trust.scan.run",
            entityKind: "trust_scan",
            entityId: null,
            payload: result,
            strict: true,
        });
        return { data: result };
    }

    async policies(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.view");
        return { data: await listTrustPolicies() };
    }

    async createPolicy(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.policies.manage");
        await requireRecentIdentityStepUp(Number(user.id), "trust.policy.manage");
        const payload = await ctx.request.validateUsing(trustPolicyValidator);
        return {
            data: await createTrustPolicyVersion({
                ctx,
                actor: user,
                policyKey: payload.policy_key,
                status: payload.status,
                scope: payload.scope,
                conditions: payload.conditions,
                effect: payload.effect,
                approvalRequired: payload.approval_required,
                reason: payload.reason,
            }),
        };
    }

    async simulatePolicy(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.view");
        const payload = await ctx.request.validateUsing(trustPolicySimulationValidator);
        return {
            data: await simulateTrustPolicy({
                policyKey: payload.policy_key,
                version: payload.version,
                context: payload.context,
            }),
        };
    }

    async models(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.view");
        return { data: await listTrustModels() };
    }

    async registerModel(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.models.manage");
        await requireRecentIdentityStepUp(Number(user.id), "trust.model.manage");
        const payload = await ctx.request.validateUsing(trustModelRegisterValidator);
        return {
            data: await registerTrustModel({
                ctx,
                actor: user,
                modelId: payload.model_id,
                version: payload.version,
                purpose: payload.purpose,
                owner: payload.owner,
                features: payload.features,
                privacyControls: payload.privacy_controls,
                evaluation: payload.evaluation,
                calibration: payload.calibration,
                deployment: payload.deployment,
                limitations: payload.limitations,
                rollbackVersion: payload.rollback_version,
                reason: payload.reason,
            }),
        };
    }

    async updateModelRollout(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.models.manage");
        await requireRecentIdentityStepUp(Number(user.id), "trust.model.manage");
        const payload = await ctx.request.validateUsing(trustModelRolloutValidator);
        return {
            data: await updateTrustModelRollout({
                ctx,
                actor: user,
                publicId: String(ctx.params.publicId),
                status: payload.status,
                rolloutPercent: payload.rollout_percent,
                reason: payload.reason,
            }),
        };
    }

    async outcomes(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.view");
        return { data: await trustOutcomeSummary() };
    }

    async access(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.view");
        return { data: await listTrustAccess() };
    }

    async applyAccessPreset(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireTrustPermission(user, "trust.access.manage");
        await requireRecentIdentityStepUp(Number(user.id), "trust.access.manage");
        const payload = await ctx.request.validateUsing(trustAccessPresetValidator);
        await applyTrustPreset(Number(user.id), payload.user_id, payload.preset);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "trust.access.preset.apply",
            entityKind: "admin_user",
            entityId: payload.user_id,
            payload: { preset: payload.preset, reason: payload.reason },
            strict: true,
        });
        return { data: { updated: true } };
    }
}
