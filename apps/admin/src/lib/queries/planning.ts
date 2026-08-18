"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

export interface PlanningRun {
    id: number;
    model_code: string;
    model_version: string;
    history_days: number;
    horizon_days: number;
    review_period_days: number;
    default_lead_time_days: number | null;
    service_level_target: number;
    data_cutoff_at: string;
    source_freshness_at: string | null;
    source_hash: string;
    status: "running" | "completed" | "failed";
    series_count: number;
    point_count: number;
    insufficient_series_count: number;
    stockout_censored_days: number;
    wape: number | null;
    bias: number | null;
    interval_coverage: number | null;
    accuracy_evaluated_days: number;
    accuracy_censored_points: number;
    model_parameters: Record<string, unknown>;
    dependency_state: Record<string, unknown>;
    failure_reason: string | null;
    created_at: string;
    updated_at: string;
}

export interface ForecastPoint {
    id: number;
    date: string;
    p10: number;
    p50: number;
    p90: number;
    effective_p50: number;
    actual: number | null;
    actual_observed_at: string | null;
    actual_censored: boolean;
    reason_codes: string[];
    evidence: Record<string, unknown>;
}

export interface ForecastSeries {
    product_id: number | null;
    variation_id: number | null;
    inventory_item_id: number | null;
    location_id: number | null;
    location_key: string;
    sku: string | null;
    name: string;
    quality: "ready" | "limited_history" | "insufficient_data";
    confidence: number;
    points: ForecastPoint[];
}

export interface ForecastEnvelope {
    data: { status: "ready" | "not_configured"; run: PlanningRun | null; series: ForecastSeries[] };
}

export interface CategoryPoint {
    date: string;
    p10: number;
    p50: number;
    p90: number;
    effective_p50: number;
    actual: number | null;
    series_count: number;
}

export interface CategoryForecastEnvelope {
    data: {
        status: "ready" | "not_configured";
        run: PlanningRun | null;
        basis?: string;
        aggregation: string;
        classification_mode: string;
        categories: Array<{ category_id: number | null; name: string; slug: string | null; points: CategoryPoint[] }>;
    };
}

export interface ReplenishmentItem {
    id: number;
    product_id: number | null;
    variation_id: number | null;
    inventory_item_id: number | null;
    location_id: number | null;
    location_key: string;
    sku: string | null;
    name: string;
    status: "ready" | "needs_input" | "not_managed" | "blocked";
    on_hand: number | null;
    suggested_quantity: number | null;
    daily_p50: number;
    daily_p90: number;
    lead_time_demand_p50: number | null;
    lead_time_demand_p90: number | null;
    safety_stock: number | null;
    reorder_point: number | null;
    target_stock: number | null;
    lead_time_days: number | null;
    review_period_days: number;
    service_level_target: number;
    economics_status: string;
    execution_boundary: string;
    reason_codes: string[];
    evidence: Record<string, unknown>;
}

export interface RiskItem extends ReplenishmentItem {
    risk: "high" | "medium" | "low" | "unavailable";
    reason_code: string;
}

export interface PlanningOverviewEnvelope {
    data: {
        forecast_status: string;
        latest_run: PlanningRun | null;
        active_cycle: PlanningCycle | null;
        risk_counts: Record<"high" | "medium" | "low" | "unavailable", number>;
        recommendation_counts: Record<"ready" | "needs_input" | "not_managed", number>;
        dependencies: Record<string, string>;
        next_action: string;
    };
}

export interface PlanningHealthEnvelope {
    data: {
        state: string;
        latest_run: PlanningRun | null;
        source_window_days: number;
        observed_rows: number;
        observed_series: number;
        managed_inventory_items: number;
        inventory_items_with_location_id: number;
        inventory_movements_84d: number;
        stockout_censoring: string;
        location_dimension: string;
        economics: string;
        procurement: string;
        source_contract: Record<string, string>;
        model_registry: Array<{ code: string; version: string; role: string }>;
    };
}

export interface PlanningCycle {
    id: number;
    title: string;
    status: string;
    forecast_run_id: number | null;
    version: number;
    approved_at: string | null;
    published_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface PlanningScenario {
    id: number;
    title: string;
    status: string;
    base_forecast_run_id: number | null;
    demand_multiplier: number;
    lead_time_days: number | null;
    review_period_days: number;
    capital_limit_minor: number | null;
    notes: string | null;
    version: number;
    created_at: string;
    updated_at: string;
}

export interface PlanningOverride {
    id: number;
    forecast_point_id: number;
    product_name_snapshot?: string;
    sku_snapshot?: string | null;
    forecast_date?: string;
    original_quantity: number;
    override_quantity: number;
    reason: string;
    status: string;
    created_at: string;
    reviewed_at: string | null;
}

function usePlanningLocale(): Locale {
    return useLocale() as Locale;
}

export function usePlanningOverview() {
    const currentLocale = usePlanningLocale();
    return useQuery({
        queryKey: ["planning", "overview", currentLocale],
        queryFn: () => apiGet<PlanningOverviewEnvelope>("planning/overview", { locale: currentLocale }),
        refetchInterval: 60_000,
    });
}

export function usePlanningForecast(runId?: number | null) {
    const currentLocale = usePlanningLocale();
    return useQuery({
        queryKey: ["planning", "forecast", currentLocale, runId ?? "latest"],
        queryFn: () => apiGet<ForecastEnvelope>("planning/forecast", { locale: currentLocale, query: { run_id: runId } }),
    });
}

export function usePlanningCategoryForecast(runId?: number | null) {
    const currentLocale = usePlanningLocale();
    return useQuery({
        queryKey: ["planning", "forecast", "categories", currentLocale, runId ?? "latest"],
        queryFn: () =>
            apiGet<CategoryForecastEnvelope>("planning/forecast/categories", { locale: currentLocale, query: { run_id: runId } }),
    });
}

export function usePlanningRecommendations(runId?: number | null) {
    const currentLocale = usePlanningLocale();
    return useQuery({
        queryKey: ["planning", "replenishment", currentLocale, runId ?? "latest"],
        queryFn: () =>
            apiGet<{
                data: {
                    status: string;
                    run_id: number | null;
                    economics_status: string;
                    execution_boundary: string;
                    items: ReplenishmentItem[];
                };
            }>("planning/replenishment", { locale: currentLocale, query: { run_id: runId } }),
    });
}

export function usePlanningRisks() {
    const currentLocale = usePlanningLocale();
    return useQuery({
        queryKey: ["planning", "inventory-risks", currentLocale],
        queryFn: () =>
            apiGet<{ data: { status: string; run_id: number | null; items: RiskItem[] } }>("planning/inventory-risks", {
                locale: currentLocale,
            }),
    });
}

export function usePlanningHealth() {
    const currentLocale = usePlanningLocale();
    return useQuery({
        queryKey: ["planning", "health", currentLocale],
        queryFn: () => apiGet<PlanningHealthEnvelope>("planning/health", { locale: currentLocale }),
        refetchInterval: 60_000,
    });
}

export function usePlanningCycles() {
    const currentLocale = usePlanningLocale();
    return useQuery({
        queryKey: ["planning", "cycles", currentLocale],
        queryFn: () => apiGet<{ data: PlanningCycle[] }>("planning/cycles", { locale: currentLocale }),
    });
}

export function usePlanningScenarios() {
    const currentLocale = usePlanningLocale();
    return useQuery({
        queryKey: ["planning", "scenarios", currentLocale],
        queryFn: () => apiGet<{ data: PlanningScenario[] }>("planning/scenarios", { locale: currentLocale }),
    });
}

export function usePlanningOverrides() {
    const currentLocale = usePlanningLocale();
    return useQuery({
        queryKey: ["planning", "overrides", currentLocale],
        queryFn: () => apiGet<{ data: PlanningOverride[] }>("planning/overrides", { locale: currentLocale }),
    });
}

export function useRunPlanningForecast() {
    const currentLocale = usePlanningLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: {
            history_days: number;
            horizon_days: number;
            review_period_days: number;
            default_lead_time_days: number | null;
            service_level_target: number;
        }) => apiMutate<ForecastEnvelope>("POST", "planning/forecast/run", { locale: currentLocale, body }),
        onSuccess: async () => client.invalidateQueries({ queryKey: ["planning"] }),
    });
}

export function useRefreshPlanningAccuracy() {
    const currentLocale = usePlanningLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (runId?: number | null) =>
            apiMutate("POST", "planning/accuracy/refresh", { locale: currentLocale, body: { run_id: runId ?? null } }),
        onSuccess: async () => client.invalidateQueries({ queryKey: ["planning"] }),
    });
}

export function useCreatePlanningCycle() {
    const currentLocale = usePlanningLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: { title: string; forecast_run_id?: number }) =>
            apiMutate("POST", "planning/cycles", { locale: currentLocale, body }),
        onSuccess: async () => client.invalidateQueries({ queryKey: ["planning"] }),
    });
}

export function useCreatePlanningScenario() {
    const currentLocale = usePlanningLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: {
            title: string;
            demand_multiplier: number;
            lead_time_days: number | null;
            review_period_days: number;
            notes?: string;
        }) => apiMutate("POST", "planning/scenarios", { locale: currentLocale, body }),
        onSuccess: async () => client.invalidateQueries({ queryKey: ["planning"] }),
    });
}
