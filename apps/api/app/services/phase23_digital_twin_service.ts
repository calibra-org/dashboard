import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export interface TwinAssumptions {
    demand_multiplier: number;
    price_multiplier: number;
    cost_multiplier: number;
    lead_time_multiplier: number;
    capacity_multiplier: number;
    capital_limit_minor?: number | null;
    campaign_lift?: number;
    service_level_target?: number;
}

const ENGINE_VERSION = "commerce-twin-v1.1.0";
const DEFAULT_SEED = 23_001;

function num(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function round4(value: number): number {
    return Math.round(value * 10_000) / 10_000;
}

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, stable(item)]),
    );
}

function hash(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function parseJson<T>(value: unknown, fallback: T): T {
    if (value && typeof value === "object") return value as T;
    if (typeof value !== "string") return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function band(center: number, uncertainty: number, floor = 0) {
    return {
        p10: round4(Math.max(floor, center * (1 - uncertainty))),
        p50: round4(Math.max(floor, center)),
        p90: round4(Math.max(floor, center * (1 + uncertainty))),
    };
}

function ratioBand(center: number, uncertainty: number) {
    const result = band(center, uncertainty, 0);
    return {
        p10: clamp(result.p10, 0, 1),
        p50: clamp(result.p50, 0, 1),
        p90: clamp(result.p90, 0, 1),
    };
}

function seededUncertaintyAdjustment(seed: number): number {
    const digest = createHash("sha256").update(String(seed)).digest();
    const normalized = digest.readUInt16BE(0) / 65_535;
    return (normalized - 0.5) * 0.02;
}

async function latestPlanningSnapshot() {
    const trx = currentTrx();
    const run = await trx.from("planning_forecast_runs").where("status", "completed").orderBy("id", "desc").first();
    if (!run) {
        return {
            run: null,
            demand: { p10: 0, p50: 0, p90: 0 },
            replenishment: { suggested: 0, on_hand: 0, safety_stock: 0 },
        };
    }

    const [demand, replenishment] = await Promise.all([
        trx
            .from("planning_forecast_points")
            .where("forecast_run_id", run.id)
            .select(
                trx.raw("COALESCE(SUM(p10_quantity),0)::numeric AS p10"),
                trx.raw("COALESCE(SUM(p50_quantity),0)::numeric AS p50"),
                trx.raw("COALESCE(SUM(p90_quantity),0)::numeric AS p90"),
            )
            .first(),
        trx
            .from("planning_replenishment_recommendations")
            .where("forecast_run_id", run.id)
            .select(
                trx.raw("COALESCE(SUM(suggested_quantity),0)::numeric AS suggested"),
                trx.raw("COALESCE(SUM(on_hand_quantity),0)::numeric AS on_hand"),
                trx.raw("COALESCE(SUM(safety_stock),0)::numeric AS safety_stock"),
            )
            .first(),
    ]);

    return {
        run,
        demand: { p10: num(demand?.p10), p50: num(demand?.p50), p90: num(demand?.p90) },
        replenishment: {
            suggested: num(replenishment?.suggested),
            on_hand: num(replenishment?.on_hand),
            safety_stock: num(replenishment?.safety_stock),
        },
    };
}

async function commerceBaseline() {
    const trx = currentTrx();
    const since = DateTime.utc().minus({ days: 90 }).toSQL();
    const row = await trx
        .from("orders as o")
        .innerJoin("order_line_items as li", "li.order_id", "o.id")
        .whereIn("o.status", ["processing", "completed"])
        .whereNull("o.deleted_at")
        .whereRaw("COALESCE(o.date_paid_at, o.created_at) >= ?", [since])
        .select(
            trx.raw("COALESCE(SUM(li.quantity * li.price_snapshot),0)::numeric AS revenue"),
            trx.raw("COALESCE(SUM(li.quantity),0)::numeric AS units"),
            trx.raw("COUNT(DISTINCT o.id)::integer AS orders"),
            trx.raw("MAX(COALESCE(o.date_paid_at, o.created_at))::text AS latest_observed_at"),
        )
        .first();
    const revenue = num(row?.revenue);
    const units = num(row?.units);
    return {
        revenue_90d: revenue,
        units_90d: units,
        orders_90d: num(row?.orders),
        avg_unit_revenue: units > 0 ? revenue / units : 0,
        latest_observed_at: row?.latest_observed_at ?? null,
    };
}

async function buildInputSnapshot() {
    const [planning, commerce] = await Promise.all([latestPlanningSnapshot(), commerceBaseline()]);
    return {
        source_cutoff_at: planning.run?.data_cutoff_at ?? commerce.latest_observed_at ?? null,
        planning: {
            forecast_run_id: planning.run?.id ?? null,
            model_code: planning.run?.model_code ?? null,
            model_version: planning.run?.model_version ?? null,
            source_hash: planning.run?.source_hash ?? null,
            data_cutoff_at: planning.run?.data_cutoff_at ?? null,
            demand: planning.demand,
            replenishment: planning.replenishment,
        },
        commerce,
    };
}

function simulate(snapshot: Awaited<ReturnType<typeof buildInputSnapshot>>, assumptions: TwinAssumptions, seed: number) {
    const lift = 1 + (assumptions.campaign_lift ?? 0);
    const demandFactor = assumptions.demand_multiplier * lift;
    const demand = {
        p10: snapshot.planning.demand.p10 * demandFactor,
        p50: snapshot.planning.demand.p50 * demandFactor,
        p90: snapshot.planning.demand.p90 * demandFactor,
    };
    const forecastUnits = demand.p50 || snapshot.commerce.units_90d * demandFactor;
    const unitRevenue = snapshot.commerce.avg_unit_revenue * assumptions.price_multiplier;
    const revenue = forecastUnits * unitRevenue;
    const costRatio = clamp(0.68 * assumptions.cost_multiplier, 0.05, 1.5);
    const grossMargin = revenue * (1 - costRatio);
    const capacityUnits = Math.max(
        1,
        (snapshot.planning.replenishment.on_hand + snapshot.planning.replenishment.suggested) * assumptions.capacity_multiplier,
    );
    const stockoutRisk = clamp((demand.p90 - capacityUnits) / Math.max(1, demand.p90), 0, 1);
    const serviceLevel = clamp(1 - stockoutRisk * assumptions.lead_time_multiplier, 0, 1);
    const serviceLevelTarget = assumptions.service_level_target ?? 0.9;
    const serviceLevelGap = serviceLevel - serviceLevelTarget;
    const workingCapital = Math.max(
        0,
        snapshot.planning.replenishment.suggested * snapshot.commerce.avg_unit_revenue * costRatio,
    );
    const capitalPressure =
        assumptions.capital_limit_minor && assumptions.capital_limit_minor > 0
            ? clamp(workingCapital / assumptions.capital_limit_minor, 0, 5)
            : 0;
    const uncertainty = clamp(
        0.08 + stockoutRisk * 0.22 + Math.max(0, assumptions.lead_time_multiplier - 1) * 0.04 + seededUncertaintyAdjustment(seed),
        0.05,
        0.4,
    );
    const confidence = round4(
        clamp(0.94 - uncertainty - (snapshot.planning.forecast_run_id ? 0 : 0.25), 0.2, 0.95),
    );
    const metrics = [
        {
            key: "demand_units",
            unit: "units",
            p10: round4(demand.p10),
            p50: round4(demand.p50),
            p90: round4(demand.p90),
        },
        { key: "revenue", unit: "minor_currency", ...band(revenue, uncertainty) },
        { key: "gross_margin", unit: "minor_currency", ...band(grossMargin, uncertainty + 0.04) },
        { key: "stockout_risk", unit: "ratio", ...ratioBand(stockoutRisk, 0.18) },
        { key: "service_level", unit: "ratio", ...ratioBand(serviceLevel, 0.08) },
        { key: "service_level_gap", unit: "ratio_delta", ...band(serviceLevelGap, 0, -1) },
        { key: "working_capital", unit: "minor_currency", ...band(workingCapital, uncertainty) },
        { key: "capital_pressure", unit: "ratio", ...band(capitalPressure, 0.12) },
    ];
    return { metrics, confidence, uncertainty, serviceLevelTarget };
}

export async function overview() {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const [scenarioCount, runCount, latestRun] = await Promise.all([
        trx.from("commerce_twin_scenarios").where("tenant_id", tenantId).count("* as c").first(),
        trx.from("commerce_twin_runs").where("tenant_id", tenantId).count("* as c").first(),
        trx.from("commerce_twin_runs").where("tenant_id", tenantId).orderBy("created_at", "desc").first(),
    ]);
    let metrics: unknown[] = [];
    if (latestRun) {
        metrics = await trx
            .from("commerce_twin_results")
            .where({ tenant_id: tenantId, run_id: latestRun.id })
            .orderBy("metric_key");
    }
    return {
        engine_version: ENGINE_VERSION,
        scenarios: num(scenarioCount?.c),
        runs: num(runCount?.c),
        latest_run: latestRun ?? null,
        latest_metrics: metrics,
    };
}

export async function listScenarios() {
    return currentTrx()
        .from("commerce_twin_scenarios")
        .where("tenant_id", Number(currentTenantId()))
        .orderBy("updated_at", "desc")
        .limit(100);
}

export async function createScenario(
    input: {
        title: string;
        objective: string;
        assumptions: TwinAssumptions;
        source_refs?: Record<string, unknown>;
    },
    actor: User,
) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const now = DateTime.utc().toSQL();
    const rows = await trx
        .table("commerce_twin_scenarios")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId,
            title: input.title,
            objective: input.objective,
            status: "ready",
            version: 1,
            assumptions: JSON.stringify(input.assumptions),
            source_refs: JSON.stringify(input.source_refs ?? {}),
            assumption_hash: hash(input.assumptions),
            created_by_user_id: actor.id,
            created_at: now,
            updated_at: now,
        })
        .returning("*");
    return rows[0];
}

export async function updateScenario(
    publicId: string,
    input: {
        title: string;
        objective: string;
        assumptions: TwinAssumptions;
        source_refs?: Record<string, unknown>;
    },
) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const current = await trx
        .from("commerce_twin_scenarios")
        .where({ tenant_id: tenantId, public_id: publicId })
        .first();
    if (!current) {
        throw new Exception("Digital twin scenario not found", {
            status: 404,
            code: "E_TWIN_SCENARIO_NOT_FOUND",
        });
    }
    await trx
        .from("commerce_twin_scenarios")
        .where({ tenant_id: tenantId, id: current.id })
        .update({
            title: input.title,
            objective: input.objective,
            assumptions: JSON.stringify(input.assumptions),
            source_refs: JSON.stringify(input.source_refs ?? {}),
            assumption_hash: hash(input.assumptions),
            version: num(current.version) + 1,
            updated_at: DateTime.utc().toSQL(),
        });
    return trx.from("commerce_twin_scenarios").where({ tenant_id: tenantId, id: current.id }).first();
}

export async function runScenario(publicId: string, requestedSeed: number | undefined, actor: User) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const scenario = await trx
        .from("commerce_twin_scenarios")
        .where({ tenant_id: tenantId, public_id: publicId })
        .first();
    if (!scenario) {
        throw new Exception("Digital twin scenario not found", {
            status: 404,
            code: "E_TWIN_SCENARIO_NOT_FOUND",
        });
    }
    const seed = requestedSeed ?? DEFAULT_SEED;
    const assumptions = parseJson<TwinAssumptions>(scenario.assumptions, {} as TwinAssumptions);
    const snapshot = await buildInputSnapshot();
    const sourceRefs = {
        ...parseJson<Record<string, unknown>>(scenario.source_refs, {}),
        planning_forecast_run_id: snapshot.planning.forecast_run_id,
        planning_source_hash: snapshot.planning.source_hash,
        commerce_latest_observed_at: snapshot.commerce.latest_observed_at,
    };
    const inputHash = hash({
        scenario_version: scenario.version,
        assumptions,
        snapshot,
        source_refs: sourceRefs,
        engine: ENGINE_VERSION,
        seed,
    });
    const existing = await trx
        .from("commerce_twin_runs")
        .where({
            tenant_id: tenantId,
            scenario_id: scenario.id,
            scenario_version: scenario.version,
            input_hash: inputHash,
        })
        .first();
    if (existing) return runDetail(existing.public_id);

    const simulation = simulate(snapshot, assumptions, seed);
    const now = DateTime.utc().toSQL();
    const runRows = await trx
        .table("commerce_twin_runs")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId,
            scenario_id: scenario.id,
            scenario_version: scenario.version,
            engine_version: ENGINE_VERSION,
            seed,
            input_hash: inputHash,
            assumption_hash: scenario.assumption_hash,
            input_snapshot: JSON.stringify(snapshot),
            source_refs: JSON.stringify(sourceRefs),
            status: "completed",
            created_by_user_id: actor.id,
            created_at: now,
        })
        .returning("*");
    const run = runRows[0];

    for (const metric of simulation.metrics) {
        await trx.table("commerce_twin_results").insert({
            tenant_id: tenantId,
            run_id: run.id,
            metric_key: metric.key,
            p10: metric.p10,
            p50: metric.p50,
            p90: metric.p90,
            unit: metric.unit,
            confidence: simulation.confidence,
            drivers: JSON.stringify(Object.entries(assumptions).map(([key, value]) => ({ key, value }))),
            evidence: JSON.stringify(sourceRefs),
            created_at: now,
        });
    }
    return runDetail(run.public_id);
}

export async function runDetail(publicId: string) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const run = await trx.from("commerce_twin_runs").where({ tenant_id: tenantId, public_id: publicId }).first();
    if (!run) {
        throw new Exception("Digital twin run not found", { status: 404, code: "E_TWIN_RUN_NOT_FOUND" });
    }
    const [scenario, results] = await Promise.all([
        trx.from("commerce_twin_scenarios").where({ tenant_id: tenantId, id: run.scenario_id }).first(),
        trx.from("commerce_twin_results").where({ tenant_id: tenantId, run_id: run.id }).orderBy("metric_key"),
    ]);
    return { run, scenario, results };
}

export async function compareRuns(runIds: string[]) {
    const details = [];
    for (const id of runIds.slice(0, 6)) details.push(await runDetail(id));
    return details;
}

export async function sensitivity(publicId: string) {
    const detail = await runDetail(publicId);
    const assumptions = parseJson<TwinAssumptions>(detail.scenario.assumptions, {} as TwinAssumptions);
    const snapshot = parseJson<Awaited<ReturnType<typeof buildInputSnapshot>>>(
        detail.run.input_snapshot,
        {} as Awaited<ReturnType<typeof buildInputSnapshot>>,
    );
    const seed = num(detail.run.seed) || DEFAULT_SEED;
    const baseline = simulate(snapshot, assumptions, seed);
    const baseRevenue = baseline.metrics.find((metric) => metric.key === "revenue")?.p50 ?? 0;
    const drivers = Object.entries(assumptions)
        .filter(([, value]) => typeof value === "number" && value !== 0)
        .map(([key, value]) => {
            const next = { ...assumptions, [key]: Number(value) * 1.1 };
            const revenue = simulate(snapshot, next, seed).metrics.find((metric) => metric.key === "revenue")?.p50 ?? 0;
            return {
                key,
                baseline: value,
                delta_10pct_revenue: round4(revenue - baseRevenue),
                elasticity: baseRevenue ? round4((revenue - baseRevenue) / baseRevenue / 0.1) : 0,
            };
        })
        .sort((a, b) => Math.abs(b.delta_10pct_revenue) - Math.abs(a.delta_10pct_revenue));
    return { run_public_id: publicId, target_metric: "revenue", drivers };
}

export async function decisionBrief(publicId: string) {
    const detail = await runDetail(publicId);
    const byKey = new Map(detail.results.map((row: Record<string, unknown>) => [String(row.metric_key), row]));
    const risk = num(byKey.get("stockout_risk")?.p50);
    const margin = num(byKey.get("gross_margin")?.p50);
    const service = num(byKey.get("service_level")?.p50);
    const serviceGap = num(byKey.get("service_level_gap")?.p50);
    const capital = num(byKey.get("capital_pressure")?.p50);
    const verdict =
        risk > 0.35 || capital > 1.2
            ? "high_risk"
            : serviceGap < 0
              ? "needs_mitigation"
              : margin > 0
                ? "viable_with_controls"
                : "economically_weak";
    return {
        run_public_id: publicId,
        verdict,
        tradeoffs: {
            gross_margin_p50: margin,
            stockout_risk_p50: risk,
            service_level_p50: service,
            service_level_gap_p50: serviceGap,
            capital_pressure_p50: capital,
        },
        confidence: detail.results.length ? num(detail.results[0].confidence) : 0,
        evidence: parseJson(detail.run.source_refs, {}),
        execution_boundary: "recommendation_only_no_operational_mutation",
    };
}
