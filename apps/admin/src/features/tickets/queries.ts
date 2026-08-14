"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";
import { tableViewQueryToSdkQuery } from "#/lib/table-view";

import type {
    Ticket,
    TicketChannel,
    TicketPriority,
    TicketResource,
    TicketSettings,
    TicketSettingsUpdate,
    TicketStatus,
    TicketSummary,
    TicketTrendPoint,
} from "./types";

interface Envelope<T> {
    data: T;
}

interface ListEnvelope<T> extends Envelope<T[]> {
    meta: { page: number; limit: number; total: number; lastPage: number };
}

export interface TicketListParams {
    page?: number;
    limit?: number;
    q?: string;
    status?: TicketStatus | "all";
    priority?: TicketPriority | "all";
    channel?: TicketChannel | "all";
    sla?: "all" | "healthy" | "breached";
}

export function useTickets(params: TicketListParams = {}) {
    const locale = useLocale();
    const filters = [
        params.status && params.status !== "all" ? { field: "status", op: "eq" as const, value: params.status } : null,
        params.priority && params.priority !== "all"
            ? { field: "priority", op: "eq" as const, value: params.priority }
            : null,
        params.channel && params.channel !== "all" ? { field: "channel", op: "eq" as const, value: params.channel } : null,
    ].filter((value): value is NonNullable<typeof value> => value !== null);
    const tableQuery = {
        page: params.page ?? 1,
        limit: params.limit ?? 25,
        filter: filters,
        filterOr: [],
        sort: [
            { field: "last_message_at", dir: "desc" as const },
            { field: "id", dir: "desc" as const },
        ],
    };
    const query = tableViewQueryToSdkQuery(tableQuery, {
        q: params.q || undefined,
        sla: params.sla && params.sla !== "all" ? params.sla : undefined,
    });
    return useQuery({
        queryKey: ["admin", "tickets", "list", { locale, ...query }],
        queryFn: ({ signal }) => apiGet<ListEnvelope<Ticket>>("tickets", { locale, query, signal }),
        placeholderData: (previous) => previous,
    });
}

export function useTicketSummary() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tickets", "summary", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<TicketSummary>>("tickets/summary", { locale, signal }),
        select: (payload) => payload.data,
        refetchInterval: 30_000,
    });
}

export function useTicketTrends() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tickets", "trends", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<TicketTrendPoint[]>>("tickets/trends", { locale, signal }),
        select: (payload) => payload.data,
    });
}

export function useTicket(id: number) {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tickets", "detail", id, { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<Ticket>>(`tickets/${id}`, { locale, signal }),
        select: (payload) => payload.data,
        enabled: id > 0,
    });
}

export function useTicketResources(kind: "customers" | "assignees", q = "") {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tickets", "resources", kind, q, { locale }],
        queryFn: ({ signal }) =>
            apiGet<Envelope<TicketResource[]>>("tickets/resources", {
                locale,
                query: { kind, q: q || undefined, limit: 50 },
                signal,
            }),
        select: (payload) => payload.data,
        staleTime: 30_000,
    });
}

function useTicketInvalidation() {
    const client = useQueryClient();
    return async (id?: number) => {
        await Promise.all([
            client.invalidateQueries({ queryKey: ["admin", "tickets", "list"] }),
            client.invalidateQueries({ queryKey: ["admin", "tickets", "summary"] }),
            client.invalidateQueries({ queryKey: ["admin", "tickets", "trends"] }),
            id ? client.invalidateQueries({ queryKey: ["admin", "tickets", "detail", id] }) : Promise.resolve(),
        ]);
    };
}

export function useCreateTicket() {
    const locale = useLocale();
    const invalidate = useTicketInvalidation();
    return useMutation({
        mutationFn: (body: {
            customer_id?: number | null;
            requester_name: string;
            requester_email?: string | null;
            requester_phone?: string | null;
            subject: string;
            message: string;
            priority?: TicketPriority;
            channel?: TicketChannel;
            category?: string | null;
            tags?: string[];
            assigned_user_id?: number | null;
        }) => apiMutate<Envelope<Ticket>>("POST", "tickets", { locale, body }),
        onSuccess: () => invalidate(),
    });
}

export function useUpdateTicket(id: number) {
    const locale = useLocale();
    const invalidate = useTicketInvalidation();
    return useMutation({
        mutationFn: (body: {
            expected_version: number;
            subject?: string;
            priority?: TicketPriority;
            category?: string | null;
            tags?: string[];
            assigned_user_id?: number | null;
        }) => apiMutate<Envelope<Ticket> & { changed?: boolean }>("PATCH", `tickets/${id}`, { locale, body }),
        onSuccess: () => invalidate(id),
    });
}

export function useTransitionTicket(id: number) {
    const locale = useLocale();
    const invalidate = useTicketInvalidation();
    return useMutation({
        mutationFn: (body: { status: TicketStatus; expected_version: number; reason?: string | null }) =>
            apiMutate<Envelope<Ticket> & { changed?: boolean }>("POST", `tickets/${id}/transition`, { locale, body }),
        onSuccess: () => invalidate(id),
    });
}

export function useAddTicketMessage(id: number) {
    const locale = useLocale();
    const invalidate = useTicketInvalidation();
    return useMutation({
        mutationFn: (body: { kind: "reply" | "internal_note"; body: string; expected_version: number }) =>
            apiMutate<unknown>("POST", `tickets/${id}/messages`, { locale, body }),
        onSuccess: () => invalidate(id),
    });
}

export function useTicketSettings() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tickets", "settings", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<TicketSettings>>("tickets/settings", { locale, signal }),
        select: (payload) => payload.data,
    });
}

export function useUpdateTicketSettings() {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: TicketSettingsUpdate) =>
            apiMutate<Envelope<TicketSettings> & { changed?: boolean }>("PATCH", "tickets/settings", { locale, body }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "settings"] }),
    });
}
