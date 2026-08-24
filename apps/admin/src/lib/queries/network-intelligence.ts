"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate, type MutationMethod } from "#/lib/queries/api-client";

const base = "network-intelligence";

export type NetworkParticipationPolicy = {
    id: number;
    public_id: string;
    version: number;
    opted_in: boolean;
    legal_basis: string | null;
    terms_version: string | null;
    purpose_scopes: string[] | string;
    minimum_cohort_size: number;
    privacy_method: "aggregate_threshold" | "laplace_dp" | "secure_aggregate";
    privacy_parameters: Record<string, unknown> | string;
    policy_digest: string;
    effective_at: string;
};

export type NetworkOverview = {
    participation: NetworkParticipationPolicy | null;
    kpis: {
        contributions: number;
        publications: number;
        active_metric_definitions: number;
        approved_security_reviews: number;
    };
};

export type NetworkMetricDefinition = {
    id: number;
    public_id: string;
    metric_key: string;
    version: number;
    unit: string;
    numerator_definition: string;
    denominator_definition: string | null;
    aggregation: string;
    period_grain: string;
    minimum_records_per_contribution: number;
    value_min: number | string;
    value_max: number | string;
    definition_digest: string;
};

export type NetworkContribution = {
    id: number;
    public_id: string;
    metric_key: string;
    metric_version: number;
    period_key: string;
    segment_key: string;
    aggregate_value: number | string;
    record_count: number;
    contribution_digest: string;
    updated_at: string;
};

export type NetworkBenchmark = {
    id: number;
    public_id: string;
    metric_key: string;
    metric_version: number;
    period_key: string;
    segment_key: string;
    cohort_size: number;
    minimum_cohort_size: number;
    privacy_method: string;
    algorithm_version: string;
    benchmark_value: number | string;
    distribution_summary: Record<string, unknown> | string;
    privacy_parameters: Record<string, unknown> | string;
    publication_digest: string;
    published_at: string;
};

export type NetworkAccessRow = {
    id: number;
    identity: string;
    permissions: Record<string, boolean>;
};

export function useNetworkIntelligenceResource<T>(path: string, enabled = true) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: T }, Error, T>({
        queryKey: ["admin", "network-intelligence", path, { locale }],
        queryFn: () => apiGet<{ data: T }>(`${base}/${path}`, { locale }),
        select: (payload) => payload.data,
        enabled,
        staleTime: 10_000,
    });
}

export function useNetworkIntelligenceMutation<T = unknown, B = Record<string, unknown>>(method: MutationMethod = "POST") {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<T, Error, { path: string; body: B }>({
        mutationFn: async ({ path, body }) => (await apiMutate<{ data: T }>(method, `${base}/${path}`, { locale, body })).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "network-intelligence"] }),
    });
}
