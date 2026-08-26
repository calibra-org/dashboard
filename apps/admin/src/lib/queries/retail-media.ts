"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate, type MutationMethod } from "#/lib/queries/api-client";

const base = "retail-media";

export type RetailMediaOverview = {
    engine_version: string;
    kpis: {
        campaigns: number;
        active_campaigns: number;
        active_creators: number;
        active_placements: number;
        net_media_spend_minor: number;
        creator_commission_minor: number;
        refund_adjustments_minor: number;
        pending_commission_minor: number;
    };
    measurement_posture: string;
};

export type RetailMediaBudget = {
    budget_total_minor: number;
    spent_minor: number;
    remaining_minor: number;
    funded_minor: number;
    currency: string;
};

export type RetailMediaCampaign = {
    id: number;
    public_id: string;
    advertiser_id: number;
    advertiser_name: string;
    advertiser_kind: string;
    name: string;
    objective: string;
    status: string;
    bid_model: "cpc" | "cpm";
    default_bid_minor: number;
    budget_total_minor: number;
    daily_pacing_cap_minor: number | null;
    currency: string;
    attribution_window_days: number;
    experiment_id: number | null;
    holdout_id: number | null;
    starts_at: string | null;
    ends_at: string | null;
    version: number;
    updated_at: string;
    budget: RetailMediaBudget;
};

export type RetailMediaPlacement = {
    id: number;
    public_id: string;
    placement_key: string;
    name: string;
    surface: string;
    status: string;
    disclosure_text: string;
    minimum_relevance_bps: number;
    minimum_quality_bps: number;
    privacy_min_cohort: number;
    updated_at: string;
};

export type RetailMediaCreator = {
    id: number;
    public_id: string;
    display_name: string;
    handle: string | null;
    status: string;
    holding_days: number;
    disclosure_text: string;
    balance: { available_minor: number; pending_minor: number };
    links: Array<Record<string, unknown>>;
};

export type RetailMediaCommission = {
    id: number;
    creator_public_id: string;
    creator_name: string;
    entry_kind: string;
    amount_minor: number;
    currency: string;
    order_id: number | null;
    refund_id: number | null;
    available_at: string | null;
    occurred_at: string;
    source_ref: string | null;
};

export type RetailMediaMeasurement = {
    engine_version: string;
    campaigns: Array<{
        campaign_public_id: string;
        name: string;
        currency: string;
        privacy: { threshold: number; cohort: number | null; suppressed: boolean };
        delivery: {
            impressions: number | null;
            clicks: number | null;
            conversions: number | null;
            revenue_minor: number | null;
            spend_minor: number;
        };
        incrementality: {
            experiment_id: number | null;
            holdout_id: number | null;
            causal_strength: string | number | null;
            status: string;
            incremental_contribution_minor: number | null;
        };
    }>;
};

export type RetailMediaAccessRow = {
    id: number;
    identity: string;
    permissions: Record<string, boolean>;
};

export function useRetailMediaResource<T>(path: string, enabled = true) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: T }, Error, T>({
        queryKey: ["admin", "retail-media", path, { locale }],
        queryFn: () => apiGet<{ data: T }>(`${base}/${path}`, { locale }),
        select: (payload) => payload.data,
        enabled,
        staleTime: 5_000,
    });
}

export function useRetailMediaMutation<T = unknown, B = Record<string, unknown>>(method: MutationMethod = "POST") {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<T, Error, { path: string; body: B }>({
        mutationFn: async ({ path, body }) => (await apiMutate<{ data: T }>(method, `${base}/${path}`, { locale, body })).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "retail-media"] }),
    });
}
