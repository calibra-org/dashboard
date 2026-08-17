import { createHash } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { computeReplenishment, forecastDemand, type AvailabilityState, type DailyDemandObservation } from "#services/planning_forecast_engine";
import { currentTrx } from "#services/tenant_context";

interface SalesRow {
    product_id: number | string | null;
    variation_id: number | string | null;
    sku_snapshot: string | null;
    name_snapshot: string;
    quantity: number | string;
    price_snapshot: number | string;
    occurred_at: Date | string;
}

interface InventoryRow {
    id: number | string;
    product_id: number | string;
    variation_id: number | string | null;
    location_id: number | string | null;
    stock_quantity: number | string;
    manage_stock: boolean;
    stock_status: string;
    low_stock_threshold: number | string | null;
    updated_at: Date | string;
}

interface MovementRow {
    inventory_item_id: number | string;
    kind: string;
    quantity_delta: number | string;
    occurred_at: Date | string;
}

interface SeriesBucket {
    productId: number | null;
    variationId: number | null;
    sku: string | null;
    name: string;
    byDay: Map<string, number>;
}

const MODEL_CODE = "calibra_weighted_seasonal_v2";
const MODEL_VERSION = "2.0.0";
const ECONOMICS_STATUS = "dependency_not_landed";
const EXECUTION_BOUNDARY = "phase14_procurement_only";

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
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function round4(value: number): number {
    return Math.round(value * 10_000) / 10_000;
}

function isoDay(value: Date | string): string {
    const parsed = value instanceof Date ? DateTime.fromJSDate(value, { zone: "utc" }) : DateTime.fromISO(String(value), { zone: "utc" });
    if (!parsed.isValid) throw new Exception("Invalid planning timestamp", { status: 500, code: "E_PLANNING_TIMESTAMP" });
    return parsed.toISODate()!;
}

function sourceHash(payload: unknown): string {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function stableTuples(rows: unknown[][]): unknown[][] {
    return rows.slice().sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function seriesKey(productId: number | null, variationId: number | null): string {
    return `${productId ?? "null"}:${variationId ?? "null"}`;
}

function buildSeries(rows: SalesRow[]): SeriesBucket[] {
    const series = new Map<string, SeriesBucket>();
    for (const row of rows) {
        const productId = numberOrNull(row.product_id);
        const variationId = numberOrNull(row.variation_id);
        const key = seriesKey(productId, variationId);
        const bucket = series.get(key) ?? {
            productId,
            variationId,
            sku: row.sku_snapshot ?? null,
            name: row.name_snapshot || row.sku_snapshot || "بدون نام",
            byDay: new Map<string, number>(),
        };
        const day = isoDay(row.occurred_at);
        bucket.byDay.set(day, (bucket.byDay.get(day) ?? 0) + numberValue(row.quantity));
        series.set(key, bucket);
    }
    return [...series.values()];
}

function inventoryMatches(bucket: SeriesBucket, inventory: InventoryRow[]): InventoryRow[] {
    return inventory.filter((item) => {
        const productMatches = numberOrNull(item.product_id) === bucket.productId;
        const variationMatches = numberOrNull(item.variation_id) === bucket.variationId;
        return productMatches && variationMatches;
    });
}

function locationContract(matches: InventoryRow[]) {
    if (matches.length === 0) return { locationId: null, locationKey: "unassigned", inventoryItemId: null };
    if (matches.length > 1) return { locationId: null, locationKey: "network_unattributed", inventoryItemId: null };
    const item = matches[0]!;
    const locationId = numberOrNull(item.location_id);
    return {
        locationId,
        locationKey: locationId === null ? "unassigned" : `location:${locationId}`,
        inventoryItemId: numberValue(item.id),
    };
}

function buildAvailabilityHistory(input: {
    bucket: SeriesBucket;
    inventoryMatches: InventoryRow[];
    movements: MovementRow[];
    cutoff: DateTime;
    historyDays: number;
}): DailyDemandObservation[] {
    const { bucket, inventoryMatches: matches, movements, cutoff, historyDays } = input;
    const demandByDay = bucket.byDay;
    if (matches.length !== 1 || !matches[0]!.manage_stock) {
        return Array.from({ length: historyDays }, (_, index) => {
            const date = cutoff.startOf("day").minus({ days: historyDays - 1 - index }).toISODate()!;
            return { date, observedDemand: demandByDay.get(date) ?? 0, availability: "unknown" as const };
        });
    }

    const item = matches[0]!;
    const itemId = numberValue(item.id);
    const itemMovements = movements.filter((movement) => numberValue(movement.inventory_item_id) === itemId);
    const movementByDay = new Map<string, number>();
    for (const movement of itemMovements) {
        const day = isoDay(movement.occurred_at);
        movementByDay.set(day, (movementByDay.get(day) ?? 0) + numberValue(movement.quantity_delta));
    }
    const earliestMovement = itemMovements.length > 0
        ? itemMovements.map((movement) => isoDay(movement.occurred_at)).sort()[0]!
        : null;

    const availabilityByDay = new Map<string, AvailabilityState>();
    let reconstructedClosingStock = numberValue(item.stock_quantity);
    for (let offset = 0; offset < historyDays; offset += 1) {
        const date = cutoff.startOf("day").minus({ days: offset }).toISODate()!;
        const hasCoverage = earliestMovement !== null && date >= earliestMovement;
        const availability: AvailabilityState = hasCoverage
            ? reconstructedClosingStock <= 0
                ? "stockout"
                : "available"
            : "unknown";
        availabilityByDay.set(date, availability);
        reconstructedClosingStock -= movementByDay.get(date) ?? 0;
    }

    return Array.from({ length: historyDays }, (_, index) => {
        const date = cutoff.startOf("day").minus({ days: historyDays - 1 - index }).toISODate()!;
        return {
            date,
            observedDemand: demandByDay.get(date) ?? 0,
            availability: availabilityByDay.get(date) ?? "unknown",
        };
    });
}

function maxTimestamp(values: Array<Date | string | null | undefined>): string | null {
    let latest: DateTime | null = null;
    for (const value of values) {
        if (!value) continue;
        const parsed = value instanceof Date ? DateTime.fromJSDate(value, { zone: "utc" }) : DateTime.fromISO(String(value), { zone: "utc" });
        if (!parsed.isValid) continue;
        if (!latest || parsed.toMillis() > latest.toMillis()) latest = parsed;
    }
    return latest?.toISO() ?? null;
}

function weightedMetric(rows: Array<{ value: number | null; weight: number }>): number | null {
    const available = rows.filter((row) => row.value !== null && row.weight > 0);
    const weight = available.reduce((sum, row) => sum + row.weight, 0);
    if (weight <= 0) return null;
    return round4(available.reduce((sum, row) => sum + (row.value ?? 0) * row.weight, 0) / weight);
}

async function latestCompletedRunId(): Promise<number | null> {
    const row = await currentTrx().from("planning_forecast_runs").where("status", "completed").orderBy("id", "desc").first();
    return row ? numberValue(row.id) : null;
}

export class Phase13PlanningService {
    async runForecast(
        input: {
            history_days?: number;
            horizon_days?: number;
            review_period_days?: number;
            default_lead_time_days?: number | null;
            service_level_target?: number;
        },
        actor: User,
    ) {
        const trx = currentTrx();
        const historyDays = input.history_days ?? 84;
        const horizonDays = input.horizon_days ?? 28;
        const reviewPeriodDays = input.review_period_days ?? 7;
        const defaultLeadTimeDays = input.default_lead_time_days ?? null;
        const serviceLevelTarget = input.service_level_target ?? 0.9;
        const cutoff = DateTime.utc();
        const historyStart = cutoff.minus({ days: historyDays - 1 }).startOf("day");

        const [sales, inventory, movements] = await Promise.all([
            trx
                .from("orders as o")
                .innerJoin("order_line_items as li", "li.order_id", "o.id")
                .whereIn("o.status", ["processing", "completed"])
                .whereNull("o.deleted_at")
                .whereRaw("COALESCE(o.date_paid_at, o.created_at) >= ?", [historyStart.toSQL()])
                .whereRaw("COALESCE(o.date_paid_at, o.created_at) <= ?", [cutoff.toSQL()])
                .select(
                    "li.product_id",
                    "li.variation_id",
                    "li.sku_snapshot",
                    "li.name_snapshot",
                    "li.quantity",
                    "li.price_snapshot",
                    trx.raw("COALESCE(o.date_paid_at, o.created_at) AS occurred_at"),
                ) as Promise<SalesRow[]>,
            trx
                .from("inventory_items")
                .select("id", "product_id", "variation_id", "location_id", "stock_quantity", "manage_stock", "stock_status", "low_stock_threshold", "updated_at") as Promise<InventoryRow[]>,
            trx
                .from("inventory_movements")
                .where("occurred_at", ">=", historyStart.toSQL())
                .where("occurred_at", "<=", cutoff.toSQL())
                .select("inventory_item_id", "kind", "quantity_delta", "occurred_at") as Promise<MovementRow[]>,
        ]);

        const hash = sourceHash({
            sales: stableTuples(
                sales.map((row) => [
                    row.product_id,
                    row.variation_id,
                    row.sku_snapshot,
                    row.name_snapshot,
                    row.quantity,
                    row.price_snapshot,
                    isoDay(row.occurred_at),
                ]),
            ),
            inventory: stableTuples(
                inventory.map((row) => [
                    row.id,
                    row.product_id,
                    row.variation_id,
                    row.location_id,
                    row.stock_quantity,
                    row.manage_stock,
                    row.stock_status,
                ]),
            ),
            movements: stableTuples(
                movements.map((row) => [row.inventory_item_id, row.kind, row.quantity_delta, isoDay(row.occurred_at)]),
            ),
        });
        const freshness = maxTimestamp([
            ...sales.map((row) => row.occurred_at),
            ...inventory.map((row) => row.updated_at),
            ...movements.map((row) => row.occurred_at),
        ]);

        const [run] = await trx
            .table("planning_forecast_runs")
            .insert({
                model_code: MODEL_CODE,
                model_version: MODEL_VERSION,
                history_days: historyDays,
                horizon_days: horizonDays,
                review_period_days: reviewPeriodDays,
                default_lead_time_days: defaultLeadTimeDays,
                service_level_target: serviceLevelTarget,
                data_cutoff_at: cutoff.toSQL(),
                source_freshness_at: freshness,
                source_hash: hash,
                status: "running",
                model_parameters: JSON.stringify({
                    recency: "linearly_weighted",
                    seasonality: "weekday_median",
                    interval: "empirical_residual_p10_p90",
                    stockout_censoring: "inventory_movement_reconstruction_when_single_location_attributable",
                    source_contract: {
                        demand: "orders_plus_order_line_item_snapshots",
                        price: "order_line_items.price_snapshot_observed_not_causal_adjustment",
                        availability: "inventory_items_plus_inventory_movements",
                        location: "inventory_items.location_id_advisory_no_warehouse_master",
                        category: "derived_from_product_category_links_same_forecast_points",
                        campaign: "not_in_current_main_contract",
                        search_demand: "not_in_current_main_contract",
                        economics: ECONOMICS_STATUS,
                    },
                }),
                dependency_state: JSON.stringify({
                    phase10_decision_intelligence: "landed",
                    phase11_governance: "landed",
                    phase12_economics: ECONOMICS_STATUS,
                    phase14_procurement: EXECUTION_BOUNDARY,
                }),
                created_by_user_id: actor.id,
            })
            .returning(["id"]);
        const runId = numberValue(run?.id);

        try {
            const series = buildSeries(sales);
            let pointCount = 0;
            let insufficientSeriesCount = 0;
            let stockoutCensoredDays = 0;
            const metricRows: Array<{ wape: number | null; bias: number | null; coverage: number | null; weight: number }> = [];

            for (const bucket of series) {
                const matches = inventoryMatches(bucket, inventory);
                const location = locationContract(matches);
                const history = buildAvailabilityHistory({ bucket, inventoryMatches: matches, movements, cutoff, historyDays });
                const forecast = forecastDemand(history, horizonDays);
                if (forecast.diagnostics.quality === "insufficient_data") insufficientSeriesCount += 1;
                stockoutCensoredDays += forecast.diagnostics.censoredDays;
                metricRows.push({
                    wape: forecast.diagnostics.wape,
                    bias: forecast.diagnostics.bias,
                    coverage: forecast.diagnostics.intervalCoverage,
                    weight: forecast.diagnostics.evaluatedDays,
                });

                if (forecast.points.length > 0) {
                    await trx.table("planning_forecast_points").insert(
                        forecast.points.map((point) => ({
                            forecast_run_id: runId,
                            product_id: bucket.productId,
                            variation_id: bucket.variationId,
                            inventory_item_id: location.inventoryItemId,
                            location_id: location.locationId,
                            location_key: location.locationKey,
                            sku_snapshot: bucket.sku,
                            product_name_snapshot: bucket.name,
                            forecast_date: point.date,
                            p10_quantity: point.p10,
                            p50_quantity: point.p50,
                            p90_quantity: point.p90,
                            quality: forecast.diagnostics.quality,
                            confidence: forecast.diagnostics.confidence,
                            reason_codes: JSON.stringify(forecast.diagnostics.reasonCodes),
                            evidence: JSON.stringify({
                                active_days: forecast.diagnostics.activeDays,
                                censored_days: forecast.diagnostics.censoredDays,
                                known_availability_days: forecast.diagnostics.knownAvailabilityDays,
                                imputed_demand: forecast.diagnostics.imputedDemand,
                                inventory_match_count: matches.length,
                            }),
                        })),
                    );
                    pointCount += forecast.points.length;
                }

                const dailyP50 = forecast.points.length > 0
                    ? forecast.points.reduce((sum, point) => sum + point.p50, 0) / forecast.points.length
                    : 0;
                const dailyP90 = forecast.points.length > 0
                    ? forecast.points.reduce((sum, point) => sum + point.p90, 0) / forecast.points.length
                    : 0;
                const recommendation = this.buildRecommendation({
                    matches,
                    dailyP50,
                    dailyP90,
                    defaultLeadTimeDays,
                    reviewPeriodDays,
                    serviceLevelTarget,
                });
                await trx.table("planning_replenishment_recommendations").insert({
                    forecast_run_id: runId,
                    product_id: bucket.productId,
                    variation_id: bucket.variationId,
                    inventory_item_id: location.inventoryItemId,
                    location_id: location.locationId,
                    location_key: location.locationKey,
                    sku_snapshot: bucket.sku,
                    product_name_snapshot: bucket.name,
                    status: recommendation.status,
                    on_hand_quantity: recommendation.onHand,
                    suggested_quantity: recommendation.suggestedQuantity,
                    daily_p50: round4(dailyP50),
                    daily_p90: round4(dailyP90),
                    lead_time_demand_p50: recommendation.leadTimeDemandP50,
                    lead_time_demand_p90: recommendation.leadTimeDemandP90,
                    safety_stock: recommendation.safetyStock,
                    reorder_point: recommendation.reorderPoint,
                    target_stock: recommendation.targetStock,
                    lead_time_days: recommendation.leadTimeDays,
                    review_period_days: reviewPeriodDays,
                    service_level_target: serviceLevelTarget,
                    economics_status: ECONOMICS_STATUS,
                    execution_boundary: EXECUTION_BOUNDARY,
                    reason_codes: JSON.stringify(recommendation.reasonCodes),
                    evidence: JSON.stringify({
                        inventory_match_count: matches.length,
                        stock_status: matches.length === 1 ? matches[0]!.stock_status : null,
                        low_stock_threshold: matches.length === 1 ? numberOrNull(matches[0]!.low_stock_threshold) : null,
                        service_policy: "P90",
                    }),
                });
            }

            const wape = weightedMetric(metricRows.map((row) => ({ value: row.wape, weight: row.weight })));
            const bias = weightedMetric(metricRows.map((row) => ({ value: row.bias, weight: row.weight })));
            const intervalCoverage = weightedMetric(metricRows.map((row) => ({ value: row.coverage, weight: row.weight })));
            const evaluatedDays = metricRows.reduce((sum, row) => sum + row.weight, 0);
            await trx
                .from("planning_forecast_runs")
                .where("id", runId)
                .update({
                    status: "completed",
                    series_count: series.length,
                    point_count: pointCount,
                    insufficient_series_count: insufficientSeriesCount,
                    stockout_censored_days: stockoutCensoredDays,
                    wape,
                    bias,
                    interval_coverage: intervalCoverage,
                    accuracy_evaluated_days: evaluatedDays,
                });
            return this.forecast(runId);
        } catch (error) {
            await trx
                .from("planning_forecast_runs")
                .where("id", runId)
                .update({
                    status: "failed",
                    failure_reason: error instanceof Error ? error.message.slice(0, 2000) : "Unknown planning failure",
                });
            throw error;
        }
    }

    private buildRecommendation(input: {
        matches: InventoryRow[];
        dailyP50: number;
        dailyP90: number;
        defaultLeadTimeDays: number | null;
        reviewPeriodDays: number;
        serviceLevelTarget: number;
    }) {
        if (input.matches.length === 0) {
            return {
                status: "not_managed" as const,
                onHand: null,
                suggestedQuantity: null,
                leadTimeDemandP50: null,
                leadTimeDemandP90: null,
                safetyStock: null,
                reorderPoint: null,
                targetStock: null,
                leadTimeDays: input.defaultLeadTimeDays,
                reasonCodes: ["INVENTORY_RECORD_UNAVAILABLE"],
            };
        }
        if (input.matches.length > 1) {
            return {
                status: "needs_input" as const,
                onHand: input.matches.reduce((sum, row) => sum + numberValue(row.stock_quantity), 0),
                suggestedQuantity: null,
                leadTimeDemandP50: null,
                leadTimeDemandP90: null,
                safetyStock: null,
                reorderPoint: null,
                targetStock: null,
                leadTimeDays: input.defaultLeadTimeDays,
                reasonCodes: ["MULTI_LOCATION_DEMAND_ATTRIBUTION_UNAVAILABLE"],
            };
        }
        const item = input.matches[0]!;
        if (!item.manage_stock) {
            return {
                status: "not_managed" as const,
                onHand: numberValue(item.stock_quantity),
                suggestedQuantity: null,
                leadTimeDemandP50: null,
                leadTimeDemandP90: null,
                safetyStock: null,
                reorderPoint: null,
                targetStock: null,
                leadTimeDays: input.defaultLeadTimeDays,
                reasonCodes: ["INVENTORY_NOT_MANAGED"],
            };
        }
        const policy = computeReplenishment({
            onHand: numberValue(item.stock_quantity),
            dailyP50: input.dailyP50,
            dailyP90: input.dailyP90,
            leadTimeDays: input.defaultLeadTimeDays,
            reviewPeriodDays: input.reviewPeriodDays,
        });
        return {
            ...policy,
            onHand: numberValue(item.stock_quantity),
            leadTimeDays: input.defaultLeadTimeDays,
            reasonCodes: input.serviceLevelTarget === 0.9 ? policy.reasonCodes : [...policy.reasonCodes, "SERVICE_LEVEL_TARGET_DISCLOSED"],
        };
    }

    async forecast(runId?: number | null) {
        const trx = currentTrx();
        const resolvedRunId = runId ?? (await latestCompletedRunId());
        if (resolvedRunId === null) return { data: { status: "not_configured", run: null, series: [] } };
        const run = await trx.from("planning_forecast_runs").where("id", resolvedRunId).first();
        if (!run) throw new Exception("Forecast run not found", { status: 404, code: "E_PLANNING_RUN_NOT_FOUND" });
        const [rows, approvedOverrides] = await Promise.all([
            trx.from("planning_forecast_points").where("forecast_run_id", resolvedRunId).orderBy("product_name_snapshot", "asc").orderBy("forecast_date", "asc"),
            trx
                .from("planning_overrides")
                .where("status", "approved")
                .whereIn("forecast_point_id", trx.from("planning_forecast_points").where("forecast_run_id", resolvedRunId).select("id"))
                .select("forecast_point_id", "override_quantity"),
        ]);
        const overrideByPoint = new Map(approvedOverrides.map((row) => [numberValue(row.forecast_point_id), numberValue(row.override_quantity)]));
        const grouped = new Map<string, Record<string, unknown>>();
        for (const row of rows) {
            const key = `${row.product_id ?? "null"}:${row.variation_id ?? "null"}:${row.location_key}`;
            const item = grouped.get(key) ?? {
                product_id: numberOrNull(row.product_id),
                variation_id: numberOrNull(row.variation_id),
                inventory_item_id: numberOrNull(row.inventory_item_id),
                location_id: numberOrNull(row.location_id),
                location_key: String(row.location_key),
                sku: row.sku_snapshot ?? null,
                name: String(row.product_name_snapshot),
                quality: String(row.quality),
                confidence: numberValue(row.confidence),
                points: [],
            };
            const pointId = numberValue(row.id);
            const p50 = numberValue(row.p50_quantity);
            (item.points as Array<Record<string, unknown>>).push({
                id: pointId,
                date: String(row.forecast_date),
                p10: numberValue(row.p10_quantity),
                p50,
                p90: numberValue(row.p90_quantity),
                effective_p50: overrideByPoint.get(pointId) ?? p50,
                actual: numberOrNull(row.actual_quantity),
                actual_observed_at: row.actual_observed_at ?? null,
                actual_censored: Boolean(row.actual_censored),
                reason_codes: Array.isArray(row.reason_codes) ? row.reason_codes : [],
                evidence: row.evidence ?? {},
            });
            grouped.set(key, item);
        }
        return {
            data: {
                status: "ready",
                run: this.runRow(run),
                series: [...grouped.values()],
            },
        };
    }

    async categoryForecast(runId?: number | null) {
        const trx = currentTrx();
        const resolvedRunId = runId ?? (await latestCompletedRunId());
        if (resolvedRunId === null) {
            return {
                data: {
                    status: "not_configured",
                    run: null,
                    aggregation: "sum_of_sku_quantiles_not_joint_distribution",
                    classification_mode: "multi_label_taxonomy",
                    categories: [],
                },
            };
        }

        const run = await trx.from("planning_forecast_runs").where("id", resolvedRunId).first();
        if (!run) throw new Exception("Forecast run not found", { status: 404, code: "E_PLANNING_RUN_NOT_FOUND" });

        const points = await trx
            .from("planning_forecast_points")
            .where("forecast_run_id", resolvedRunId)
            .orderBy("forecast_date", "asc");
        const productIds = [...new Set(points.map((row) => numberOrNull(row.product_id)).filter((value): value is number => value !== null))];
        const links = productIds.length > 0
            ? await trx.from("product_category_links").whereIn("product_id", productIds).select("product_id", "category_id")
            : [];
        const categoryIds = [...new Set(links.map((row) => numberValue(row.category_id)))];
        const translations = categoryIds.length > 0
            ? await trx
                  .from("product_category_translations")
                  .whereIn("category_id", categoryIds)
                  .whereIn("locale", ["fa", "en"])
                  .select("category_id", "locale", "name", "slug")
            : [];
        const approvedOverrides = points.length > 0
            ? await trx
                  .from("planning_overrides")
                  .where("status", "approved")
                  .whereIn("forecast_point_id", points.map((row) => numberValue(row.id)))
                  .select("forecast_point_id", "override_quantity")
            : [];

        const categoriesByProduct = new Map<number, number[]>();
        for (const link of links) {
            const productId = numberValue(link.product_id);
            const categoryId = numberValue(link.category_id);
            const values = categoriesByProduct.get(productId) ?? [];
            if (!values.includes(categoryId)) values.push(categoryId);
            categoriesByProduct.set(productId, values);
        }
        const translationByCategory = new Map<number, { name: string; slug: string | null }>();
        for (const locale of ["en", "fa"]) {
            for (const row of translations.filter((item) => String(item.locale) === locale)) {
                translationByCategory.set(numberValue(row.category_id), { name: String(row.name), slug: row.slug ? String(row.slug) : null });
            }
        }
        const overrideByPoint = new Map(approvedOverrides.map((row) => [numberValue(row.forecast_point_id), numberValue(row.override_quantity)]));

        type AggregatePoint = {
            date: string;
            p10: number;
            p50: number;
            p90: number;
            effectiveP50: number;
            actualTotal: number;
            actualObserved: number;
            seriesKeys: Set<string>;
        };
        const grouped = new Map<string, { categoryId: number | null; name: string; slug: string | null; points: Map<string, AggregatePoint> }>();
        for (const row of points) {
            const productId = numberOrNull(row.product_id);
            const memberships = productId === null ? [] : categoriesByProduct.get(productId) ?? [];
            const categoryMemberships: Array<number | null> = memberships.length > 0 ? memberships : [null];
            for (const categoryId of categoryMemberships) {
                const key = categoryId === null ? "unclassified" : String(categoryId);
                const translation = categoryId === null ? null : translationByCategory.get(categoryId);
                const category = grouped.get(key) ?? {
                    categoryId,
                    name: categoryId === null ? "بدون دسته" : translation?.name ?? `دسته #${categoryId}`,
                    slug: translation?.slug ?? null,
                    points: new Map<string, AggregatePoint>(),
                };
                const date = String(row.forecast_date);
                const aggregate = category.points.get(date) ?? {
                    date,
                    p10: 0,
                    p50: 0,
                    p90: 0,
                    effectiveP50: 0,
                    actualTotal: 0,
                    actualObserved: 0,
                    seriesKeys: new Set<string>(),
                };
                const pointId = numberValue(row.id);
                aggregate.p10 += numberValue(row.p10_quantity);
                aggregate.p50 += numberValue(row.p50_quantity);
                aggregate.p90 += numberValue(row.p90_quantity);
                aggregate.effectiveP50 += overrideByPoint.get(pointId) ?? numberValue(row.p50_quantity);
                const actual = numberOrNull(row.actual_quantity);
                if (actual !== null) {
                    aggregate.actualTotal += actual;
                    aggregate.actualObserved += 1;
                }
                aggregate.seriesKeys.add(`${row.product_id ?? "null"}:${row.variation_id ?? "null"}:${row.location_key}`);
                category.points.set(date, aggregate);
                grouped.set(key, category);
            }
        }

        const categories = [...grouped.values()]
            .map((category) => ({
                category_id: category.categoryId,
                name: category.name,
                slug: category.slug,
                points: [...category.points.values()]
                    .sort((left, right) => left.date.localeCompare(right.date))
                    .map((point) => ({
                        date: point.date,
                        p10: round4(point.p10),
                        p50: round4(point.p50),
                        p90: round4(point.p90),
                        effective_p50: round4(point.effectiveP50),
                        actual: point.actualObserved > 0 ? round4(point.actualTotal) : null,
                        series_count: point.seriesKeys.size,
                    })),
            }))
            .sort((left, right) => left.name.localeCompare(right.name, "fa"));

        return {
            data: {
                status: "ready",
                run: this.runRow(run),
                basis: "same_versioned_forecast_points",
                aggregation: "sum_of_sku_quantiles_not_joint_distribution",
                classification_mode: "multi_label_taxonomy",
                categories,
            },
        };
    }

    async recommendations(runId?: number | null) {
        const resolvedRunId = runId ?? (await latestCompletedRunId());
        if (resolvedRunId === null) return { data: { status: "not_configured", run_id: null, items: [] } };
        const rows = await currentTrx()
            .from("planning_replenishment_recommendations")
            .where("forecast_run_id", resolvedRunId)
            .orderByRaw("CASE status WHEN 'ready' THEN 0 WHEN 'needs_input' THEN 1 WHEN 'not_managed' THEN 2 ELSE 3 END")
            .orderBy("suggested_quantity", "desc");
        return {
            data: {
                status: "ready",
                run_id: resolvedRunId,
                economics_status: ECONOMICS_STATUS,
                execution_boundary: EXECUTION_BOUNDARY,
                items: rows.map((row) => ({
                    id: numberValue(row.id),
                    product_id: numberOrNull(row.product_id),
                    variation_id: numberOrNull(row.variation_id),
                    inventory_item_id: numberOrNull(row.inventory_item_id),
                    location_id: numberOrNull(row.location_id),
                    location_key: String(row.location_key),
                    sku: row.sku_snapshot ?? null,
                    name: String(row.product_name_snapshot),
                    status: String(row.status),
                    on_hand: numberOrNull(row.on_hand_quantity),
                    suggested_quantity: numberOrNull(row.suggested_quantity),
                    daily_p50: numberValue(row.daily_p50),
                    daily_p90: numberValue(row.daily_p90),
                    lead_time_demand_p50: numberOrNull(row.lead_time_demand_p50),
                    lead_time_demand_p90: numberOrNull(row.lead_time_demand_p90),
                    safety_stock: numberOrNull(row.safety_stock),
                    reorder_point: numberOrNull(row.reorder_point),
                    target_stock: numberOrNull(row.target_stock),
                    lead_time_days: numberOrNull(row.lead_time_days),
                    review_period_days: numberValue(row.review_period_days),
                    service_level_target: numberValue(row.service_level_target),
                    economics_status: String(row.economics_status),
                    execution_boundary: String(row.execution_boundary),
                    reason_codes: Array.isArray(row.reason_codes) ? row.reason_codes : [],
                    evidence: row.evidence ?? {},
                })),
            },
        };
    }

    async inventoryRisks() {
        const recommendations = await this.recommendations();
        if (recommendations.data.status !== "ready") return { data: { status: recommendations.data.status, run_id: null, items: [] } };
        const items = recommendations.data.items.map((item) => {
            let risk: "high" | "medium" | "low" | "unavailable" = "unavailable";
            let reasonCode = item.reason_codes[0] ?? "INPUT_UNAVAILABLE";
            if (item.status === "ready" && item.on_hand !== null && item.reorder_point !== null && item.target_stock !== null) {
                if (item.on_hand <= item.reorder_point) {
                    risk = "high";
                    reasonCode = "BELOW_REORDER_POINT";
                } else if (item.on_hand < item.target_stock) {
                    risk = "medium";
                    reasonCode = "BELOW_TARGET_STOCK";
                } else {
                    risk = "low";
                    reasonCode = item.on_hand > item.target_stock * 2 ? "EXCESS_STOCK_CANDIDATE" : "TARGET_COVERED";
                }
            }
            return { ...item, risk, reason_code: reasonCode };
        });
        return { data: { status: "ready", run_id: recommendations.data.run_id, items } };
    }

    async refreshAccuracy(runId?: number | null) {
        const trx = currentTrx();
        const resolvedRunId = runId ?? (await latestCompletedRunId());
        if (resolvedRunId === null) throw new Exception("No completed forecast run exists", { status: 409, code: "E_PLANNING_FORECAST_REQUIRED" });
        const run = await trx.from("planning_forecast_runs").where("id", resolvedRunId).first();
        if (!run) throw new Exception("Forecast run not found", { status: 404, code: "E_PLANNING_RUN_NOT_FOUND" });
        const today = DateTime.utc().startOf("day");
        const points = await trx
            .from("planning_forecast_points")
            .where("forecast_run_id", resolvedRunId)
            .where("forecast_date", "<", today.toISODate()!)
            .select("id", "product_id", "variation_id", "inventory_item_id", "forecast_date", "p10_quantity", "p50_quantity", "p90_quantity");
        if (points.length === 0) {
            return { data: { run_id: resolvedRunId, evaluated_points: 0, censored_points: 0, wape: null, bias: null, interval_coverage: null } };
        }

        const earliest = points.map((point) => String(point.forecast_date)).sort()[0]!;
        const inventoryItemIds = [...new Set(points.map((point) => numberOrNull(point.inventory_item_id)).filter((value): value is number => value !== null))];
        const [actualRows, inventoryRows, movementRows] = await Promise.all([
            trx
                .from("orders as o")
                .innerJoin("order_line_items as li", "li.order_id", "o.id")
                .whereIn("o.status", ["processing", "completed"])
                .whereNull("o.deleted_at")
                .whereRaw("COALESCE(o.date_paid_at, o.created_at) >= ?", [`${earliest}T00:00:00.000Z`])
                .whereRaw("COALESCE(o.date_paid_at, o.created_at) < ?", [today.toISO()])
                .groupBy("li.product_id", "li.variation_id", trx.raw("DATE(COALESCE(o.date_paid_at, o.created_at))"))
                .select(
                    "li.product_id",
                    "li.variation_id",
                    trx.raw("DATE(COALESCE(o.date_paid_at, o.created_at)) AS demand_date"),
                    trx.raw("SUM(li.quantity)::numeric AS actual_quantity"),
                ),
            inventoryItemIds.length > 0
                ? trx.from("inventory_items").whereIn("id", inventoryItemIds).select("id", "stock_quantity", "manage_stock")
                : Promise.resolve([]),
            inventoryItemIds.length > 0
                ? trx
                      .from("inventory_movements")
                      .whereIn("inventory_item_id", inventoryItemIds)
                      .where("occurred_at", ">=", `${earliest}T00:00:00.000Z`)
                      .where("occurred_at", "<", today.toISO())
                      .select("inventory_item_id", "quantity_delta", "occurred_at")
                : Promise.resolve([]),
        ]);

        const actualByKey = new Map<string, number>();
        for (const row of actualRows) {
            actualByKey.set(
                `${seriesKey(numberOrNull(row.product_id), numberOrNull(row.variation_id))}:${isoDay(row.demand_date)}`,
                numberValue(row.actual_quantity),
            );
        }

        const availabilityByItemDay = new Map<string, AvailabilityState>();
        const movementByItemDay = new Map<string, number>();
        for (const movement of movementRows) {
            const key = `${numberValue(movement.inventory_item_id)}:${isoDay(movement.occurred_at)}`;
            movementByItemDay.set(key, (movementByItemDay.get(key) ?? 0) + numberValue(movement.quantity_delta));
        }
        const firstMovementByItem = new Map<number, string>();
        for (const movement of movementRows) {
            const itemId = numberValue(movement.inventory_item_id);
            const day = isoDay(movement.occurred_at);
            const current = firstMovementByItem.get(itemId);
            if (!current || day < current) firstMovementByItem.set(itemId, day);
        }
        for (const item of inventoryRows) {
            const itemId = numberValue(item.id);
            if (!item.manage_stock) continue;
            let reconstructedClosingStock = numberValue(item.stock_quantity);
            const firstMovement = firstMovementByItem.get(itemId) ?? null;
            for (let cursor = today.minus({ days: 1 }); cursor.toISODate()! >= earliest; cursor = cursor.minus({ days: 1 })) {
                const day = cursor.toISODate()!;
                const covered = firstMovement !== null && day >= firstMovement;
                availabilityByItemDay.set(`${itemId}:${day}`, covered ? (reconstructedClosingStock <= 0 ? "stockout" : "available") : "unknown");
                reconstructedClosingStock -= movementByItemDay.get(`${itemId}:${day}`) ?? 0;
            }
        }

        let absoluteError = 0;
        let signedError = 0;
        let actualTotal = 0;
        let covered = 0;
        let evaluated = 0;
        let censored = 0;
        for (const point of points) {
            const day = isoDay(point.forecast_date);
            const key = `${seriesKey(numberOrNull(point.product_id), numberOrNull(point.variation_id))}:${day}`;
            const actual = actualByKey.get(key) ?? 0;
            const inventoryItemId = numberOrNull(point.inventory_item_id);
            const availability = inventoryItemId === null ? "unknown" : availabilityByItemDay.get(`${inventoryItemId}:${day}`) ?? "unknown";
            const actualCensored = availability === "stockout";
            await trx
                .from("planning_forecast_points")
                .where("id", point.id)
                .update({ actual_quantity: actual, actual_observed_at: DateTime.utc().toSQL(), actual_censored: actualCensored });
            if (actualCensored) {
                censored += 1;
                continue;
            }
            const p10 = numberValue(point.p10_quantity);
            const p50 = numberValue(point.p50_quantity);
            const p90 = numberValue(point.p90_quantity);
            absoluteError += Math.abs(p50 - actual);
            signedError += p50 - actual;
            actualTotal += actual;
            if (actual >= p10 && actual <= p90) covered += 1;
            evaluated += 1;
        }
        const wape = actualTotal > 0 ? round4(absoluteError / actualTotal) : null;
        const bias = actualTotal > 0 ? round4(signedError / actualTotal) : null;
        const intervalCoverage = evaluated > 0 ? round4(covered / evaluated) : null;
        await trx.from("planning_forecast_runs").where("id", resolvedRunId).update({
            wape,
            bias,
            interval_coverage: intervalCoverage,
            accuracy_evaluated_days: evaluated,
            accuracy_censored_points: censored,
        });
        return { data: { run_id: resolvedRunId, evaluated_points: evaluated, censored_points: censored, wape, bias, interval_coverage: intervalCoverage } };
    }

    async overview() {
        const trx = currentTrx();
        const [forecast, risks, recommendations, cycle] = await Promise.all([
            this.forecast(),
            this.inventoryRisks(),
            this.recommendations(),
            trx.from("planning_cycles").whereNotIn("status", ["superseded", "cancelled"]).orderBy("updated_at", "desc").first(),
        ]);
        const riskItems = risks.data.items;
        const recommendationItems = recommendations.data.items;
        return {
            data: {
                forecast_status: forecast.data.status,
                latest_run: forecast.data.run,
                active_cycle: cycle ? this.cycleRow(cycle) : null,
                risk_counts: {
                    high: riskItems.filter((item) => item.risk === "high").length,
                    medium: riskItems.filter((item) => item.risk === "medium").length,
                    low: riskItems.filter((item) => item.risk === "low").length,
                    unavailable: riskItems.filter((item) => item.risk === "unavailable").length,
                },
                recommendation_counts: {
                    ready: recommendationItems.filter((item) => item.status === "ready").length,
                    needs_input: recommendationItems.filter((item) => item.status === "needs_input").length,
                    not_managed: recommendationItems.filter((item) => item.status === "not_managed").length,
                },
                dependencies: {
                    economics: ECONOMICS_STATUS,
                    procurement_execution: EXECUTION_BOUNDARY,
                    multi_location_master: "not_landed_location_id_is_advisory",
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
        if (forecastRunId === null) throw new Exception("A completed forecast is required", { status: 409, code: "E_PLANNING_FORECAST_REQUIRED" });
        const [row] = await trx
            .table("planning_cycles")
            .insert({ title: input.title, forecast_run_id: forecastRunId, status: "draft", created_by_user_id: actor.id })
            .returning("*");
        return { data: this.cycleRow(row) };
    }

    async transitionCycle(cycleId: number, input: { status: string; expected_version: number; note?: string }, actor: User) {
        const trx = currentTrx();
        const cycle = await trx.from("planning_cycles").where("id", cycleId).first();
        if (!cycle) throw new Exception("Planning cycle not found", { status: 404, code: "E_PLANNING_CYCLE_NOT_FOUND" });
        if (numberValue(cycle.version) !== input.expected_version) {
            throw new Exception("Planning cycle version conflict", { status: 409, code: "PLANNING_CYCLE_VERSION_CONFLICT" });
        }
        if (!(CYCLE_TRANSITIONS[String(cycle.status)] ?? []).includes(input.status)) {
            throw new Exception("Invalid planning cycle transition", { status: 422, code: "E_PLANNING_CYCLE_TRANSITION" });
        }
        const patch: Record<string, unknown> = { status: input.status, version: numberValue(cycle.version) + 1, updated_at: DateTime.utc().toSQL() };
        if (input.status === "approved") {
            patch.approved_by_user_id = actor.id;
            patch.approved_at = DateTime.utc().toSQL();
        }
        if (input.status === "published") {
            patch.published_by_user_id = actor.id;
            patch.published_at = DateTime.utc().toSQL();
        }
        const [updated] = await trx.from("planning_cycles").where("id", cycleId).where("version", input.expected_version).update(patch).returning("*");
        if (!updated) throw new Exception("Planning cycle version conflict", { status: 409, code: "PLANNING_CYCLE_VERSION_CONFLICT" });
        if (["approved", "published"].includes(input.status)) {
            await trx.table("planning_approvals").insert({ planning_cycle_id: cycleId, decision: input.status === "approved" ? "approved" : "published", note: input.note ?? null, actor_user_id: actor.id });
        }
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
            lead_time_days?: number | null;
            review_period_days?: number;
            capital_limit_minor?: number;
            notes?: string;
        },
        actor: User,
    ) {
        const baseRunId = input.base_forecast_run_id ?? (await latestCompletedRunId());
        if (baseRunId === null) throw new Exception("A completed forecast is required", { status: 409, code: "E_PLANNING_FORECAST_REQUIRED" });
        const [row] = await currentTrx()
            .table("planning_scenarios")
            .insert({
                title: input.title,
                base_forecast_run_id: baseRunId,
                demand_multiplier: input.demand_multiplier,
                lead_time_days: input.lead_time_days ?? null,
                review_period_days: input.review_period_days ?? 7,
                capital_limit_minor: input.capital_limit_minor ?? null,
                notes: input.notes ?? null,
                status: "ready",
                created_by_user_id: actor.id,
            })
            .returning("*");
        return { data: this.scenarioRow(row) };
    }

    async scenarioResult(scenarioId: number) {
        const trx = currentTrx();
        const scenario = await trx.from("planning_scenarios").where("id", scenarioId).first();
        if (!scenario) throw new Exception("Planning scenario not found", { status: 404, code: "E_PLANNING_SCENARIO_NOT_FOUND" });
        const runId = numberOrNull(scenario.base_forecast_run_id);
        if (runId === null) throw new Exception("Scenario has no forecast run", { status: 409, code: "E_PLANNING_SCENARIO_RUN" });
        const points = await trx.from("planning_forecast_points").where("forecast_run_id", runId).select("p10_quantity", "p50_quantity", "p90_quantity");
        const multiplier = numberValue(scenario.demand_multiplier);
        return {
            data: {
                scenario: this.scenarioRow(scenario),
                totals: {
                    p10: round4(points.reduce((sum, row) => sum + numberValue(row.p10_quantity) * multiplier, 0)),
                    p50: round4(points.reduce((sum, row) => sum + numberValue(row.p50_quantity) * multiplier, 0)),
                    p90: round4(points.reduce((sum, row) => sum + numberValue(row.p90_quantity) * multiplier, 0)),
                },
                economics_status: ECONOMICS_STATUS,
                procurement_execution: EXECUTION_BOUNDARY,
            },
        };
    }

    async overrides() {
        const rows = await currentTrx()
            .from("planning_overrides as po")
            .innerJoin("planning_forecast_points as fp", "fp.id", "po.forecast_point_id")
            .select("po.*", "fp.product_name_snapshot", "fp.sku_snapshot", "fp.forecast_date")
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
                original_quantity: point.p50_quantity,
                override_quantity: input.override_quantity,
                reason: input.reason,
                evidence: JSON.stringify(input.evidence ?? {}),
                status: "pending",
                created_by_user_id: actor.id,
            })
            .returning("*");
        return { data: this.overrideRow({ ...row, product_name_snapshot: point.product_name_snapshot, sku_snapshot: point.sku_snapshot, forecast_date: point.forecast_date }) };
    }

    async reviewOverride(overrideId: number, decision: "approved" | "rejected", actor: User) {
        const [updated] = await currentTrx()
            .from("planning_overrides")
            .where("id", overrideId)
            .where("status", "pending")
            .update({ status: decision, reviewed_by_user_id: actor.id, reviewed_at: DateTime.utc().toSQL(), updated_at: DateTime.utc().toSQL() })
            .returning("*");
        if (!updated) throw new Exception("Planning override not found or already reviewed", { status: 409, code: "E_PLANNING_OVERRIDE_REVIEW" });
        return { data: this.overrideRow(updated) };
    }

    async health() {
        const trx = currentTrx();
        const [run, sales, inventoryCount, locationCount, movementCount] = await Promise.all([
            trx.from("planning_forecast_runs").orderBy("id", "desc").first(),
            trx
                .from("orders as o")
                .innerJoin("order_line_items as li", "li.order_id", "o.id")
                .whereIn("o.status", ["processing", "completed"])
                .whereNull("o.deleted_at")
                .whereRaw("COALESCE(o.date_paid_at, o.created_at) >= NOW() - INTERVAL '84 days'")
                .select(
                    trx.raw("COUNT(li.id)::integer AS count"),
                    trx.raw("COUNT(DISTINCT (li.product_id, li.variation_id))::integer AS series"),
                )
                .first(),
            trx.from("inventory_items").where("manage_stock", true).count<{ count: string }[]>("id as count").first(),
            trx.from("inventory_items").whereNotNull("location_id").count<{ count: string }[]>("id as count").first(),
            trx.from("inventory_movements").where("occurred_at", ">=", DateTime.utc().minus({ days: 84 }).toSQL()).count<{ count: string }[]>("id as count").first(),
        ]);
        const locationReady = numberValue(locationCount?.count) > 0;
        const movementReady = numberValue(movementCount?.count) > 0;
        return {
            data: {
                state: run?.status === "completed" ? "ready" : run?.status === "failed" ? "degraded" : "not_configured",
                latest_run: run ? this.runRow(run) : null,
                source_window_days: 84,
                observed_rows: numberValue(sales?.count),
                observed_series: numberValue(sales?.series),
                managed_inventory_items: numberValue(inventoryCount?.count),
                inventory_items_with_location_id: numberValue(locationCount?.count),
                inventory_movements_84d: numberValue(movementCount?.count),
                stockout_censoring: movementReady ? "movement_reconstruction_available" : "unavailable_no_movements",
                location_dimension: locationReady ? "advisory_location_id_present" : "single_or_unassigned_only",
                economics: ECONOMICS_STATUS,
                procurement: EXECUTION_BOUNDARY,
                source_contract: {
                    demand: "orders_plus_order_line_item_snapshots",
                    price: "order_line_items.price_snapshot_observed_not_causal_adjustment",
                    availability: "inventory_items_plus_inventory_movements",
                    category: "derived_from_product_category_links_same_forecast_points",
                    campaign: "not_in_current_main_contract",
                    search_demand: "not_in_current_main_contract",
                },
                model_registry: [{ code: MODEL_CODE, version: MODEL_VERSION, role: "production_baseline" }],
            },
        };
    }

    private runRow(run: Record<string, unknown>) {
        return {
            id: numberValue(run.id),
            model_code: String(run.model_code),
            model_version: String(run.model_version),
            history_days: numberValue(run.history_days),
            horizon_days: numberValue(run.horizon_days),
            review_period_days: numberValue(run.review_period_days),
            default_lead_time_days: numberOrNull(run.default_lead_time_days),
            service_level_target: numberValue(run.service_level_target),
            data_cutoff_at: run.data_cutoff_at,
            source_freshness_at: run.source_freshness_at ?? null,
            source_hash: String(run.source_hash),
            status: String(run.status),
            series_count: numberValue(run.series_count),
            point_count: numberValue(run.point_count),
            insufficient_series_count: numberValue(run.insufficient_series_count),
            stockout_censored_days: numberValue(run.stockout_censored_days),
            wape: numberOrNull(run.wape),
            bias: numberOrNull(run.bias),
            interval_coverage: numberOrNull(run.interval_coverage),
            accuracy_evaluated_days: numberValue(run.accuracy_evaluated_days),
            accuracy_censored_points: numberValue(run.accuracy_censored_points),
            model_parameters: run.model_parameters ?? {},
            dependency_state: run.dependency_state ?? {},
            failure_reason: run.failure_reason ?? null,
            created_at: run.created_at,
            updated_at: run.updated_at,
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
            lead_time_days: numberOrNull(row.lead_time_days),
            review_period_days: numberValue(row.review_period_days),
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
            product_name: row.product_name_snapshot ? String(row.product_name_snapshot) : null,
            sku: row.sku_snapshot ?? null,
            forecast_date: row.forecast_date ?? null,
            original_quantity: numberValue(row.original_quantity),
            override_quantity: numberValue(row.override_quantity),
            reason: String(row.reason),
            evidence: row.evidence ?? {},
            status: String(row.status),
            created_at: row.created_at,
            reviewed_at: row.reviewed_at ?? null,
        };
    }
}

export const phase13PlanningService = new Phase13PlanningService();
