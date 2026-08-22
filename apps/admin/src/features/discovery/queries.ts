"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { apiGet, apiMutate } from "#/lib/queries/api-client";
import type {
    DiscoveryOverview,
    IndexHealth,
    MerchRule,
    Opportunity,
    Paginated,
    Relationship,
    Resource,
    SearchEvent,
    SearchPolicy,
    Simulation,
    SynonymRule,
} from "./types";
const root = ["discovery"] as const;
const useList = <T>(path: string, query: Record<string, string | number | boolean | undefined> = {}) => {
    const locale = useLocale();
    return useQuery({
        queryKey: [...root, path, locale, query],
        queryFn: ({ signal }) => apiGet<Paginated<T>>(`discovery/${path}`, { locale: locale as never, query, signal }),
    });
};
const invalidate = (qc: ReturnType<typeof useQueryClient>) => () => qc.invalidateQueries({ queryKey: root });
export function useDiscoveryCapabilities() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...root, "capabilities", locale],
        queryFn: ({ signal }) =>
            apiGet<Resource<{ permissions: Record<string, boolean> }>>("discovery/capabilities", {
                locale: locale as never,
                signal,
            }),
        staleTime: 60_000,
    });
}
export function useDiscoveryOverview() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...root, "overview", locale],
        queryFn: ({ signal }) => apiGet<Resource<DiscoveryOverview>>("discovery/overview", { locale: locale as never, signal }),
    });
}
export function useSearchEvents(q = "", page = 1) {
    return useList<SearchEvent>("queries", { page, limit: 25, ...(q ? { q } : {}) });
}
export function useZeroResults(q = "", page = 1) {
    return useList<SearchEvent>("zero-results", { page, limit: 25, ...(q ? { q } : {}) });
}
export function useSynonyms(page = 1) {
    return useList<SynonymRule>("synonyms", { page, limit: 25 });
}
export function useMerchandising(page = 1) {
    return useList<MerchRule>("merchandising", { page, limit: 25 });
}
export function useRelationships(page = 1) {
    return useList<Relationship>("relationships", { page, limit: 25 });
}
export function useOpportunities(page = 1) {
    return useList<Opportunity>("opportunities", { page, limit: 25 });
}
export function usePolicies(page = 1) {
    return useList<SearchPolicy>("policies", { page, limit: 25 });
}
export function useIndexHealth() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...root, "index-health", locale],
        queryFn: ({ signal }) => apiGet<Resource<IndexHealth>>("discovery/index/health", { locale: locale as never, signal }),
    });
}
export function useDiscoveryMutations() {
    const locale = useLocale();
    const qc = useQueryClient();
    const done = invalidate(qc);
    return {
        simulate: useMutation({
            mutationFn: (body: { query: string; locale?: string; limit?: number; category_id?: number }) =>
                apiMutate<Resource<Simulation>>("POST", "discovery/simulate", { locale: locale as never, body }),
        }),
        createSynonym: useMutation({
            mutationFn: (body: Record<string, unknown>) =>
                apiMutate("POST", "discovery/synonyms", { locale: locale as never, body }),
            onSuccess: done,
        }),
        toggleSynonym: useMutation({
            mutationFn: (id: number) => apiMutate("POST", `discovery/synonyms/${id}/toggle`, { locale: locale as never }),
            onSuccess: done,
        }),
        createRule: useMutation({
            mutationFn: (body: Record<string, unknown>) =>
                apiMutate("POST", "discovery/merchandising", { locale: locale as never, body }),
            onSuccess: done,
        }),
        ruleStatus: useMutation({
            mutationFn: ({ id, status }: { id: number; status: string }) =>
                apiMutate("POST", `discovery/merchandising/${id}/status`, { locale: locale as never, body: { status } }),
            onSuccess: done,
        }),
        createRelationship: useMutation({
            mutationFn: (body: Record<string, unknown>) =>
                apiMutate("POST", "discovery/relationships", { locale: locale as never, body }),
            onSuccess: done,
        }),
        resolveRelationship: useMutation({
            mutationFn: ({ id, ...body }: { id: number; [key: string]: unknown }) =>
                apiMutate("POST", `discovery/relationships/${id}/resolve`, { locale: locale as never, body }),
            onSuccess: done,
        }),
        revokeRelationship: useMutation({
            mutationFn: (id: number) => apiMutate("POST", `discovery/relationships/${id}/revoke`, { locale: locale as never }),
            onSuccess: done,
        }),
        detect: useMutation({
            mutationFn: () => apiMutate("POST", "discovery/opportunities/detect", { locale: locale as never }),
            onSuccess: done,
        }),
        opportunityAction: useMutation({
            mutationFn: ({ id, ...body }: { id: number; [key: string]: unknown }) =>
                apiMutate("POST", `discovery/opportunities/${id}/action`, { locale: locale as never, body }),
            onSuccess: done,
        }),
        createPolicy: useMutation({
            mutationFn: (body: Record<string, unknown>) =>
                apiMutate("POST", "discovery/policies", { locale: locale as never, body }),
            onSuccess: done,
        }),
        versionPolicy: useMutation({
            mutationFn: ({ id, ...body }: { id: number; [key: string]: unknown }) =>
                apiMutate("POST", `discovery/policies/${id}/versions`, { locale: locale as never, body }),
            onSuccess: done,
        }),
        activatePolicy: useMutation({
            mutationFn: ({ id, version }: { id: number; version: number }) =>
                apiMutate("POST", `discovery/policies/${id}/activate`, { locale: locale as never, body: { version } }),
            onSuccess: done,
        }),
        rollbackPolicy: useMutation({
            mutationFn: ({ id, version }: { id: number; version: number }) =>
                apiMutate("POST", `discovery/policies/${id}/rollback`, { locale: locale as never, body: { version } }),
            onSuccess: done,
        }),
        rebuildIndex: useMutation({
            mutationFn: () => apiMutate("POST", "discovery/index/rebuild", { locale: locale as never }),
            onSuccess: done,
        }),
    };
}
