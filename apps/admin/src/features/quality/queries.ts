"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

import type { QualityCase, QualityCaseDetail, QualityOverview, QualityRecord } from "./types";

type List<T> = { data: T[]; meta: { page: number; limit: number; total: number } };

const useQ = (key: string, path: string) => {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "quality", key, locale],
        queryFn: ({ signal }) => apiGet<any>(path, { locale, signal }),
    });
};

export const useOverview = () => useQ("overview", "quality/overview") as ReturnType<typeof useQuery<QualityOverview>>;
export const useCases = () => useQ("cases", "quality/cases") as ReturnType<typeof useQuery<List<QualityCase>>>;
export const useReturns = () => useQ("returns", "quality/returns") as ReturnType<typeof useQuery<List<QualityRecord>>>;
export const useVoc = () => useQ("voc", "quality/voc") as ReturnType<typeof useQuery<List<QualityRecord>>>;
export const useSignals = () => useQ("signals", "quality/signals") as ReturnType<typeof useQuery<List<QualityRecord>>>;
export const useActions = () => useQ("actions", "quality/actions") as ReturnType<typeof useQuery<List<QualityRecord>>>;
export const useReasons = () => useQ("reasons", "quality/taxonomy/reasons");
export const useTraceability = () => useQ("traceability", "quality/traceability");
export const useSupplier = () => useQ("supplier", "quality/supplier-quality");
export const useMetrics = () => useQ("metrics", "quality/metrics");
export const useAudit = () => useQ("audit", "quality/audit");

export function useCase(id: number) {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "quality", "case", id, locale],
        queryFn: ({ signal }) => apiGet<{ data: QualityCaseDetail }>(`quality/cases/${id}`, { locale, signal }),
        select: (response) => response.data,
    });
}

function useQualityMutation(path: (value: any) => string, method: "POST" | "PATCH" = "POST") {
    const locale = useLocale();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (value: any) => apiMutate<any>(method, path(value), { locale, body: value.body ?? value }),
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
