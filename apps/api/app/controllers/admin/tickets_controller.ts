import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { CacheInvalidation } from "#services/cache_invalidation";
import { ticketQueueService } from "#services/support/ticket_queue_service";
import { scheduleTicketRealtime } from "#services/support/ticket_realtime";
import { supportTicketService } from "#services/support/ticket_service";
import { currentTenantId } from "#services/tenant_context";
import {
    adminTicketCreateValidator,
    adminTicketListValidator,
    adminTicketMessageValidator,
    adminTicketResourceValidator,
    adminTicketSettingsValidator,
    adminTicketTransitionValidator,
    adminTicketUpdateValidator,
} from "#validators/admin/ticket_validator";

function id(ctx: HttpContext): number {
    const value = Number(ctx.params.id);
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Exception("Invalid support ticket identifier", { status: 422, code: "E_TICKET_INVALID_ID" });
    }
    return value;
}

async function actorId(ctx: HttpContext): Promise<number> {
    const user = await ctx.auth.authenticate();
    return Number(user.id);
}

async function assertExpectedVersion(ticketId: number, expectedVersion: number): Promise<void> {
    const current = await supportTicketService.find(ticketId);
    if (Number(current.data.version) !== expectedVersion) {
        throw new Exception("Support ticket changed by another operator", {
            status: 409,
            code: "E_TICKET_VERSION_CONFLICT",
        });
    }
}

async function refreshLinkedCustomers(...customerIds: Array<number | null | undefined>) {
    const unique = [...new Set(customerIds.filter((value): value is number => Number.isSafeInteger(value) && Number(value) > 0))];
    for (const customerId of unique) await CacheInvalidation.customerChanged(currentTenantId(), customerId);
}

export default class TicketsController {
    async index(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminTicketListValidator);
        return ticketQueueService.list(payload);
    }

    async show(ctx: HttpContext) {
        return supportTicketService.find(id(ctx));
    }

    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminTicketCreateValidator);
        const result = await supportTicketService.create(payload, await actorId(ctx));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "support.ticket.create",
            entityKind: "support_ticket",
            entityId: Number(result.data.id),
            payload: { reference: result.data.reference, priority: result.data.priority, channel: result.data.channel },
        });
        await refreshLinkedCustomers(result.data.customer_id);
        await scheduleTicketRealtime(ctx, { type: "created", ticketId: Number(result.data.id) });
        return result;
    }

    async update(ctx: HttpContext) {
        const ticketId = id(ctx);
        const payload = await ctx.request.validateUsing(adminTicketUpdateValidator);
        const before = await supportTicketService.find(ticketId);
        if (Number(before.data.version) !== payload.expected_version) {
            throw new Exception("Support ticket changed by another operator", {
                status: 409,
                code: "E_TICKET_VERSION_CONFLICT",
            });
        }
        const result = await supportTicketService.update(ticketId, payload, await actorId(ctx));
        if (result.changed) {
            await recordAudit({
                ctx,
                action: "support.ticket.update",
                entityKind: "support_ticket",
                entityId: ticketId,
                payload: { expected_version: payload.expected_version },
            });
            await refreshLinkedCustomers(before.data.customer_id, result.data.customer_id);
            await scheduleTicketRealtime(ctx, { type: "updated", ticketId });
        }
        return result;
    }

    async transition(ctx: HttpContext) {
        const ticketId = id(ctx);
        const payload = await ctx.request.validateUsing(adminTicketTransitionValidator);
        await assertExpectedVersion(ticketId, payload.expected_version);
        const result = await supportTicketService.transition(
            ticketId,
            payload.status,
            payload.expected_version,
            payload.reason,
            await actorId(ctx),
        );
        if (result.changed) {
            await recordAudit({
                ctx,
                action: "support.ticket.transition",
                entityKind: "support_ticket",
                entityId: ticketId,
                payload: {
                    status: payload.status,
                    reason: payload.reason ?? null,
                    expected_version: payload.expected_version,
                },
            });
            await refreshLinkedCustomers(result.data.customer_id);
            await scheduleTicketRealtime(ctx, { type: "transitioned", ticketId });
        }
        return result;
    }

    async message(ctx: HttpContext) {
        const ticketId = id(ctx);
        const payload = await ctx.request.validateUsing(adminTicketMessageValidator);
        const result = await supportTicketService.addMessage(
            ticketId,
            payload.kind,
            payload.body,
            payload.expected_version,
            await actorId(ctx),
        );
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: payload.kind === "reply" ? "support.ticket.reply" : "support.ticket.internal_note",
            entityKind: "support_ticket",
            entityId: ticketId,
            payload: { message_id: result.data.id },
        });
        await scheduleTicketRealtime(ctx, { type: "message", ticketId });
        return result;
    }

    async summary() {
        return supportTicketService.summary();
    }

    async trends() {
        return supportTicketService.trends();
    }

    async settingsShow() {
        return supportTicketService.settings();
    }

    async settingsUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminTicketSettingsValidator);
        const result = await supportTicketService.updateSettings(payload);
        if (result.changed) {
            await recordAudit({
                ctx,
                action: "support.ticket.settings.update",
                entityKind: "support_ticket_settings",
                entityId: null,
                payload,
            });
        }
        return result;
    }

    async resources(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminTicketResourceValidator);
        return supportTicketService.resources(payload.kind, payload.q ?? "", payload.limit ?? 30);
    }
}
