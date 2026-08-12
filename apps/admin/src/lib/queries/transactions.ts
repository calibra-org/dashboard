"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet } from "#/lib/queries/api-client";
import { type TableViewQuery, tableViewQueryToSdkQuery } from "#/lib/table-view";

export type PaymentAttemptStatus = "initiated" | "awaiting_callback" | "verified" | "failed" | "cancelled" | "refunded";

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
    initiated_at: string | null;
    verified_at: string | null;
    created_at: string | null;
}

export interface AdminTransactionDetail extends AdminTransaction {
    gateway_payload: Record<string, unknown>;
}

interface TransactionListEnvelope {
    data: AdminTransaction[];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}

export interface TransactionSummary {
    total_count: number;
    total_amount_minor: number;
    by_status: Record<string, { count: number; amount_minor: number }>;
}

interface SummaryEnvelope { data: TransactionSummary }
interface DetailEnvelope { data: AdminTransactionDetail }

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
