import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import {
    createPlan,
    decideApproval,
    executeStep,
    listAgents,
    listPlans,
    overview,
    resolveConflict,
    saveAgent,
    scheduleOutcomeHook,
    setKillSwitch,
} from "#services/agent_orchestrator/orchestrator_service";
import { requireAgentOrchestratorPermission } from "#services/agent_orchestrator/permissions";
import { listTools, registerTool } from "#services/agent_orchestrator/tool_registry_service";
import { hasRecentIdentityStepUp, requireRecentIdentityStepUp } from "#services/identity/step_up";
import {
    agentValidator,
    approvalValidator,
    conflictValidator,
    executeValidator,
    killSwitchValidator,
    outcomeHookValidator,
    planValidator,
    toolValidator,
} from "#validators/agent_orchestrator/agent_orchestrator_validator";

export default class AdminAgentOrchestratorController {
    async overview(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgentOrchestratorPermission(user, "agent_orchestrator.view");
        return { data: await overview() };
    }

    async agents(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgentOrchestratorPermission(user, "agent_orchestrator.view");
        return { data: await listAgents() };
    }

    async saveAgent(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgentOrchestratorPermission(user, "agent_orchestrator.agents.manage");
        await requireRecentIdentityStepUp(Number(user.id), "agent.orchestrator.manage");
        const payload = await ctx.request.validateUsing(agentValidator);
        const data = await saveAgent({
            agentKey: payload.agent_key,
            displayName: payload.display_name,
            specialty: payload.specialty,
            scopes: payload.scopes,
            budgetMinor: payload.budget_minor,
            active: payload.is_active,
            actorUserId: Number(user.id),
        });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "agent.identity.save",
            entityKind: "agent_identity",
            entityId: data?.id ?? null,
            payload: { agent_key: payload.agent_key, specialty: payload.specialty, reason: payload.reason },
            strict: true,
        });
        return { data };
    }

    async tools(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgentOrchestratorPermission(user, "agent_orchestrator.view");
        return { data: await listTools() };
    }

    async registerTool(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgentOrchestratorPermission(user, "agent_orchestrator.tools.manage");
        await requireRecentIdentityStepUp(Number(user.id), "agent.tool.manage");
        const payload = await ctx.request.validateUsing(toolValidator);
        const data = await registerTool({
            toolKey: payload.tool_key,
            version: payload.version,
            handlerKey: payload.handler_key,
            inputSchema: payload.input_schema,
            outputSchema: payload.output_schema,
            requiredScopes: payload.required_scopes,
            requiredPermission: payload.required_permission,
            riskClass: payload.risk_class,
            supportsDryRun: payload.supports_dry_run,
            reversible: payload.reversible,
            rollbackPlan: payload.rollback_plan,
            approvalRequired: payload.approval_required,
            sideEffects: payload.side_effects,
            actorUserId: Number(user.id),
        });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "agent.tool.register",
            entityKind: "agent_tool",
            entityId: data?.id ?? null,
            payload: {
                tool_key: payload.tool_key,
                handler_key: payload.handler_key,
                risk_class: data?.risk_class ?? payload.risk_class,
                approval_required: data?.approval_required ?? payload.approval_required,
                reason: payload.reason,
            },
            strict: true,
        });
        return { data };
    }

    async plans(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgentOrchestratorPermission(user, "agent_orchestrator.view");
        const limit = Math.max(1, Math.min(Number(ctx.request.input("limit", 50)) || 50, 100));
        return { data: await listPlans(limit) };
    }

    async createPlan(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgentOrchestratorPermission(user, "agent_orchestrator.plans.manage");
        const payload = await ctx.request.validateUsing(planValidator);
        const data = await createPlan({
            agentPublicId: payload.agent_public_id,
            goal: payload.goal,
            contextSnapshot: payload.context_snapshot,
            constraints: payload.constraints,
            evidence: payload.evidence,
            options: payload.options,
            expectedOutcomes: payload.expected_outcomes,
            risk: payload.risk,
            policyEvaluation: payload.policy_evaluation,
            verificationPlan: payload.verification_plan,
            learningPlan: payload.learning_plan,
            steps: payload.steps.map((step) => ({
                toolKey: step.tool_key,
                toolVersion: step.tool_version,
                input: step.input,
                riskClass: step.risk_class,
                idempotencyKey: step.idempotency_key,
            })),
            actorUserId: Number(user.id),
        });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "agent.plan.create",
            entityKind: "agent_plan",
            entityId: data?.id ?? null,
            payload: { goal: payload.goal, step_count: payload.steps.length },
            strict: true,
        });
        return { data };
    }

    async conflict(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgentOrchestratorPermission(user, "agent_orchestrator.plans.manage");
        const payload = await ctx.request.validateUsing(conflictValidator);
        const data = await resolveConflict({
            planPublicId: payload.plan_public_id,
            participants: payload.participants,
            summary: payload.summary,
            objectiveKey: payload.objective_key,
            priorityOrder: payload.priority_order,
            evidence: payload.evidence,
            alternatives: payload.alternatives,
            resolution: payload.resolution,
            actorUserId: Number(user.id),
        });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "agent.conflict.resolve",
            entityKind: "agent_conflict",
            entityId: data?.id ?? null,
            payload: { objective_key: payload.objective_key, participants: payload.participants },
            strict: true,
        });
        return { data };
    }

    async approval(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgentOrchestratorPermission(user, "agent_orchestrator.approve");
        await requireRecentIdentityStepUp(Number(user.id), "agent.action.approve");
        const payload = await ctx.request.validateUsing(approvalValidator);
        const data = await decideApproval(payload.step_public_id, payload.status, payload.reason, Number(user.id));
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "agent.step.approval",
            entityKind: "agent_plan_step",
            entityId: null,
            payload,
            strict: true,
        });
        return { data };
    }

    async execute(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgentOrchestratorPermission(user, "agent_orchestrator.execute");
        const payload = await ctx.request.validateUsing(executeValidator);
        const stepUpSatisfied = payload.dry_run ? false : await hasRecentIdentityStepUp(Number(user.id), "agent.action.execute");
        const data = await executeStep({
            stepPublicId: payload.step_public_id,
            idempotencyKey: payload.idempotency_key,
            dryRun: payload.dry_run,
            actor: user,
            stepUpSatisfied,
        });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "agent.step.execute",
            entityKind: "agent_tool_run",
            entityId: data?.id ?? null,
            payload: {
                step_public_id: payload.step_public_id,
                dry_run: payload.dry_run,
                idempotency_key: payload.idempotency_key,
            },
            strict: true,
        });
        return { data };
    }

    async outcomeHook(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgentOrchestratorPermission(user, "agent_orchestrator.plans.manage");
        const payload = await ctx.request.validateUsing(outcomeHookValidator);
        const data = await scheduleOutcomeHook({
            planPublicId: payload.plan_public_id,
            metricKey: payload.metric_key,
            evaluateAfterIso: payload.evaluate_after_iso,
            baseline: payload.baseline,
            predicted: payload.predicted,
        });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "agent.outcome_hook.schedule",
            entityKind: "agent_outcome_hook",
            entityId: data?.id ?? null,
            payload: {
                plan_public_id: payload.plan_public_id,
                metric_key: payload.metric_key,
                evaluate_after_iso: payload.evaluate_after_iso,
            },
            strict: true,
        });
        return { data };
    }

    async killSwitch(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgentOrchestratorPermission(user, "agent_orchestrator.kill_switch");
        await requireRecentIdentityStepUp(Number(user.id), "agent.kill_switch");
        const payload = await ctx.request.validateUsing(killSwitchValidator);
        const data = await setKillSwitch(payload.agent_public_id, payload.enabled);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "agent.kill_switch.set",
            entityKind: "agent_identity",
            entityId: data?.id ?? null,
            payload: { enabled: payload.enabled, reason: payload.reason },
            strict: true,
        });
        return { data };
    }
}
