import { Exception } from "@adonisjs/core/exceptions";

import { supportTicketService } from "#services/support/ticket_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

const CORE_STATUSES = ["open", "pending", "waiting_customer", "resolved", "closed"] as const;
type CoreStatus = (typeof CORE_STATUSES)[number];
type DbRow = Record<string, unknown>;

function numberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function jsonValue(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }
    return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function serialize(row: DbRow): DbRow {
    const result: DbRow = { ...row };
    for (const key of [
        "id",
        "ticket_id",
        "message_id",
        "media_id",
        "owner_user_id",
        "user_id",
        "campaign_id",
        "source_ticket_id",
        "target_ticket_id",
        "version",
    ]) {
        if (key in result) result[key] = nullableNumber(result[key]);
    }
    for (const key of ["query", "configuration", "conditions", "actions", "quiet_hours"]) {
        if (key in result) result[key] = jsonValue(result[key]);
    }
    return result;
}

async function ensureAdmin(userId: number | null): Promise<void> {
    if (userId === null) return;
    const row = await currentTrx().from("users").where("id", userId).where("role", "admin").whereNull("deleted_at").first();
    if (!row) throw new Exception("Support assignee not found", { status: 422, code: "E_TICKET_ASSIGNEE_INVALID" });
}

async function event(ticketId: number, actorUserId: number | null, eventType: string, payload: Record<string, unknown>) {
    await currentTrx()
        .table("support_ticket_events")
        .insert({
            ticket_id: ticketId,
            actor_user_id: actorUserId,
            event_type: eventType,
            payload: JSON.stringify(payload),
        });
}

function validateSavedViewQuery(query: Record<string, unknown>) {
    const allowed = new Set(["q", "status", "priority", "channel", "assigned_user_id", "customer_id", "sla", "sort"]);
    for (const key of Object.keys(query)) {
        if (!allowed.has(key))
            throw new Exception("Unsupported saved-view filter", { status: 422, code: "E_TICKET_SAVED_VIEW_QUERY" });
    }
    if (query.status !== undefined && !CORE_STATUSES.includes(String(query.status) as CoreStatus)) {
        throw new Exception("Unsupported saved-view status", { status: 422, code: "E_TICKET_SAVED_VIEW_QUERY" });
    }
}

function validateRuleObject(input: Record<string, unknown>, kind: "conditions" | "actions") {
    const allowedConditionKeys = new Set([
        "status",
        "priority",
        "channel",
        "category",
        "assigned_user_id",
        "sla_breached",
        "tags_any",
    ]);
    const allowedActionKeys = new Set(["assign_user_id", "priority", "category", "add_tags", "status"]);
    const allowed = kind === "conditions" ? allowedConditionKeys : allowedActionKeys;
    for (const key of Object.keys(input)) {
        if (!allowed.has(key))
            throw new Exception(`Unsupported support ${kind} key`, { status: 422, code: "E_SUPPORT_RULE_SHAPE" });
    }
}

export class TicketOperationsService {
    async workflowStatuses() {
        await this.ensureDefaultWorkflowStatuses();
        const rows = await currentTrx()
            .from("support_ticket_workflow_statuses")
            .orderBy("sort_order", "asc")
            .orderBy("id", "asc");
        return { data: rows.map((row) => serialize(row as DbRow)) };
    }

    async ensureDefaultWorkflowStatuses() {
        const defaults = [
            {
                code: "open",
                label_fa: "باز",
                label_en: "Open",
                semantic_group: "active",
                is_terminal: false,
                is_customer_waiting: false,
                sort_order: 10,
            },
            {
                code: "pending",
                label_fa: "در انتظار",
                label_en: "Pending",
                semantic_group: "waiting",
                is_terminal: false,
                is_customer_waiting: false,
                sort_order: 20,
            },
            {
                code: "waiting_customer",
                label_fa: "منتظر مشتری",
                label_en: "Waiting for customer",
                semantic_group: "waiting",
                is_terminal: false,
                is_customer_waiting: true,
                sort_order: 30,
            },
            {
                code: "resolved",
                label_fa: "حل‌شده",
                label_en: "Resolved",
                semantic_group: "resolved",
                is_terminal: true,
                is_customer_waiting: false,
                sort_order: 40,
            },
            {
                code: "closed",
                label_fa: "بسته",
                label_en: "Closed",
                semantic_group: "closed",
                is_terminal: true,
                is_customer_waiting: false,
                sort_order: 50,
            },
        ];
        for (const item of defaults) {
            await currentTrx().table("support_ticket_workflow_statuses").insert(item).onConflict(["tenant_id", "code"]).ignore();
        }
    }

    async createWorkflowStatus(input: Record<string, unknown>) {
        await this.ensureDefaultWorkflowStatuses();
        const [row] = await currentTrx().table("support_ticket_workflow_statuses").insert(input).returning("*");
        return { data: serialize(row as DbRow) };
    }

    async savedViews(actorUserId: number) {
        const rows = await currentTrx()
            .from("support_ticket_saved_views")
            .where((query) => query.where("owner_user_id", actorUserId).orWhere("is_shared", true))
            .orderBy("name", "asc");
        return { data: rows.map((row) => serialize(row as DbRow)) };
    }

    async createSavedView(actorUserId: number, input: { name: string; query: Record<string, unknown>; is_shared?: boolean }) {
        validateSavedViewQuery(input.query);
        const [row] = await currentTrx()
            .table("support_ticket_saved_views")
            .insert({
                owner_user_id: actorUserId,
                name: input.name,
                query: JSON.stringify(input.query),
                is_shared: input.is_shared ?? false,
            })
            .returning("*");
        return { data: serialize(row as DbRow) };
    }

    async updateSavedView(
        id: number,
        actorUserId: number,
        input: { name?: string; query?: Record<string, unknown>; is_shared?: boolean },
    ) {
        if (input.query) validateSavedViewQuery(input.query);
        const current = await currentTrx()
            .from("support_ticket_saved_views")
            .where("id", id)
            .where("owner_user_id", actorUserId)
            .first();
        if (!current) throw new Exception("Saved view not found", { status: 404, code: "E_TICKET_SAVED_VIEW_NOT_FOUND" });
        const patch: Record<string, unknown> = { updated_at: new Date() };
        if (input.name !== undefined) patch.name = input.name;
        if (input.query !== undefined) patch.query = JSON.stringify(input.query);
        if (input.is_shared !== undefined) patch.is_shared = input.is_shared;
        const [row] = await currentTrx()
            .from("support_ticket_saved_views")
            .where("id", id)
            .where("owner_user_id", actorUserId)
            .update(patch)
            .returning("*");
        return { data: serialize(row as DbRow) };
    }

    async deleteSavedView(id: number, actorUserId: number) {
        const deleted = await currentTrx()
            .from("support_ticket_saved_views")
            .where("id", id)
            .where("owner_user_id", actorUserId)
            .delete();
        if (!deleted) throw new Exception("Saved view not found", { status: 404, code: "E_TICKET_SAVED_VIEW_NOT_FOUND" });
    }

    async bulk(
        input: {
            tickets: Array<{ id: number; expected_version: number }>;
            operation: "assign" | "priority" | "category" | "tags" | "transition";
            assigned_user_id?: number | null;
            priority?: "low" | "normal" | "high" | "urgent";
            category?: string | null;
            tags?: string[];
            status?: CoreStatus;
            reason?: string | null;
        },
        actorUserId: number,
    ) {
        const ids = input.tickets.map((item) => item.id);
        if (new Set(ids).size !== ids.length)
            throw new Exception("Duplicate ticket ids are not allowed", { status: 422, code: "E_TICKET_BULK_DUPLICATE" });
        if (input.operation === "assign") await ensureAdmin(input.assigned_user_id ?? null);
        const results: Array<Record<string, unknown>> = [];
        for (const item of input.tickets) {
            try {
                if (input.operation === "transition") {
                    if (!input.status)
                        throw new Exception("Bulk transition requires status", { status: 422, code: "E_TICKET_BULK_PAYLOAD" });
                    const result = await supportTicketService.transition(
                        item.id,
                        input.status,
                        item.expected_version,
                        input.reason,
                        actorUserId,
                    );
                    results.push({ id: item.id, ok: true, version: result.data.version, changed: result.changed });
                    continue;
                }
                const patch: Record<string, unknown> = { expected_version: item.expected_version };
                if (input.operation === "assign") patch.assigned_user_id = input.assigned_user_id ?? null;
                if (input.operation === "priority") {
                    if (!input.priority)
                        throw new Exception("Bulk priority requires priority", { status: 422, code: "E_TICKET_BULK_PAYLOAD" });
                    patch.priority = input.priority;
                }
                if (input.operation === "category") patch.category = input.category ?? null;
                if (input.operation === "tags") patch.tags = input.tags ?? [];
                const result = await supportTicketService.update(item.id, patch as never, actorUserId);
                results.push({ id: item.id, ok: true, version: result.data.version, changed: result.changed });
            } catch (error) {
                const candidate = error as { code?: string; status?: number; message?: string };
                results.push({
                    id: item.id,
                    ok: false,
                    code: candidate.code ?? "E_TICKET_BULK_ITEM",
                    status: candidate.status ?? 422,
                    message: candidate.message ?? "Ticket operation failed",
                });
            }
        }
        return {
            data: results,
            meta: {
                requested: input.tickets.length,
                succeeded: results.filter((item) => item.ok).length,
                failed: results.filter((item) => !item.ok).length,
            },
        };
    }

    async addAttachment(
        ticketId: number,
        input: { media_id: number; message_id?: number | null; sha256?: string | null },
        actorUserId: number,
    ) {
        const trx = currentTrx();
        const ticket = await trx.from("support_tickets").where("id", ticketId).first();
        if (!ticket) throw new Exception("Support ticket not found", { status: 404, code: "E_TICKET_NOT_FOUND" });
        const media = await trx.from("media").where("id", input.media_id).first();
        if (!media) throw new Exception("Media not found", { status: 422, code: "E_TICKET_ATTACHMENT_MEDIA" });
        if (input.message_id) {
            const message = await trx
                .from("support_ticket_messages")
                .where("id", input.message_id)
                .where("ticket_id", ticketId)
                .first();
            if (!message) throw new Exception("Ticket message not found", { status: 422, code: "E_TICKET_ATTACHMENT_MESSAGE" });
        }
        const [row] = await trx
            .table("support_ticket_attachments")
            .insert({
                ticket_id: ticketId,
                message_id: input.message_id ?? null,
                media_id: input.media_id,
                uploaded_by_user_id: actorUserId,
                filename: String(media.filename ?? `media-${input.media_id}`),
                mime: String(media.mime ?? "application/octet-stream"),
                size_bytes: numberValue(media.size_bytes),
                sha256: input.sha256 ?? null,
                scan_status: "pending",
            })
            .returning("*");
        await event(ticketId, actorUserId, "ticket.attachment.added", {
            attachment_id: numberValue(row.id),
            media_id: input.media_id,
            scan_status: "pending",
        });
        return { data: serialize(row as DbRow) };
    }

    async updateAttachmentScan(
        id: number,
        input: { status: "clean" | "infected" | "error"; evidence?: string | null },
        actorUserId: number,
    ) {
        const current = await currentTrx().from("support_ticket_attachments").where("id", id).forUpdate().first();
        if (!current) throw new Exception("Ticket attachment not found", { status: 404, code: "E_TICKET_ATTACHMENT_NOT_FOUND" });
        if (String(current.scan_status) !== "pending" && String(current.scan_status) !== "error") {
            throw new Exception("Attachment scan result is immutable", { status: 409, code: "E_TICKET_ATTACHMENT_SCAN_FINAL" });
        }
        const [row] = await currentTrx()
            .from("support_ticket_attachments")
            .where("id", id)
            .update({
                scan_status: input.status,
                scan_evidence: input.evidence ?? null,
                scanned_at: new Date(),
            })
            .returning("*");
        await event(numberValue(row.ticket_id), actorUserId, "ticket.attachment.scanned", {
            attachment_id: id,
            status: input.status,
        });
        return { data: serialize(row as DbRow) };
    }

    async attachments(ticketId: number) {
        const rows = await currentTrx()
            .from("support_ticket_attachments")
            .where("ticket_id", ticketId)
            .orderBy("created_at", "asc");
        return { data: rows.map((row) => serialize(row as DbRow)) };
    }

    async merge(
        sourceTicketId: number,
        input: {
            target_ticket_id: number;
            expected_source_version: number;
            expected_target_version: number;
            reason?: string | null;
        },
        actorUserId: number,
    ) {
        if (sourceTicketId === input.target_ticket_id)
            throw new Exception("A ticket cannot be merged into itself", { status: 422, code: "E_TICKET_MERGE_SELF" });
        const firstId = Math.min(sourceTicketId, input.target_ticket_id);
        const secondId = Math.max(sourceTicketId, input.target_ticket_id);
        const rows = await currentTrx()
            .from("support_tickets")
            .whereIn("id", [firstId, secondId])
            .orderBy("id", "asc")
            .forUpdate();
        if (rows.length !== 2) throw new Exception("Support ticket not found", { status: 404, code: "E_TICKET_NOT_FOUND" });
        const source = rows.find((row) => numberValue(row.id) === sourceTicketId) as DbRow;
        const target = rows.find((row) => numberValue(row.id) === input.target_ticket_id) as DbRow;
        if (
            numberValue(source.version) !== input.expected_source_version ||
            numberValue(target.version) !== input.expected_target_version
        ) {
            throw new Exception("Support ticket changed by another operator", { status: 409, code: "E_TICKET_VERSION_CONFLICT" });
        }
        const reverse = await currentTrx()
            .from("support_ticket_merges")
            .where("source_ticket_id", input.target_ticket_id)
            .where("target_ticket_id", sourceTicketId)
            .first();
        if (reverse) throw new Exception("Ticket merge would create a loop", { status: 409, code: "E_TICKET_MERGE_LOOP" });
        const [mergeRow] = await currentTrx()
            .table("support_ticket_merges")
            .insert({
                source_ticket_id: sourceTicketId,
                target_ticket_id: input.target_ticket_id,
                merged_by_user_id: actorUserId,
                reason: input.reason ?? null,
            })
            .returning("*");
        await currentTrx()
            .from("support_tickets")
            .where("id", sourceTicketId)
            .where("version", input.expected_source_version)
            .update({
                status: "closed",
                version: input.expected_source_version + 1,
                closed_at: new Date(),
                updated_at: new Date(),
            });
        await event(sourceTicketId, actorUserId, "ticket.merged", {
            target_ticket_id: input.target_ticket_id,
            merge_id: numberValue(mergeRow.id),
            reason: input.reason ?? null,
        });
        await event(input.target_ticket_id, actorUserId, "ticket.merge.received", {
            source_ticket_id: sourceTicketId,
            merge_id: numberValue(mergeRow.id),
        });
        return { data: serialize(mergeRow as DbRow) };
    }

    async presence() {
        const rows = await currentTrx()
            .from("support_agent_presence as p")
            .leftJoin("users as u", "u.id", "p.user_id")
            .select("p.*", "u.email")
            .orderBy("p.state", "asc")
            .orderBy("u.email", "asc");
        const now = Date.now();
        return {
            data: rows.map((row) => {
                const heartbeat = row.last_heartbeat_at ? new Date(String(row.last_heartbeat_at)).getTime() : 0;
                const stale = heartbeat === 0 || now - heartbeat > 90_000;
                return { ...serialize(row as DbRow), effective_state: stale ? "offline" : row.state, stale };
            }),
        };
    }

    async heartbeat(userId: number, input: { state: "offline" | "available" | "busy" | "away"; capacity: number }) {
        const active = await currentTrx()
            .from("support_tickets")
            .where("assigned_user_id", userId)
            .whereNotIn("status", ["resolved", "closed"])
            .count("id as total")
            .first();
        const payload = {
            tenant_id: currentTenantId(),
            user_id: userId,
            state: input.state,
            capacity: input.capacity,
            active_count: numberValue(active?.total),
            last_heartbeat_at: new Date(),
            updated_at: new Date(),
        };
        await currentTrx().table("support_agent_presence").insert(payload).onConflict(["tenant_id", "user_id"]).merge(payload);
        const row = await currentTrx().from("support_agent_presence").where("user_id", userId).first();
        return { data: serialize(row as DbRow) };
    }

    async channels() {
        const rows = await currentTrx().from("support_channel_integrations").orderBy("channel", "asc");
        return {
            data: rows.map((row) => ({
                ...serialize(row as DbRow),
                credential_configured: Boolean(row.credential_env_ref && process.env[String(row.credential_env_ref)]),
                credential_value: undefined,
            })),
        };
    }

    async configureChannel(input: {
        channel: string;
        enabled: boolean;
        credential_env_ref?: string | null;
        configuration?: Record<string, unknown>;
    }) {
        const envRef = input.credential_env_ref ?? null;
        const credentialConfigured = Boolean(envRef && process.env[envRef]);
        const status = input.enabled ? "configured" : "disabled";
        const payload = {
            tenant_id: currentTenantId(),
            channel: input.channel,
            status,
            credential_env_ref: envRef,
            configuration: JSON.stringify(input.configuration ?? {}),
            last_error:
                input.enabled && envRef && !credentialConfigured
                    ? "Credential environment reference is not available at runtime"
                    : null,
            last_verified_at: null,
            updated_at: new Date(),
        };
        await currentTrx()
            .table("support_channel_integrations")
            .insert(payload)
            .onConflict(["tenant_id", "channel"])
            .merge(payload);
        const row = await currentTrx().from("support_channel_integrations").where("channel", input.channel).first();
        return { data: { ...serialize(row as DbRow), credential_configured: credentialConfigured } };
    }

    async routingRules() {
        const rows = await currentTrx().from("support_routing_rules").orderBy("priority", "asc").orderBy("id", "asc");
        return { data: rows.map((row) => serialize(row as DbRow)) };
    }

    async createRoutingRule(input: {
        name: string;
        priority?: number;
        enabled?: boolean;
        conditions: Record<string, unknown>;
        actions: Record<string, unknown>;
    }) {
        validateRuleObject(input.conditions, "conditions");
        validateRuleObject(input.actions, "actions");
        const [row] = await currentTrx()
            .table("support_routing_rules")
            .insert({ ...input, conditions: JSON.stringify(input.conditions), actions: JSON.stringify(input.actions) })
            .returning("*");
        return { data: serialize(row as DbRow) };
    }

    async updateRoutingRule(
        id: number,
        input: {
            expected_version: number;
            name?: string;
            priority?: number;
            enabled?: boolean;
            conditions?: Record<string, unknown>;
            actions?: Record<string, unknown>;
        },
    ) {
        if (input.conditions) validateRuleObject(input.conditions, "conditions");
        if (input.actions) validateRuleObject(input.actions, "actions");
        const patch: Record<string, unknown> = { version: input.expected_version + 1, updated_at: new Date() };
        for (const key of ["name", "priority", "enabled"] as const) if (input[key] !== undefined) patch[key] = input[key];
        if (input.conditions) patch.conditions = JSON.stringify(input.conditions);
        if (input.actions) patch.actions = JSON.stringify(input.actions);
        const [row] = await currentTrx()
            .from("support_routing_rules")
            .where("id", id)
            .where("version", input.expected_version)
            .update(patch)
            .returning("*");
        if (!row)
            throw new Exception("Support routing rule changed or was not found", { status: 409, code: "E_SUPPORT_RULE_VERSION" });
        return { data: serialize(row as DbRow) };
    }

    async automationRules() {
        const rows = await currentTrx().from("support_automation_rules").orderBy("id", "asc");
        return { data: rows.map((row) => serialize(row as DbRow)) };
    }

    async createAutomationRule(input: {
        name: string;
        trigger: string;
        enabled?: boolean;
        conditions: Record<string, unknown>;
        actions: Array<Record<string, unknown>>;
    }) {
        validateRuleObject(input.conditions, "conditions");
        for (const action of input.actions) validateRuleObject(action, "actions");
        const [row] = await currentTrx()
            .table("support_automation_rules")
            .insert({ ...input, conditions: JSON.stringify(input.conditions), actions: JSON.stringify(input.actions) })
            .returning("*");
        return { data: serialize(row as DbRow) };
    }

    async updateAutomationRule(
        id: number,
        input: {
            expected_version: number;
            name?: string;
            enabled?: boolean;
            conditions?: Record<string, unknown>;
            actions?: Array<Record<string, unknown>>;
        },
    ) {
        if (input.conditions) validateRuleObject(input.conditions, "conditions");
        if (input.actions) for (const action of input.actions) validateRuleObject(action, "actions");
        const patch: Record<string, unknown> = { version: input.expected_version + 1, updated_at: new Date() };
        if (input.name !== undefined) patch.name = input.name;
        if (input.enabled !== undefined) patch.enabled = input.enabled;
        if (input.conditions) patch.conditions = JSON.stringify(input.conditions);
        if (input.actions) patch.actions = JSON.stringify(input.actions);
        const [row] = await currentTrx()
            .from("support_automation_rules")
            .where("id", id)
            .where("version", input.expected_version)
            .update(patch)
            .returning("*");
        if (!row)
            throw new Exception("Support automation rule changed or was not found", {
                status: 409,
                code: "E_SUPPORT_AUTOMATION_VERSION",
            });
        return { data: serialize(row as DbRow) };
    }

    async campaigns() {
        const rows = await currentTrx().from("support_campaigns").orderBy("created_at", "desc");
        return { data: rows.map((row) => serialize(row as DbRow)) };
    }

    async createCampaign(input: {
        name: string;
        channel: string;
        template_body: string;
        quiet_hours?: Record<string, unknown>;
        estimated_cost_minor?: number;
        scheduled_at?: Date | null;
    }) {
        const [row] = await currentTrx()
            .table("support_campaigns")
            .insert({
                name: input.name,
                channel: input.channel,
                status: input.scheduled_at ? "scheduled" : "draft",
                template_status: "draft",
                template_body: input.template_body,
                quiet_hours: JSON.stringify(input.quiet_hours ?? {}),
                estimated_cost_minor: input.estimated_cost_minor ?? 0,
                scheduled_at: input.scheduled_at ?? null,
            })
            .returning("*");
        return { data: serialize(row as DbRow) };
    }

    async addCampaignRecipients(id: number, expectedVersion: number, recipients: string[]) {
        const campaign = await currentTrx().from("support_campaigns").where("id", id).forUpdate().first();
        if (!campaign) throw new Exception("Support campaign not found", { status: 404, code: "E_SUPPORT_CAMPAIGN_NOT_FOUND" });
        if (numberValue(campaign.version) !== expectedVersion)
            throw new Exception("Support campaign changed", { status: 409, code: "E_SUPPORT_CAMPAIGN_VERSION" });
        if (!["draft", "scheduled", "paused"].includes(String(campaign.status)))
            throw new Exception("Campaign recipients cannot be changed after delivery starts", {
                status: 409,
                code: "E_SUPPORT_CAMPAIGN_IMMUTABLE",
            });
        const unique = [...new Set(recipients.map((value) => value.trim().toLowerCase()).filter(Boolean))];
        for (const recipient of unique) {
            await currentTrx()
                .table("support_campaign_recipients")
                .insert({ campaign_id: id, recipient_key: recipient })
                .onConflict(["tenant_id", "campaign_id", "recipient_key"])
                .ignore();
        }
        await currentTrx()
            .from("support_campaigns")
            .where("id", id)
            .where("version", expectedVersion)
            .update({ version: expectedVersion + 1, updated_at: new Date() });
        const total = await currentTrx()
            .from("support_campaign_recipients")
            .where("campaign_id", id)
            .count("id as total")
            .first();
        return { data: { campaign_id: id, version: expectedVersion + 1, recipients: numberValue(total?.total) } };
    }

    async transitionCampaign(id: number, expectedVersion: number, status: "scheduled" | "paused" | "cancelled") {
        const row = await currentTrx().from("support_campaigns").where("id", id).first();
        if (!row) throw new Exception("Support campaign not found", { status: 404, code: "E_SUPPORT_CAMPAIGN_NOT_FOUND" });
        if (numberValue(row.version) !== expectedVersion)
            throw new Exception("Support campaign changed", { status: 409, code: "E_SUPPORT_CAMPAIGN_VERSION" });
        if (status === "scheduled") {
            if (!row.scheduled_at)
                throw new Exception("Campaign needs a schedule before scheduling", {
                    status: 422,
                    code: "E_SUPPORT_CAMPAIGN_SCHEDULE",
                });
            if (String(row.template_status) !== "approved")
                throw new Exception("Campaign template must be approved before scheduling", {
                    status: 422,
                    code: "E_SUPPORT_CAMPAIGN_TEMPLATE",
                });
            const channel = await currentTrx().from("support_channel_integrations").where("channel", row.channel).first();
            if (!channel || String(channel.status) !== "connected")
                throw new Exception("Campaign channel is not verified as connected", {
                    status: 422,
                    code: "E_SUPPORT_CHANNEL_NOT_CONNECTED",
                });
        }
        const [updated] = await currentTrx()
            .from("support_campaigns")
            .where("id", id)
            .where("version", expectedVersion)
            .update({ status, version: expectedVersion + 1, updated_at: new Date() })
            .returning("*");
        return { data: serialize(updated as DbRow) };
    }

    async reports() {
        const trx = currentTrx();
        const [backlog, sla, byAssignee, csat, reopened] = await Promise.all([
            trx
                .from("support_tickets")
                .whereNotIn("status", ["resolved", "closed"])
                .select("priority")
                .count("id as total")
                .groupBy("priority"),
            trx.rawQuery(`SELECT
                COUNT(*) FILTER (WHERE first_response_at IS NULL AND first_response_due_at < NOW())::bigint AS first_response_breached,
                COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed') AND resolution_due_at < NOW())::bigint AS resolution_breached,
                AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))/60) FILTER (WHERE first_response_at IS NOT NULL) AS avg_first_response_minutes,
                AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, closed_at) - created_at))/60) FILTER (WHERE resolved_at IS NOT NULL OR closed_at IS NOT NULL) AS avg_resolution_minutes
                FROM support_tickets`),
            trx
                .from("support_tickets as t")
                .leftJoin("users as u", "u.id", "t.assigned_user_id")
                .whereNotIn("t.status", ["resolved", "closed"])
                .select("t.assigned_user_id", "u.email")
                .count("t.id as active")
                .groupBy("t.assigned_user_id", "u.email")
                .orderBy("active", "desc"),
            trx.from("support_csat_responses").avg("score as average").count("id as responses").first(),
            trx.rawQuery(
                `SELECT COUNT(DISTINCT ticket_id)::bigint AS total FROM support_ticket_events WHERE event_type = 'ticket.status_changed' AND payload->>'from' IN ('resolved','closed') AND payload->>'to' = 'open'`,
            ),
        ]);
        const slaRow = ((sla.rows ?? sla) as DbRow[])[0] ?? {};
        const reopenedRow = ((reopened.rows ?? reopened) as DbRow[])[0] ?? {};
        return {
            data: {
                backlog: backlog.map((row) => ({ priority: row.priority, total: numberValue(row.total) })),
                sla: {
                    first_response_breached: numberValue(slaRow.first_response_breached),
                    resolution_breached: numberValue(slaRow.resolution_breached),
                    avg_first_response_minutes: Number(slaRow.avg_first_response_minutes ?? 0),
                    avg_resolution_minutes: Number(slaRow.avg_resolution_minutes ?? 0),
                },
                csat: { average: Number(csat?.average ?? 0), responses: numberValue(csat?.responses) },
                reopened_tickets: numberValue(reopenedRow.total),
                fcr_proxy: { definition: "resolved tickets that were not later reopened", evidence: "support_ticket_events" },
                assignees: byAssignee.map((row) => ({
                    assigned_user_id: nullableNumber(row.assigned_user_id),
                    email: row.email ?? null,
                    active: numberValue(row.active),
                })),
            },
        };
    }
}

export const ticketOperationsService = new TicketOperationsService();
