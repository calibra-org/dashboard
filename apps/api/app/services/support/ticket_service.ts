import { Exception } from "@adonisjs/core/exceptions";

import { currentTenantId, currentTrx } from "#services/tenant_context";
import { nextNumber } from "#services/tenant_numbering_service";
import type { TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_STATUSES } from "#validators/admin/ticket_validator";

type TicketStatus = (typeof TICKET_STATUSES)[number];
type TicketPriority = (typeof TICKET_PRIORITIES)[number];
type TicketChannel = (typeof TICKET_CHANNELS)[number];
type DbRow = Record<string, unknown>;
type TicketRecord = DbRow & {
    id: number;
    ticket_number: number;
    reference: string;
    subject: string;
    status: TicketStatus;
    priority: TicketPriority;
    channel: TicketChannel;
    category: string | null;
    tags: string[];
    assigned_user_id: number | null;
    version: number;
    resolved_at: unknown;
    closed_at: unknown;
    first_response_at: unknown;
};
type TicketDetail = TicketRecord & { messages: DbRow[]; events: DbRow[] };

export interface TicketListInput {
    page?: number;
    limit?: number;
    q?: string;
    status?: TicketStatus;
    priority?: TicketPriority;
    channel?: TicketChannel;
    assigned_user_id?: number;
    customer_id?: number;
    sla?: "all" | "healthy" | "breached";
    sort?: "activity_desc" | "created_desc" | "created_asc" | "priority_desc";
}

export interface TicketCreateInput {
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
}

export interface TicketUpdateInput {
    expected_version: number;
    subject?: string;
    priority?: TicketPriority;
    category?: string | null;
    tags?: string[];
    assigned_user_id?: number | null;
}

export interface TicketSettingsInput {
    reference_prefix?: string;
    first_response_minutes?: number;
    resolution_minutes?: number;
    default_priority?: TicketPriority;
    default_assignee_user_id?: number | null;
}

const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
    open: ["pending", "waiting_customer", "resolved", "closed"],
    pending: ["open", "waiting_customer", "resolved", "closed"],
    waiting_customer: ["open", "pending", "resolved", "closed"],
    resolved: ["open", "closed"],
    closed: ["open"],
};

function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
}

function numberValue(value: unknown): number {
    return numberOrNull(value) ?? 0;
}

function ticketRow(row: DbRow): TicketRecord {
    return {
        ...row,
        id: numberValue(row.id),
        ticket_number: numberValue(row.ticket_number),
        reference: String(row.reference ?? ""),
        subject: String(row.subject ?? ""),
        status: String(row.status ?? "open") as TicketStatus,
        priority: String(row.priority ?? "normal") as TicketPriority,
        channel: String(row.channel ?? "admin") as TicketChannel,
        category: row.category === null || row.category === undefined ? null : String(row.category),
        customer_id: numberOrNull(row.customer_id),
        assigned_user_id: numberOrNull(row.assigned_user_id),
        created_by_user_id: numberOrNull(row.created_by_user_id),
        version: numberValue(row.version),
        tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
        resolved_at: row.resolved_at ?? null,
        closed_at: row.closed_at ?? null,
        first_response_at: row.first_response_at ?? null,
    };
}

function messageRow(row: DbRow): DbRow {
    return {
        ...row,
        id: numberValue(row.id),
        ticket_id: numberValue(row.ticket_id),
        author_user_id: numberOrNull(row.author_user_id),
        author_customer_id: numberOrNull(row.author_customer_id),
    };
}

function eventRow(row: DbRow): DbRow {
    return {
        ...row,
        id: numberValue(row.id),
        ticket_id: numberValue(row.ticket_id),
        actor_user_id: numberOrNull(row.actor_user_id),
        payload: typeof row.payload === "object" && row.payload !== null ? row.payload : {},
    };
}

function pagination(page = 1, limit = 25) {
    const safePage = Math.max(1, Math.trunc(page));
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

function sameValue(current: unknown, next: unknown): boolean {
    if (Array.isArray(current) && Array.isArray(next)) {
        return JSON.stringify(current) === JSON.stringify(next);
    }
    return current === next;
}

async function insertEvent(ticketId: number, actorUserId: number | null, eventType: string, payload: Record<string, unknown>) {
    await currentTrx()
        .table("support_ticket_events")
        .insert({
            ticket_id: ticketId,
            actor_user_id: actorUserId,
            event_type: eventType,
            payload: JSON.stringify(payload),
        });
}

async function ensureAssignee(userId: number | null | undefined): Promise<void> {
    if (userId === null || userId === undefined) return;
    const row = await currentTrx().from("users").where("id", userId).where("role", "admin").whereNull("deleted_at").first();
    if (!row) throw new Exception("Support assignee not found", { status: 422, code: "E_TICKET_ASSIGNEE_INVALID" });
}

async function ensureCustomer(customerId: number | null | undefined): Promise<void> {
    if (customerId === null || customerId === undefined) return;
    const row = await currentTrx().from("customers").where("id", customerId).whereNull("deleted_at").first();
    if (!row) throw new Exception("Support customer not found", { status: 422, code: "E_TICKET_CUSTOMER_INVALID" });
}

export class SupportTicketService {
    async settings() {
        const trx = currentTrx();
        const tenantId = Number(currentTenantId());
        await trx.table("support_ticket_settings").insert({ tenant_id: tenantId }).onConflict("tenant_id").ignore();
        const row = await trx.from("support_ticket_settings").where("tenant_id", tenantId).first();
        return {
            data: {
                ...row,
                tenant_id: numberValue(row.tenant_id),
                first_response_minutes: numberValue(row.first_response_minutes),
                resolution_minutes: numberValue(row.resolution_minutes),
                default_assignee_user_id: numberOrNull(row.default_assignee_user_id),
            },
        };
    }

    async updateSettings(input: TicketSettingsInput) {
        const current = (await this.settings()).data;
        const entries = Object.entries(input).filter(([, value]) => value !== undefined);
        if (entries.every(([key, value]) => sameValue(current[key as keyof typeof current], value))) {
            return { data: current, changed: false };
        }
        await ensureAssignee(input.default_assignee_user_id);
        const patch: Record<string, unknown> = { updated_at: new Date() };
        for (const [key, value] of entries) patch[key] = value;
        const [row] = await currentTrx()
            .from("support_ticket_settings")
            .where("tenant_id", Number(currentTenantId()))
            .update(patch)
            .returning("*");
        return {
            data: {
                ...row,
                tenant_id: numberValue(row.tenant_id),
                default_assignee_user_id: numberOrNull(row.default_assignee_user_id),
            },
            changed: true,
        };
    }

    async list(input: TicketListInput) {
        const trx = currentTrx();
        const { page, limit, offset } = pagination(input.page, input.limit);
        let query = trx
            .from("support_tickets as t")
            .leftJoin("users as assignee", "assignee.id", "t.assigned_user_id")
            .select("t.*", "assignee.email as assignee_email");

        if (input.q) {
            const term = `%${input.q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
            query = query.where((builder) => {
                builder
                    .whereILike("t.reference", term)
                    .orWhereILike("t.subject", term)
                    .orWhereILike("t.requester_name", term)
                    .orWhereILike("t.requester_email", term)
                    .orWhereILike("t.requester_phone", term);
            });
        }
        if (input.status) query = query.where("t.status", input.status);
        if (input.priority) query = query.where("t.priority", input.priority);
        if (input.channel) query = query.where("t.channel", input.channel);
        if (input.assigned_user_id) query = query.where("t.assigned_user_id", input.assigned_user_id);
        if (input.customer_id) query = query.where("t.customer_id", input.customer_id);
        if (input.sla === "breached") {
            query = query.where((builder) => {
                builder
                    .where((nested) =>
                        nested.whereNull("t.first_response_at").where("t.first_response_due_at", "<", trx.raw("now()")),
                    )
                    .orWhere((nested) =>
                        nested.whereNotIn("t.status", ["resolved", "closed"]).where("t.resolution_due_at", "<", trx.raw("now()")),
                    );
            });
        }
        if (input.sla === "healthy") {
            query = query.whereNot((builder) => {
                builder
                    .where((nested) =>
                        nested.whereNull("t.first_response_at").where("t.first_response_due_at", "<", trx.raw("now()")),
                    )
                    .orWhere((nested) =>
                        nested.whereNotIn("t.status", ["resolved", "closed"]).where("t.resolution_due_at", "<", trx.raw("now()")),
                    );
            });
        }

        const countQuery = query.clone().clearSelect().clearOrder().count("t.id as total").first();
        if (input.sort === "created_desc") query = query.orderBy("t.created_at", "desc");
        else if (input.sort === "created_asc") query = query.orderBy("t.created_at", "asc");
        else if (input.sort === "priority_desc") {
            query = query
                .orderByRaw("CASE t.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC")
                .orderBy("t.last_message_at", "desc");
        } else query = query.orderBy("t.last_message_at", "desc");

        const [countRow, rows] = await Promise.all([countQuery, query.limit(limit).offset(offset)]);
        const total = numberValue(countRow?.total);
        return {
            data: rows.map((row) => ticketRow(row as DbRow)),
            meta: { page, perPage: limit, total, lastPage: Math.max(1, Math.ceil(total / limit)) },
        };
    }

    async find(ticketId: number): Promise<{ data: TicketDetail }> {
        const trx = currentTrx();
        const row = await trx
            .from("support_tickets as t")
            .leftJoin("users as assignee", "assignee.id", "t.assigned_user_id")
            .leftJoin("customers as c", "c.id", "t.customer_id")
            .select(
                "t.*",
                "assignee.email as assignee_email",
                "c.first_name as customer_first_name",
                "c.last_name as customer_last_name",
            )
            .where("t.id", ticketId)
            .first();
        if (!row) throw new Exception("Support ticket not found", { status: 404, code: "E_TICKET_NOT_FOUND" });

        const [messages, events] = await Promise.all([
            trx
                .from("support_ticket_messages as m")
                .leftJoin("users as author", "author.id", "m.author_user_id")
                .select("m.*", "author.email as author_email")
                .where("m.ticket_id", ticketId)
                .orderBy("m.created_at", "asc"),
            trx
                .from("support_ticket_events as e")
                .leftJoin("users as actor", "actor.id", "e.actor_user_id")
                .select("e.*", "actor.email as actor_email")
                .where("e.ticket_id", ticketId)
                .orderBy("e.created_at", "desc"),
        ]);
        return {
            data: {
                ...ticketRow(row as DbRow),
                messages: messages.map((item) => messageRow(item as DbRow)),
                events: events.map((item) => eventRow(item as DbRow)),
            },
        };
    }

    async create(input: TicketCreateInput, actorUserId: number | null) {
        await ensureCustomer(input.customer_id);
        await ensureAssignee(input.assigned_user_id);
        const settings = (await this.settings()).data;
        const ticketNumber = Number(await nextNumber("ticket"));
        if (!Number.isSafeInteger(ticketNumber) || ticketNumber < 1) {
            throw new Exception("Ticket number is outside the supported numeric range", {
                status: 500,
                code: "E_TICKET_NUMBER_RANGE",
            });
        }
        const prefix = String(settings.reference_prefix ?? "TKT").toUpperCase();
        const priority = input.priority ?? (settings.default_priority as TicketPriority) ?? "normal";
        const assignedUserId =
            input.assigned_user_id === undefined ? numberOrNull(settings.default_assignee_user_id) : input.assigned_user_id;
        await ensureAssignee(assignedUserId);
        const trx = currentTrx();
        const now = new Date();
        const [row] = await trx
            .table("support_tickets")
            .insert({
                ticket_number: ticketNumber,
                reference: `${prefix}-${ticketNumber}`,
                customer_id: input.customer_id ?? null,
                requester_name: input.requester_name,
                requester_email: input.requester_email ?? null,
                requester_phone: input.requester_phone ?? null,
                subject: input.subject,
                status: "open",
                priority,
                channel: input.channel ?? "admin",
                category: input.category ?? null,
                tags: JSON.stringify(input.tags ?? []),
                assigned_user_id: assignedUserId ?? null,
                created_by_user_id: actorUserId,
                first_response_due_at: new Date(now.getTime() + numberValue(settings.first_response_minutes) * 60_000),
                resolution_due_at: new Date(now.getTime() + numberValue(settings.resolution_minutes) * 60_000),
                last_message_at: now,
            })
            .returning("*");
        const ticketId = numberValue(row.id);
        await trx.table("support_ticket_messages").insert({
            ticket_id: ticketId,
            author_user_id: null,
            author_customer_id: input.customer_id ?? null,
            kind: "requester_message",
            body: input.message,
        });
        await insertEvent(ticketId, actorUserId, "ticket.created", {
            status: "open",
            priority,
            assigned_user_id: assignedUserId ?? null,
            customer_id: input.customer_id ?? null,
        });
        return this.find(ticketId);
    }

    async update(ticketId: number, input: TicketUpdateInput, actorUserId: number | null) {
        await ensureAssignee(input.assigned_user_id);
        const current = (await this.find(ticketId)).data;
        const patch: Record<string, unknown> = {};
        const changedFields: string[] = [];
        for (const key of ["subject", "priority", "category", "tags", "assigned_user_id"] as const) {
            const value = input[key];
            if (value === undefined || sameValue(current[key], value)) continue;
            patch[key] = key === "tags" ? JSON.stringify(value) : value;
            changedFields.push(key);
        }
        if (changedFields.length === 0) return { data: current, changed: false };
        patch.updated_at = new Date();
        patch.version = input.expected_version + 1;
        const [row] = await currentTrx()
            .from("support_tickets")
            .where("id", ticketId)
            .where("version", input.expected_version)
            .update(patch)
            .returning("*");
        if (!row)
            throw new Exception("Support ticket changed by another operator", { status: 409, code: "E_TICKET_VERSION_CONFLICT" });
        await insertEvent(ticketId, actorUserId, "ticket.updated", { fields: changedFields });
        return { ...(await this.find(ticketId)), changed: true };
    }

    async transition(
        ticketId: number,
        status: TicketStatus,
        expectedVersion: number,
        reason: string | null | undefined,
        actorUserId: number | null,
    ) {
        const current = (await this.find(ticketId)).data;
        const currentStatus = String(current.status) as TicketStatus;
        if (currentStatus === status) return { data: current, changed: false };
        if (!ALLOWED_TRANSITIONS[currentStatus]?.includes(status)) {
            throw new Exception("Support ticket status transition is not allowed", {
                status: 422,
                code: "E_TICKET_TRANSITION_INVALID",
            });
        }
        const patch: Record<string, unknown> = {
            status,
            version: expectedVersion + 1,
            updated_at: new Date(),
            resolved_at: status === "resolved" ? new Date() : status === "open" ? null : current.resolved_at,
            closed_at: status === "closed" ? new Date() : status === "open" ? null : current.closed_at,
        };
        const [row] = await currentTrx()
            .from("support_tickets")
            .where("id", ticketId)
            .where("version", expectedVersion)
            .update(patch)
            .returning("*");
        if (!row)
            throw new Exception("Support ticket changed by another operator", { status: 409, code: "E_TICKET_VERSION_CONFLICT" });
        await insertEvent(ticketId, actorUserId, "ticket.status_changed", {
            from: currentStatus,
            to: status,
            reason: reason ?? null,
        });
        return { ...(await this.find(ticketId)), changed: true };
    }

    async addMessage(
        ticketId: number,
        kind: "reply" | "internal_note",
        body: string,
        expectedVersion: number,
        actorUserId: number | null,
    ) {
        const current = (await this.find(ticketId)).data;
        const now = new Date();
        const patch: Record<string, unknown> = { last_message_at: now, updated_at: now, version: expectedVersion + 1 };
        if (kind === "reply" && current.first_response_at === null) patch.first_response_at = now;
        const [ticket] = await currentTrx()
            .from("support_tickets")
            .where("id", ticketId)
            .where("version", expectedVersion)
            .update(patch)
            .returning("*");
        if (!ticket)
            throw new Exception("Support ticket changed by another operator", { status: 409, code: "E_TICKET_VERSION_CONFLICT" });
        const [message] = await currentTrx()
            .table("support_ticket_messages")
            .insert({ ticket_id: ticketId, author_user_id: actorUserId, author_customer_id: null, kind, body })
            .returning("*");
        await insertEvent(ticketId, actorUserId, kind === "reply" ? "message.reply" : "message.internal_note", {
            message_id: numberValue(message.id),
        });
        return { data: messageRow(message as DbRow), ticket: ticketRow(ticket as DbRow) };
    }

    async summary() {
        const result = await currentTrx().rawQuery(`
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status IN ('open','pending','waiting_customer'))::int AS active,
                COUNT(*) FILTER (WHERE status = 'waiting_customer')::int AS waiting_customer,
                COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= now() - interval '30 days')::int AS resolved_30d,
                COUNT(*) FILTER (
                    WHERE (first_response_at IS NULL AND first_response_due_at < now())
                       OR (status NOT IN ('resolved','closed') AND resolution_due_at < now())
                )::int AS sla_breached,
                COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60) FILTER (WHERE first_response_at IS NOT NULL))::int, 0) AS avg_first_response_minutes,
                COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60) FILTER (WHERE resolved_at IS NOT NULL))::int, 0) AS avg_resolution_minutes
            FROM support_tickets
        `);
        const row = result.rows[0] ?? {};
        return { data: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, numberValue(value)])) };
    }

    async trends() {
        const result = await currentTrx().rawQuery(`
            WITH days AS (
                SELECT generate_series(current_date - interval '29 days', current_date, interval '1 day')::date AS day
            )
            SELECT days.day,
                COUNT(t.id) FILTER (WHERE t.created_at::date = days.day)::int AS opened,
                COUNT(t.id) FILTER (WHERE t.resolved_at::date = days.day)::int AS resolved
            FROM days
            LEFT JOIN support_tickets t ON t.created_at::date = days.day OR t.resolved_at::date = days.day
            GROUP BY days.day
            ORDER BY days.day ASC
        `);
        return {
            data: result.rows.map((row: DbRow) => ({
                day: row.day,
                opened: numberValue(row.opened),
                resolved: numberValue(row.resolved),
            })),
        };
    }

    async resources(kind: "customers" | "assignees", q = "", limit = 30) {
        const trx = currentTrx();
        const safeLimit = Math.max(1, Math.min(50, limit));
        if (kind === "assignees") {
            let query = trx
                .from("users")
                .select("id", "email")
                .where("role", "admin")
                .whereNull("deleted_at")
                .orderBy("email", "asc");
            if (q) query = query.whereILike("email", `%${q}%`);
            const rows = await query.limit(safeLimit);
            return { data: rows.map((row) => ({ id: numberValue(row.id), label: String(row.email), email: String(row.email) })) };
        }
        let query = trx
            .from("customers as c")
            .leftJoin("users as u", "u.id", "c.user_id")
            .select("c.id", "c.first_name", "c.last_name", "c.phone", "u.email")
            .whereNull("c.deleted_at")
            .orderBy("c.created_at", "desc");
        if (q) {
            query = query.where((builder) => {
                builder
                    .whereILike("c.first_name", `%${q}%`)
                    .orWhereILike("c.last_name", `%${q}%`)
                    .orWhereILike("c.phone", `%${q}%`)
                    .orWhereILike("u.email", `%${q}%`);
            });
        }
        const rows = await query.limit(safeLimit);
        return {
            data: rows.map((row) => ({
                id: numberValue(row.id),
                label: `${String(row.first_name)} ${String(row.last_name)}`.trim(),
                phone: row.phone ?? null,
                email: row.email ?? null,
            })),
        };
    }
}

export const supportTicketService = new SupportTicketService();
