import { BaseTransformer } from "@adonisjs/core/transformers";

import type SupportTicket from "#models/support_ticket";

/** Public admin shape for ticket queue rows backed by the Lucid ticket model. */
export default class SupportTicketTransformer extends BaseTransformer<SupportTicket> {
    toObject() {
        return {
            id: Number(this.resource.id),
            ticket_number: Number(this.resource.ticketNumber),
            reference: this.resource.reference,
            customer_id: this.resource.customerId === null ? null : Number(this.resource.customerId),
            requester_name: this.resource.requesterName,
            requester_email: this.resource.requesterEmail,
            requester_phone: this.resource.requesterPhone,
            subject: this.resource.subject,
            status: this.resource.status,
            priority: this.resource.priority,
            channel: this.resource.channel,
            category: this.resource.category,
            tags: Array.isArray(this.resource.tags) ? this.resource.tags : [],
            assigned_user_id: this.resource.assignedUserId === null ? null : Number(this.resource.assignedUserId),
            version: this.resource.version,
            first_response_due_at: this.resource.firstResponseDueAt?.toISO() ?? null,
            resolution_due_at: this.resource.resolutionDueAt?.toISO() ?? null,
            first_response_at: this.resource.firstResponseAt?.toISO() ?? null,
            resolved_at: this.resource.resolvedAt?.toISO() ?? null,
            closed_at: this.resource.closedAt?.toISO() ?? null,
            last_message_at: this.resource.lastMessageAt.toISO(),
            created_at: this.resource.createdAt.toISO(),
            updated_at: this.resource.updatedAt.toISO(),
        };
    }
}
