import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";

import { requiresHumanApproval, type ToolRisk } from "#services/agent_orchestrator/contracts";
import { assertAgentScopes, invokeRegisteredTool } from "#services/agent_orchestrator/tool_registry_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

function notFound(message: string, code: string): never {
    throw Object.assign(new Error(message), { status: 404, code });
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value !== "string") return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

export async function overview() {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const [agents, plans, runs, conflicts] = await Promise.all([
        trx.from("agent_identities").where("tenant_id", tenantId).count("* as c").first(),
        trx.from("agent_plans").where("tenant_id", tenantId).count("* as c").first(),
        trx
            .from("agent_tool_runs")
            .where("tenant_id", tenantId)
            .where("started_at", ">=", DateTime.utc().minus({ days: 30 }).toSQL())
            .count("* as c")
            .first(),
        trx.from("agent_conflicts").where("tenant_id", tenantId).count("* as c").first(),
    ]);
    return {
        kpis: {
            agents: Number(agents?.c ?? 0),
            plans: Number(plans?.c ?? 0),
            runs_30d: Number(runs?.c ?? 0),
            conflicts: Number(conflicts?.c ?? 0),
        },
    };
}

export async function listAgents() {
    return currentTrx().from("agent_identities").where("tenant_id", Number(currentTenantId())).orderBy("specialty");
}

export async function saveAgent(input: {
    agentKey: string;
    displayName: string;
    specialty: string;
    scopes: string[];
    budgetMinor: number;
    active: boolean;
    actorUserId: number;
}) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const now = DateTime.utc().toSQL();
    const existing = await trx.from("agent_identities").where({ tenant_id: tenantId, agent_key: input.agentKey }).first();
    if (existing) {
        await trx
            .from("agent_identities")
            .where({ tenant_id: tenantId, id: existing.id })
            .update({
                display_name: input.displayName,
                specialty: input.specialty,
                scopes: JSON.stringify(input.scopes),
                budget_minor: input.budgetMinor,
                is_active: input.active,
                version: Number(existing.version) + 1,
                updated_at: now,
            });
        return trx.from("agent_identities").where({ tenant_id: tenantId, id: existing.id }).first();
    }
    const rows = await trx
        .table("agent_identities")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId,
            agent_key: input.agentKey,
            display_name: input.displayName,
            specialty: input.specialty,
            scopes: JSON.stringify(input.scopes),
            budget_minor: input.budgetMinor,
            is_active: input.active,
            kill_switch: false,
            version: 1,
            created_by_user_id: input.actorUserId,
            created_at: now,
            updated_at: now,
        })
        .returning("*");
    return rows[0];
}

export async function setKillSwitch(publicId: string, enabled: boolean) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const updated = await trx
        .from("agent_identities")
        .where({ tenant_id: tenantId, public_id: publicId })
        .update({ kill_switch: enabled, updated_at: DateTime.utc().toSQL() });
    if (!updated) notFound("Agent not found", "E_AGENT_NOT_FOUND");
    return trx.from("agent_identities").where({ tenant_id: tenantId, public_id: publicId }).first();
}

export async function createPlan(input: {
    agentPublicId: string;
    goal: string;
    contextSnapshot: Record<string, unknown>;
    constraints: Record<string, unknown>;
    evidence: unknown[];
    options: unknown[];
    expectedOutcomes: Record<string, unknown>;
    risk: Record<string, unknown>;
    policyEvaluation: Record<string, unknown>;
    verificationPlan: Record<string, unknown>;
    learningPlan: Record<string, unknown>;
    steps: Array<{
        toolKey: string;
        toolVersion: number;
        input: Record<string, unknown>;
        riskClass: ToolRisk;
        idempotencyKey: string;
    }>;
    actorUserId: number;
}) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const now = DateTime.utc().toSQL();
    const agent = await trx
        .from("agent_identities")
        .where({ tenant_id: tenantId, public_id: input.agentPublicId, is_active: true })
        .first();
    if (!agent) notFound("Agent not found or inactive", "E_AGENT_NOT_ACTIVE");
    if (agent.kill_switch) {
        throw Object.assign(new Error("Agent kill switch is active"), {
            status: 409,
            code: "E_AGENT_KILL_SWITCH",
        });
    }

    const resolvedSteps = [] as Array<{
        source: (typeof input.steps)[number];
        tool: Record<string, any>;
        approvalRequired: boolean;
    }>;
    for (const source of input.steps) {
        const tool = await trx
            .from("agent_tool_registry")
            .where({
                tenant_id: tenantId,
                tool_key: source.toolKey,
                version: source.toolVersion,
                is_active: true,
            })
            .first();
        if (!tool) {
            throw Object.assign(new Error(`Tool ${source.toolKey}@${source.toolVersion} not found`), {
                status: 422,
                code: "E_AGENT_TOOL_NOT_REGISTERED",
            });
        }
        assertAgentScopes(agent.scopes, tool.required_scopes);
        resolvedSteps.push({
            source,
            tool,
            approvalRequired: requiresHumanApproval(tool.risk_class as ToolRisk, Boolean(tool.approval_required)),
        });
    }

    const rows = await trx
        .table("agent_plans")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId,
            agent_identity_id: agent.id,
            status: "draft",
            goal: input.goal,
            context_snapshot: JSON.stringify(input.contextSnapshot),
            constraints: JSON.stringify(input.constraints),
            evidence: JSON.stringify(input.evidence),
            options: JSON.stringify(input.options),
            expected_outcomes: JSON.stringify(input.expectedOutcomes),
            risk: JSON.stringify(input.risk),
            policy_evaluation: JSON.stringify(input.policyEvaluation),
            approval_requirement: "derived_per_step",
            verification_plan: JSON.stringify(input.verificationPlan),
            learning_plan: JSON.stringify(input.learningPlan),
            correlation_id: randomUUID(),
            version: 1,
            created_by_user_id: input.actorUserId,
            created_at: now,
            updated_at: now,
        })
        .returning("*");
    const plan = rows[0];

    for (let index = 0; index < resolvedSteps.length; index += 1) {
        const { source, tool, approvalRequired } = resolvedSteps[index];
        const stepRows = await trx
            .table("agent_plan_steps")
            .insert({
                public_id: randomUUID(),
                tenant_id: tenantId,
                plan_id: plan.id,
                sequence: index + 1,
                tool_key: source.toolKey,
                tool_version: source.toolVersion,
                input: JSON.stringify(source.input),
                risk_class: tool.risk_class,
                approval_required: approvalRequired,
                status: "pending",
                idempotency_key: source.idempotencyKey,
                created_at: now,
                updated_at: now,
            })
            .returning(["id"]);
        if (approvalRequired) {
            await trx.table("agent_approvals").insert({
                public_id: randomUUID(),
                tenant_id: tenantId,
                plan_step_id: stepRows[0].id,
                status: "pending",
                reason: "Approval required by registered tool risk policy",
                requested_by_user_id: input.actorUserId,
                decided_by_user_id: null,
                decided_at: null,
                created_at: now,
            });
        }
    }
    return plan;
}

export async function listPlans(limit = 50) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    return trx
        .from("agent_plans as p")
        .join("agent_identities as a", "a.id", "p.agent_identity_id")
        .where("p.tenant_id", tenantId)
        .select(["p.*", "a.display_name as agent_name", "a.specialty"])
        .orderBy("p.created_at", "desc")
        .limit(limit);
}

export async function resolveConflict(input: {
    planPublicId: string;
    participants: string[];
    summary: string;
    objectiveKey: string;
    priorityOrder: string[];
    evidence: unknown[];
    alternatives: unknown[];
    resolution: Record<string, unknown>;
    actorUserId: number;
}) {
    if (!input.objectiveKey || !input.priorityOrder.length || !input.evidence.length) {
        throw Object.assign(new Error("Explicit objective, priority and evidence are required"), {
            status: 422,
            code: "E_AGENT_CONFLICT_EXPLICIT_BASIS_REQUIRED",
        });
    }
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const plan = await trx.from("agent_plans").where({ tenant_id: tenantId, public_id: input.planPublicId }).first();
    if (!plan) notFound("Plan not found", "E_AGENT_PLAN_NOT_FOUND");
    const rows = await trx
        .table("agent_conflicts")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId,
            plan_id: plan.id,
            participants: JSON.stringify(input.participants),
            conflict_summary: input.summary,
            objective_key: input.objectiveKey,
            priority_order: JSON.stringify(input.priorityOrder),
            evidence_snapshot: JSON.stringify(input.evidence),
            alternatives: JSON.stringify(input.alternatives),
            resolution: JSON.stringify(input.resolution),
            resolved_by: "human_explicit",
            resolved_by_user_id: input.actorUserId,
            created_at: DateTime.utc().toSQL(),
        })
        .returning("*");
    return rows[0];
}

export async function decideApproval(stepPublicId: string, status: "approved" | "rejected", reason: string, userId: number) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const step = await trx.from("agent_plan_steps").where({ tenant_id: tenantId, public_id: stepPublicId }).first();
    if (!step) notFound("Plan step not found", "E_AGENT_STEP_NOT_FOUND");
    if (!step.approval_required) {
        throw Object.assign(new Error("This plan step does not require approval"), {
            status: 409,
            code: "E_AGENT_APPROVAL_NOT_REQUIRED",
        });
    }
    const now = DateTime.utc().toSQL();
    let row = await trx.from("agent_approvals").where({ tenant_id: tenantId, plan_step_id: step.id, status: "pending" }).first();
    if (!row) {
        throw Object.assign(new Error("Approval request is not pending"), {
            status: 409,
            code: "E_AGENT_APPROVAL_NOT_PENDING",
        });
    }
    await trx
        .from("agent_approvals")
        .where({ tenant_id: tenantId, id: row.id })
        .update({ status, reason, decided_by_user_id: userId, decided_at: now });
    row = await trx.from("agent_approvals").where({ tenant_id: tenantId, id: row.id }).first();
    return row;
}

export async function executeStep(input: {
    stepPublicId: string;
    idempotencyKey: string;
    dryRun: boolean;
    actor: any;
    stepUpSatisfied: boolean;
}) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const step = await trx
        .from("agent_plan_steps as s")
        .join("agent_plans as p", "p.id", "s.plan_id")
        .join("agent_identities as a", "a.id", "p.agent_identity_id")
        .where("s.tenant_id", tenantId)
        .where("s.public_id", input.stepPublicId)
        .select(["s.*", "p.public_id as plan_public_id", "a.kill_switch", "a.is_active", "a.scopes"])
        .first();
    if (!step) notFound("Plan step not found", "E_AGENT_STEP_NOT_FOUND");
    if (String(step.idempotency_key) !== input.idempotencyKey) {
        throw Object.assign(new Error("Execution idempotency key does not match the plan step"), {
            status: 409,
            code: "E_AGENT_IDEMPOTENCY_MISMATCH",
        });
    }

    const prior = await trx
        .from("agent_tool_runs")
        .where({ tenant_id: tenantId, plan_step_id: step.id, idempotency_key: input.idempotencyKey })
        .first();
    if (prior) return prior;

    if (!step.is_active || step.kill_switch) {
        throw Object.assign(new Error("Agent is stopped"), { status: 409, code: "E_AGENT_KILL_SWITCH" });
    }

    const tool = await trx
        .from("agent_tool_registry")
        .where({
            tenant_id: tenantId,
            tool_key: step.tool_key,
            version: step.tool_version,
            is_active: true,
        })
        .first();
    if (!tool) notFound("Registered tool not found", "E_AGENT_TOOL_NOT_REGISTERED");
    assertAgentScopes(step.scopes, tool.required_scopes);

    const highRisk = requiresHumanApproval(tool.risk_class as ToolRisk, Boolean(tool.approval_required));
    if (highRisk && !input.stepUpSatisfied) {
        throw Object.assign(new Error("Recent step-up authentication is required for high-risk execution"), {
            status: 403,
            code: "E_IDENTITY_STEP_UP_REQUIRED",
        });
    }
    if (step.approval_required) {
        const approval = await trx
            .from("agent_approvals")
            .where({ tenant_id: tenantId, plan_step_id: step.id, status: "approved" })
            .first();
        if (!approval) {
            throw Object.assign(new Error("Human approval required"), {
                status: 409,
                code: "E_AGENT_APPROVAL_REQUIRED",
            });
        }
    }

    if (tool.required_permission) {
        const permissionRow = await trx
            .from("admin_permissions")
            .where({
                tenant_id: tenantId,
                user_id: Number(input.actor.id),
                permission: String(tool.required_permission),
            })
            .first();
        if (permissionRow && !permissionRow.allowed) {
            throw Object.assign(new Error("Tool-specific permission denied"), {
                status: 403,
                code: "E_AGENT_TOOL_PERMISSION_DENIED",
            });
        }
    }

    const now = DateTime.utc();
    const rows = await trx
        .table("agent_tool_runs")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId,
            plan_step_id: step.id,
            tool_registry_id: tool.id,
            status: "executing",
            idempotency_key: input.idempotencyKey,
            dry_run: input.dryRun,
            input_snapshot: JSON.stringify(parseJsonRecord(step.input)),
            policy_result: JSON.stringify({
                allowed: true,
                approval_required: Boolean(step.approval_required),
                risk_class: tool.risk_class,
                recent_step_up: highRisk ? input.stepUpSatisfied : null,
            }),
            result: "{}",
            verification: "{}",
            attempt: 1,
            started_at: now.toSQL(),
        })
        .returning("*");
    const run = rows[0];

    try {
        const invoked = await invokeRegisteredTool(tool, parseJsonRecord(step.input), input.actor, input.dryRun);
        await trx
            .from("agent_tool_runs")
            .where({ tenant_id: tenantId, id: run.id })
            .update({
                status: "completed",
                result: JSON.stringify(invoked.result),
                verification: JSON.stringify(invoked.verification),
                finished_at: DateTime.utc().toSQL(),
            });
        await trx
            .from("agent_plan_steps")
            .where({ tenant_id: tenantId, id: step.id })
            .update({ status: "completed", updated_at: DateTime.utc().toSQL() });
        return { ...run, status: "completed", ...invoked };
    } catch (error) {
        const failure = error as Error & { code?: string };
        await trx
            .from("agent_tool_runs")
            .where({ tenant_id: tenantId, id: run.id })
            .update({
                status: "failed",
                error_code: failure.code ?? "E_AGENT_TOOL_FAILED",
                error_message: failure.message.slice(0, 1000),
                finished_at: DateTime.utc().toSQL(),
            });
        throw error;
    }
}

export async function scheduleOutcomeHook(input: {
    planPublicId: string;
    metricKey: string;
    evaluateAfterIso: string;
    baseline: Record<string, unknown>;
    predicted: Record<string, unknown>;
}) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const plan = await trx.from("agent_plans").where({ tenant_id: tenantId, public_id: input.planPublicId }).first();
    if (!plan) notFound("Plan not found", "E_AGENT_PLAN_NOT_FOUND");
    const when = DateTime.fromISO(input.evaluateAfterIso, { zone: "utc" });
    if (!when.isValid || when <= DateTime.utc()) {
        throw Object.assign(new Error("Outcome evaluation must be scheduled in the future"), {
            status: 422,
            code: "E_AGENT_OUTCOME_SCHEDULE_INVALID",
        });
    }
    const rows = await trx
        .table("agent_outcome_hooks")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId,
            plan_id: plan.id,
            metric_key: input.metricKey,
            evaluate_after: when.toSQL(),
            baseline: JSON.stringify(input.baseline),
            predicted: JSON.stringify(input.predicted),
            actual: null,
            status: "pending",
            created_at: DateTime.utc().toSQL(),
        })
        .returning("*");
    return rows[0];
}
