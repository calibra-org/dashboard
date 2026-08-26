"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate, type MutationMethod } from "#/lib/queries/api-client";

const base = "fulfillment-promise";

export type FulfillmentPromiseOverview = {
    active_nodes: number;
    calibrated_services: number;
    promises_30d: number;
    allocation_recommendations_30d: number;
    on_time_promises: number;
    measured_outcomes: number;
    promise_accuracy_bps: number | null;
};

export type FulfillmentNode = {
    id: number;
    public_id: string;
    node_code: string;
    name: string;
    node_type: string;
    status: string;
    timezone: string;
    country: string;
    region_id: number | null;
    city: string | null;
    cutoff_local_time: string | null;
    handling_minutes: number;
    inventory_stale_after_minutes: number;
    version: number;
    updated_at: string;
};

export type FulfillmentServiceProfile = {
    id: number;
    node_public_id: string;
    node_name: string;
    shipping_zone_method_id: number;
    method_code: string;
    method_title: string;
    status: string;
    transit_minutes_p50: number;
    transit_minutes_p90: number;
    calibration_sample_count: number;
    minimum_sample_count: number;
    confidence_bps: number;
    max_calibration_age_hours: number;
    last_calibrated_at: string | null;
};

export type FulfillmentPromiseRow = {
    public_id: string;
    strategy: string;
    status: string;
    window_start_at: string;
    window_end_at: string;
    confidence_bps: number;
    shipping_cost_minor: number;
    currency: string;
    constraints: string[];
    created_at: string;
    source_name: string | null;
};

export type AllocationRecommendation = {
    id: number;
    order_id: number;
    strategy: string;
    score_bps: number;
    recommendation: Record<string, unknown>;
    constraints: string[];
    status: string;
    accepted_at: string | null;
    created_at: string;
};

export type PromiseAccuracy = {
    measured_outcomes: number;
    on_time_count: number;
    accuracy_bps: number | null;
    median_lateness_minutes: number | null;
    outcomes: Array<{
        on_time: boolean | null;
        lateness_minutes: number | null;
        actual_delivered_at: string | null;
        strategy: string;
        confidence_bps: number;
        window_end_at: string;
        node_name: string | null;
    }>;
};

export type FulfillmentPromiseAccessRow = {
    id: number;
    identity: string;
    permissions: Record<string, boolean>;
};

export function useFulfillmentPromiseResource<T>(path: string, enabled = true) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: T }, Error, T>({
        queryKey: ["admin", "fulfillment-promise", path, { locale }],
        queryFn: () => apiGet<{ data: T }>(`${base}/${path}`, { locale }),
        select: (payload) => payload.data,
        enabled,
        staleTime: 5_000,
    });
}

export function useFulfillmentPromiseMutation<T = unknown, B = Record<string, unknown>>(method: MutationMethod = "POST") {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<T, Error, { path: string; body: B }>({
        mutationFn: async ({ path, body }) =>
            (await apiMutate<{ data: T }>(method, `${base}/${path}`, { locale, body })).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "fulfillment-promise"] }),
    });
}
