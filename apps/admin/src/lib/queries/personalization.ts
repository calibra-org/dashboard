"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { apiGet, apiMutate } from "#/lib/queries/api-client";

export interface Campaign {
    id: number;
    name: string;
    status: string;
    selection_mode: "manual" | "smart" | "controlled_random" | "hybrid";
    min_discount_percent: number;
    max_items: number;
    rotation_minutes: number;
    version: number;
    starts_at: string | null;
    ends_at: string | null;
    products: Array<{ product_id: number; pinned: boolean; position: number }>;
}
export interface RuntimeSettings {
    enabled: boolean;
    kill_switch: boolean;
    homepage_enabled: boolean;
    homepage_campaign_id: number | null;
    default_limit: number;
}
export interface Placement {
    id: number;
    placement: string;
    enabled: boolean;
    strategy: string;
    max_items: number;
    exploration_percent: number;
    version: number;
}
export interface CampaignWrite {
    name: string;
    selection_mode: Campaign["selection_mode"];
    min_discount_percent: number;
    max_items: number;
    rotation_minutes: number;
    product_ids: number[];
    pinned_product_ids: number[];
    starts_at?: string | null;
    ends_at?: string | null;
    expected_version?: number;
}

type Envelope<T> = { data: T };
const key = ["admin", "personalization"] as const;
export function usePersonalizationOverview() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...key, "overview", locale],
        queryFn: () => apiGet<Envelope<Record<string, unknown>>>("personalization/overview", { locale }),
    });
}
export function useCampaigns() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...key, "campaigns", locale],
        queryFn: () => apiGet<Envelope<Campaign[]>>("personalization/campaigns", { locale }),
        select: (r) => r.data,
    });
}
export function useRuntimeSettings() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...key, "settings", locale],
        queryFn: () => apiGet<Envelope<RuntimeSettings>>("personalization/settings", { locale }),
        select: (r) => r.data,
    });
}
export function usePlacements() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...key, "placements", locale],
        queryFn: () => apiGet<Envelope<Placement[]>>("personalization/placements", { locale }),
        select: (r) => r.data,
    });
}
export function usePhase9Health() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...key, "health", locale],
        queryFn: () => apiGet<Envelope<Record<string, unknown>>>("personalization/health", { locale }),
        select: (r) => r.data,
        refetchInterval: 30000,
    });
}
export function usePhase9Events() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...key, "events", locale],
        queryFn: () => apiGet<Envelope<Record<string, unknown>[]>>("personalization/events", { locale, query: { limit: 50 } }),
        select: (r) => r.data,
    });
}
export function usePhase9Consents() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...key, "consents", locale],
        queryFn: () => apiGet<Envelope<Record<string, unknown>[]>>("personalization/consents", { locale, query: { limit: 50 } }),
        select: (r) => r.data,
    });
}
function invalidate(qc: ReturnType<typeof useQueryClient>) {
    qc.invalidateQueries({ queryKey: key });
}
export function useCreateCampaign() {
    const locale = useLocale();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: CampaignWrite) => apiMutate<Envelope<Campaign>>("POST", "personalization/campaigns", { locale, body }),
        onSuccess: () => invalidate(qc),
    });
}
export function useUpdateCampaign() {
    const locale = useLocale();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...body }: CampaignWrite & { id: number }) =>
            apiMutate<Envelope<Campaign>>("PATCH", `personalization/campaigns/${id}`, { locale, body }),
        onSuccess: () => invalidate(qc),
    });
}
export function useCampaignAction(action: "publish" | "pause") {
    const locale = useLocale();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, expected_version }: { id: number; expected_version: number }) =>
            apiMutate<Envelope<Campaign>>("POST", `personalization/campaigns/${id}/${action}`, {
                locale,
                body: { expected_version },
            }),
        onSuccess: () => invalidate(qc),
    });
}
export function useUpdateRuntimeSettings() {
    const locale = useLocale();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: Partial<RuntimeSettings>) =>
            apiMutate<Envelope<RuntimeSettings>>("PATCH", "personalization/settings", { locale, body }),
        onSuccess: () => invalidate(qc),
    });
}
export function useUpdatePlacement() {
    const locale = useLocale();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ placement, ...body }: Partial<Placement> & { placement: string; expected_version: number }) =>
            apiMutate<Envelope<Placement>>("PATCH", `personalization/placements/${placement}`, { locale, body }),
        onSuccess: () => invalidate(qc),
    });
}
export function useSimulation() {
    const locale = useLocale();
    return useMutation({
        mutationFn: (body: Record<string, unknown>) =>
            apiMutate<Envelope<Record<string, unknown>>>("POST", "personalization/simulate", { locale, body }),
    });
}
