import { createHash, randomBytes } from "node:crypto";

import { Exception } from "@adonisjs/core/exceptions";

import { supportTicketService } from "#services/support/ticket_service";
import { currentTrx } from "#services/tenant_context";

type DbRow = Record<string, unknown>;

function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

function numberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

async function tokenRow(token: string, lock = false): Promise<DbRow> {
    const hash = hashToken(token);
    let query = currentTrx().from("support_public_tokens").where("token_hash", hash);
    if (lock) query = query.forUpdate();
    const row = (await query.first()) as DbRow | undefined;
    if (!row || row.revoked_at || new Date(String(row.expires_at)).getTime() <= Date.now()) {
        throw new Exception("Support tracking token is invalid or expired", { status: 404, code: "E_SUPPORT_PUBLIC_TOKEN" });
    }
    return row;
}

async function publicTicket(ticketId: number) {
    const trx = currentTrx();
    const ticket = await trx
        .from("support_tickets")
        .select("id", "reference", "requester_name", "subject", "status", "priority", "category", "version", "created_at", "updated_at", "last_message_at", "resolved_at", "closed_at")
        .where("id", ticketId)
        .first();
    if (!ticket) throw new Exception("Support ticket not found", { status: 404, code: "E_TICKET_NOT_FOUND" });
    const [messages, attachments] = await Promise.all([
        trx
            .from("support_ticket_messages")
            .select("id", "kind", "body", "created_at")
            .where("ticket_id", ticketId)
            .whereIn("kind", ["requester_message", "reply"])
            .orderBy("created_at", "asc"),
        trx
            .from("support_ticket_attachments")
            .select("id", "message_id", "filename", "mime", "size_bytes", "created_at")
            .where("ticket_id", ticketId)
            .where("scan_status", "clean")
            .orderBy("created_at", "asc"),
    ]);
    return {
        ...ticket,
        id: numberValue(ticket.id),
        version: numberValue(ticket.version),
        messages: messages.map((row) => ({ ...row, id: numberValue(row.id) })),
        attachments: attachments.map((row) => ({ ...row, id: numberValue(row.id), message_id: row.message_id === null ? null : numberValue(row.message_id), size_bytes: numberValue(row.size_bytes), download_available: false })),
    };
}

export class PublicSupportService {
    async create(input: {
        requester_name: string;
        requester_email?: string | null;
        requester_phone?: string | null;
        subject: string;
        message: string;
        category?: string | null;
    }) {
        const created = await supportTicketService.create({
            requester_name: input.requester_name,
            requester_email: input.requester_email ?? null,
            requester_phone: input.requester_phone ?? null,
            subject: input.subject,
            message: input.message,
            category: input.category ?? null,
            channel: "web",
        }, null);
        const ticketId = Number(created.data.id);
        const token = randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await currentTrx().table("support_public_tokens").insert({
            ticket_id: ticketId,
            token_hash: hashToken(token),
            expires_at: expiresAt,
        });
        return {
            data: {
                ticket: await publicTicket(ticketId),
                tracking_token: token,
                expires_at: expiresAt.toISOString(),
            },
        };
    }

    async show(token: string) {
        const access = await tokenRow(token);
        await currentTrx().from("support_public_tokens").where("id", access.id).update({ last_used_at: new Date() });
        return { data: await publicTicket(numberValue(access.ticket_id)) };
    }

    async reply(token: string, input: { expected_version: number; body: string }) {
        const access = await tokenRow(token, true);
        const ticketId = numberValue(access.ticket_id);
        const ticket = await currentTrx().from("support_tickets").where("id", ticketId).forUpdate().first();
        if (!ticket) throw new Exception("Support ticket not found", { status: 404, code: "E_TICKET_NOT_FOUND" });
        if (numberValue(ticket.version) !== input.expected_version) {
            throw new Exception("Support ticket changed", { status: 409, code: "E_TICKET_VERSION_CONFLICT" });
        }
        if (String(ticket.status) === "closed") {
            throw new Exception("Closed support tickets cannot receive public replies", { status: 409, code: "E_SUPPORT_PUBLIC_CLOSED" });
        }
        const now = new Date();
        const [updated] = await currentTrx().from("support_tickets").where("id", ticketId).where("version", input.expected_version).update({
            last_message_at: now,
            updated_at: now,
            version: input.expected_version + 1,
            status: String(ticket.status) === "waiting_customer" ? "open" : ticket.status,
        }).returning("*");
        if (!updated) throw new Exception("Support ticket changed", { status: 409, code: "E_TICKET_VERSION_CONFLICT" });
        const [message] = await currentTrx().table("support_ticket_messages").insert({
            ticket_id: ticketId,
            author_user_id: null,
            author_customer_id: null,
            kind: "requester_message",
            body: input.body,
        }).returning(["id"]);
        await currentTrx().table("support_ticket_events").insert({
            ticket_id: ticketId,
            actor_user_id: null,
            event_type: "message.requester",
            payload: JSON.stringify({ message_id: numberValue(message.id), source: "public_token" }),
        });
        await currentTrx().from("support_public_tokens").where("id", access.id).update({ last_used_at: now });
        return { data: await publicTicket(ticketId) };
    }

    async csat(token: string, input: { score: number; comment?: string | null }) {
        const access = await tokenRow(token, true);
        const ticketId = numberValue(access.ticket_id);
        const ticket = await currentTrx().from("support_tickets").where("id", ticketId).first();
        if (!ticket) throw new Exception("Support ticket not found", { status: 404, code: "E_TICKET_NOT_FOUND" });
        if (!['resolved', 'closed'].includes(String(ticket.status))) {
            throw new Exception("CSAT is available after ticket resolution", { status: 409, code: "E_SUPPORT_CSAT_NOT_READY" });
        }
        const existing = await currentTrx().from("support_csat_responses").where("ticket_id", ticketId).first();
        if (existing) throw new Exception("CSAT response already submitted", { status: 409, code: "E_SUPPORT_CSAT_EXISTS" });
        const [row] = await currentTrx().table("support_csat_responses").insert({
            ticket_id: ticketId,
            score: input.score,
            comment: input.comment ?? null,
            response_token_hash: hashToken(token),
        }).returning(["id", "ticket_id", "score", "comment", "created_at"]);
        await currentTrx().table("support_ticket_events").insert({
            ticket_id: ticketId,
            actor_user_id: null,
            event_type: "ticket.csat_submitted",
            payload: JSON.stringify({ score: input.score }),
        });
        return { data: { ...row, id: numberValue(row.id), ticket_id: ticketId } };
    }
}

export const publicSupportService = new PublicSupportService();
