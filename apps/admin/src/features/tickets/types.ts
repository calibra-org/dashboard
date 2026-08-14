export type TicketStatus = "open" | "pending" | "waiting_customer" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketChannel = "admin" | "web" | "email" | "phone" | "api";

export interface Ticket {
    id: number;
    ticket_number: number;
    reference: string;
    customer_id?: number | null;
    requester_name: string;
    requester_email: string | null;
    requester_phone: string | null;
    subject: string;
    status: TicketStatus;
    priority: TicketPriority;
    channel: TicketChannel;
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
    messages?: TicketMessage[];
    events?: TicketEvent[];
}

export interface TicketMessage {
    id: number;
    ticket_id: number;
    author_user_id: number | null;
    author_customer_id?: number | null;
    author_email?: string | null;
    kind: "requester_message" | "reply" | "internal_note" | "system";
    body: string;
    created_at: string;
}

export interface TicketEvent {
    id: number;
    ticket_id: number;
    actor_user_id: number | null;
    actor_email?: string | null;
    event_type: string;
    payload: Record<string, unknown>;
    created_at: string;
}

export interface TicketSummary {
    total: number;
    active: number;
    waiting_customer: number;
    resolved_30d: number;
    sla_breached: number;
    avg_first_response_minutes: number;
    avg_resolution_minutes: number;
}

export interface TicketTrendPoint {
    day: string;
    opened: number;
    resolved: number;
}

export interface TicketSettings {
    tenant_id: number;
    reference_prefix: string;
    first_response_minutes: number;
    resolution_minutes: number;
    default_priority: TicketPriority;
    default_assignee_user_id: number | null;
}

export interface TicketResource {
    id: number;
    label: string;
    email?: string | null;
    phone?: string | null;
}

export interface TicketSettingsUpdate {
    reference_prefix?: string;
    first_response_minutes?: number;
    resolution_minutes?: number;
    default_priority?: TicketPriority;
    default_assignee_user_id?: number | null;
}
