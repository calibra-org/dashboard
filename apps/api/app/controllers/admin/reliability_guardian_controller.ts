import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { requireRecentIdentityStepUp } from "#services/identity/step_up";
import { requireReliabilityGuardianPermission } from "#services/reliability_guardian/permissions";
import * as guardian from "#services/reliability_guardian/reliability_guardian_service";
import {
    reliabilityInvariantValidator,
    reliabilityObservationValidator,
    reliabilityPolicyValidator,
    reliabilityRemediationExecuteValidator,
} from "#validators/reliability_guardian/reliability_guardian_validator";

export default class ReliabilityGuardianController {
    async overview(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireReliabilityGuardianPermission(user, "reliability_guardian.view");
        return { data: await guardian.overview() };
    }
    async invariants(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireReliabilityGuardianPermission(user, "reliability_guardian.view");
        return { data: await guardian.listInvariants() };
    }
    async createInvariant(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireReliabilityGuardianPermission(user, "reliability_guardian.invariant.manage");
        const payload = await ctx.request.validateUsing(reliabilityInvariantValidator);
        const { reason, ...input } = payload;
        const data = await guardian.createInvariant(input, Number(user.id));
        await recordAudit({ ctx, actorUserId: Number(user.id), action: "reliability_guardian.invariant.create", entityKind: "reliability_invariant", entityId: data.id, payload: { invariant_key: input.invariant_key, severity: input.severity, source_kind: input.source_kind, reason }, strict: true });
        return ctx.response.created({ data });
    }
    async policies(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireReliabilityGuardianPermission(user, "reliability_guardian.view");
        return { data: await guardian.listPolicies() };
    }
    async createPolicy(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireReliabilityGuardianPermission(user, "reliability_guardian.policy.manage");
        await requireRecentIdentityStepUp(Number(user.id), "reliability.guardian.policy.manage");
        const payload = await ctx.request.validateUsing(reliabilityPolicyValidator);
        const { reason, ...input } = payload;
        const data = await guardian.createPolicy(input, Number(user.id));
        await recordAudit({ ctx, actorUserId: Number(user.id), action: "reliability_guardian.policy.create", entityKind: "reliability_remediation_policy", entityId: data.id, payload: { policy_key: input.policy_key, action_type: input.action_type, risk_level: input.risk_level, auto_execute: input.auto_execute, reason }, strict: true });
        return ctx.response.created({ data });
    }
    async observe(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireReliabilityGuardianPermission(user, "reliability_guardian.invariant.manage");
        const payload = await ctx.request.validateUsing(reliabilityObservationValidator);
        const data = await guardian.recordManualObservation(ctx.params.publicId, payload.value, payload.evidence);
        await recordAudit({ ctx, actorUserId: Number(user.id), action: "reliability_guardian.observation.record", entityKind: "reliability_invariant", entityId: null, payload: { invariant_public_id: ctx.params.publicId, passed: data.passed }, strict: true });
        return { data };
    }
    async incidents(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireReliabilityGuardianPermission(user, "reliability_guardian.view");
        return { data: await guardian.listIncidents(Number(ctx.request.input("limit", 100))) };
    }
    async remediations(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireReliabilityGuardianPermission(user, "reliability_guardian.view");
        return { data: await guardian.listRemediations(Number(ctx.request.input("limit", 100))) };
    }
    async scorecards(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireReliabilityGuardianPermission(user, "reliability_guardian.view");
        return { data: await guardian.listScorecards(Number(ctx.request.input("limit", 100))) };
    }
    async runCycle(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireReliabilityGuardianPermission(user, "reliability_guardian.cycle.run");
        const data = await guardian.runCycle(Number(user.id));
        await recordAudit({ ctx, actorUserId: Number(user.id), action: "reliability_guardian.cycle.run", entityKind: "reliability_guardian", entityId: null, payload: { evaluated: data.evaluated }, strict: true });
        return { data };
    }
    async executeRemediation(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireReliabilityGuardianPermission(user, "reliability_guardian.remediation.execute");
        await requireRecentIdentityStepUp(Number(user.id), "reliability.guardian.remediation.execute");
        const payload = await ctx.request.validateUsing(reliabilityRemediationExecuteValidator);
        const data = await guardian.executeRemediation(ctx.params.publicId, Number(user.id), true);
        await recordAudit({ ctx, actorUserId: Number(user.id), action: "reliability_guardian.remediation.execute", entityKind: "reliability_incident", entityId: null, payload: { incident_public_id: ctx.params.publicId, reason: payload.reason }, strict: true });
        return { data };
    }
    async rollbackRemediation(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireReliabilityGuardianPermission(user, "reliability_guardian.remediation.rollback");
        await requireRecentIdentityStepUp(Number(user.id), "reliability.guardian.remediation.rollback");
        const payload = await ctx.request.validateUsing(reliabilityRemediationExecuteValidator);
        const data = await guardian.rollbackRemediation(ctx.params.publicId, Number(user.id));
        await recordAudit({ ctx, actorUserId: Number(user.id), action: "reliability_guardian.remediation.rollback", entityKind: "reliability_remediation_run", entityId: null, payload: { remediation_public_id: ctx.params.publicId, reason: payload.reason }, strict: true });
        return { data };
    }
}
