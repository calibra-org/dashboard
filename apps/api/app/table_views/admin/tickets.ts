import { TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_STATUSES } from "#enums/support_ticket";
import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import SupportTicket from "#models/support_ticket";

/**
 * Admin support-ticket queue. Cross-column free-text search and SLA predicates stay as endpoint
 * extras because neither maps to one field; every direct status, priority, channel, assignment,
 * customer, date, and sort predicate uses the shared TableView grammar.
 */
export const adminTicketsView = createTableView({
    model: SupportTicket,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        ticket_number: { type: "bigint", filterable: true, orderable: true },
        reference: { type: "string", filterable: true, orderable: true },
        customer_id: { type: "bigint", filterable: true, orderable: false },
        requester_name: { type: "string", filterable: true, orderable: true },
        requester_email: { type: "string", filterable: true, orderable: false },
        requester_phone: { type: "string", filterable: true, orderable: false },
        subject: { type: "string", filterable: true, orderable: true },
        status: { type: "enum", values: TICKET_STATUSES, filterable: true, orderable: true },
        priority: { type: "enum", values: TICKET_PRIORITIES, filterable: true, orderable: true },
        channel: { type: "enum", values: TICKET_CHANNELS, filterable: true, orderable: true },
        category: { type: "string", filterable: true, orderable: true },
        assigned_user_id: { type: "bigint", filterable: true, orderable: false },
        first_response_due_at: { type: "datetime", filterable: true, orderable: true },
        resolution_due_at: { type: "datetime", filterable: true, orderable: true },
        first_response_at: { type: "datetime", filterable: true, orderable: true },
        resolved_at: { type: "datetime", filterable: true, orderable: true },
        closed_at: { type: "datetime", filterable: true, orderable: true },
        last_message_at: { type: "datetime", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
        updated_at: { type: "datetime", filterable: false, orderable: true },
    },
    defaultSort: [
        ["last_message_at", "desc"],
        ["id", "desc"],
    ],
});

export type AdminTicketsViewQuery = InferTableViewQuery<typeof adminTicketsView>;
