"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

export interface ExperimentVariant {
    id: number;
    key: string;
    name: string;
    weight_bps: number;
    is_control: boolean;
    payload: Record<string, unknown>;
}

export interface ExperimentAnalysis {
    id: number;
    status: "insufficient_data" | "healthy" | "srm_detected" | "guardrail_breached";
    srm_detected: boolean;
    srm_chi_square: number | null;
    variant_metrics: Array<{
        variantId: number;
        variantKey: string;
        isControl: boolean;
        expectedShare: number;
        assignments: number;
        exposedSubjects: number;
        observations: number;
        sum: number;
        sumSquares: number;
        effect: {
            mean: number | null;
            absoluteLift: number | null;
            relativeLift: number | null;
            ci95: [number, number] | null;
        };
    }>;
    guardrail_results: Array<{
        metric_key: string;
        threshold_relative: number;
        control_mean: number | null;
        worst_relative_change: number | null;
        breached: boolean;
    }>;
    causal_strength: string;
    conclusion: string;
    automatic_action?: string | null;
    data_cutoff_at: string;
}

export interface Experiment {
    id: number;
    experiment_key: string;
    name: string;
    hypothesis: string;
    surface: string;
    status: string;
    risk_level: string;
    randomization_unit: string;
    layer_key: string;
    layer_start_bps: number;
    layer_end_bps: number;
    primary_metric_key: string;
    primary_metric_kind: string;
    secondary_metrics: string[];
    guardrails: Array<Record<string, unknown>>;
    eligibility: Record<string, unknown>;
    exclusions: string[];
    sample_plan: Record<string, unknown>;
    analysis_method: string;
    approval_reference: string | null;
    version: number;
    owner_user_id: number | null;
    approved_by_user_id: number | null;
    approved_at: string | null;
    starts_at: string | null;
    ends_at: string | null;
    started_at: string | null;
    stopped_at: string | null;
    stop_reason: string | null;
    created_at: string;
    updated_at: string;
    variants: ExperimentVariant[];
    latest_analysis?: ExperimentAnalysis | null;
    assignment_count?: number;
    exposure_count?: number;
    analysis?: ExperimentAnalysis[];
}

export interface ExperimentOverview {
    counts: {
        running: number;
        review: number;
        completed: number;
        total: number;
        srm_alerts: number;
        guardrail_alerts: number;
        causal_memory: number;
    };
    exposures_14d: Array<{ day: string; count: number }>;
    evidence_policy: Record<string, boolean>;
}

export interface ExperimentHoldout {
    id: number;
    holdout_key: string;
    name: string;
    scope: string;
    allocation_bps: number;
    status: string;
    purpose: string;
    created_at?: string;
    updated_at?: string;
}

export interface CausalKnowledge {
    id: number;
    experiment_id: number | null;
    knowledge_key: string;
    surface: string;
    metric_key: string;
    evidence_strength: string;
    conclusion: string;
    effect_snapshot: Record<string, unknown>;
    limitations: string[];
    replication_count: number;
    last_evaluated_at: string;
}

function useCurrentLocale(): Locale {
    return useLocale() as Locale;
}

export function useExperimentOverview() {
    const locale = useCurrentLocale();
    return useQuery({
        queryKey: ["experiments", "overview", locale],
        queryFn: () => apiGet<{ data: ExperimentOverview }>("experiments/overview", { locale }),
        refetchInterval: 60_000,
    });
}

export function useExperiments() {
    const locale = useCurrentLocale();
    return useQuery({
        queryKey: ["experiments", "list", locale],
        queryFn: () => apiGet<{ data: Experiment[] }>("experiments", { locale }),
    });
}

export function useExperiment(id: number | null) {
    const locale = useCurrentLocale();
    return useQuery({
        queryKey: ["experiments", "detail", locale, id],
        queryFn: () => apiGet<{ data: Experiment }>(`experiments/${id}`, { locale }),
        enabled: Boolean(id),
    });
}

export function useExperimentHoldouts() {
    const locale = useCurrentLocale();
    return useQuery({
        queryKey: ["experiments", "holdouts", locale],
        queryFn: () => apiGet<{ data: ExperimentHoldout[] }>("experiments/holdouts", { locale }),
    });
}

export function useCausalKnowledge() {
    const locale = useCurrentLocale();
    return useQuery({
        queryKey: ["experiments", "knowledge", locale],
        queryFn: () => apiGet<{ data: CausalKnowledge[] }>("experiments/knowledge", { locale }),
    });
}

export function useExperimentCollisions() {
    const locale = useCurrentLocale();
    return useQuery({
        queryKey: ["experiments", "collisions", locale],
        queryFn: () => apiGet<{ data: Array<Record<string, unknown>> }>("experiments/collisions", { locale }),
    });
}

export function useCreateExperiment() {
    const locale = useCurrentLocale();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: Record<string, unknown>) =>
            apiMutate<{ data: Experiment }>("POST", "experiments", { locale, body }),
        onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["experiments"] }),
    });
}

export function useTransitionExperiment() {
    const locale = useCurrentLocale();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...body }: { id: number; status: string; expected_version: number; reason?: string; approval_reference?: string | null }) =>
            apiMutate<{ data: Experiment }>("POST", `experiments/${id}/transition`, { locale, body }),
        onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["experiments"] }),
    });
}

export function useAnalyzeExperiment() {
    const locale = useCurrentLocale();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) =>
            apiMutate<{ data: ExperimentAnalysis }>("POST", `experiments/${id}/analyze`, { locale, body: {} }),
        onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["experiments"] }),
    });
}

export function useCreateHoldout() {
    const locale = useCurrentLocale();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: Record<string, unknown>) =>
            apiMutate<{ data: ExperimentHoldout }>("POST", "experiments/holdouts", { locale, body }),
        onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["experiments"] }),
    });
}
