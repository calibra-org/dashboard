import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { currentTrx } from "#services/tenant_context";

interface SalesRow {
    product_id: number | string | null;
    variation_id: number | string | null;
    sku: string | null;
    name: string;
    quantity: number | string;
    occurred_at: Date | string;
}

interface SeriesBucket {
    productId: number | null;
    variationId: number | null;
    sku: string | null;
    name: string;
    byDay: Map<string, number>;
}

const CYCLE_TRANSITIONS: Record<string, readonly string[]> = {
    draft: ["data_ready", "cancelled"],
    data_ready: ["forecasted", "cancelled"],
    forecasted: ["under_review", "cancelled"],
    under_review: ["approved", "cancelled"],
    approved: ["published", "cancelled"],
    published: ["superseded"],
    superseded: [],
    cancelled: [],
};

function numberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function isoDay(value: Date | string): string {
    const parsed = value instanceof Date ? DateTime.fromJSDate(value, { zone: "utc" }) : DateTime.fromISO(String(value), { zone: "utc" });
    if (!parsed.isValid) throw new Exception("Invalid planning timestamp", { status: 500, code: "E_PLANNING_TIMESTAMP" });
    return parsed.toISODate()!;
}

function average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round4(value: number): number {
    return Math.round(value * 10_000) / 10_000;
}

function buildSeries(rows: SalesRow[]): SeriesBucket[] {
    const series = new Map<string, SeriesBucket>();
    for (const row of rows) {
        const productId = numberOrNull(row.product_id);
        const variationId = numberOrNull(row.variation_id);
        const key = `${productId ?? "null"}:${variationId ?? "null"}:${row.sku ?? ""}:${row.name}`;
        const bucket = series.get(key) ?? {
            productId,
            variationId,
            sku: row.sku ?? null,
            name: row.name || row.sku || "بدون نام",
            byDay: new Map<string, number>(),
        };
        const day = isoDay(row.occurred_at);
        bucket.byDay.set(day, (bucket.byDay.get(day) ?? 0) + numberValue(row.quantity));
        series.set(key, bucket);
    }
    return [...series.values()];
}

function forecastSeries(bucket: SeriesBucket, cutoff: DateTime, historyDays: number, horizonDays: number) {
    const history: Array<{ day: DateTime; quantity: number }> = [];
    for (let offset = historyDays - 1; offset >= 0; offset -= 1) {
        const day = cutoff.startOf("day").minus({ days: offset });
        history.push({ day, quantity: bucket.byDay.get(day.toISODate()!) ?? 0 });
    }
    const activeDays = history.filter((item) => item.quantity > 0).length;
    const overallMean = average(history.map((item) => item.quantity));
    const weekdayMean = new Map<number, number>();
    for (let weekday = 1; weekday <= 7; weekday += 1) {
        weekdayMean.set(
            weekday,
            average(history.filter((item) => item.day.weekday === weekday).map((item) => item.quantity)),
        );
    }
    const fittedErrors = history.map((item) => Math.abs(item.quantity - (weekdayMean.get(item.day.weekday) ?? overallMean)));
    const mae = average(fittedErrors);
    const quality = activeDays >= 8 ? "observed_sales" : activeDays >= 4 ? "limited_history" : "insufficient_data";
    const reasons = quality === "observed_sales" ? ["SEASONAL_WEEKDAY_BASELINE"] : ["LIMITED_HISTORY", "FALLBACK_BASELINE"];
    const points = [];
    for (let offset = 1; offset <= horizonDays; offset += 1) {
        const day = cutoff.startOf("day").plus({ days: offset });
        const seasonal = weekdayMean.get(day.weekday) ?? 0;
        const point = seasonal > 0 ? seasonal : overallMean;
        const spread = Math.max(mae * 1.28, Math.sqrt(Math.max(point, 1)) * 0.5);
        points.push({
            date: day.toISODate()!,
            point: round4(Math.max(0, point)),
            lower: round4(Math.max(0, point - spread)),
            upper: round4(Math.max(0, point + spread)),
            mae: round4(mae),
            quality,
            reasons,
        });
    }
    return { activeDays, quality, points };
}

async function latestCompletedRunId(): Promise<number | null> {
    const row = await currentTrx().from("planning_forecast_runs").where("status", "completed").orderBy("id", "desc").first();
    return row ? numberValue(row.id) : null;
}

export class Phase13PlanningService {
    async runForecast(input: { history_days?: number; horizon_days?: number }, actor: User) {
        const trx = currentTrx();
        const historyDays = input.history_days ?? 56;
        const horizonDays = input.horizon_days ?? 14;
        const cutoff = DateTime.utc();
        const [run] = await trx
            .table("planning_forecast_runs")
            .insert({
                model_code: "seasonal_naive_v1",
                model_version: "1.0.0",
                history_days: historyDays,
                horizon_days: horizonDays,
                data_cutoff_at: cutoff.toSQL(),
                status: "running",
                created_by_user_id: actor.id,
            })
            .returning(["id"]);
        const runId = numberValue(run?.id);
        try {
            const historyStart = cutoff.minus({ days: historyDays - 1 }).startOf("day").toSQL();
            const rows = (await trx
                .from("orders as o")
                .innerJoin("order_line_items as li", "li.order_id", "o.id")
                .whereIn("o.status", ["processing", "completed"])
                .whereNull("o.deleted_at")
                .where("o.created_at", ">=", historyStart)
                .select(
                    "li.product_id",
                    "li.variation_id",
                    "li.sku",
                    "li.name",
                    "li.quantity",
                    trx.raw("COALESCE(o.date_paid_at, o.created_at) AS occurred_at"),
                )) as SalesRow[];
            const series = buildSeries(rows);
            let pointCount = 0;
            let insufficient = 0;
            for (const bucket of series) {
                const result = forecastSeries(bucket, cutoff, historyDays, horizonDays);
                if (result.quality === "insufficient_data") insufficient += 1;
                if (result.points.length === 0) continue;
                await trx.table("planning_forecast_points").insert(
                    result.points.map((point) => ({
                        forecast_run_id: runId,
                        product_id: bucket.productId,
                        variation_id: bucket.variationId,
                        sku: bucket.sku,
                        product_name: bucket.name,
                        forecast_date: point.date,
                        point_quantity: point.point,
                        interval_lower: point.lower,
                        interval_upper: point.upper,
                        mae: point.mae,
                        quality: point.quality,
                        reason_codes: JSON.stringify(point.reasons),
                    })),
                );
                pointCount += result.points.length;
            }
            await trx
                .from("planning_forecast_runs")
                .where("id", runId)
                .update({ status: "completed", series_count: series.length, point_count: pointCount, insufficient_series_count: insufficient });
            return this.forecast(runId);
        } catch (error) {
            await trx
                .from("planning_forecast_runs")
                .where("id", runId)
                .update({ status: "failed", failure_reason: error instanceof Error ? error.message.slice(0, 2000) : "Unknown failure" });
            throw error;
        }
    }

    async forecast(runId?: number | null) {
        const trx = currentTrx();
        const resolvedRunId = runId ?? (await latestCompletedRunId());
        if (resolvedRunId === null) return { data: { status: "not_configured", run: null, series: [] } };
        const run = await trx.from("planning_forecast_runs").where("id", resolvedRunId).first();
        if (!run) throw new Exception("Forecast run not found", { status: 404, code: "E_PLANNING_RUN_NOT_FOUND" });
        const rows = await trx
            .from("planning_forecast_points")
            .where("forecast_run_id", resolvedRunId)
            .orderBy("product_name", "asc")
            .orderBy("forecast_date", "asc");
        const grouped = new Map<string, { product_id: number | null; variation_id: number | null; sku: string | null; name: string; quality: string; points: unknown[] }>();
        for (const row of rows) {
            const key = `${row.product_id ?? "null"}:${row.variation_id ?? "null"}`;
            const item = grouped.get(key) ?? {
                product_id: numberOrNull(row.product_id),
                variation_id: numberOrNull(row.variation_id),
                sku: row.sku ?? null,
                name: String(row.product_name),
                quality: String(row.quality),
                points: [],
            };
            item.points.push({
                id: numberValue(row.id),
                date: String(row.forecast_date),
                point: numberValue(row.point_quantity),
                lower: numberValue(row.interval_lower),
                upper: numberValue(row.interval_upper),
                mae: numberValue(row.mae),
                reason_codes: Array.isArray(row.reason_codes) ? row.reason_codes : [],
            });
            grouped.set(key, item);
        }
        return {
            data: {
                status: "ready",
                run: {
                    id: resolvedRunId,
                    model_code: String(run.model_code),
                    model_version: String(run.model_version),
                    history_days: numberValue(run.history_days),
                    horizon_days: numberValue(run.horizon_days),
                    data_cutoff_at: run.data_cutoff_at,
                    series_count: numberValue(run.series_count),
                    point_count: numberValue(run.point_count),
                    insufficient_series_count: numberValue(run.insufficient_series_count),
                    created_at: run.created_at,
                },
                series: [...grouped.values()],
            },
        };
    }

    async inventoryRisks() {
        const runId = await latestCompletedRunId();
        if (runId === null) return { data: { status: "not_configured", run_id: null, items: [] } };
        const trx = currentTrx();
        const points = await trx
            .from("planning_forecast_points")
            .where("forecast_run_id", runId)
            .select("product_id", "variation_id", "sku", "product_name", "point_quantity");
        const totals = new Map<string, { productId: number | null; variationId: number | null; sku: string | null; name: string; forecast: number }>();
        for (const row of points) {
            const key = `${row.product_id ?? "null"}:${row.variation_id ?? "null"}`;
            const current = totals.get(key) ?? {
                productId: numberOrNull(row.product_id),
                variationId: numberOrNull(row.variation_id),
                sku: row.sku ?? null,
                name: String(row.product_name),
                forecast: 0,
            };
            current.forecast += numberValue(row.point_quantity);
            totals.set(key, current);
        }
        const inventory = await trx
            .from("inventory_items")
            .select("id", "product_id", "variation_id", "stock_quantity", "stock_status", "manage_stock", "low_stock_threshold");
        const inventoryByKey = new Map(inventory.map((row) => [`${row.product_id ?? "null"}:${row.variation_id ?? "null"}`, row]));
        const run = await trx.from("planning_forecast_runs").where("id", runId).first();
        const horizonDays = Math.max(1, numberValue(run?.horizon_days) || 14);
        const items = [...totals.entries()].map(([key, value]) => {
            const item = inventoryByKey.get(key);
            const stock = item ? numberValue(item.stock_quantity) : null;
            const demand = round4(value.forecast);
            const avgDaily = demand / horizonDays;
            const coverage = stock !== null && avgDaily > 0 ? round4(stock / avgDaily) : null;
            let risk: "high" | "medium" | "low" | "unavailable" = "unavailable";
            let reason = "INVENTORY_NOT_MANAGED";
            if (stock !== null) {
                if (stock <= demand) {
                    risk = "high";
                    reason = "PROJECTED_STOCKOUT";
                } else if (stock <= demand * 1.5) {
                    risk = "medium";
                    reason = "LOW_COVERAGE";
                } else {
                    risk = "low";
                    reason = stock > demand * 4 && demand > 0 ? "OVERSTOCK_CANDIDATE" : "SUFFICIENT_COVERAGE";
                }
            }
            return {
                inventory_item_id: item ? numberValue(item.id) : null,
                product_id: value.productId,
                variation_id: value.variationId,
                sku: value.sku,
                name: value.name,
                stock,
                stock_status: item ? String(item.stock_status) : "unavailable",
                forecast_quantity: demand,
                coverage_days: coverage,
                risk,
                reason_code: reason,
            };
        });
        items.sort((a, b) => ({ high: 0, medium: 1, low: 2, unavailable: 3 }[a.risk] ?? 4) - ({ high: 0, medium: 1, low: 2, unavailable: 3 }[b.risk] ?? 4));
        return { data: { status: "ready", run_id: runId, items } };
    }

    async overview() {
        const trx = currentTrx();
        const [forecast, risks, cycle] = await Promise.all([
            this.forecast(),
            this.inventoryRisks(),
            trx.from("planning_cycles").orderBy("updated_at", "desc").first(),
        ]);
        const riskItems = risks.data.items;
        return {
            data: {
                forecast_status: forecast.data.status,
                latest_run: forecast.data.run,
                active_cycle: cycle
                    ? { id: numberValue(cycle.id), title: String(cycle.title), status: String(cycle.status), version: numberValue(cycle.version), updated_at: cycle.updated_at }
                    : null,
                risk_counts: {
                    high: riskItems.filter((item) => item.risk === "high").length,
                    medium: riskItems.filter((item) => item.risk === "medium").length,
                    low: riskItems.filter((item) => item.risk === "low").length,
                    unavailable: riskItems.filter((item) => item.risk === "unavailable").length,
                },
                next_action: forecast.data.status !== "ready" ? "RUN_FORECAST" : cycle ? "REVIEW_ACTIVE_CYCLE" : "CREATE_PLANNING_CYCLE",
            },
        };
    }

    async cycles() {
        const rows = await currentTrx().from("planning_cycles").orderBy("updated_at", "desc").limit(100);
        return { data: rows.map((row) => this.cycleRow(row)) };
    }

    async createCycle(input: { title: string; forecast_run_id?: number }, actor: User) {
        const trx = currentTrx();
        const forecastRunId = input.forecast_run_id ?? (await latestCompletedRunId());
        const [row] = await trx
            .table("planning_cycles")
            .insert({ title: input.title, forecast_run_id: forecastRunId, created_by_user_id: actor.id })
            .returning("*");
        return { data: this.cycleRow(row) };
    }

    async transitionCycle(id: number, input: { status: string; expected_version: number; note?: string }, actor: User) {
        const trx = currentTrx();
        const row = await trx.from("planning_cycles").where("id", id).forUpdate().first();
        if (!row) throw new Exception("Planning cycle not found", { status: 404, code: "E_PLANNING_CYCLE_NOT_FOUND" });
        if (numberValue(row.version) !== input.expected_version) {
            throw new Exception("Planning cycle version conflict", { status: 409, code: "E_PLANNING_CYCLE_VERSION" });
        }
        const allowed = CYCLE_TRANSITIONS[String(row.status)] ?? [];
        if (!allowed.includes(input.status)) {
            throw new Exception("Illegal planning cycle transition", { status: 422, code: "E_PLANNING_CYCLE_TRANSITION" });
        }
        const patch: Record<string, unknown> = { status: input.status, version: numberValue(row.version) + 1, updated_at: DateTime.utc().toSQL() };
        if (input.status === "approved") {
            patch.approved_by_user_id = actor.id;
            patch.approved_at = DateTime.utc().toSQL();
        }
        if (input.status === "published") {
            patch.published_by_user_id = actor.id;
            patch.published_at = DateTime.utc().toSQL();
        }
        await trx.from("planning_cycles").where("id", id).update(patch);
        if (["approved", "published"].includes(input.status)) {
            await trx.table("planning_approvals").insert({
                planning_cycle_id: id,
                decision: input.status,
                note: input.note ?? null,
                actor_user_id: actor.id,
            });
        }
        const updated = await trx.from("planning_cycles").where("id", id).first();
        if (!updated) throw new Exception("Planning cycle not found after transition", { status: 500, code: "E_PLANNING_CYCLE_WRITE" });
        return { data: this.cycleRow(updated) };
    }

    async scenarios() {
        const rows = await currentTrx().from("planning_scenarios").orderBy("updated_at", "desc").limit(100);
        return { data: rows.map((row) => this.scenarioRow(row)) };
    }

    async createScenario(
        input: {
            title: string;
            base_forecast_run_id?: number;
            demand_multiplier: number;
            lead_time_days?: number;
            capital_limit_minor?: number;
            notes?: string;
        },
        actor: User,
    ) {
        const baseRunId = input.base_forecast_run_id ?? (await latestCompletedRunId());
        if (baseRunId === null) throw new Exception("Run a forecast before creating a scenario", { status: 422, code: "E_PLANNING_FORECAST_REQUIRED" });
        const [row] = await currentTrx()
            .table("planning_scenarios")
            .insert({
                title: input.title,
                base_forecast_run_id: baseRunId,
                demand_multiplier: input.demand_multiplier,
                lead_time_days: input.lead_time_days ?? 0,
                capital_limit_minor: input.capital_limit_minor ?? null,
                notes: input.notes ?? null,
                status: "ready",
                created_by_user_id: actor.id,
            })
            .returning("*");
        return { data: this.scenarioRow(row) };
    }

    async scenarioResult(id: number) {
        const trx = currentTrx();
        const scenario = await trx.from("planning_scenarios").where("id", id).first();
        if (!scenario) throw new Exception("Planning scenario not found", { status: 404, code: "E_PLANNING_SCENARIO_NOT_FOUND" });
        const points = await trx.from("planning_forecast_points").where("forecast_run_id", scenario.base_forecast_run_id);
        const baseline = points.reduce((sum, row) => sum + numberValue(row.point_quantity), 0);
        const multiplier = numberValue(scenario.demand_multiplier);
        return {
            data: {
                scenario: this.scenarioRow(scenario),
                simulation_only: true,
                baseline_quantity: round4(baseline),
                scenario_quantity: round4(baseline * multiplier),
                delta_quantity: round4(baseline * multiplier - baseline),
                cash_effect_status: scenario.capital_limit_minor === null ? "economics_unavailable" : "constraint_only",
            },
        };
    }

    async overrides() {
        const rows = await currentTrx()
            .from("planning_overrides as po")
            .innerJoin("planning_forecast_points as fp", "fp.id", "po.forecast_point_id")
            .select("po.*", "fp.product_name", "fp.sku", "fp.forecast_date")
            .orderBy("po.created_at", "desc")
            .limit(100);
        return { data: rows.map((row) => this.overrideRow(row)) };
    }

    async createOverride(input: { forecast_point_id: number; override_quantity: number; reason: string; evidence?: Record<string, unknown> }, actor: User) {
        const trx = currentTrx();
        const point = await trx.from("planning_forecast_points").where("id", input.forecast_point_id).first();
        if (!point) throw new Exception("Forecast point not found", { status: 404, code: "E_PLANNING_POINT_NOT_FOUND" });
        const [row] = await trx
            .table("planning_overrides")
            .insert({
                forecast_point_id: input.forecast_point_id,
                original_quantity: point.point_quantity,
                override_quantity: input.override_quantity,
                reason: input.reason,
                evidence: JSON.stringify(input.evidence ?? {}),
                created_by_user_id: actor.id,
            })
            .returning("*");
        return { data: this.overrideRow({ ...row, product_name: point.product_name, sku: point.sku, forecast_date: point.forecast_date }) };
    }

    async reviewOverride(id: number, decision: "approved" | "rejected", actor: User) {
        const trx = currentTrx();
        const row = await trx.from("planning_overrides").where("id", id).forUpdate().first();
        if (!row) throw new Exception("Planning override not found", { status: 404, code: "E_PLANNING_OVERRIDE_NOT_FOUND" });
        if (String(row.status) !== "pending") throw new Exception("Override already reviewed", { status: 409, code: "E_PLANNING_OVERRIDE_REVIEWED" });
        await trx.from("planning_overrides").where("id", id).update({ status: decision, reviewed_by_user_id: actor.id, reviewed_at: DateTime.utc().toSQL(), updated_at: DateTime.utc().toSQL() });
        const updated = await trx
            .from("planning_overrides as po")
            .innerJoin("planning_forecast_points as fp", "fp.id", "po.forecast_point_id")
            .where("po.id", id)
            .select("po.*", "fp.product_name", "fp.sku", "fp.forecast_date")
            .first();
        if (!updated) throw new Exception("Planning override not found after review", { status: 500, code: "E_PLANNING_OVERRIDE_WRITE" });
        return { data: this.overrideRow(updated) };
    }

    async health() {
        const trx = currentTrx();
        const run = await trx.from("planning_forecast_runs").orderBy("id", "desc").first();
        const sales = await trx
            .from("orders as o")
            .innerJoin("order_line_items as li", "li.order_id", "o.id")
            .whereIn("o.status", ["processing", "completed"])
            .whereNull("o.deleted_at")
            .where("o.created_at", ">=", DateTime.utc().minus({ days: 56 }).toSQL())
            .countDistinct({ series: trx.raw("COALESCE(li.variation_id, li.product_id)") })
            .count({ rows: "li.id" })
            .first();
        const inventoryCount = await trx.from("inventory_items").where("manage_stock", true).count({ count: "id" }).first();
        return {
            data: {
                state: run ? (String(run.status) === "failed" ? "degraded" : "ready") : "not_configured",
                latest_run: run
                    ? {
                          id: numberValue(run.id),
                          status: String(run.status),
                          model_code: String(run.model_code),
                          model_version: String(run.model_version),
                          data_cutoff_at: run.data_cutoff_at,
                          series_count: numberValue(run.series_count),
                          insufficient_series_count: numberValue(run.insufficient_series_count),
                          failure_reason: run.failure_reason ?? null,
                      }
                    : null,
                source_window_days: 56,
                observed_rows: numberValue(sales?.rows),
                observed_series: numberValue(sales?.series),
                managed_inventory_items: numberValue(inventoryCount?.count),
                stockout_censoring: "partial",
                economics: "not_connected_phase12",
                procurement: "planning_only_phase14",
                model_registry: [{ code: "seasonal_naive_v1", version: "1.0.0", role: "production_baseline" }],
            },
        };
    }

    private cycleRow(row: Record<string, unknown>) {
        return {
            id: numberValue(row.id),
            title: String(row.title),
            status: String(row.status),
            forecast_run_id: numberOrNull(row.forecast_run_id),
            version: numberValue(row.version),
            approved_at: row.approved_at ?? null,
            published_at: row.published_at ?? null,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }

    private scenarioRow(row: Record<string, unknown>) {
        return {
            id: numberValue(row.id),
            title: String(row.title),
            status: String(row.status),
            base_forecast_run_id: numberOrNull(row.base_forecast_run_id),
            demand_multiplier: numberValue(row.demand_multiplier),
            lead_time_days: numberValue(row.lead_time_days),
            capital_limit_minor: numberOrNull(row.capital_limit_minor),
            notes: row.notes ?? null,
            version: numberValue(row.version),
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }

    private overrideRow(row: Record<string, unknown>) {
        return {
            id: numberValue(row.id),
            forecast_point_id: numberValue(row.forecast_point_id),
            product_name: String(row.product_name ?? ""),
            sku: row.sku ?? null,
            forecast_date: row.forecast_date ?? null,
            original_quantity: numberValue(row.original_quantity),
            override_quantity: numberValue(row.override_quantity),
            reason: String(row.reason),
            evidence: typeof row.evidence === "object" && row.evidence !== null ? row.evidence : {},
            status: String(row.status),
            created_at: row.created_at,
            reviewed_at: row.reviewed_at ?? null,
        };
    }
}

export const phase13PlanningInternals = { buildSeries, forecastSeries };
export const phase13PlanningService = new Phase13PlanningService();
