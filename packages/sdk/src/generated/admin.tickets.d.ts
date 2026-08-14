/**
 * Generated Admin Tickets API overlay.
 * Source: docs/api/reference/openapi/admin.tickets.v1.yaml
 */
export interface components {
    schemas: {
        TicketStatus: "open" | "pending" | "waiting_customer" | "resolved" | "closed";
        TicketPriority: "low" | "normal" | "high" | "urgent";
        TicketChannel: "admin" | "web" | "email" | "phone" | "api";
        TicketQueueItem: {
            id: number;
            ticket_number: number;
            reference: string;
            customer_id?: number | null;
            requester_name: string;
            requester_email: string | null;
            requester_phone: string | null;
            subject: string;
            status: components["schemas"]["TicketStatus"];
            priority: components["schemas"]["TicketPriority"];
            channel: components["schemas"]["TicketChannel"];
            category: string | null;
            tags: string[];
            assigned_user_id: number | null;
            assignee_email?: string | null;
            version: number;
            first_response_due_at: string | null;
            resolution_due_at: string | null;
            first_response_at: string | null;
            resolved_at: string | null;
            closed_at: string | null;
            last_message_at: string;
            created_at: string;
            updated_at: string;
            [key: string]: unknown;
        };
        TicketMessage: {
            id: number;
            ticket_id: number;
            author_user_id: number | null;
            author_customer_id?: number | null;
            author_email?: string | null;
            kind: "requester_message" | "reply" | "internal_note" | "system";
            body: string;
            created_at: string;
            [key: string]: unknown;
        };
        TicketEvent: {
            id: number;
            ticket_id: number;
            actor_user_id: number | null;
            actor_email?: string | null;
            event_type: string;
            payload: Record<string, unknown>;
            created_at: string;
            [key: string]: unknown;
        };
        TicketDetail: components["schemas"]["TicketQueueItem"] & {
            customer_first_name?: string | null;
            customer_last_name?: string | null;
            messages: components["schemas"]["TicketMessage"][];
            events: components["schemas"]["TicketEvent"][];
        };
        TicketSummary: {
            total: number;
            active: number;
            waiting_customer: number;
            resolved_30d: number;
            sla_breached: number;
            avg_first_response_minutes: number;
            avg_resolution_minutes: number;
        };
        TicketTrendPoint: { day: string; opened: number; resolved: number };
        TicketSettings: {
            tenant_id: number;
            reference_prefix: string;
            first_response_minutes: number;
            resolution_minutes: number;
            default_priority: components["schemas"]["TicketPriority"];
            default_assignee_user_id: number | null;
            [key: string]: unknown;
        };
        TicketResource: { id: number; label: string; email?: string | null; phone?: string | null };
        PaginationMeta: { page: number; limit?: number; perPage?: number; total: number; lastPage: number; [key: string]: unknown };
        TicketCreateInput: {
            customer_id?: number | null;
            requester_name: string;
            requester_email?: string | null;
            requester_phone?: string | null;
            subject: string;
            message: string;
            priority?: components["schemas"]["TicketPriority"];
            channel?: components["schemas"]["TicketChannel"];
            category?: string | null;
            tags?: string[];
            assigned_user_id?: number | null;
        };
        TicketUpdateInput: {
            expected_version: number;
            priority?: components["schemas"]["TicketPriority"];
            category?: string | null;
            tags?: string[];
            assigned_user_id?: number | null;
        };
        TicketTransitionInput: { expected_version: number; status: components["schemas"]["TicketStatus"] };
        TicketMessageInput: { expected_version: number; kind: "reply" | "internal_note"; body: string };
        TicketSettingsUpdateInput: {
            reference_prefix?: string;
            first_response_minutes?: number;
            resolution_minutes?: number;
            default_priority?: components["schemas"]["TicketPriority"];
            default_assignee_user_id?: number | null;
        };
    };
}

type JsonResponse<T> = { headers: { [name: string]: unknown }; content: { "application/json": T } };
type EmptyResponse = { headers: { [name: string]: unknown }; content?: never };
type NoParams = { query?: never; header?: never; path?: never; cookie?: never };

export interface operations {
    adminTicketsIndex: {
        parameters: { query?: { page?: number; limit?: number; filter?: string[]; filterOr?: string[]; sort?: string[]; q?: string; sla?: "all" | "healthy" | "breached" }; header?: never; path?: never; cookie?: never };
        requestBody?: never;
        responses: { 200: JsonResponse<{ data: components["schemas"]["TicketQueueItem"][]; meta: components["schemas"]["PaginationMeta"] }>; 422: EmptyResponse };
    };
    adminTicketsStore: {
        parameters: NoParams;
        requestBody: { content: { "application/json": components["schemas"]["TicketCreateInput"] } };
        responses: { 201: JsonResponse<{ data: components["schemas"]["TicketDetail"] }>; 422: EmptyResponse };
    };
    adminTicketsSummary: { parameters: NoParams; requestBody?: never; responses: { 200: JsonResponse<{ data: components["schemas"]["TicketSummary"] }> } };
    adminTicketsTrends: { parameters: NoParams; requestBody?: never; responses: { 200: JsonResponse<{ data: components["schemas"]["TicketTrendPoint"][] }> } };
    adminTicketsSettingsShow: { parameters: NoParams; requestBody?: never; responses: { 200: JsonResponse<{ data: components["schemas"]["TicketSettings"] }> } };
    adminTicketsSettingsUpdate: {
        parameters: NoParams;
        requestBody: { content: { "application/json": components["schemas"]["TicketSettingsUpdateInput"] } };
        responses: { 200: JsonResponse<{ data: components["schemas"]["TicketSettings"] }>; 422: EmptyResponse };
    };
    adminTicketsResources: {
        parameters: { query: { kind: "customers" | "assignees"; q?: string; limit?: number }; header?: never; path?: never; cookie?: never };
        requestBody?: never;
        responses: { 200: JsonResponse<{ data: components["schemas"]["TicketResource"][] }>; 422: EmptyResponse };
    };
    adminTicketsShow: {
        parameters: { query?: never; header?: never; path: { id: number }; cookie?: never };
        requestBody?: never;
        responses: { 200: JsonResponse<{ data: components["schemas"]["TicketDetail"] }>; 404: EmptyResponse; 422: EmptyResponse };
    };
    adminTicketsUpdate: {
        parameters: { query?: never; header?: never; path: { id: number }; cookie?: never };
        requestBody: { content: { "application/json": components["schemas"]["TicketUpdateInput"] } };
        responses: { 200: JsonResponse<{ data: components["schemas"]["TicketQueueItem"] }>; 404: EmptyResponse; 409: EmptyResponse; 422: EmptyResponse };
    };
    adminTicketsTransition: {
        parameters: { query?: never; header?: never; path: { id: number }; cookie?: never };
        requestBody: { content: { "application/json": components["schemas"]["TicketTransitionInput"] } };
        responses: { 200: JsonResponse<{ data: components["schemas"]["TicketQueueItem"] }>; 409: EmptyResponse; 422: EmptyResponse };
    };
    adminTicketsMessagesStore: {
        parameters: { query?: never; header?: never; path: { id: number }; cookie?: never };
        requestBody: { content: { "application/json": components["schemas"]["TicketMessageInput"] } };
        responses: { 201: JsonResponse<{ data: components["schemas"]["TicketMessage"]; ticket: components["schemas"]["TicketQueueItem"] }>; 409: EmptyResponse; 422: EmptyResponse };
    };
}

export interface paths {
    "/api/v1/admin/tickets": { parameters: NoParams; get: operations["adminTicketsIndex"]; put?: never; post: operations["adminTicketsStore"]; delete?: never; options?: never; head?: unknown; patch?: never; trace?: never };
    "/api/v1/admin/tickets/summary": { parameters: NoParams; get: operations["adminTicketsSummary"]; put?: never; post?: never; delete?: never; options?: never; head?: unknown; patch?: never; trace?: never };
    "/api/v1/admin/tickets/trends": { parameters: NoParams; get: operations["adminTicketsTrends"]; put?: never; post?: never; delete?: never; options?: never; head?: unknown; patch?: never; trace?: never };
    "/api/v1/admin/tickets/settings": { parameters: NoParams; get: operations["adminTicketsSettingsShow"]; put?: never; post?: never; delete?: never; options?: never; head?: unknown; patch: operations["adminTicketsSettingsUpdate"]; trace?: never };
    "/api/v1/admin/tickets/resources": { parameters: NoParams; get: operations["adminTicketsResources"]; put?: never; post?: never; delete?: never; options?: never; head?: unknown; patch?: never; trace?: never };
    "/api/v1/admin/tickets/{id}": { parameters: NoParams; get: operations["adminTicketsShow"]; put?: never; post?: never; delete?: never; options?: never; head?: unknown; patch: operations["adminTicketsUpdate"]; trace?: never };
    "/api/v1/admin/tickets/{id}/transition": { parameters: NoParams; get?: never; put?: never; post: operations["adminTicketsTransition"]; delete?: never; options?: never; head?: never; patch?: never; trace?: never };
    "/api/v1/admin/tickets/{id}/messages": { parameters: NoParams; get?: never; put?: never; post: operations["adminTicketsMessagesStore"]; delete?: never; options?: never; head?: never; patch?: never; trace?: never };
}
