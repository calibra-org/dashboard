"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate, type MutationMethod } from "#/lib/queries/api-client";

const base = "reliability-guardian";

export type ReliabilityOverview = {
    active_invariants: number;
    incidents: Record<string, number>;
    remediations_30d: Record<string, number>;
    latest_scorecard: ReliabilityScorecard | null;
    boundaries: Record<string, string>;
};
export type ReliabilityInvariant = {
    id: number;
    public_id: string;
    invariant_key: string;
    name: string;
    domain: string;
    severity: string;
    source_kind: string;
    operator: string;
    threshold: number;
    window_seconds: number;
    min_consecutive_failures: number;
    recovery_consecutive_passes: number;
    remediation_policy_public_id: string | null;
    remediation_policy_name: string | null;
    enabled: boolean;
};
export type ReliabilityIncident = {
    id: number;
    public_id: string;
    invariant_key: string;
    invariant_name: string;
    status: string;
    severity: string;
    failure_count: number;
    recovery_count: number;
    latest_evidence: Record<string, unknown>;
    policy_public_id: string | null;
    policy_name: string | null;
    opened_at: string;
    last_observed_at: string;
    resolved_at: string | null;
};
export type ReliabilityRemediation = {
    id: number;
    public_id: string;
    incident_public_id: string;
    policy_public_id: string;
    policy_name: string;
    action_type: string;
    status: string;
    risk_level: string;
    verification: Record<string, unknown>;
    executed_at: string | null;
    verified_at: string | null;
    rolled_back_at: string | null;
};
export type ReliabilityScorecard = {
    id: number;
    window_start_at: string;
    window_end_at: string;
    reliability_bps: number;
    evaluated_invariants: number;
    passing_invariants: number;
    open_incidents: number;
    auto_remediations: number;
};

export function useReliabilityResource<T>(path: string) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: T }, Error, T>({
        queryKey: ["admin", "reliability-guardian", path, { locale }],
        queryFn: () => apiGet<{ data: T }>(`${base}/${path}`, { locale }),
        select: (payload) => payload.data,
        staleTime: 5_000,
    });
}

export function useReliabilityMutation<T = unknown, B = Record<string, unknown>>(method: MutationMethod = "POST") {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<T, Error, { path: string; body: B }>({
        mutationFn: async ({ path, body }) => (await apiMutate<{ data: T }>(method, `${base}/${path}`, { locale, body })).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "reliability-guardian"] }),
    });
}
