import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { governanceService } from "#services/governance_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export const SOLVER_VERSION = "growth-portfolio-v1.1.0";

export type GrowthPortfolioPolicy = {
    max_selected_actions?: number;
    min_confidence?: number;
    forbidden_case_ids?: number[];
    approval_risk_threshold?: number;
    high_risk_auto_cancel?: boolean;
};

export type CandidateInput = {
    intelligence_case_id: number;
    expected_incremental_contribution_minor: number;
    confidence: number;
    required_cash_minor: number;
    team_hours: number;
    warehouse_capacity: number;
    supplier_capacity: number;
    risk: number;
    reversibility: number;
    time_to_value: number;
    customer_impact: number;
    strategic_alignment: number;
    dependencies?: number[];
    exclusive_with?: number[];
    channel_requirements?: Record<string, number>;
};

export type CandidateRow = CandidateInput & {
    id: number;
    source_case_stable_key: string;
    source_case_version: number;
};

export type PlanRow = {
    id: number;
    public_id: string;
    name?: string;
    objective?: string;
    version: number;
    cash_budget_minor: number | null;
    team_hours_budget: string | number | null;
    warehouse_capacity_budget: string | number | null;
    supplier_capacity_budget: string | number | null;
    max_risk: string | number | null;
    channel_limits: Record<string, number> | string;
    policy_constraints: GrowthPortfolioPolicy | string;
};

type ConstraintOverrides = {
    cash_budget_minor?: number | null;
    team_hours_budget?: number | null;
    warehouse_capacity_budget?: number | null;
    supplier_capacity_budget?: number | null;
    max_risk?: number | null;
    channel_limits?: Record<string, number>;
};

type RebalanceInput = {
    trigger_kind: "stockout" | "campaign_outcome" | "cash_settlement_delay" | "supplier_incident";
    trigger_snapshot: Record<string, unknown>;
    constraint_overrides?: ConstraintOverrides;
    active_case_ids?: number[];
};

const tenantId = () => Number(currentTenantId());
const num = (value: unknown) => Number(value ?? 0);
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

function hash(value: unknown) {
    return createHash("sha256")
        .update(JSON.stringify(stable(value)))
        .digest("hex");
}

function uniqueNumbers(values: number[] = []) {
    return [...new Set(values.map(Number))];
}

function policyFor(plan: PlanRow): GrowthPortfolioPolicy {
    const policy = json<GrowthPortfolioPolicy>(plan.policy_constraints, {});
    if (policy.high_risk_auto_cancel === true) {
        throw new Exception("High-risk active actions may never be auto-cancelled by Phase 25", {
            status: 422,
            code: "E_GROWTH_PORTFOLIO_HIGH_RISK_AUTOCANCEL_FORBIDDEN",
        });
    }
    return policy;
}

export function weightedGrowthPortfolioValue(candidate: CandidateRow) {
    const quality =
        0.42 * candidate.confidence +
        0.2 * candidate.strategic_alignment +
        0.12 * candidate.reversibility +
        0.12 * candidate.time_to_value +
        0.14 * candidate.customer_impact;
    const riskPenalty = 1 - Math.min(0.85, candidate.risk * 0.55);
    return Math.round(candidate.expected_incremental_contribution_minor * quality * riskPenalty);
}

function subsetFeasible(
    plan: PlanRow,
    candidates: CandidateRow[],
    selectedIds: Set<number>,
    validateDependencies = true,
) {
    let cash = 0;
    let hours = 0;
    let warehouse = 0;
    let supplier = 0;
    let maxRisk = 0;
    const channels: Record<string, number> = {};
    const reasons: string[] = [];
    const selectedByCase = new Map(
        candidates.filter((candidate) => selectedIds.has(candidate.id)).map((candidate) => [candidate.intelligence_case_id, candidate]),
    );
    const policy = policyFor(plan);
    const forbidden = new Set(uniqueNumbers(policy.forbidden_case_ids));

    if (policy.max_selected_actions != null && selectedByCase.size > policy.max_selected_actions) {
        reasons.push("policy:max_selected_actions");
    }

    for (const candidate of selectedByCase.values()) {
        cash += candidate.required_cash_minor;
        hours += candidate.team_hours;
        warehouse += candidate.warehouse_capacity;
        supplier += candidate.supplier_capacity;
        maxRisk = Math.max(maxRisk, candidate.risk);
        if (policy.min_confidence != null && candidate.confidence < policy.min_confidence) {
            reasons.push(`policy:min_confidence:${candidate.intelligence_case_id}`);
        }
        if (forbidden.has(candidate.intelligence_case_id)) {
            reasons.push(`policy:forbidden_case:${candidate.intelligence_case_id}`);
        }
        for (const [channel, amount] of Object.entries(candidate.channel_requirements ?? {})) {
            channels[channel] = (channels[channel] ?? 0) + Number(amount);
        }
        if (validateDependencies) {
            for (const dependency of candidate.dependencies ?? []) {
                if (!selectedByCase.has(Number(dependency))) {
                    reasons.push(`dependency:${candidate.intelligence_case_id}->${dependency}`);
                }
            }
        }
        for (const exclusive of candidate.exclusive_with ?? []) {
            if (selectedByCase.has(Number(exclusive))) {
                reasons.push(`exclusive:${candidate.intelligence_case_id}x${exclusive}`);
            }
        }
    }

    if (plan.cash_budget_minor != null && cash > num(plan.cash_budget_minor)) reasons.push("cash_budget");
    if (plan.team_hours_budget != null && hours > num(plan.team_hours_budget)) reasons.push("team_hours_budget");
    if (plan.warehouse_capacity_budget != null && warehouse > num(plan.warehouse_capacity_budget)) {
        reasons.push("warehouse_capacity");
    }
    if (plan.supplier_capacity_budget != null && supplier > num(plan.supplier_capacity_budget)) {
        reasons.push("supplier_capacity");
    }
    if (plan.max_risk != null && maxRisk > num(plan.max_risk)) reasons.push("max_risk");

    const limits = json<Record<string, number>>(plan.channel_limits, {});
    for (const [channel, used] of Object.entries(channels)) {
        if (limits[channel] != null && used > Number(limits[channel])) reasons.push(`channel:${channel}`);
    }

    return {
        feasible: reasons.length === 0,
        reasons: [...new Set(reasons)],
        utilization: { cash, hours, warehouse, supplier, max_risk: maxRisk, channels, selected: selectedByCase.size },
    };
}

export function optimizeGrowthPortfolio(plan: PlanRow, candidates: CandidateRow[]) {
    if (candidates.length > 24) {
        throw new Exception("Phase 25 exact solver currently supports up to 24 candidates per plan", {
            status: 422,
            code: "E_GROWTH_PORTFOLIO_CANDIDATE_LIMIT",
        });
    }

    const candidateCaseIds = new Set(candidates.map((candidate) => candidate.intelligence_case_id));
    for (const candidate of candidates) {
        for (const dependency of candidate.dependencies ?? []) {
            if (!candidateCaseIds.has(Number(dependency))) {
                throw new Exception("Candidate dependency must exist in the same portfolio plan", {
                    status: 422,
                    code: "E_GROWTH_PORTFOLIO_DEPENDENCY_MISSING",
                });
            }
        }
    }

    const ordered = [...candidates].sort((a, b) => weightedGrowthPortfolioValue(b) - weightedGrowthPortfolioValue(a));
    const suffix = Array(ordered.length + 1).fill(0);
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
        suffix[index] = suffix[index + 1] + Math.max(0, weightedGrowthPortfolioValue(ordered[index]));
    }

    let bestValue = 0;
    let bestSelected = new Set<number>();
    let bestUtilization: Record<string, unknown> = {};

    const visit = (index: number, selected: Set<number>, value: number) => {
        if (value + suffix[index] < bestValue) return;
        const monotonicFeasibility = subsetFeasible(plan, ordered, selected, false);
        if (!monotonicFeasibility.feasible) return;
        if (index === ordered.length) {
            const finalFeasibility = subsetFeasible(plan, ordered, selected, true);
            if (!finalFeasibility.feasible) return;
            if (value > bestValue || (value === bestValue && selected.size < bestSelected.size)) {
                bestValue = value;
                bestSelected = new Set(selected);
                bestUtilization = finalFeasibility.utilization;
            }
            return;
        }
        visit(index + 1, selected, value);
        const candidate = ordered[index];
        selected.add(candidate.id);
        visit(index + 1, selected, value + weightedGrowthPortfolioValue(candidate));
        selected.delete(candidate.id);
    };

    visit(0, new Set(), 0);

    const items = ordered.map((candidate) => {
        if (bestSelected.has(candidate.id)) {
            return {
                candidate,
                decision: "selected" as const,
                reason: "selected_by_portfolio_optimization",
                binding_constraints: [] as string[],
                score: weightedGrowthPortfolioValue(candidate),
            };
        }
        const attempt = new Set(bestSelected);
        attempt.add(candidate.id);
        const feasibility = subsetFeasible(plan, ordered, attempt, true);
        return {
            candidate,
            decision: feasibility.feasible ? ("deferred" as const) : ("infeasible" as const),
            reason: feasibility.feasible ? "lower_marginal_portfolio_value" : "blocked_by_hard_constraints",
            binding_constraints: feasibility.reasons,
            score: weightedGrowthPortfolioValue(candidate),
        };
    });

    const selected = items.filter((item) => item.decision === "selected");
    const p50 = selected.reduce((sum, item) => sum + item.score, 0);
    const uncertainty = selected.reduce(
        (sum, item) => sum + Math.abs(item.candidate.expected_incremental_contribution_minor) * (1 - item.candidate.confidence),
        0,
    );
    return {
        items,
        selected,
        expected: {
            p10: Math.round(p50 - uncertainty * 0.65),
            p50: Math.round(p50),
            p90: Math.round(p50 + uncertainty * 0.65),
        },
        resource_utilization: bestUtilization,
        dependency_plan: selected
            .filter((item) => (item.candidate.dependencies ?? []).length > 0)
            .map((item) => ({ case_id: item.candidate.intelligence_case_id, dependencies: item.candidate.dependencies ?? [] })),
    };
}

async function requirePlan(planPublicId: string) {
    const plan = (await currentTrx()
        .from("growth_portfolio_plans")
        .where({ tenant_id: tenantId(), public_id: planPublicId })
        .first()) as PlanRow | undefined;
    if (!plan) {
        throw new Exception("Portfolio plan not found", { status: 404, code: "E_GROWTH_PORTFOLIO_PLAN_NOT_FOUND" });
    }
    return plan;
}

async function loadCandidates(plan: PlanRow): Promise<CandidateRow[]> {
    const rows = await currentTrx()
        .from("growth_portfolio_candidates")
        .where({ tenant_id: tenantId(), plan_id: plan.id })
        .orderBy("id");
    return rows.map((row) => ({
        ...row,
        intelligence_case_id: num(row.intelligence_case_id),
        expected_incremental_contribution_minor: num(row.expected_incremental_contribution_minor),
        confidence: num(row.confidence),
        required_cash_minor: num(row.required_cash_minor),
        team_hours: num(row.team_hours),
        warehouse_capacity: num(row.warehouse_capacity),
        supplier_capacity: num(row.supplier_capacity),
        risk: num(row.risk),
        reversibility: num(row.reversibility),
        time_to_value: num(row.time_to_value),
        customer_impact: num(row.customer_impact),
        strategic_alignment: num(row.strategic_alignment),
        dependencies: json<number[]>(row.dependencies, []),
        exclusive_with: json<number[]>(row.exclusive_with, []),
        channel_requirements: json<Record<string, number>>(row.channel_requirements, {}),
    }));
}

async function assertFreshCandidates(candidates: CandidateRow[]) {
    const sourceCases = await currentTrx()
        .from("intelligence_cases")
        .where("tenant_id", tenantId())
        .whereIn("id", candidates.map((candidate) => candidate.intelligence_case_id))
        .select("id", "version", "signal_state");
    const currentById = new Map(sourceCases.map((item) => [Number(item.id), item]));
    const stale = candidates.find((candidate) => {
        const source = currentById.get(candidate.intelligence_case_id);
        return !source || source.signal_state !== "open" || Number(source.version) !== Number(candidate.source_case_version);
    });
    if (stale) {
        throw new Exception("Portfolio candidate snapshot is stale; refresh from Phase 10 before optimizing", {
            status: 409,
            code: "E_GROWTH_PORTFOLIO_STALE_CANDIDATE",
        });
    }
}

function effectivePlan(plan: PlanRow, overrides: ConstraintOverrides = {}): PlanRow {
    return {
        ...plan,
        cash_budget_minor: overrides.cash_budget_minor === undefined ? plan.cash_budget_minor : overrides.cash_budget_minor,
        team_hours_budget:
            overrides.team_hours_budget === undefined ? plan.team_hours_budget : overrides.team_hours_budget,
        warehouse_capacity_budget:
            overrides.warehouse_capacity_budget === undefined
                ? plan.warehouse_capacity_budget
                : overrides.warehouse_capacity_budget,
        supplier_capacity_budget:
            overrides.supplier_capacity_budget === undefined
                ? plan.supplier_capacity_budget
                : overrides.supplier_capacity_budget,
        max_risk: overrides.max_risk === undefined ? plan.max_risk : overrides.max_risk,
        channel_limits: overrides.channel_limits === undefined ? plan.channel_limits : overrides.channel_limits,
    };
}

async function materializeRun(
    plan: PlanRow,
    candidates: CandidateRow[],
    actor: User,
    options: {
        effective?: PlanRow;
        status?: "proposed" | "awaiting_approval" | "completed";
        trigger_context?: Record<string, unknown>;
    } = {},
) {
    const effective = options.effective ?? plan;
    const optimized = optimizeGrowthPortfolio(effective, candidates);
    const triggerContext = options.trigger_context ?? {};
    const inputHash = hash({
        plan: {
            ...effective,
            channel_limits: json(effective.channel_limits, {}),
            policy_constraints: json(effective.policy_constraints, {}),
        },
        candidates,
        trigger_context: triggerContext,
        solver: SOLVER_VERSION,
    });
    const existing = await currentTrx()
        .from("growth_portfolio_runs")
        .where({ tenant_id: tenantId(), plan_id: plan.id, plan_version: plan.version, input_hash: inputHash })
        .first();
    if (existing) return runDetail(existing.public_id);

    const now = DateTime.utc().toSQL();
    const rows = await currentTrx()
        .table("growth_portfolio_runs")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            plan_id: plan.id,
            plan_version: plan.version,
            solver_version: SOLVER_VERSION,
            input_hash: inputHash,
            status: options.status ?? "completed",
            expected_value_p10_minor: optimized.expected.p10,
            expected_value_p50_minor: optimized.expected.p50,
            expected_value_p90_minor: optimized.expected.p90,
            resource_utilization: JSON.stringify(optimized.resource_utilization),
            dependency_plan: JSON.stringify(optimized.dependency_plan),
            constraint_snapshot: JSON.stringify({
                cash_budget_minor: effective.cash_budget_minor,
                team_hours_budget: effective.team_hours_budget,
                warehouse_capacity_budget: effective.warehouse_capacity_budget,
                supplier_capacity_budget: effective.supplier_capacity_budget,
                max_risk: effective.max_risk,
                channel_limits: json(effective.channel_limits, {}),
                policy_constraints: json(effective.policy_constraints, {}),
            }),
            trigger_context: JSON.stringify(triggerContext),
            generated_at: now,
            created_by_user_id: actor.id,
        })
        .returning("*");
    const run = rows[0];
    let executionOrder = 1;
    for (const item of optimized.items) {
        await currentTrx().table("growth_portfolio_run_items").insert({
            tenant_id: tenantId(),
            run_id: run.id,
            candidate_id: item.candidate.id,
            decision: item.decision,
            reason: item.reason,
            expected_weighted_value_minor: item.score,
            portfolio_score: item.score,
            execution_order: item.decision === "selected" ? executionOrder++ : null,
            binding_constraints: JSON.stringify(item.binding_constraints),
        });
    }
    return runDetail(run.public_id);
}

export async function overview() {
    const trx = currentTrx();
    const tenant = tenantId();
    const [plans, runs, rebalances, outcomes, latest] = await Promise.all([
        trx.from("growth_portfolio_plans").where("tenant_id", tenant).count("* as c").first(),
        trx.from("growth_portfolio_runs").where("tenant_id", tenant).count("* as c").first(),
        trx.from("growth_portfolio_rebalance_events").where("tenant_id", tenant).count("* as c").first(),
        trx.from("growth_portfolio_outcomes").where("tenant_id", tenant).avg("realization_ratio as avg_ratio").first(),
        trx
            .from("growth_portfolio_runs as r")
            .leftJoin("growth_portfolio_plans as p", "p.id", "r.plan_id")
            .where("r.tenant_id", tenant)
            .select("r.*", "p.name as plan_name")
            .orderBy("r.generated_at", "desc")
            .limit(6),
    ]);
    return {
        solver_version: SOLVER_VERSION,
        plans: Number(plans?.c ?? 0),
        runs: Number(runs?.c ?? 0),
        rebalances: Number(rebalances?.c ?? 0),
        realization_ratio: outcomes?.avg_ratio == null ? null : Number(outcomes.avg_ratio),
        latest_runs: latest,
    };
}

export async function listOpportunities() {
    return currentTrx()
        .from("intelligence_cases")
        .where({ tenant_id: tenantId(), signal_state: "open" })
        .whereIn("kind", ["opportunity", "recommendation"])
        .select(
            "id",
            "stable_key",
            "kind",
            "domain",
            "title_fa",
            "summary_fa",
            "expected_value_minor",
            "confidence",
            "priority_score",
            "version",
        )
        .orderBy("priority_score", "desc")
        .limit(200);
}

export async function listPlans() {
    return currentTrx().from("growth_portfolio_plans").where("tenant_id", tenantId()).orderBy("updated_at", "desc");
}

export async function createPlan(
    input: {
        name: string;
        objective: string;
        cash_budget_minor?: number | null;
        team_hours_budget?: number | null;
        warehouse_capacity_budget?: number | null;
        supplier_capacity_budget?: number | null;
        max_risk?: number | null;
        channel_limits?: Record<string, number>;
        policy_constraints?: GrowthPortfolioPolicy;
    },
    actor: User,
) {
    if (input.policy_constraints?.high_risk_auto_cancel === true) {
        throw new Exception("High-risk auto-cancel is forbidden by the Phase 25 governance boundary", {
            status: 422,
            code: "E_GROWTH_PORTFOLIO_HIGH_RISK_AUTOCANCEL_FORBIDDEN",
        });
    }
    const rows = await currentTrx()
        .table("growth_portfolio_plans")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            name: input.name,
            objective: input.objective,
            objective_mode: "expected_contribution",
            cash_budget_minor: input.cash_budget_minor ?? null,
            team_hours_budget: input.team_hours_budget ?? null,
            warehouse_capacity_budget: input.warehouse_capacity_budget ?? null,
            supplier_capacity_budget: input.supplier_capacity_budget ?? null,
            max_risk: input.max_risk ?? null,
            channel_limits: JSON.stringify(input.channel_limits ?? {}),
            policy_constraints: JSON.stringify({ high_risk_auto_cancel: false, ...(input.policy_constraints ?? {}) }),
            status: "draft",
            version: 1,
            created_by_user_id: actor.id,
        })
        .returning("*");
    return rows[0];
}

export async function listCandidates(planPublicId: string) {
    const plan = await requirePlan(planPublicId);
    return currentTrx()
        .from("growth_portfolio_candidates as c")
        .leftJoin("intelligence_cases as i", "i.id", "c.intelligence_case_id")
        .where({ "c.tenant_id": tenantId(), "c.plan_id": plan.id })
        .select("c.*", "i.title_fa", "i.summary_fa", "i.domain", "i.priority_score")
        .orderBy("i.priority_score", "desc");
}

export async function addCandidate(planPublicId: string, input: CandidateInput) {
    const trx = currentTrx();
    const plan = await requirePlan(planPublicId);
    const intelligenceCase = await trx
        .from("intelligence_cases")
        .where({ tenant_id: tenantId(), id: input.intelligence_case_id, signal_state: "open" })
        .whereIn("kind", ["opportunity", "recommendation"])
        .first();
    if (!intelligenceCase) {
        throw new Exception("Candidate must reference an open Phase 10 opportunity or recommendation", {
            status: 422,
            code: "E_GROWTH_PORTFOLIO_SOURCE_REQUIRED",
        });
    }
    if ((input.dependencies ?? []).includes(input.intelligence_case_id)) {
        throw new Exception("Candidate cannot depend on itself", { status: 422, code: "E_GROWTH_PORTFOLIO_SELF_DEPENDENCY" });
    }
    if ((input.exclusive_with ?? []).includes(input.intelligence_case_id)) {
        throw new Exception("Candidate cannot be exclusive with itself", { status: 422, code: "E_GROWTH_PORTFOLIO_SELF_EXCLUSIVE" });
    }
    const now = DateTime.utc().toSQL();
    const rows = await trx
        .table("growth_portfolio_candidates")
        .insert({
            tenant_id: tenantId(),
            plan_id: plan.id,
            intelligence_case_id: input.intelligence_case_id,
            expected_incremental_contribution_minor: input.expected_incremental_contribution_minor,
            confidence: input.confidence,
            required_cash_minor: input.required_cash_minor,
            team_hours: input.team_hours,
            warehouse_capacity: input.warehouse_capacity,
            supplier_capacity: input.supplier_capacity,
            risk: input.risk,
            reversibility: input.reversibility,
            time_to_value: input.time_to_value,
            customer_impact: input.customer_impact,
            strategic_alignment: input.strategic_alignment,
            dependencies: JSON.stringify(uniqueNumbers(input.dependencies)),
            exclusive_with: JSON.stringify(uniqueNumbers(input.exclusive_with)),
            channel_requirements: JSON.stringify(input.channel_requirements ?? {}),
            source_case_stable_key: intelligenceCase.stable_key,
            source_case_version: intelligenceCase.version,
            snapshot_at: now,
            created_at: now,
            updated_at: now,
        })
        .returning("*");
    await trx
        .from("growth_portfolio_plans")
        .where({ tenant_id: tenantId(), id: plan.id })
        .update({ version: plan.version + 1, updated_at: now });
    return rows[0];
}

export async function removeCandidate(planPublicId: string, candidateId: number) {
    const trx = currentTrx();
    const plan = await requirePlan(planPublicId);
    const candidate = await trx
        .from("growth_portfolio_candidates")
        .where({ tenant_id: tenantId(), plan_id: plan.id, id: candidateId })
        .first();
    if (!candidate) {
        throw new Exception("Portfolio candidate not found", { status: 404, code: "E_GROWTH_PORTFOLIO_CANDIDATE_NOT_FOUND" });
    }
    const dependents = await trx
        .from("growth_portfolio_candidates")
        .where({ tenant_id: tenantId(), plan_id: plan.id })
        .whereRaw("dependencies @> ?::jsonb", [JSON.stringify([Number(candidate.intelligence_case_id)])])
        .first();
    if (dependents) {
        throw new Exception("Candidate is still required by another candidate", {
            status: 409,
            code: "E_GROWTH_PORTFOLIO_DEPENDENCY_IN_USE",
        });
    }
    await trx.from("growth_portfolio_candidates").where("id", candidate.id).delete();
    await trx
        .from("growth_portfolio_plans")
        .where({ tenant_id: tenantId(), id: plan.id })
        .update({ version: plan.version + 1, updated_at: DateTime.utc().toSQL() });
    return { removed: true, candidate_id: candidateId };
}

export async function runPlan(planPublicId: string, actor: User) {
    const plan = await requirePlan(planPublicId);
    const candidates = await loadCandidates(plan);
    if (candidates.length === 0) {
        throw new Exception("Portfolio plan has no candidates", { status: 422, code: "E_GROWTH_PORTFOLIO_EMPTY" });
    }
    await assertFreshCandidates(candidates);
    return materializeRun(plan, candidates, actor);
}

export async function listRuns() {
    return currentTrx()
        .from("growth_portfolio_runs as r")
        .leftJoin("growth_portfolio_plans as p", "p.id", "r.plan_id")
        .where("r.tenant_id", tenantId())
        .select("r.*", "p.name as plan_name", "p.objective")
        .orderBy("r.generated_at", "desc")
        .limit(100);
}

export async function runDetail(publicId: string) {
    const trx = currentTrx();
    const run = await trx.from("growth_portfolio_runs").where({ tenant_id: tenantId(), public_id: publicId }).first();
    if (!run) {
        throw new Exception("Portfolio run not found", { status: 404, code: "E_GROWTH_PORTFOLIO_RUN_NOT_FOUND" });
    }
    const items = await trx
        .from("growth_portfolio_run_items as ri")
        .leftJoin("growth_portfolio_candidates as c", "c.id", "ri.candidate_id")
        .leftJoin("intelligence_cases as i", "i.id", "c.intelligence_case_id")
        .where({ "ri.tenant_id": tenantId(), "ri.run_id": run.id })
        .select(
            "ri.*",
            "i.title_fa",
            "i.domain",
            "c.intelligence_case_id",
            "c.required_cash_minor",
            "c.team_hours",
            "c.risk",
            "c.confidence",
        )
        .orderByRaw("execution_order NULLS LAST, ri.id ASC");
    const outcomes = await trx
        .from("growth_portfolio_outcomes")
        .where({ tenant_id: tenantId(), run_id: run.id })
        .orderBy("measured_at", "desc");
    return { ...run, items, outcomes };
}

export async function rebalancePlan(planPublicId: string, input: RebalanceInput, actor: User) {
    const trx = currentTrx();
    const plan = await requirePlan(planPublicId);
    const candidates = await loadCandidates(plan);
    if (candidates.length === 0) {
        throw new Exception("Portfolio plan has no candidates", { status: 422, code: "E_GROWTH_PORTFOLIO_EMPTY" });
    }
    await assertFreshCandidates(candidates);
    const latest = await trx
        .from("growth_portfolio_runs")
        .where({ tenant_id: tenantId(), plan_id: plan.id })
        .whereIn("status", ["completed", "superseded"])
        .orderBy("generated_at", "desc")
        .first();
    const effective = effectivePlan(plan, input.constraint_overrides ?? {});
    const proposed = await materializeRun(plan, candidates, actor, {
        effective,
        status: "proposed",
        trigger_context: {
            trigger_kind: input.trigger_kind,
            trigger_snapshot: input.trigger_snapshot,
            constraint_overrides: input.constraint_overrides ?? {},
        },
    });

    const currentSelected = latest
        ? await trx
              .from("growth_portfolio_run_items as ri")
              .leftJoin("growth_portfolio_candidates as c", "c.id", "ri.candidate_id")
              .where({ "ri.tenant_id": tenantId(), "ri.run_id": latest.id, "ri.decision": "selected" })
              .select("c.intelligence_case_id", "c.risk")
        : [];
    const proposedSelected = new Set(
        (proposed.items as Array<Record<string, unknown>>)
            .filter((item) => item.decision === "selected")
            .map((item) => Number(item.intelligence_case_id)),
    );
    const explicitlyActive = new Set(uniqueNumbers(input.active_case_ids));
    const inProgress = currentSelected.length
        ? await trx
              .from("intelligence_action_records")
              .where("tenant_id", tenantId())
              .where("status", "in_progress")
              .whereIn(
                  "case_id",
                  currentSelected.map((item) => Number(item.intelligence_case_id)),
              )
              .select("case_id")
        : [];
    for (const item of inProgress) explicitlyActive.add(Number(item.case_id));
    const threshold = policyFor(plan).approval_risk_threshold ?? 0.65;
    const protectedActiveCaseIds = currentSelected
        .filter(
            (item) =>
                explicitlyActive.has(Number(item.intelligence_case_id)) &&
                !proposedSelected.has(Number(item.intelligence_case_id)) &&
                Number(item.risk) >= threshold,
        )
        .map((item) => Number(item.intelligence_case_id));

    const eventPublicId = randomUUID();
    const now = DateTime.utc().toSQL();
    const eventRows = await trx
        .table("growth_portfolio_rebalance_events")
        .insert({
            public_id: eventPublicId,
            tenant_id: tenantId(),
            plan_id: plan.id,
            from_run_id: latest?.id ?? null,
            proposed_run_id: proposed.id,
            trigger_kind: input.trigger_kind,
            trigger_snapshot: JSON.stringify({
                ...input.trigger_snapshot,
                constraint_overrides: input.constraint_overrides ?? {},
            }),
            protected_active_case_ids: JSON.stringify(protectedActiveCaseIds),
            status: protectedActiveCaseIds.length ? "approval_required" : "applied",
            detected_at: now,
            applied_at: protectedActiveCaseIds.length ? null : now,
            created_by_user_id: actor.id,
        })
        .returning("*");
    const event = eventRows[0];

    if (protectedActiveCaseIds.length > 0) {
        const approval = await governanceService.createApproval(
            {
                actionKey: "growth.portfolio.high_risk_cancel",
                reason: "Phase 25 rebalance would remove active high-risk actions and requires human approval",
                workflowKind: "single",
                expiresInMinutes: 1440,
                resourceType: "growth_portfolio_rebalance",
                resourceId: eventPublicId,
                separationOfDuties: true,
                payload: {
                    plan_public_id: plan.public_id,
                    trigger_kind: input.trigger_kind,
                    protected_active_case_ids: protectedActiveCaseIds,
                    proposed_run_public_id: proposed.public_id,
                },
            },
            actor.id,
        );
        await trx
            .from("growth_portfolio_rebalance_events")
            .where("id", event.id)
            .update({ approval_reference: approval.reference });
        await trx.from("growth_portfolio_runs").where("id", proposed.id).update({ status: "awaiting_approval" });
    } else {
        if (latest) await trx.from("growth_portfolio_runs").where("id", latest.id).update({ status: "superseded" });
        await trx.from("growth_portfolio_runs").where("id", proposed.id).update({ status: "completed" });
    }
    return rebalanceDetail(eventPublicId);
}

export async function listRebalances() {
    return currentTrx()
        .from("growth_portfolio_rebalance_events as e")
        .leftJoin("growth_portfolio_plans as p", "p.id", "e.plan_id")
        .where("e.tenant_id", tenantId())
        .select("e.*", "p.name as plan_name")
        .orderBy("e.detected_at", "desc")
        .limit(100);
}

export async function rebalanceDetail(publicId: string) {
    const trx = currentTrx();
    const event = await trx
        .from("growth_portfolio_rebalance_events as e")
        .leftJoin("growth_portfolio_plans as p", "p.id", "e.plan_id")
        .where({ "e.tenant_id": tenantId(), "e.public_id": publicId })
        .select("e.*", "p.name as plan_name", "p.public_id as plan_public_id")
        .first();
    if (!event) {
        throw new Exception("Portfolio rebalance event not found", {
            status: 404,
            code: "E_GROWTH_PORTFOLIO_REBALANCE_NOT_FOUND",
        });
    }
    const proposedRun = event.proposed_run_id
        ? await trx.from("growth_portfolio_runs").where({ tenant_id: tenantId(), id: event.proposed_run_id }).first()
        : null;
    const approval = event.approval_reference
        ? await trx
              .from("governance_approval_requests")
              .where({ tenant_id: tenantId(), reference: event.approval_reference })
              .select("reference", "status", "expires_at", "approved_at", "rejected_at")
              .first()
        : null;
    return { ...event, proposed_run: proposedRun, approval };
}

export async function applyRebalance(publicId: string) {
    const trx = currentTrx();
    const event = await trx
        .from("growth_portfolio_rebalance_events")
        .where({ tenant_id: tenantId(), public_id: publicId })
        .forUpdate()
        .first();
    if (!event) {
        throw new Exception("Portfolio rebalance event not found", {
            status: 404,
            code: "E_GROWTH_PORTFOLIO_REBALANCE_NOT_FOUND",
        });
    }
    if (event.status === "applied") return rebalanceDetail(publicId);
    if (event.status !== "approval_required") {
        throw new Exception("Rebalance is not awaiting approval", { status: 409, code: "E_GROWTH_PORTFOLIO_REBALANCE_STATE" });
    }
    const approval = await trx
        .from("governance_approval_requests")
        .where({ tenant_id: tenantId(), reference: event.approval_reference })
        .first();
    if (!approval || approval.status !== "approved") {
        throw new Exception("Approved Governance OS request is required before applying this rebalance", {
            status: 409,
            code: "E_GROWTH_PORTFOLIO_APPROVAL_REQUIRED",
        });
    }
    const now = DateTime.utc().toSQL();
    if (event.from_run_id) {
        await trx.from("growth_portfolio_runs").where("id", event.from_run_id).update({ status: "superseded" });
    }
    if (event.proposed_run_id) {
        await trx.from("growth_portfolio_runs").where("id", event.proposed_run_id).update({ status: "completed" });
    }
    await trx
        .from("growth_portfolio_rebalance_events")
        .where("id", event.id)
        .update({ status: "applied", applied_at: now });
    return rebalanceDetail(publicId);
}

export async function measureRun(
    publicId: string,
    input: {
        realized_value_minor: number;
        attribution_confidence: number;
        measurement_window?: string;
        source_outcome_ids: number[];
        notes?: string;
    },
    actor: User,
) {
    const trx = currentTrx();
    const run = await trx.from("growth_portfolio_runs").where({ tenant_id: tenantId(), public_id: publicId }).first();
    if (!run) {
        throw new Exception("Portfolio run not found", { status: 404, code: "E_GROWTH_PORTFOLIO_RUN_NOT_FOUND" });
    }
    const sourceIds = uniqueNumbers(input.source_outcome_ids);
    if (sourceIds.length !== input.source_outcome_ids.length) {
        throw new Exception("Portfolio outcome source identifiers must be unique", {
            status: 422,
            code: "E_GROWTH_PORTFOLIO_OUTCOME_DUPLICATE_SOURCE",
        });
    }
    if (sourceIds.length > 0) {
        const runCaseRows = await trx
            .from("growth_portfolio_run_items as ri")
            .leftJoin("growth_portfolio_candidates as c", "c.id", "ri.candidate_id")
            .where({ "ri.tenant_id": tenantId(), "ri.run_id": run.id })
            .select("c.intelligence_case_id");
        const runCaseIds = new Set(runCaseRows.map((item) => Number(item.intelligence_case_id)));
        const outcomeRows = await trx
            .from("intelligence_outcome_records")
            .where("tenant_id", tenantId())
            .whereIn("id", sourceIds)
            .select("id", "case_id");
        if (outcomeRows.length !== sourceIds.length || outcomeRows.some((item) => !runCaseIds.has(Number(item.case_id)))) {
            throw new Exception("Portfolio outcomes must reference Phase 10 outcomes for cases in this exact run", {
                status: 422,
                code: "E_GROWTH_PORTFOLIO_OUTCOME_SOURCE",
            });
        }
    }
    const expected = num(run.expected_value_p50_minor);
    const rows = await trx
        .table("growth_portfolio_outcomes")
        .insert({
            tenant_id: tenantId(),
            run_id: run.id,
            expected_value_minor: expected,
            realized_value_minor: input.realized_value_minor,
            realization_ratio: expected === 0 ? null : input.realized_value_minor / expected,
            attribution_confidence: input.attribution_confidence,
            measurement_window: input.measurement_window ?? null,
            source_outcome_ids: JSON.stringify(sourceIds),
            notes: input.notes ?? null,
            measured_at: DateTime.utc().toSQL(),
            recorded_by_user_id: actor.id,
        })
        .returning("*");
    return rows[0];
}
