"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

import type { QualityCase, QualityCaseDetail, QualityOverview, QualityRecord } from "./types";

type List<T> = { data: T[]; meta: { page: number; limit: number; total: number } };
type MutationValue = {
    body?: unknown;
    findingId?: string | number;
    returnId?: string | number;
    itemId?: string | number;
    id?: string | number;
    action?: string;
    [key: string]: unknown;
};

const useQ = <T>(key: string, path: string) => {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "quality", key, locale],
        queryFn: ({ signal }) => apiGet<T>(path, { locale, signal }),
    });
};

export const useOverview = () => useQ<QualityOverview>("overview", "quality/overview");
export const useCases = () => useQ<List<QualityCase>>("cases", "quality/cases");
export const useReturns = () => useQ<List<QualityRecord>>("returns", "quality/returns");
export const useVoc = () => useQ<List<QualityRecord>>("voc", "quality/voc");
export const useSignals = () => useQ<List<QualityRecord>>("signals", "quality/signals");
export const useActions = () => useQ<List<QualityRecord>>("actions", "quality/actions");
export const useReasons = () => useQ<unknown>("reasons", "quality/taxonomy/reasons");
export const useTraceability = () => useQ<unknown>("traceability", "quality/traceability");
export const useSupplier = () => useQ<unknown>("supplier", "quality/supplier-quality");
export const useMetrics = () => useQ<unknown>("metrics", "quality/metrics");
export const useAudit = () => useQ<unknown>("audit", "quality/audit");

export function useCase(id: number) {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "quality", "case", id, locale],
        queryFn: ({ signal }) => apiGet<{ data: QualityCaseDetail }>(`quality/cases/${id}`, { locale, signal }),
        select: (response) => response.data,
    });
}

function useQualityMutation(path: (value: MutationValue) => string, method: "POST" | "PATCH" = "POST") {
    const locale = useLocale();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (value: MutationValue) => apiMutate<unknown>(method, path(value), { locale, body: value.body ?? value }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "quality"] }),
    });
}

export const useCreateCase = () => useQualityMutation(() => "quality/cases");
export const useUpdateCase = (id: number) => useQualityMutation(() => `quality/cases/${id}`, "PATCH");
export const useAddSource = (id: number) => useQualityMutation(() => `quality/cases/${id}/sources`);
export const useAddEvidence = (id: number) => useQualityMutation(() => `quality/cases/${id}/evidence`);
export const useAddFinding = (id: number) => useQualityMutation(() => `quality/cases/${id}/findings`);
export const useAdjudicate = (id: number) =>
    useQualityMutation((value) => `quality/cases/${id}/findings/${value.findingId}`, "PATCH");
export const useInspect = () => useQualityMutation((value) => `order-returns/${value.returnId}/items/${value.itemId}/inspection`);
export const useClassify = () => useQualityMutation(() => "quality/voc/classifications");
export const useEvaluate = () => useQualityMutation(() => "quality/signals/evaluate");
export const useSignalTransition = () => useQualityMutation((value) => `quality/signals/${value.id}/${value.action}`);
export const useCreateAction = () => useQualityMutation(() => "quality/actions");
export const useUpdateAction = () => useQualityMutation((value) => `quality/actions/${value.id}`, "PATCH");
export const useCreateOutcome = () => useQualityMutation(() => "quality/outcomes");
export const useCreateReason = () => useQualityMutation(() => "quality/taxonomy/reasons");
export const useReasonVersion = () => useQualityMutation((value) => `quality/taxonomy/reasons/${value.id}/versions`);
