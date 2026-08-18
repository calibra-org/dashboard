"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

interface Envelope<T> { data: T }
export interface EconomicsOverviewRow {
    currency: string;
    contribution_minor: string;
    revenue_minor: string;
    cogs_minor: string;
    refunds_minor: string;
    orders: string;
    incomplete_entries: string;
}
export interface EconomicsOverview {
    currencies: EconomicsOverviewRow[];
    settlements: Array<{ currency: string; status: string; net_minor: string }>;
}
export interface EconomicsCubeRow {
    id: string | null;
    label: string | null;
    currency: string;
    contribution_minor: string;
    incomplete_entries: string;
}
export interface WorkingCapital {
    currency: string;
    inventory_capital_minor: number;
    unvalued_units: number;
    expected_cash_minor: number;
}

function operationKey(): string {
    return globalThis.crypto?.randomUUID?.() ?? `economics-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useEconomicsOverview(currency?: string) {
    const locale = useLocale() as Locale;
    return useQuery<Envelope<EconomicsOverview>, Error, EconomicsOverview>({
        queryKey: ["admin", "economics", "overview", currency, locale],
        queryFn: () => apiGet<Envelope<EconomicsOverview>>("economics/overview", { locale, query: { currency } }),
        select: (payload) => payload.data,
        staleTime: 15_000,
    });
}

export function useEconomicsCube(dimension: "product" | "order", currency?: string) {
    const locale = useLocale() as Locale;
    return useQuery<Envelope<EconomicsCubeRow[]>, Error, EconomicsCubeRow[]>({
        queryKey: ["admin", "economics", "cube", dimension, currency, locale],
        queryFn: () => apiGet<Envelope<EconomicsCubeRow[]>>("economics/cube", { locale, query: { dimension, currency, limit: 100 } }),
        select: (payload) => payload.data,
        staleTime: 15_000,
    });
}

export function useWorkingCapital() {
    const locale = useLocale() as Locale;
    return useQuery<Envelope<WorkingCapital>, Error, WorkingCapital>({
        queryKey: ["admin", "economics", "working-capital", locale],
        queryFn: () => apiGet<Envelope<WorkingCapital>>("economics/working-capital", { locale }),
        select: (payload) => payload.data,
        staleTime: 15_000,
    });
}

export function useOrderEconomics(id: number) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["admin", "economics", "order", id, locale],
        queryFn: () => apiGet<Envelope<any>>(`economics/orders/${id}`, { locale }),
        select: (payload) => payload.data,
    });
}

export function useProductEconomics(id: number) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["admin", "economics", "product", id, locale],
        queryFn: () => apiGet<Envelope<any>>(`economics/products/${id}`, { locale }),
        select: (payload) => payload.data,
    });
}

function useEconomicMutation(path: string) {
    const locale = useLocale() as Locale;
    const client = useQueryClient();
    return useMutation<Envelope<any>, Error, Record<string, unknown>>({
        mutationFn: (body) => apiMutate<Envelope<any>>("POST", path, { locale, body, idempotencyKey: operationKey() }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "economics"] }),
    });
}

export function useCreateCostPolicy() { return useEconomicMutation("economics/cost-policies"); }
export function useCreateCostLayer() { return useEconomicMutation("economics/cost-layers"); }
export function useReconcileSettlement() { return useEconomicMutation("economics/settlements/reconcile"); }
export function useBackfillEconomics() { return useEconomicMutation("economics/backfill"); }

export function useCorrectLineCost(lineId: number | null) {
    const locale = useLocale() as Locale;
    const client = useQueryClient();
    return useMutation<Envelope<any>, Error, Record<string, unknown>>({
        mutationFn: (body) => {
            if (!lineId) throw new Error("line id is required");
            return apiMutate<Envelope<any>>("POST", `economics/line-costs/${lineId}/corrections`, { locale, body, idempotencyKey: operationKey() });
        },
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "economics"] }),
    });
}
