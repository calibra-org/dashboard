"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

export type IntelligenceDomain = "payments" | "fulfillment" | "support" | "inventory" | "seo";
export type IntelligenceSeverity = "low" | "medium" | "high" | "critical";
export type IntelligenceDecision = "accept" | "reject" | "defer" | "watch";

export interface ScoreComponent {
    available: boolean;
    raw: number | null;
    baseWeight: number;
    effectiveWeight: number;
    contribution: number;
}

export interface IntelligenceCase {
    id: string;
    stableKey: string;
    kind: "risk" | "opportunity" | "recommendation";
    domain: IntelligenceDomain;
    lifecycleStage: string;
    signalState: "open" | "cleared";
    severity: IntelligenceSeverity;
    titleFa: string;
    titleEn: string;
    summaryFa: string;
    summaryEn: string;
    recommendedActionFa: string;
    recommendedActionEn: string;
    actionRoute: string | null;
    expectedValueMinor: string | null;
    expectedValueCurrency: string | null;
    confidence: number | null;
    confidenceSource: string | null;
    urgency: number | null;
    priorityScore: number;
    scoreMode: "provisional" | "calibrated";
    rankingPolicyVersion: string;
    scoreComponents: Record<string, ScoreComponent>;
    missingComponents: string[];
    freshnessAt: string;
    firstSeenAt: string;
    lastSeenAt: string;
    clearedAt: string | null;
    version: number;
}

export interface IntelligenceSummary {
    openCount: number;
    highCriticalCount: number;
    provisionalCount: number;
    measuredCount: number;
    byDomain: Array<{ domain: IntelligenceDomain; count: number }>;
    sourceCoverage: Array<{ source: string; status: "active" | "dependency_not_landed" }>;
    rankingPolicyVersion: string;
}

export interface IntelligenceDetail {
    case: IntelligenceCase;
    evidence: Array<Record<string, unknown>>;
    decisions: Array<Record<string, unknown>>;
    actions: Array<Record<string, unknown>>;
    outcomes: Array<Record<string, unknown>>;
}

interface Envelope<T> {
    data: T;
}

interface InboxEnvelope {
    data: IntelligenceCase[];
    meta: { page: number; limit: number; total: number; lastPage: number };
}

export function useIntelligenceSummary() {
    const locale = useLocale() as Locale;
    return useQuery<Envelope<IntelligenceSummary>, Error, IntelligenceSummary>({
        queryKey: ["admin", "intelligence", "summary", { locale }],
        queryFn: () => apiGet<Envelope<IntelligenceSummary>>("intelligence/summary", { locale }),
        select: (payload) => payload.data,
        staleTime: 15_000,
        refetchInterval: 60_000,
    });
}

export function useIntelligenceInbox(filters?: { domain?: IntelligenceDomain; severity?: IntelligenceSeverity; q?: string }) {
    const locale = useLocale() as Locale;
    const params = new URLSearchParams({ state: "open", limit: "50" });
    if (filters?.domain) params.set("domain", filters.domain);
    if (filters?.severity) params.set("severity", filters.severity);
    if (filters?.q?.trim()) params.set("q", filters.q.trim());
    const query = params.toString();
    return useQuery<InboxEnvelope, Error>({
        queryKey: ["admin", "intelligence", "inbox", filters ?? {}, { locale }],
        queryFn: () => apiGet<InboxEnvelope>(`intelligence/inbox?${query}`, { locale }),
        staleTime: 10_000,
        refetchInterval: 45_000,
    });
}

export function useIntelligenceDetail(id: string | null) {
    const locale = useLocale() as Locale;
    return useQuery<Envelope<IntelligenceDetail>, Error, IntelligenceDetail>({
        queryKey: ["admin", "intelligence", "case", id, { locale }],
        queryFn: () => apiGet<Envelope<IntelligenceDetail>>(`intelligence/cases/${id}`, { locale }),
        select: (payload) => payload.data,
        enabled: Boolean(id),
        staleTime: 5_000,
    });
}

export function useIntelligenceDecision() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<Envelope<unknown>, Error, { id: string; decision: IntelligenceDecision; reason: string; version: number }>(
        {
            mutationFn: (input) =>
                apiMutate<Envelope<unknown>>("POST", `intelligence/cases/${input.id}/decisions`, {
                    locale,
                    body: { decision: input.decision, reason: input.reason, version: input.version },
                }),
            onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "intelligence"] }),
        },
    );
}

export function useIntelligenceOutcome() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<
        Envelope<unknown>,
        Error,
        {
            id: string;
            metricName: string;
            baselineValue?: number;
            observedValue?: number;
            measurementWindow?: string;
            attributionConfidence?: number;
            notes?: string;
            observedAt: string;
        }
    >({
        mutationFn: (input) =>
            apiMutate<Envelope<unknown>>("POST", `intelligence/cases/${input.id}/outcomes`, {
                locale,
                body: {
                    metric_name: input.metricName,
                    baseline_value: input.baselineValue,
                    observed_value: input.observedValue,
                    measurement_window: input.measurementWindow,
                    attribution_confidence: input.attributionConfidence,
                    notes: input.notes,
                    observed_at: input.observedAt,
                },
            }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "intelligence"] }),
    });
}
