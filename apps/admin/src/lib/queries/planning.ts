"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { apiGet, apiMutate } from "#/lib/queries/api-client";

export interface PlanningForecastRun { id: number; model_code: string; model_version: string; history_days: number; horizon_days: number; data_cutoff_at: string; series_count: number; point_count: number; insufficient_series_count: number; created_at: string; }
export interface PlanningOverview { data: { forecast_status: string; latest_run: PlanningForecastRun | null; active_cycle: { id: number; title: string; status: string; version: number; updated_at: string } | null; risk_counts: { high: number; medium: number; low: number; unavailable: number }; next_action: string; }; }
export interface ForecastPoint { id: number; date: string; point: number; lower: number; upper: number; mae: number; reason_codes: string[]; }
export interface ForecastSeries { product_id: number | null; variation_id: number | null; sku: string | null; name: string; quality: string; points: ForecastPoint[]; }
export interface PlanningForecast { data: { status: string; run: PlanningForecastRun | null; series: ForecastSeries[] }; }
export interface InventoryRisk { inventory_item_id: number | null; product_id: number | null; variation_id: number | null; sku: string | null; name: string; stock: number | null; stock_status: string; forecast_quantity: number; coverage_days: number | null; risk: "high" | "medium" | "low" | "unavailable"; reason_code: string; }
export interface PlanningRisks { data: { status: string; run_id: number | null; items: InventoryRisk[] }; }
export interface PlanningCycle { id: number; title: string; status: string; forecast_run_id: number | null; version: number; approved_at: string | null; published_at: string | null; created_at: string; updated_at: string; }
export interface PlanningScenario { id: number; title: string; status: string; base_forecast_run_id: number | null; demand_multiplier: number; lead_time_days: number; capital_limit_minor: number | null; notes: string | null; version: number; created_at: string; updated_at: string; }
export interface PlanningOverride { id: number; forecast_point_id: number; product_name: string; sku: string | null; forecast_date: string | null; original_quantity: number; override_quantity: number; reason: string; evidence: Record<string, unknown>; status: string; created_at: string; reviewed_at: string | null; }
export interface PlanningHealth { data: { state: string; latest_run: null | { id: number; status: string; model_code: string; model_version: string; data_cutoff_at: string; series_count: number; insufficient_series_count: number; failure_reason: string | null; }; source_window_days: number; observed_rows: number; observed_series: number; managed_inventory_items: number; stockout_censoring: string; economics: string; procurement: string; model_registry: Array<{ code: string; version: string; role: string }>; }; }

function usePlanningQuery<T>(key: string, path: string) { const locale = useLocale() as Locale; return useQuery({ queryKey: ["planning", key, locale], queryFn: () => apiGet<T>(path, { locale }) }); }
function usePlanningMutation<TBody, TResult>(path: string) { const locale = useLocale() as Locale; const client = useQueryClient(); return useMutation({ mutationFn: (body: TBody) => apiMutate<TResult>("POST", path, { locale, body }), onSuccess: () => client.invalidateQueries({ queryKey: ["planning"] }) }); }
export const usePlanningOverview = () => usePlanningQuery<PlanningOverview>("overview", "planning/overview");
export const usePlanningForecast = () => usePlanningQuery<PlanningForecast>("forecast", "planning/forecast");
export const usePlanningRisks = () => usePlanningQuery<PlanningRisks>("risks", "planning/inventory-risks");
export const usePlanningCycles = () => usePlanningQuery<{ data: PlanningCycle[] }>("cycles", "planning/cycles");
export const usePlanningScenarios = () => usePlanningQuery<{ data: PlanningScenario[] }>("scenarios", "planning/scenarios");
export const usePlanningOverrides = () => usePlanningQuery<{ data: PlanningOverride[] }>("overrides", "planning/overrides");
export const usePlanningHealth = () => usePlanningQuery<PlanningHealth>("health", "planning/health");
export const useRunPlanningForecast = () => usePlanningMutation<{ history_days: number; horizon_days: number }, PlanningForecast>("planning/forecast/run");
export const useCreatePlanningCycle = () => usePlanningMutation<{ title: string }, { data: PlanningCycle }>("planning/cycles");
export const useCreatePlanningScenario = () => usePlanningMutation<{ title: string; demand_multiplier: number; lead_time_days: number; notes?: string }, { data: PlanningScenario }>("planning/scenarios");
export const useCreatePlanningOverride = () => usePlanningMutation<{ forecast_point_id: number; override_quantity: number; reason: string }, { data: PlanningOverride }>("planning/overrides");
export function useTransitionPlanningCycle(id: number) { return usePlanningMutation<{ status: string; expected_version: number; note?: string }, { data: PlanningCycle }>(`planning/cycles/${id}/transition`); }
export function useReviewPlanningOverride(id: number) { return usePlanningMutation<{ decision: "approved" | "rejected" }, { data: PlanningOverride }>(`planning/overrides/${id}/review`); }
