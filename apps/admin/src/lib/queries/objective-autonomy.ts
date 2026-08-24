"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate, type MutationMethod } from "#/lib/queries/api-client";

const base = "objective-autonomy";

export type AutonomyObjective = {
    id: number;
    public_id: string;
    name: string;
    target_metric: string;
    direction: "maximize" | "minimize" | "target";
    baseline_value: number | string;
    target_value: number | string;
    horizon_end: string;
    budget_minor: number | null;
    constraints: Record<string, unknown> | string;
    allowed_tool_keys: string[] | string;
    autonomy_level: "recommend" | "propose" | "bounded_auto";
    effective_autonomy_level: "recommend" | "propose" | "bounded_auto";
    risk_ceiling: string;
    minimum_confidence: number | string;
    stop_loss: Record<string, unknown> | string;
    approvers: string[] | string;
    scenario_public_id: string;
    portfolio_plan_public_id: string;
    agent_plan_public_id: string;
    status: string;
    reason: string;
    updated_at: string;
};

export type AutonomyCycle = {
    id: number;
    public_id: string;
    sequence: number;
    status: string;
    twin_run_public_id: string;
    portfolio_run_public_id: string;
    agent_plan_public_id: string;
    simulation_confidence: number | string;
    policy_snapshot: Record<string, unknown> | string;
    explanation: Record<string, unknown> | string;
    started_at: string;
};

export type AutonomyCheckpoint = {
    public_id: string;
    observed_value: number | string;
    budget_spent_minor: number | string;
    confidence: number | string;
    constraint_breaches: string[] | string;
    unexpected_harm: boolean;
    decision: string;
    reason: string;
    created_at: string;
};

export type AutonomyOverview = {
    engine_version: string;
    kpis: { objectives: number; active: number; halted: number; cycles: number };
    latest_checkpoint: AutonomyCheckpoint | null;
    execution_boundary: string;
};

export type ObjectiveDetail = {
    objective: AutonomyObjective;
    cycles: AutonomyCycle[];
    checkpoints: AutonomyCheckpoint[];
    postmortem: Record<string, unknown> | null;
};

export type AccessRow = { id: number; identity: string; permissions: Record<string, boolean> };
export type Prerequisites = {
    scenarios: Array<{ public_id: string; name: string; version: number }>;
    portfolios: Array<{ public_id: string; name: string; objective: string; status: string }>;
    plans: Array<{ public_id: string; goal: string; status: string }>;
    tools: Array<{ tool_key: string; version: string; risk_class: string; approval_required: boolean }>;
};

export function useObjectiveAutonomyResource<T>(path: string, enabled = true) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: T }, Error, T>({
        queryKey: ["admin", "objective-autonomy", path, { locale }],
        queryFn: () => apiGet<{ data: T }>(`${base}/${path}`, { locale }),
        select: (payload) => payload.data,
        enabled,
        staleTime: 5_000,
    });
}

export function useObjectiveAutonomyMutation<T = unknown, B = Record<string, unknown>>(method: MutationMethod = "POST") {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<T, Error, { path: string; body: B }>({
        mutationFn: async ({ path, body }) => (await apiMutate<{ data: T }>(method, `${base}/${path}`, { locale, body })).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "objective-autonomy"] }),
    });
}

export function useObjectiveAutonomyPrerequisites() {
    const locale = useLocale() as Locale;
    return useQuery<Prerequisites>({
        queryKey: ["admin", "objective-autonomy", "prerequisites", { locale }],
        queryFn: async () => {
            const [scenarioPayload, portfolioPayload, planPayload, toolPayload] = await Promise.all([
                apiGet<{ data: Prerequisites["scenarios"] }>("digital-twin/scenarios", { locale }),
                apiGet<{ data: Prerequisites["portfolios"] }>("growth-portfolio/plans", { locale }),
                apiGet<{ data: Prerequisites["plans"] }>("agentic-commerce/orchestrator/plans", { locale }),
                apiGet<{ data: Prerequisites["tools"] }>("agentic-commerce/orchestrator/tools", { locale }),
            ]);
            return { scenarios: scenarioPayload.data, portfolios: portfolioPayload.data, plans: planPayload.data, tools: toolPayload.data };
        },
        staleTime: 10_000,
    });
}
