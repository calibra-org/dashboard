import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { governanceService } from "#services/governance_service";
import { requireRecentIdentityStepUp } from "#services/identity/step_up";

export default class AdminGovernanceController {
    async overview(ctx: HttpContext) {
        await this.authorize(ctx, "governance:read");
        return { data: await governanceService.overview() };
    }
    async registry(ctx: HttpContext) {
        await this.authorize(ctx, "governance:read");
        return { data: governanceService.registry() };
    }
    async policies(ctx: HttpContext) {
        await this.authorize(ctx, "governance:read");
        return { data: await governanceService.listPolicies() };
    }

    async createPolicy(ctx: HttpContext) {
        const actor = await this.authorize(ctx, "governance:policy:write");
        await requireRecentIdentityStepUp(Number(actor.id), "governance.policy.version.create");
        const data = await governanceService.createPolicy(ctx.request.body(), Number(actor.id));
        await this.audit(ctx, Number(actor.id), "governance.policy.version.create", "governance_policy", data.id, {
            policy_key: data.policyKey,
            version: data.version,
            reason: data.reason,
        });
        return { data };
    }

    async evaluate(ctx: HttpContext) {
        const actor = await this.authorize(ctx, "governance:read");
        return {
            data: await governanceService.evaluate({
                ...(ctx.request.body() as Record<string, unknown>),
                actorUserId: Number(actor.id),
            } as never),
        };
    }

    async agents(ctx: HttpContext) {
        await this.authorize(ctx, "governance:read");
        return { data: await governanceService.listAgents() };
    }
    async createAgent(ctx: HttpContext) {
        const actor = await this.authorize(ctx, "governance:agent:write");
        await requireRecentIdentityStepUp(Number(actor.id), "governance.agent.update");
        const data = await governanceService.createAgent(ctx.request.body(), Number(actor.id));
        await this.audit(ctx, Number(actor.id), "governance.agent.create", "governance_agent", data.id, {
            principal_key: data.principalKey,
            autonomy_level: data.autonomyLevel,
        });
        return { data };
    }
    async killSwitch(ctx: HttpContext) {
        const actor = await this.authorize(ctx, "governance:agent:write");
        await requireRecentIdentityStepUp(Number(actor.id), "governance.agent.kill_switch");
        const id = this.positiveId(ctx.params.id);
        const enabled = ctx.request.input("enabled") === true;
        const data = await governanceService.setKillSwitch(id, enabled, Number(actor.id));
        await this.audit(ctx, Number(actor.id), "governance.agent.kill_switch", "governance_agent", id, { enabled });
        return { data };
    }

    async approvals(ctx: HttpContext) {
        await this.authorize(ctx, "governance:read");
        const status = ctx.request.input("status");
        return { data: await governanceService.listApprovals(typeof status === "string" ? status : undefined) };
    }
    async createApproval(ctx: HttpContext) {
        const actor = await this.authorize(ctx, "governance:approval:request");
        const data = await governanceService.createApproval(ctx.request.body(), Number(actor.id));
        await this.audit(ctx, Number(actor.id), "governance.approval.request", "governance_approval", null, {
            reference: data.reference,
            action_key: data.actionKey,
            request_hash: data.requestHash,
        });
        return { data };
    }
    async approval(ctx: HttpContext) {
        await this.authorize(ctx, "governance:read");
        return { data: await governanceService.getApproval(String(ctx.params.reference)) };
    }
    async decideApproval(ctx: HttpContext) {
        const actor = await this.authorize(ctx, "governance:approval:decide");
        const decision = String(ctx.request.input("decision"));
        if (decision !== "approve" && decision !== "reject")
            throw new Exception("Invalid approval decision", { status: 422, code: "E_GOVERNANCE_APPROVAL_DECISION" });
        const reason = String(ctx.request.input("reason") ?? "");
        const data = await governanceService.decideApproval(String(ctx.params.reference), decision, reason, Number(actor.id));
        await this.audit(ctx, Number(actor.id), "governance.approval.decision", "governance_approval", null, {
            reference: data.reference,
            decision,
            reason,
        });
        return { data };
    }
    async delegateApproval(ctx: HttpContext) {
        const actor = await this.authorize(ctx, "governance:approval:decide");
        const delegatedToUserId = Number(ctx.request.input("delegatedToUserId"));
        const reason = String(ctx.request.input("reason") ?? "");
        const data = await governanceService.delegateApproval(
            String(ctx.params.reference),
            delegatedToUserId,
            reason,
            Number(actor.id),
        );
        await this.audit(ctx, Number(actor.id), "governance.approval.delegate", "governance_approval", null, {
            reference: data.reference,
            delegated_to_user_id: delegatedToUserId,
            reason,
        });
        return { data };
    }
    async breakGlass(ctx: HttpContext) {
        const actor = await this.authorize(ctx, "governance:break_glass");
        await requireRecentIdentityStepUp(Number(actor.id), "governance.approval.break_glass");
        const reason = String(ctx.request.input("reason") ?? "");
        const data = await governanceService.breakGlass(String(ctx.params.reference), reason, Number(actor.id));
        await this.audit(ctx, Number(actor.id), "governance.approval.break_glass", "governance_approval", null, {
            reference: data.reference,
            reason,
            elevated_audit: true,
        });
        return { data };
    }

    async ledger(ctx: HttpContext) {
        await this.authorize(ctx, "governance:read");
        return { data: await governanceService.listLedger(Number(ctx.request.input("limit", 100))) };
    }
    async verifyLedger(ctx: HttpContext) {
        await this.authorize(ctx, "governance:read");
        return { data: await governanceService.verifyLedger() };
    }
    async shadow(ctx: HttpContext) {
        await this.authorize(ctx, "governance:read");
        return await governanceService.listShadow();
    }
    async createShadow(ctx: HttpContext) {
        await this.authorize(ctx, "governance:shadow:write");
        return { data: await governanceService.createShadow(ctx.request.body()) };
    }
    async reviewShadow(ctx: HttpContext) {
        const actor = await this.authorize(ctx, "governance:shadow:review");
        const data = await governanceService.reviewShadow(
            this.positiveId(ctx.params.id),
            String(ctx.request.input("humanDecision")),
            ctx.request.input("outcome", {}),
            Number(actor.id),
        );
        await this.audit(ctx, Number(actor.id), "governance.shadow.review", "governance_shadow", this.positiveId(ctx.params.id), {
            human_decision: ctx.request.input("humanDecision"),
        });
        return { data };
    }

    private positiveId(value: unknown) {
        const id = Number(value);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Exception("Invalid identifier", { status: 404 });
        return id;
    }
    private async authorize(ctx: HttpContext, permission: string) {
        const user = await ctx.auth.authenticate();
        const token = user.currentAccessToken;
        const abilities = token?.abilities ?? [];
        const scoped = abilities.filter((item) => String(item).startsWith("governance:"));
        if (token?.allows("*") || scoped.length === 0 || token?.allows(permission)) return user;
        throw new Exception("Governance permission required", {
            status: 403,
            code: "E_GOVERNANCE_PERMISSION",
            cause: { missing: [permission] },
        });
    }
    private async audit(
        ctx: HttpContext,
        actorUserId: number,
        action: string,
        entityKind: string,
        entityId: number | null,
        payload: Record<string, unknown>,
    ) {
        await recordAudit({ ctx, actorUserId, action, entityKind, entityId, payload, strict: true });
    }
}
