"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";
import { type TableViewQuery, tableViewQueryToSdkQuery } from "#/lib/table-view";

export type PaymentAttemptStatus = "initiated" | "awaiting_callback" | "verified" | "failed" | "cancelled" | "refunded";
export type PaymentReconciliationStatus = "unchecked" | "matched" | "mismatch" | "unsupported" | "error";

export interface AdminTransaction {
    id: number;
    order_id: number;
    gateway_id: number;
    gateway_code: string;
    status: PaymentAttemptStatus;
    amount_minor: number;
    currency: string;
    gateway_authority: string | null;
    gateway_transaction_id: string | null;
    error_code: string | null;
    error_message: string | null;
    reconciliation_status: PaymentReconciliationStatus;
    reconciliation_provider_status: string | null;
    reconciliation_checked_at: string | null;
    reconciliation_checked_by_user_id: number | null;
    reconciliation_error_code: string | null;
    initiated_at: string | null;
    verified_at: string | null;
    created_at: string | null;
}

export interface AdminTransactionDetail extends AdminTransaction {
    gateway_payload: Record<string, unknown>;
    reconciliation_evidence: Record<string, unknown>;
}

interface TransactionListEnvelope {
    data: AdminTransaction[];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

export interface TransactionSummary {
    total_count: number;
    total_amount_minor: number;
    by_status: Record<string, { count: number; amount_minor: number }>;
    by_reconciliation: Record<string, number>;
    needs_attention_count: number;
}

export interface ReconciliationAuditEntry {
    id: string;
    actor: { id: string; email: string } | null;
    action: string;
    entity_kind: string;
    entity_id: string | null;
    payload: Record<string, unknown>;
    ip_address: string | null;
    occurred_at: string | null;
}

interface SummaryEnvelope { data: TransactionSummary }
interface DetailEnvelope { data: AdminTransactionDetail }
interface HistoryEnvelope { data: ReconciliationAuditEntry[] }

export function useTransactions(query: TableViewQuery, q?: string) {
    const locale = useLocale() as Locale;
    const sdkQuery = tableViewQueryToSdkQuery(query, { q: q?.trim() || undefined });
    return useQuery({
        queryKey: ["admin", "transactions", "list", { locale, sdkQuery }],
        queryFn: ({ signal }) => apiGet<TransactionListEnvelope>("payment-attempts", { locale, query: sdkQuery, signal }),
        select: (payload) => ({
            data: payload.data ?? [],
            meta: payload.meta ?? { page: query.page, limit: query.limit, total: payload.data?.length ?? 0, lastPage: 1 },
        }),
        placeholderData: (previous) => previous,
    });
}

export function useTransactionSummary() {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["admin", "transactions", "summary", { locale }],
        queryFn: ({ signal }) => apiGet<SummaryEnvelope>("payment-attempts/summary", { locale, signal }),
        select: (payload) => payload.data,
        staleTime: 15_000,
        refetchInterval: 30_000,
    });
}

export function useTransaction(id: number | null) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["admin", "transactions", "detail", id, { locale }],
        queryFn: ({ signal }) => apiGet<DetailEnvelope>(`payment-attempts/${id}`, { locale, signal }),
        select: (payload) => payload.data,
        enabled: id !== null && id > 0,
    });
}

export function useTransactionReconciliationHistory(id: number | null) {
    const locale = useLocale() as Locale;
    return useQuery({
        queryKey: ["admin", "transactions", "reconciliation-history", id, { locale }],
        queryFn: ({ signal }) => apiGet<HistoryEnvelope>(`payment-attempts/${id}/reconciliation`, { locale, signal }),
        select: (payload) => payload.data ?? [],
        enabled: id !== null && id > 0,
    });
}

export function useReconcileTransaction() {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<DetailEnvelope, Error, number>({
        mutationFn: (id) => apiMutate<DetailEnvelope>("POST", `payment-attempts/${id}/reconcile`, { locale, body: {} }),
        onSettled: (_data, _error, id) => {
            queryClient.invalidateQueries({ queryKey: ["admin", "transactions", "detail", id] });
            queryClient.invalidateQueries({ queryKey: ["admin", "transactions", "reconciliation-history", id] });
            queryClient.invalidateQueries({ queryKey: ["admin", "transactions", "list"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "transactions", "summary"] });
        },
    });
}
