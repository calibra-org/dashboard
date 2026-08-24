import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { RISK_ORDER, type ToolRisk } from "#services/agent_orchestrator/contracts";
import { executeStep } from "#services/agent_orchestrator/orchestrator_service";
import { runScenario } from "#services/phase23_digital_twin_service";
import { runPlan } from "#services/phase25_growth_portfolio_service";
import { createMemory } from "#services/phase26_merchant_memory_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export const OBJECTIVE_AUTONOMY_VERSION = "objective-autonomy-v1.0.0";
export type AutonomyLevel = "recommend" | "propose" | "bounded_auto";

type ObjectiveRow = Record<string, unknown> & {
    id: number;
    public_id: string;
    scenario_public_id: string;
    portfolio_plan_public_id: string;
    agent_plan_public_id: string;
    allowed_tool_keys: string[] | string;
    autonomy_level: AutonomyLevel;
    effective_autonomy_level: AutonomyLevel;
    risk_ceiling: ToolRisk;
};

const tenantId = () => Number(currentTenantId());
const nowSql = () => DateTime.utc().toSQL();
const json = <T>(value: T | string | null | undefined, fallback: T): T => {
    if (value == null) return fallback;
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, stable(item)]),
    );
}

function digest(value: unknown) {
    return createHash("sha256")
        .update(JSON.stringify(stable(value)))
        .digest("hex");
}

function notFound(message: string, code: string): never {
    throw new Exception(message, { status: 404, code });
}

export function assertRiskWithinCeiling(risk: ToolRisk, ceiling: ToolRisk, autonomyLevel: AutonomyLevel) {
    if (RISK_ORDER[risk] > RISK_ORDER[ceiling]) {
        throw new Exception("Registered action exceeds objective risk ceiling", { status: 422, code: "E_AUTONOMY_RISK_CEILING" });
    }
    if (autonomyLevel === "bounded_auto" && RISK_ORDER[risk] >= RISK_ORDER.high) {
        throw new Exception("High and critical actions cannot be auto-executed", {
            status: 422,
            code: "E_AUTONOMY_HIGH_RISK_AUTO_FORBIDDEN",
        });
    }
}

export function evaluateControlDecision(input: {
    budgetMinor: number | null;
    budgetSpentMinor: number;
    confidence: number;
    minimumConfidence: number;
    unexpectedHarm: boolean;
    constraintBreaches: string[];
    stopLoss: Record<string, unknown>;
    observedValue: number;
}) {
    const maxBudget = Number(input.stopLoss.max_budget_minor ?? input.budgetMinor ?? 0);
    const floor = input.stopLoss.metric_floor == null ? null : Number(input.stopLoss.metric_floor);
    const ceiling = input.stopLoss.metric_ceiling == null ? null : Number(input.stopLoss.metric_ceiling);
    const budgetBreached = maxBudget > 0 && input.budgetSpentMinor > maxBudget;
    const metricBreached = (floor != null && input.observedValue < floor) || (ceiling != null && input.observedValue > ceiling);
    if (input.unexpectedHarm || input.constraintBreaches.length > 0 || budgetBreached || metricBreached) {
        return { decision: "halt" as const, nextAutonomy: "recommend" as const };
    }
    if (input.confidence < input.minimumConfidence) {
        return { decision: "reduce_autonomy" as const, nextAutonomy: "propose" as const };
    }
    return { decision: "continue" as const, nextAutonomy: null };
}

async function requireObjective(publicId: string) {
    const row = await currentTrx().from("autonomy_objectives").where({ tenant_id: tenantId(), public_id: publicId }).first();
    if (!row) notFound("Objective not found", "E_AUTONOMY_OBJECTIVE_NOT_FOUND");
    return row;
}

async function objectiveDependencies(objective: ObjectiveRow) {
    const trx = currentTrx();
    const [scenario, portfolio, agentPlan] = await Promise.all([
        trx.from("commerce_twin_scenarios").where({ tenant_id: tenantId(), public_id: objective.scenario_public_id }).first(),
        trx
            .from("growth_portfolio_plans")
            .where({ tenant_id: tenantId(), public_id: objective.portfolio_plan_public_id })
            .first(),
        trx.from("agent_plans").where({ tenant_id: tenantId(), public_id: objective.agent_plan_public_id }).first(),
    ]);
    if (!scenario) throw new Exception("Phase 23 scenario is required", { status: 422, code: "E_AUTONOMY_TWIN_REQUIRED" });
    if (!portfolio)
        throw new Exception("Phase 25 portfolio plan is required", { status: 422, code: "E_AUTONOMY_PORTFOLIO_REQUIRED" });
    if (!agentPlan)
        throw new Exception("Phase 22 agent plan is required", { status: 422, code: "E_AUTONOMY_AGENT_PLAN_REQUIRED" });
    return { scenario, portfolio, agentPlan };
}

async function assertRegisteredPlanBoundary(objective: ObjectiveRow) {
    const trx = currentTrx();
    const allowed = new Set(json<string[]>(objective.allowed_tool_keys, []));
    const { agentPlan } = await objectiveDependencies(objective);
    const steps = await trx.from("agent_plan_steps").where({ tenant_id: tenantId(), plan_id: agentPlan.id }).orderBy("sequence");
    if (!steps.length)
        throw new Exception("Agent plan has no registered steps", { status: 422, code: "E_AUTONOMY_AGENT_PLAN_EMPTY" });
    for (const step of steps) {
        if (!allowed.has(String(step.tool_key))) {
            throw new Exception("Agent plan contains a tool outside objective action classes", {
                status: 422,
                code: "E_AUTONOMY_TOOL_NOT_ALLOWED",
            });
        }
        assertRiskWithinCeiling(
            step.risk_class as ToolRisk,
            objective.risk_ceiling as ToolRisk,
            objective.autonomy_level as AutonomyLevel,
        );
    }
    return steps;
}

export async function overview() {
    const trx = currentTrx();
    const tenant = tenantId();
    const [objectives, active, halted, cycles, latestCheckpoint] = await Promise.all([
        trx.from("autonomy_objectives").where("tenant_id", tenant).count("* as c").first(),
        trx.from("autonomy_objectives").where({ tenant_id: tenant, status: "active" }).count("* as c").first(),
        trx.from("autonomy_objectives").where({ tenant_id: tenant, status: "halted" }).count("* as c").first(),
        trx.from("autonomy_cycles").where("tenant_id", tenant).count("* as c").first(),
        trx.from("autonomy_checkpoints").where("tenant_id", tenant).orderBy("created_at", "desc").first(),
    ]);
    return {
        engine_version: OBJECTIVE_AUTONOMY_VERSION,
        kpis: {
            objectives: Number(objectives?.c ?? 0),
            active: Number(active?.c ?? 0),
            halted: Number(halted?.c ?? 0),
            cycles: Number(cycles?.c ?? 0),
        },
        latest_checkpoint: latestCheckpoint ?? null,
        execution_boundary: "phase22_registered_tools_only",
    };
}

export async function listObjectives() {
    return currentTrx().from("autonomy_objectives").where("tenant_id", tenantId()).orderBy("updated_at", "desc").limit(100);
}

export async function objectiveDetail(publicId: string) {
    const objective = await requireObjective(publicId);
    const trx = currentTrx();
    const [cycles, checkpoints, postmortem] = await Promise.all([
        trx
            .from("autonomy_cycles")
            .where({ tenant_id: tenantId(), objective_id: objective.id })
            .orderBy("sequence", "desc")
            .limit(50),
        trx
            .from("autonomy_checkpoints")
            .where({ tenant_id: tenantId(), objective_id: objective.id })
            .orderBy("created_at", "desc")
            .limit(100),
        trx.from("autonomy_postmortems").where({ tenant_id: tenantId(), objective_id: objective.id }).first(),
    ]);
    return { objective, cycles, checkpoints, postmortem: postmortem ?? null };
}

export async function createObjective(
    input: {
        name: string;
        target_metric: string;
        direction: "maximize" | "minimize" | "target";
        baseline_value: number;
        target_value: number;
        horizon_end: string;
        budget_minor?: number;
        constraints: Record<string, unknown>;
        allowed_tool_keys: string[];
        autonomy_level: AutonomyLevel;
        risk_ceiling: ToolRisk;
        minimum_confidence: number;
        stop_loss: Record<string, unknown>;
        approvers: string[];
        scenario_public_id: string;
        portfolio_plan_public_id: string;
        agent_plan_public_id: string;
        reason: string;
    },
    actor: User,
) {
    const horizon = DateTime.fromISO(input.horizon_end, { setZone: true });
    if (!horizon.isValid || horizon.toUTC() <= DateTime.utc()) {
        throw new Exception("Objective horizon must be in the future", { status: 422, code: "E_AUTONOMY_HORIZON_INVALID" });
    }
    if (input.autonomy_level === "bounded_auto" && RISK_ORDER[input.risk_ceiling] >= RISK_ORDER.high) {
        throw new Exception("Bounded-auto risk ceiling cannot include high or critical actions", {
            status: 422,
            code: "E_AUTONOMY_BOUNDARY_INVALID",
        });
    }
    const now = nowSql();
    const rows = await currentTrx()
        .table("autonomy_objectives")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            name: input.name,
            target_metric: input.target_metric,
            direction: input.direction,
            baseline_value: input.baseline_value,
            target_value: input.target_value,
            horizon_end: horizon.toUTC().toSQL(),
            budget_minor: input.budget_minor ?? null,
            constraints: JSON.stringify(input.constraints),
            allowed_tool_keys: JSON.stringify([...new Set(input.allowed_tool_keys)]),
            autonomy_level: input.autonomy_level,
            effective_autonomy_level: input.autonomy_level,
            risk_ceiling: input.risk_ceiling,
            minimum_confidence: input.minimum_confidence,
            stop_loss: JSON.stringify(input.stop_loss),
            approvers: JSON.stringify(input.approvers),
            scenario_public_id: input.scenario_public_id,
            portfolio_plan_public_id: input.portfolio_plan_public_id,
            agent_plan_public_id: input.agent_plan_public_id,
            status: "draft",
            version: 1,
            reason: input.reason,
            created_by_user_id: actor.id,
            updated_by_user_id: actor.id,
            created_at: now,
            updated_at: now,
        })
        .returning("*");
    return rows[0];
}

export async function activateObjective(publicId: string, actor: User, reason: string) {
    const objective = await requireObjective(publicId);
    if (!["draft", "paused"].includes(String(objective.status))) {
        throw new Exception("Objective cannot be activated from its current state", {
            status: 409,
            code: "E_AUTONOMY_OBJECTIVE_STATE",
        });
    }
    await objectiveDependencies(objective);
    await assertRegisteredPlanBoundary(objective);
    const now = nowSql();
    await currentTrx()
        .from("autonomy_objectives")
        .where({ tenant_id: tenantId(), id: objective.id })
        .update({
            status: "active",
            effective_autonomy_level: objective.autonomy_level,
            reason,
            activated_at: now,
            halted_at: null,
            version: Number(objective.version) + 1,
            updated_by_user_id: actor.id,
            updated_at: now,
        });
    return requireObjective(publicId);
}

export async function haltObjective(publicId: string, actor: User, reason: string) {
    const objective = await requireObjective(publicId);
    const now = nowSql();
    await currentTrx()
        .from("autonomy_objectives")
        .where({ tenant_id: tenantId(), id: objective.id })
        .update({
            status: "halted",
            effective_autonomy_level: "recommend",
            reason,
            halted_at: now,
            version: Number(objective.version) + 1,
            updated_by_user_id: actor.id,
            updated_at: now,
        });
    await currentTrx()
        .from("autonomy_cycles")
        .where({ tenant_id: tenantId(), objective_id: objective.id })
        .whereIn("status", ["ready", "executing", "checkpoint"])
        .update({ status: "halted", finished_at: now });
    return requireObjective(publicId);
}

export async function startCycle(publicId: string, seed: number | undefined, actor: User) {
    const objective = await requireObjective(publicId);
    if (objective.status !== "active")
        throw new Exception("Objective must be active", { status: 409, code: "E_AUTONOMY_OBJECTIVE_NOT_ACTIVE" });
    const steps = await assertRegisteredPlanBoundary(objective);
    const twin = await runScenario(String(objective.scenario_public_id), seed, actor);
    const portfolio = await runPlan(String(objective.portfolio_plan_public_id), actor);
    const confidence = twin.results.length ? Number(twin.results[0].confidence ?? 0) : 0;
    const sequenceRow = await currentTrx()
        .from("autonomy_cycles")
        .where({ tenant_id: tenantId(), objective_id: objective.id })
        .max("sequence as max")
        .first();
    const sequence = Number(sequenceRow?.max ?? 0) + 1;
    const policy = {
        objective_risk_ceiling: objective.risk_ceiling,
        autonomy_level: objective.autonomy_level,
        effective_autonomy_level: objective.effective_autonomy_level,
        allowed_tool_keys: json(objective.allowed_tool_keys, []),
        high_critical_require_human_approval: true,
        registered_steps: steps.map((step) => ({
            public_id: step.public_id,
            tool_key: step.tool_key,
            risk_class: step.risk_class,
            approval_required: step.approval_required,
        })),
    };
    const explanation = {
        what_happened: "Phase 23 simulation and Phase 25 portfolio ranking completed before any Phase 22 execution",
        why: objective.reason,
        data: { twin_source_refs: twin.run.source_refs, portfolio_input_hash: portfolio.input_hash ?? null },
        model_versions: {
            twin: twin.run.engine_version,
            portfolio: portfolio.solver_version ?? "growth-portfolio-v1.1.0",
            autonomy: OBJECTIVE_AUTONOMY_VERSION,
        },
        policy,
        approved_by: json(objective.approvers, []),
        changed: "No operational mutation; cycle is staged for bounded Phase 22 execution",
        result: { twin_run_public_id: twin.run.public_id, portfolio_run_public_id: portfolio.public_id },
        uncertainty: { simulation_confidence: confidence },
    };
    const now = nowSql();
    const rows = await currentTrx()
        .table("autonomy_cycles")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            objective_id: objective.id,
            sequence,
            status: "ready",
            twin_run_public_id: twin.run.public_id,
            portfolio_run_public_id: portfolio.public_id,
            agent_plan_public_id: objective.agent_plan_public_id,
            simulation_confidence: confidence,
            simulation_snapshot: JSON.stringify({ run: twin.run, results: twin.results }),
            portfolio_snapshot: JSON.stringify(portfolio),
            policy_snapshot: JSON.stringify(policy),
            explanation: JSON.stringify(explanation),
            input_digest: digest({
                objective_version: objective.version,
                twin: twin.run.input_hash,
                portfolio: portfolio.input_hash,
                agent_plan: objective.agent_plan_public_id,
            }),
            created_by_user_id: actor.id,
            started_at: now,
        })
        .returning("*");
    if (confidence < Number(objective.minimum_confidence)) {
        await currentTrx()
            .from("autonomy_objectives")
            .where({ tenant_id: tenantId(), id: objective.id })
            .update({ effective_autonomy_level: "propose", updated_at: now });
    }
    return rows[0];
}

export async function executeObjectiveStep(input: {
    objectivePublicId: string;
    cyclePublicId: string;
    stepPublicId: string;
    dryRun: boolean;
    actor: User;
    stepUpSatisfied: boolean;
}) {
    const objective = await requireObjective(input.objectivePublicId);
    if (objective.status !== "active")
        throw new Exception("Objective is not active", { status: 409, code: "E_AUTONOMY_OBJECTIVE_NOT_ACTIVE" });
    const cycle = await currentTrx()
        .from("autonomy_cycles")
        .where({ tenant_id: tenantId(), public_id: input.cyclePublicId, objective_id: objective.id })
        .first();
    if (!cycle) notFound("Autonomy cycle not found", "E_AUTONOMY_CYCLE_NOT_FOUND");
    if (["halted", "completed"].includes(String(cycle.status)))
        throw new Exception("Cycle is not executable", { status: 409, code: "E_AUTONOMY_CYCLE_STATE" });
    const step = await currentTrx()
        .from("agent_plan_steps as s")
        .join("agent_plans as p", "p.id", "s.plan_id")
        .where("s.tenant_id", tenantId())
        .where("s.public_id", input.stepPublicId)
        .where("p.public_id", objective.agent_plan_public_id)
        .select("s.*")
        .first();
    if (!step) notFound("Phase 22 plan step not found for objective", "E_AUTONOMY_STEP_NOT_FOUND");
    if (!json<string[]>(objective.allowed_tool_keys, []).includes(String(step.tool_key))) {
        throw new Exception("Tool is outside objective allowed action classes", {
            status: 403,
            code: "E_AUTONOMY_TOOL_NOT_ALLOWED",
        });
    }
    assertRiskWithinCeiling(
        step.risk_class as ToolRisk,
        objective.risk_ceiling as ToolRisk,
        objective.effective_autonomy_level as AutonomyLevel,
    );
    if (objective.effective_autonomy_level !== "bounded_auto" && !input.dryRun) {
        throw new Exception("Objective autonomy level currently allows proposals only", {
            status: 409,
            code: "E_AUTONOMY_EXECUTION_NOT_ALLOWED",
        });
    }
    const result = await executeStep({
        stepPublicId: input.stepPublicId,
        idempotencyKey: String(step.idempotency_key),
        dryRun: input.dryRun,
        actor: input.actor,
        stepUpSatisfied: input.stepUpSatisfied,
    });
    await currentTrx()
        .from("autonomy_cycles")
        .where({ tenant_id: tenantId(), id: cycle.id })
        .update({ status: input.dryRun ? "ready" : "executing" });
    return result;
}

export async function recordCheckpoint(
    publicId: string,
    input: {
        cycle_public_id?: string;
        observed_value: number;
        budget_spent_minor: number;
        confidence: number;
        constraint_breaches: string[];
        unexpected_harm: boolean;
        evidence_refs: unknown[];
        reason: string;
    },
    actor: User,
) {
    const objective = await requireObjective(publicId);
    const cycle = input.cycle_public_id
        ? await currentTrx()
              .from("autonomy_cycles")
              .where({ tenant_id: tenantId(), objective_id: objective.id, public_id: input.cycle_public_id })
              .first()
        : null;
    if (input.cycle_public_id && !cycle) notFound("Autonomy cycle not found", "E_AUTONOMY_CYCLE_NOT_FOUND");
    const control = evaluateControlDecision({
        budgetMinor: objective.budget_minor == null ? null : Number(objective.budget_minor),
        budgetSpentMinor: input.budget_spent_minor,
        confidence: input.confidence,
        minimumConfidence: Number(objective.minimum_confidence),
        unexpectedHarm: input.unexpected_harm,
        constraintBreaches: input.constraint_breaches,
        stopLoss: json(objective.stop_loss, {}),
        observedValue: input.observed_value,
    });
    const now = nowSql();
    const rows = await currentTrx()
        .table("autonomy_checkpoints")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            objective_id: objective.id,
            cycle_id: cycle?.id ?? null,
            observed_value: input.observed_value,
            budget_spent_minor: input.budget_spent_minor,
            confidence: input.confidence,
            constraint_breaches: JSON.stringify(input.constraint_breaches),
            unexpected_harm: input.unexpected_harm,
            evidence_refs: JSON.stringify(input.evidence_refs),
            decision: control.decision,
            reason: input.reason,
            created_by_user_id: actor.id,
            created_at: now,
        })
        .returning("*");
    if (control.decision === "halt") {
        await haltObjective(publicId, actor, `checkpoint:${input.reason}`);
    } else if (control.nextAutonomy) {
        await currentTrx()
            .from("autonomy_objectives")
            .where({ tenant_id: tenantId(), id: objective.id })
            .update({ effective_autonomy_level: control.nextAutonomy, updated_at: now });
    }
    if (cycle)
        await currentTrx()
            .from("autonomy_cycles")
            .where({ tenant_id: tenantId(), id: cycle.id })
            .update({
                status: control.decision === "halt" ? "halted" : "checkpoint",
                finished_at: control.decision === "halt" ? now : null,
            });
    return { checkpoint: rows[0], control };
}

export async function createPostmortem(
    publicId: string,
    input: {
        final_value: number;
        summary: string;
        lesson: string;
        residual_uncertainty: Record<string, unknown>;
        confidence: number;
        evidence_refs: Array<{ source: string; id: string; label: string }>;
    },
    actor: User,
) {
    const objective = await requireObjective(publicId);
    const existing = await currentTrx()
        .from("autonomy_postmortems")
        .where({ tenant_id: tenantId(), objective_id: objective.id })
        .first();
    if (existing)
        throw new Exception("Objective postmortem already exists", { status: 409, code: "E_AUTONOMY_POSTMORTEM_EXISTS" });
    const target = Number(objective.target_value);
    const baseline = Number(objective.baseline_value);
    const achieved =
        objective.direction === "minimize"
            ? input.final_value <= target
            : objective.direction === "maximize"
              ? input.final_value >= target
              : Math.abs(input.final_value - target) <= Math.max(0.000001, Math.abs(target - baseline) * 0.05);
    const memory = await createMemory(
        {
            memory_class: "architecture_process_decision",
            subject_type: "autonomy_objective",
            subject_id: String(objective.public_id),
            title: `Phase 28 postmortem — ${objective.name}`,
            context: input.summary,
            observed_signals: input.evidence_refs,
            decision: achieved ? "objective_achieved" : "objective_not_achieved",
            reason: objective.reason,
            action: "bounded objective-driven commerce loop",
            outcome: String(input.final_value),
            lesson: input.lesson,
            confidence: input.confidence,
            strength: input.confidence,
            sensitivity: "internal",
            retention_class: "extended",
            allowed_consumers: ["human", "agent"],
            purposes: ["phase28_postmortem", "autonomy_planning"],
            sources: [
                {
                    source_phase: "manual_reviewed",
                    source_kind: "phase28_postmortem",
                    source_id: String(objective.public_id),
                    source_route: `/api/v1/admin/objective-autonomy/objectives/${objective.public_id}`,
                    label: `Objective ${objective.name}`,
                    evidence_role: "outcome",
                    evidence_summary: { final_value: input.final_value, target, achieved, refs: input.evidence_refs },
                    sensitivity: "internal",
                    observed_at: DateTime.utc().toISO()!,
                },
            ],
        },
        actor,
    );
    const now = nowSql();
    const rows = await currentTrx()
        .table("autonomy_postmortems")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            objective_id: objective.id,
            outcome: achieved ? "achieved" : "missed",
            final_value: input.final_value,
            summary: input.summary,
            lesson: input.lesson,
            residual_uncertainty: JSON.stringify(input.residual_uncertainty),
            memory_public_id: memory.public_id,
            created_by_user_id: actor.id,
            created_at: now,
        })
        .returning("*");
    await currentTrx()
        .from("autonomy_objectives")
        .where({ tenant_id: tenantId(), id: objective.id })
        .update({ status: "completed", effective_autonomy_level: "recommend", updated_at: now });
    return { postmortem: rows[0], memory };
}
