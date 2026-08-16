"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

export type LifecycleState = "never_purchased" | "first_purchase" | "active_repeat" | "at_risk" | "lapsed" | "reactivated";
export type RiskBand = "unknown" | "low" | "medium" | "high";
export type ValueBand = "unknown" | "developing" | "core" | "high_value";

export interface CustomerIntelligence {
    customer_id: number;
    lifecycle_state: LifecycleState;
    lifecycle_reason: string;
    recency_days: number | null;
    frequency_365d: number;
    monetary_365d_minor: number;
    rfm_recency_score: number | null;
    rfm_frequency_score: number | null;
    rfm_monetary_score: number | null;
    rfm_score: number | null;
    value_band: ValueBand;
    risk_band: RiskBand;
    historical_revenue_ltv_minor: number | null;
    historical_contribution_ltv_minor: number | null;
    expected_next_purchase_from: string | null;
    expected_next_purchase_to: string | null;
    signals: {
        support?: { open_tickets?: number; tickets_90d?: number };
        refunds?: { refunded_minor?: number };
        consent?: { email_opt_in?: boolean; sms_opt_in?: boolean };
    };
    prediction_meta: {
        churn?: { status?: string; probability?: number | null; horizon_days?: number; method?: string };
        next_purchase?: { status?: string; probability?: number | null; method?: string };
        contribution_ltv?: { status?: string; source?: string; value_minor?: number | null };
    };
    nba_candidates: Array<{
        action_type?: string;
        reason_codes?: string[];
        evidence_refs?: string[];
        eligibility?: string;
        consent_requirement?: string;
        execution?: { status?: string; owner?: string };
    }>;
    quality_status: string;
    engine_version: string;
    calculated_at: string;
    stale_at: string | null;
}

export interface CustomerIntelligenceSummary {
    total: number;
    active_repeat: number;
    at_risk: number;
    lapsed: number;
    high_risk: number;
    high_value: number;
    historical_revenue_ltv_minor: number;
    generated_at: string | null;
    engine_version: string;
    predictive_status: string;
    contribution_status: string;
}

export interface LifecycleCohortRow {
    cohort: string;
    lifecycle_state: LifecycleState;
    customers: number;
    revenue_ltv_minor: number;
}

export type SegmentFeature =
    | "lifecycle.state"
    | "risk.band"
    | "value.band"
    | "rfm.score"
    | "rfm.recency_days"
    | "rfm.frequency_365d"
    | "rfm.monetary_365d_minor"
    | "economics.historical_revenue_ltv_minor"
    | "consent.email"
    | "consent.sms";

export type SegmentOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in";

export interface SegmentCondition {
    feature: SegmentFeature;
    operator: SegmentOperator;
    value: string | number | boolean | Array<string | number | boolean>;
}

export interface SegmentDefinition {
    version: 1;
    op: "and" | "or";
    conditions: SegmentCondition[];
}

export interface SegmentIntelligenceDefinition {
    segment_id: number;
    kind: "saved_view" | "rule_based" | "rfm" | "cohort" | "lifecycle" | "predictive";
    definition: SegmentDefinition | null;
    refresh_policy: "manual" | "event_driven";
    definition_version: number;
    status: string;
    member_count: number | null;
    last_evaluated_at: string | null;
}

export interface SegmentMember {
    id: number;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    matched_at: string;
    evaluated_at: string;
}

export function useCustomerIntelligenceSummary() {
    const locale = useLocale() as Locale;
    return useQuery<{ data: CustomerIntelligenceSummary }, Error, CustomerIntelligenceSummary>({
        queryKey: ["admin", "customer-intelligence", "summary", { locale }],
        queryFn: () => apiGet("customer-intelligence/summary", { locale }),
        select: (payload) => payload.data,
        staleTime: 30_000,
    });
}

export function useCustomerIntelligence(customerId: number | null) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: CustomerIntelligence }, Error, CustomerIntelligence>({
        queryKey: ["admin", "customer-intelligence", "customer", { locale, customerId }],
        queryFn: () => apiGet(`customer-intelligence/customers/${customerId}`, { locale }),
        select: (payload) => payload.data,
        enabled: customerId !== null && customerId > 0,
        staleTime: 30_000,
    });
}

export function useRefreshCustomerIntelligence(customerId: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () =>
            apiMutate<{ data: CustomerIntelligence }>("POST", `customer-intelligence/customers/${customerId}/refresh`, { locale }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customer-intelligence", "customer", { locale, customerId }] });
            qc.invalidateQueries({ queryKey: ["admin", "customer-intelligence", "summary", { locale }] });
            qc.invalidateQueries({ queryKey: ["admin", "customer-intelligence", "cohorts", { locale }] });
        },
    });
}

export function useRefreshAllCustomerIntelligence() {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () =>
            apiMutate<{ data: { refreshed: number; purged: number } }>("POST", "customer-intelligence/refresh", { locale }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "customer-intelligence"] }),
    });
}

export function useLifecycleCohorts() {
    const locale = useLocale() as Locale;
    return useQuery<{ data: LifecycleCohortRow[] }, Error, LifecycleCohortRow[]>({
        queryKey: ["admin", "customer-intelligence", "cohorts", { locale }],
        queryFn: () => apiGet("customer-intelligence/cohorts", { locale }),
        select: (payload) => payload.data,
    });
}

export function useSegmentIntelligenceDefinition(segmentId: number | null) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: SegmentIntelligenceDefinition }, Error, SegmentIntelligenceDefinition>({
        queryKey: ["admin", "customer-segments", "intelligence-definition", { locale, segmentId }],
        queryFn: () => apiGet(`customer-segments/${segmentId}/intelligence-definition`, { locale }),
        select: (payload) => payload.data,
        enabled: segmentId !== null && segmentId > 0,
    });
}

export function useSaveSegmentIntelligenceDefinition(segmentId: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: {
            kind: "rule_based" | "rfm" | "cohort" | "lifecycle" | "predictive";
            definition: SegmentDefinition;
            refresh_policy: "manual" | "event_driven";
        }) =>
            apiMutate<{ data: SegmentIntelligenceDefinition }>("PUT", `customer-segments/${segmentId}/intelligence-definition`, {
                locale,
                body: input,
            }),
        onSuccess: () =>
            qc.invalidateQueries({ queryKey: ["admin", "customer-segments", "intelligence-definition", { locale, segmentId }] }),
    });
}

export function usePreviewCustomerSegment(segmentId: number) {
    const locale = useLocale() as Locale;
    return useMutation({
        mutationFn: () =>
            apiMutate<{ data: { count: number; sample_customer_ids: number[] } }>("POST", `customer-segments/${segmentId}/preview`, {
                locale,
            }),
    });
}

export function useEvaluateCustomerSegment(segmentId: number) {
    const locale = useLocale() as Locale;
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () =>
            apiMutate<{ data: { member_count: number; evaluated_at: string } }>("POST", `customer-segments/${segmentId}/evaluate`, {
                locale,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin", "customer-segments", "intelligence-definition", { locale, segmentId }] });
            qc.invalidateQueries({ queryKey: ["admin", "customer-segments", "members", { locale, segmentId }] });
        },
    });
}

export function useCustomerSegmentMembers(segmentId: number | null, page = 1, limit = 25) {
    const locale = useLocale() as Locale;
    return useQuery<
        { data: SegmentMember[]; meta: { page: number; limit: number; total: number; last_page: number } },
        Error
    >({
        queryKey: ["admin", "customer-segments", "members", { locale, segmentId, page, limit }],
        queryFn: () => apiGet(`customer-segments/${segmentId}/members`, { locale, query: { page, limit } }),
        enabled: segmentId !== null && segmentId > 0,
    });
}
