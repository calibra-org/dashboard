import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { currentTenantId, currentTrx } from "#services/tenant_context";

const SOLVER_VERSION = "growth-portfolio-v1.0.0";

type CandidateInput = {
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

type CandidateRow = CandidateInput & {
    id: number;
    source_case_stable_key: string;
    source_case_version: number;
};

type PlanRow = {
    id: number;
    public_id: string;
    version: number;
    cash_budget_minor: number | null;
    team_hours_budget: string | number | null;
    warehouse_capacity_budget: string | number | null;
    supplier_capacity_budget: string | number | null;
    max_risk: string | number | null;
    channel_limits: Record<string, number> | string;
    policy_constraints: Record<string, unknown> | string;
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
    return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function weightedValue(candidate: CandidateRow) {
    const quality =
        0.42 * candidate.confidence +
        0.2 * candidate.strategic_alignment +
        0.12 * candidate.reversibility +
        0.12 * candidate.time_to_value +
        0.14 * candidate.customer_impact;
    const riskPenalty = 1 - Math.min(0.85, candidate.risk * 0.55);
    return Math.round(candidate.expected_incremental_contribution_minor * quality * riskPenalty);
}

function subsetFeasible(plan: PlanRow, candidates: CandidateRow[], selectedIds: Set<number>) {
    let cash = 0;
    let hours = 0;
    let warehouse = 0;
    let supplier = 0;
    let maxRisk = 0;
    const channels: Record<string, number> = {};
    const reasons: string[] = [];
    const selectedByCase = new Map(candidates.filter((c) => selectedIds.has(c.id)).map((c) => [c.intelligence_case_id, c]));

    for (const candidate of selectedByCase.values()) {
        cash += candidate.required_cash_minor;
        hours += candidate.team_hours;
        warehouse += candidate.warehouse_capacity;
        supplier += candidate.supplier_capacity;
        maxRisk = Math.max(maxRisk, candidate.risk);
        for (const [channel, amount] of Object.entries(candidate.channel_requirements ?? {})) {
            channels[channel] = (channels[channel] ?? 0) + Number(amount);
        }
        for (const dependency of candidate.dependencies ?? []) {
            if (!selectedByCase.has(Number(dependency))) reasons.push(`dependency:${candidate.intelligence_case_id}->${dependency}`);
        }
        for (const exclusive of candidate.exclusive_with ?? []) {
            if (selectedByCase.has(Number(exclusive))) reasons.push(`exclusive:${candidate.intelligence_case_id}x${exclusive}`);
        }
    }

    if (plan.cash_budget_minor != null && cash > num(plan.cash_budget_minor)) reasons.push("cash_budget");
    if (plan.team_hours_budget != null && hours > num(plan.team_hours_budget)) reasons.push("team_hours_budget");
    if (plan.warehouse_capacity_budget != null && warehouse > num(plan.warehouse_capacity_budget)) reasons.push("warehouse_capacity");
    if (plan.supplier_capacity_budget != null && supplier > num(plan.supplier_capacity_budget)) reasons.push("supplier_capacity");
    if (plan.max_risk != null && maxRisk > num(plan.max_risk)) reasons.push("max_risk");

    const limits = json<Record<string, number>>(plan.channel_limits, {});
    for (const [channel, used] of Object.entries(channels)) {
        if (limits[channel] != null && used > Number(limits[channel])) reasons.push(`channel:${channel}`);
    }

    return {
        feasible: reasons.length === 0,
        reasons,
        utilization: { cash, hours, warehouse, supplier, max_risk: maxRisk, channels },
    };
}

function optimize(plan: PlanRow, candidates: CandidateRow[]) {
    if (candidates.length > 24) {
        throw new Exception("Phase 25 exact solver currently supports up to 24 candidates per plan", {
            status: 422,
            code: "E_GROWTH_PORTFOLIO_CANDIDATE_LIMIT",
        });
    }

    const ordered = [...candidates].sort((a, b) => weightedValue(b) - weightedValue(a));
    const suffix = Array(ordered.length + 1).fill(0);
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
        suffix[index] = suffix[index + 1] + Math.max(0, weightedValue(ordered[index]));
    }

    let bestValue = -Infinity;
    let bestSelected = new Set<number>();
    let bestUtilization: Record<string, unknown> = {};

    const visit = (index: number, selected: Set<number>, value: number) => {
        if (value + suffix[index] < bestValue) return;
        const feasibility = subsetFeasible(plan, ordered, selected);
        if (!feasibility.feasible) return;
        if (index === ordered.length) {
            if (value > bestValue) {
                bestValue = value;
                bestSelected = new Set(selected);
                bestUtilization = feasibility.utilization;
            }
            return;
        }
        visit(index + 1, selected, value);
        const candidate = ordered[index];
        selected.add(candidate.id);
        visit(index + 1, selected, value + weightedValue(candidate));
        selected.delete(candidate.id);
    };

    visit(0, new Set(), 0);

    const items = ordered.map((candidate) => {
        if (bestSelected.has(candidate.id)) {
            return {
                candidate,
                decision: "selected" as const,
                reason: "selected_by_portfolio_optimization",
                binding_constraints: [],
                score: weightedValue(candidate),
            };
        }
        const attempt = new Set(bestSelected);
        attempt.add(candidate.id);
        const feasibility = subsetFeasible(plan, ordered, attempt);
        return {
            candidate,
            decision: feasibility.feasible ? ("deferred" as const) : ("infeasible" as const),
            reason: feasibility.feasible ? "lower_marginal_portfolio_value" : "blocked_by_hard_constraints",
            binding_constraints: feasibility.reasons,
            score: weightedValue(candidate),
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

export async function overview() {
    const trx = currentTrx();
    const tenant = tenantId();
    const [plans, runs, latest] = await Promise.all([
        trx.from("growth_portfolio_plans").where("tenant_id", tenant).count("* as c").first(),
        trx.from("growth_portfolio_runs").where("tenant_id", tenant).count("* as c").first(),
        trx
            .from("growth_portfolio_runs as r")
            .leftJoin("growth_portfolio_plans as p", "p.id", "r.plan_id")
            .where("r.tenant_id", tenant)
            .select("r.*", "p.name as plan_name")
            .orderBy("r.generated_at", "desc")
            .limit(6),
    ]);
    return { solver_version: SOLVER_VERSION, plans: Number(plans?.c ?? 0), runs: Number(runs?.c ?? 0), latest_runs: latest };
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
        policy_constraints?: Record<string, unknown>;
    },
    actor: User,
) {
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
            policy_constraints: JSON.stringify(input.policy_constraints ?? {}),
            status: "draft",
            version: 1,
            created_by_user_id: actor.id,
        })
        .returning("*");
    return rows[0];
}

export async function listCandidates(planPublicId: string) {
    const trx = currentTrx();
    const plan = await trx.from("growth_portfolio_plans").where({ tenant_id: tenantId(), public_id: planPublicId }).first();
    if (!plan) throw new Exception("Portfolio plan not found", { status: 404, code: "E_GROWTH_PORTFOLIO_PLAN_NOT_FOUND" });
    return trx
        .from("growth_portfolio_candidates as c")
        .leftJoin("intelligence_cases as i", "i.id", "c.intelligence_case_id")
        .where({ "c.tenant_id": tenantId(), "c.plan_id": plan.id })
        .select("c.*", "i.title_fa", "i.summary_fa", "i.domain", "i.priority_score")
        .orderBy("i.priority_score", "desc");
}

export async function addCandidate(planPublicId: string, input: CandidateInput) {
    const trx = currentTrx();
    const plan = await trx.from("growth_portfolio_plans").where({ tenant_id: tenantId(), public_id: planPublicId }).first();
    if (!plan) throw new Exception("Portfolio plan not found", { status: 404, code: "E_GROWTH_PORTFOLIO_PLAN_NOT_FOUND" });
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
            dependencies: JSON.stringify(input.dependencies ?? []),
            exclusive_with: JSON.stringify(input.exclusive_with ?? []),
            channel_requirements: JSON.stringify(input.channel_requirements ?? {}),
            source_case_stable_key: intelligenceCase.stable_key,
            source_case_version: intelligenceCase.version,
            snapshot_at: now,
            created_at: now,
            updated_at: now,
        })
        .returning("*");
    await trx.from("growth_portfolio_plans").where({ tenant_id: tenantId(), id: plan.id }).update({ version: plan.version + 1, updated_at: now });
    return rows[0];
}

export async function runPlan(planPublicId: string, actor: User) {
    const trx = currentTrx();
    const plan = (await trx.from("growth_portfolio_plans").where({ tenant_id: tenantId(), public_id: planPublicId }).first()) as PlanRow | undefined;
    if (!plan) throw new Exception("Portfolio plan not found", { status: 404, code: "E_GROWTH_PORTFOLIO_PLAN_NOT_FOUND" });
    const rawCandidates = await trx.from("growth_portfolio_candidates").where({ tenant_id: tenantId(), plan_id: plan.id }).orderBy("id");
    if (rawCandidates.length === 0) {
        throw new Exception("Portfolio plan has no candidates", { status: 422, code: "E_GROWTH_PORTFOLIO_EMPTY" });
    }
    const candidates: CandidateRow[] = rawCandidates.map((row) => ({
        ...row,
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
    const sourceCases = await trx
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

    const optimized = optimize(plan, candidates);
    const inputHash = hash({ plan: { ...plan, channel_limits: json(plan.channel_limits, {}), policy_constraints: json(plan.policy_constraints, {}) }, candidates, solver: SOLVER_VERSION });
    const existing = await trx
        .from("growth_portfolio_runs")
        .where({ tenant_id: tenantId(), plan_id: plan.id, plan_version: plan.version, input_hash: inputHash })
        .first();
    if (existing) return runDetail(existing.public_id);

    const now = DateTime.utc().toSQL();
    const rows = await trx
        .table("growth_portfolio_runs")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            plan_id: plan.id,
            plan_version: plan.version,
            solver_version: SOLVER_VERSION,
            input_hash: inputHash,
            status: "completed",
            expected_value_p10_minor: optimized.expected.p10,
            expected_value_p50_minor: optimized.expected.p50,
            expected_value_p90_minor: optimized.expected.p90,
            resource_utilization: JSON.stringify(optimized.resource_utilization),
            dependency_plan: JSON.stringify(optimized.dependency_plan),
            constraint_snapshot: JSON.stringify({
                cash_budget_minor: plan.cash_budget_minor,
                team_hours_budget: plan.team_hours_budget,
                warehouse_capacity_budget: plan.warehouse_capacity_budget,
                supplier_capacity_budget: plan.supplier_capacity_budget,
                max_risk: plan.max_risk,
                channel_limits: json(plan.channel_limits, {}),
            }),
            generated_at: now,
            created_by_user_id: actor.id,
        })
        .returning("*");
    const run = rows[0];
    let executionOrder = 1;
    for (const item of optimized.items) {
        await trx.table("growth_portfolio_run_items").insert({
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
    if (!run) throw new Exception("Portfolio run not found", { status: 404, code: "E_GROWTH_PORTFOLIO_RUN_NOT_FOUND" });
    const items = await trx
        .from("growth_portfolio_run_items as ri")
        .leftJoin("growth_portfolio_candidates as c", "c.id", "ri.candidate_id")
        .leftJoin("intelligence_cases as i", "i.id", "c.intelligence_case_id")
        .where({ "ri.tenant_id": tenantId(), "ri.run_id": run.id })
        .select("ri.*", "i.title_fa", "i.domain", "c.intelligence_case_id", "c.required_cash_minor", "c.team_hours")
        .orderByRaw("execution_order NULLS LAST, ri.id ASC");
    const outcomes = await trx.from("growth_portfolio_outcomes").where({ tenant_id: tenantId(), run_id: run.id }).orderBy("measured_at", "desc");
    return { ...run, items, outcomes };
}

export async function measureRun(
    publicId: string,
    input: { realized_value_minor: number; attribution_confidence: number; source_outcome_ids: number[]; notes?: string },
    actor: User,
) {
    const trx = currentTrx();
    const run = await trx.from("growth_portfolio_runs").where({ tenant_id: tenantId(), public_id: publicId }).first();
    if (!run) throw new Exception("Portfolio run not found", { status: 404, code: "E_GROWTH_PORTFOLIO_RUN_NOT_FOUND" });
    if (input.source_outcome_ids.length > 0) {
        const count = await trx
            .from("intelligence_outcome_records")
            .where("tenant_id", tenantId())
            .whereIn("id", input.source_outcome_ids)
            .count("* as c")
            .first();
        if (Number(count?.c ?? 0) !== input.source_outcome_ids.length) {
            throw new Exception("Portfolio outcome sources must reference Phase 10 outcome records in the same tenant", {
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
            source_outcome_ids: JSON.stringify(input.source_outcome_ids),
            notes: input.notes ?? null,
            measured_at: DateTime.utc().toSQL(),
            recorded_by_user_id: actor.id,
        })
        .returning("*");
    return rows[0];
}
