import SupportTicket from "#models/support_ticket";
import { currentTrx } from "#services/tenant_context";
import { type AdminTicketsViewQuery, adminTicketsView } from "#table_views/admin/tickets";
import SupportTicketTransformer from "#transformers/support_ticket_transformer";

export interface TicketQueueInput extends AdminTicketsViewQuery {
    q?: string;
    sla?: "all" | "healthy" | "breached";
}

function likeLiteral(value: string): string {
    return `%${value.toLowerCase().replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

class TicketQueueService {
    async list(input: TicketQueueInput) {
        const trx = currentTrx();
        const query = SupportTicket.query({ client: trx });
        const now = new Date();

        if (input.q) {
            const needle = likeLiteral(input.q);
            query.where((builder) => {
                builder
                    .whereRaw("LOWER(reference) LIKE ?", [needle])
                    .orWhereRaw("LOWER(subject) LIKE ?", [needle])
                    .orWhereRaw("LOWER(requester_name) LIKE ?", [needle])
                    .orWhereRaw("LOWER(COALESCE(requester_email, '')) LIKE ?", [needle])
                    .orWhereRaw("LOWER(COALESCE(requester_phone, '')) LIKE ?", [needle]);
            });
        }

        if (input.sla === "healthy") {
            query.where((builder) => {
                builder
                    .where((firstResponse) =>
                        firstResponse.whereNotNull("first_response_at").orWhere("first_response_due_at", ">=", now),
                    )
                    .where((resolution) =>
                        resolution.whereIn("status", ["resolved", "closed"]).orWhere("resolution_due_at", ">=", now),
                    );
            });
        }
        if (input.sla === "breached") {
            query.where((builder) => {
                builder
                    .where((firstResponse) =>
                        firstResponse.whereNull("first_response_at").where("first_response_due_at", "<", now),
                    )
                    .orWhere((resolution) =>
                        resolution.whereNotIn("status", ["resolved", "closed"]).where("resolution_due_at", "<", now),
                    );
            });
        }

        const { data, meta } = await adminTicketsView.run<SupportTicket>(query, input);
        const assigneeIds = [
            ...new Set(data.flatMap((ticket) => (ticket.assignedUserId === null ? [] : [Number(ticket.assignedUserId)]))),
        ];
        const assignees =
            assigneeIds.length === 0
                ? []
                : await trx.from("users").select("id", "email").whereIn("id", assigneeIds).whereNull("deleted_at");
        const assigneeEmails = new Map(assignees.map((row) => [Number(row.id), String(row.email)]));

        return {
            data: data.map((ticket) => ({
                ...new SupportTicketTransformer(ticket).toObject(),
                assignee_email:
                    ticket.assignedUserId === null ? null : (assigneeEmails.get(Number(ticket.assignedUserId)) ?? null),
            })),
            meta,
        };
    }
}

export const ticketQueueService = new TicketQueueService();
