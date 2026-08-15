export type TicketStatus = "open" | "pending" | "waiting_customer" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type SupportChannel =
    | "web"
    | "email"
    | "phone"
    | "api"
    | "whatsapp"
    | "telegram"
    | "instagram"
    | "rubika"
    | "bale"
    | "eitaa"
    | "sms";
export type TicketChannel = "admin" | SupportChannel;
export type SupportChannelStatus = "disabled" | "configured" | "connected" | "error";
export type AgentPresenceState = "offline" | "available" | "busy" | "away";
export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled";
export type CampaignTemplateStatus = "draft" | "pending" | "approved" | "rejected";

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

export interface TicketWorkflowStatus {
    id: number;
    code: string;
    label_fa: string;
    label_en: string;
    semantic_group: "active" | "waiting" | "resolved" | "closed";
    is_terminal: boolean;
    is_customer_waiting: boolean;
    is_enabled: boolean;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export interface TicketSavedViewQuery {
    q?: string;
    status?: TicketStatus;
    priority?: TicketPriority;
    channel?: TicketChannel;
    assigned_user_id?: number | null;
    customer_id?: number | null;
    sla?: "healthy" | "breached";
    sort?: string;
}

export interface TicketSavedView {
    id: number;
    owner_user_id: number;
    name: string;
    query: TicketSavedViewQuery;
    is_shared: boolean;
    created_at: string;
    updated_at: string;
}

export interface TicketBulkResult {
    id: number;
    ok: boolean;
    version?: number;
    changed?: boolean;
    code?: string;
    status?: number;
    message?: string;
}

export interface TicketBulkResponse {
    data: TicketBulkResult[];
    meta: { requested: number; succeeded: number; failed: number };
}

export interface TicketAttachment {
    id: number;
    ticket_id: number;
    message_id: number | null;
    media_id: number;
    filename: string;
    mime: string;
    size_bytes: number;
    sha256: string | null;
    scan_status: "pending" | "clean" | "infected" | "error";
    scan_evidence: string | null;
    scanned_at: string | null;
    created_at: string;
}

export interface AgentPresence {
    user_id: number;
    email: string | null;
    state: AgentPresenceState;
    effective_state: AgentPresenceState;
    capacity: number;
    active_count: number;
    last_heartbeat_at: string | null;
    stale: boolean;
    updated_at: string;
}

export interface SupportChannelIntegration {
    id: number;
    channel: SupportChannel;
    status: SupportChannelStatus;
    credential_env_ref: string | null;
    configuration: Record<string, unknown>;
    credential_configured: boolean;
    last_error: string | null;
    last_verified_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface SupportRoutingRule {
    id: number;
    name: string;
    priority: number;
    enabled: boolean;
    conditions: Record<string, unknown>;
    actions: Record<string, unknown>;
    version: number;
    created_at: string;
    updated_at: string;
}

export type SupportAutomationTrigger =
    | "ticket_created"
    | "ticket_updated"
    | "status_changed"
    | "message_received"
    | "sla_breached";

export interface SupportAutomationRule {
    id: number;
    name: string;
    trigger: SupportAutomationTrigger;
    enabled: boolean;
    conditions: Record<string, unknown>;
    actions: Array<Record<string, unknown>>;
    version: number;
    created_at: string;
    updated_at: string;
}

export interface SupportCampaign {
    id: number;
    name: string;
    channel: Exclude<SupportChannel, "web" | "phone" | "api">;
    status: CampaignStatus;
    template_status: CampaignTemplateStatus;
    template_body: string;
    quiet_hours: Record<string, unknown>;
    estimated_cost_minor: number;
    version: number;
    scheduled_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
    recipient_summary?: {
        total: number;
        pending: number;
        queued: number;
        sent: number;
        delivered: number;
        failed: number;
        skipped: number;
        opted_out: number;
    };
}

export interface SupportReports {
    backlog: Array<{ priority: TicketPriority; total: number }>;
    sla: {
        first_response_breached: number;
        resolution_breached: number;
        avg_first_response_minutes: number;
        avg_resolution_minutes: number;
    };
    csat: { average: number; responses: number };
    reopened_tickets: number;
    fcr_proxy: {
        definition: string;
        evidence: string;
        completed_tickets: number;
        first_contact_resolved: number;
        rate_percent: number;
    };
    statuses: Array<{ status: TicketStatus; total: number }>;
    channels: Array<{ channel: TicketChannel; total: number }>;
    assignees: Array<{ assigned_user_id: number | null; email: string | null; active: number }>;
}
