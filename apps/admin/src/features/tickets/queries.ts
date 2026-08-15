"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";
import { tableViewQueryToSdkQuery } from "#/lib/table-view";

import type {
    AgentPresence,
    AgentPresenceState,
    CampaignStatus,
    SupportAutomationRule,
    SupportAutomationTrigger,
    SupportCampaign,
    SupportChannel,
    SupportChannelIntegration,
    SupportReports,
    SupportRoutingRule,
    Ticket,
    TicketAttachment,
    TicketBulkResponse,
    TicketChannel,
    TicketPriority,
    TicketResource,
    TicketSavedView,
    TicketSavedViewQuery,
    TicketSettings,
    TicketSettingsUpdate,
    TicketStatus,
    TicketSummary,
    TicketTrendPoint,
    TicketWorkflowStatus,
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
        params.priority && params.priority !== "all" ? { field: "priority", op: "eq" as const, value: params.priority } : null,
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
            client.invalidateQueries({ queryKey: ["admin", "tickets", "reports"] }),
            client.invalidateQueries({ queryKey: ["admin", "tickets", "presence"] }),
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

export function useTicketWorkflowStatuses() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tickets", "workflow-statuses", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<TicketWorkflowStatus[]>>("tickets/workflow-statuses", { locale, signal }),
        select: (payload) => payload.data,
    });
}

export function useCreateTicketWorkflowStatus() {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: {
            code: string;
            label_fa: string;
            label_en: string;
            semantic_group: "active" | "waiting" | "resolved" | "closed";
            is_terminal?: boolean;
            is_customer_waiting?: boolean;
            is_enabled?: boolean;
            sort_order?: number;
        }) => apiMutate<Envelope<TicketWorkflowStatus>>("POST", "tickets/workflow-statuses", { locale, body }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "workflow-statuses"] }),
    });
}

export function useTicketSavedViews() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tickets", "saved-views", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<TicketSavedView[]>>("tickets/saved-views", { locale, signal }),
        select: (payload) => payload.data,
    });
}

export function useCreateTicketSavedView() {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: { name: string; query: TicketSavedViewQuery; is_shared?: boolean }) =>
            apiMutate<Envelope<TicketSavedView>>("POST", "tickets/saved-views", { locale, body }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "saved-views"] }),
    });
}

export function useDeleteTicketSavedView() {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => apiMutate<unknown>("DELETE", `tickets/saved-views/${id}`, { locale }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "saved-views"] }),
    });
}

export function useTicketBulkOperation() {
    const locale = useLocale();
    const invalidate = useTicketInvalidation();
    return useMutation({
        mutationFn: (body: {
            tickets: Array<{ id: number; expected_version: number }>;
            operation: "assign" | "priority" | "category" | "tags" | "transition";
            assigned_user_id?: number | null;
            priority?: TicketPriority;
            category?: string | null;
            tags?: string[];
            status?: TicketStatus;
            reason?: string | null;
        }) => apiMutate<TicketBulkResponse>("POST", "tickets/bulk", { locale, body }),
        onSuccess: () => invalidate(),
    });
}

export function useTicketAttachments(ticketId: number) {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tickets", "attachments", ticketId, { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<TicketAttachment[]>>(`tickets/${ticketId}/attachments`, { locale, signal }),
        select: (payload) => payload.data,
        enabled: ticketId > 0,
    });
}

export function useAddTicketAttachment(ticketId: number) {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: { media_id: number; message_id?: number | null; sha256?: string | null }) =>
            apiMutate<Envelope<TicketAttachment>>("POST", `tickets/${ticketId}/attachments`, { locale, body }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "attachments", ticketId] }),
    });
}

export function useAttachMediaToTicket() {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (input: { ticket_id: number; media_id: number; message_id?: number | null; sha256?: string | null }) => {
            const { ticket_id, ...body } = input;
            return apiMutate<Envelope<TicketAttachment>>("POST", `tickets/${ticket_id}/attachments`, { locale, body });
        },
        onSuccess: (_payload, input) =>
            client.invalidateQueries({ queryKey: ["admin", "tickets", "attachments", input.ticket_id] }),
    });
}

export function useMergeTicket(ticketId: number) {
    const locale = useLocale();
    const invalidate = useTicketInvalidation();
    return useMutation({
        mutationFn: (body: {
            target_ticket_id: number;
            expected_source_version: number;
            expected_target_version: number;
            reason?: string | null;
        }) => apiMutate<Envelope<Record<string, unknown>>>("POST", `tickets/${ticketId}/merge`, { locale, body }),
        onSuccess: () => invalidate(ticketId),
    });
}

export function useAgentPresence() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tickets", "presence", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<AgentPresence[]>>("tickets/operations/presence", { locale, signal }),
        select: (payload) => payload.data,
        refetchInterval: 30_000,
    });
}

export function useHeartbeat() {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: { state: AgentPresenceState; capacity: number }) =>
            apiMutate<Envelope<AgentPresence>>("PUT", "tickets/operations/presence/me", { locale, body }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "presence"] }),
    });
}

export function useSupportChannels() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tickets", "channels", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<SupportChannelIntegration[]>>("tickets/operations/channels", { locale, signal }),
        select: (payload) => payload.data,
        refetchInterval: 60_000,
    });
}

export function useUpdateSupportChannel() {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: {
            channel: SupportChannel;
            enabled: boolean;
            credential_env_ref?: string | null;
            configuration?: Record<string, unknown>;
        }) => apiMutate<Envelope<SupportChannelIntegration>>("PATCH", "tickets/operations/channels", { locale, body }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "channels"] }),
    });
}

export function useSupportRoutingRules() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tickets", "routing-rules", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<SupportRoutingRule[]>>("tickets/operations/routing-rules", { locale, signal }),
        select: (payload) => payload.data,
    });
}

export function useCreateSupportRoutingRule() {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: {
            name: string;
            priority?: number;
            enabled?: boolean;
            conditions: Record<string, unknown>;
            actions: Record<string, unknown>;
        }) => apiMutate<Envelope<SupportRoutingRule>>("POST", "tickets/operations/routing-rules", { locale, body }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "routing-rules"] }),
    });
}

export function useUpdateSupportRoutingRule(id: number) {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: {
            expected_version: number;
            name?: string;
            priority?: number;
            enabled?: boolean;
            conditions?: Record<string, unknown>;
            actions?: Record<string, unknown>;
        }) => apiMutate<Envelope<SupportRoutingRule>>("PATCH", `tickets/operations/routing-rules/${id}`, { locale, body }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "routing-rules"] }),
    });
}

export function useSupportAutomationRules() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tickets", "automation-rules", { locale }],
        queryFn: ({ signal }) =>
            apiGet<Envelope<SupportAutomationRule[]>>("tickets/operations/automation-rules", { locale, signal }),
        select: (payload) => payload.data,
    });
}

export function useCreateSupportAutomationRule() {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: {
            name: string;
            trigger: SupportAutomationTrigger;
            enabled?: boolean;
            conditions: Record<string, unknown>;
            actions: Array<Record<string, unknown>>;
        }) => apiMutate<Envelope<SupportAutomationRule>>("POST", "tickets/operations/automation-rules", { locale, body }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "automation-rules"] }),
    });
}

export function useUpdateSupportAutomationRule(id: number) {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: {
            expected_version: number;
            name?: string;
            enabled?: boolean;
            conditions?: Record<string, unknown>;
            actions?: Array<Record<string, unknown>>;
        }) => apiMutate<Envelope<SupportAutomationRule>>("PATCH", `tickets/operations/automation-rules/${id}`, { locale, body }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "automation-rules"] }),
    });
}

export function useSupportCampaigns() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tickets", "campaigns", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<SupportCampaign[]>>("tickets/operations/campaigns", { locale, signal }),
        select: (payload) => payload.data,
    });
}

export function useCreateSupportCampaign() {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: {
            name: string;
            channel: SupportCampaign["channel"];
            template_body: string;
            quiet_hours?: Record<string, unknown>;
            estimated_cost_minor?: number;
            scheduled_at?: string | null;
        }) => apiMutate<Envelope<SupportCampaign>>("POST", "tickets/operations/campaigns", { locale, body }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "campaigns"] }),
    });
}

export function useAddCampaignRecipients(id: number) {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: { expected_version: number; recipients: string[] }) =>
            apiMutate<Envelope<{ campaign_id: number; version: number; recipients: number }>>(
                "POST",
                `tickets/operations/campaigns/${id}/recipients`,
                { locale, body },
            ),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "campaigns"] }),
    });
}

export function useTransitionCampaign(id: number) {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: { expected_version: number; status: Extract<CampaignStatus, "scheduled" | "paused" | "cancelled"> }) =>
            apiMutate<Envelope<SupportCampaign>>("POST", `tickets/operations/campaigns/${id}/transition`, { locale, body }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "campaigns"] }),
    });
}

export function useReviewCampaignTemplate(id: number) {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: { expected_version: number; decision: "approved" | "rejected"; note?: string | null }) =>
            apiMutate<Envelope<SupportCampaign>>("POST", `tickets/operations/campaigns/${id}/template-review`, { locale, body }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tickets", "campaigns"] }),
    });
}

export function useSupportReports() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tickets", "reports", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<SupportReports>>("tickets/operations/reports", { locale, signal }),
        select: (payload) => payload.data,
        refetchInterval: 60_000,
    });
}
