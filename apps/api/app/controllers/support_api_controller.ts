import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { omnichannelService } from "#services/support/omnichannel_service";
import { supportApiKeyService } from "#services/support/support_api_key_service";
import { supportApiWebhookDispatcher } from "#services/support/support_api_webhook_dispatcher";
import { scheduleTicketRealtime } from "#services/support/ticket_realtime";
import { supportTicketService } from "#services/support/ticket_service";
import { currentTrx } from "#services/tenant_context";

function token(ctx: HttpContext) {
    const direct = ctx.request.header("x-api-key")?.trim();
    if (direct) return direct;
    const authorization = ctx.request.header("authorization")?.trim() ?? "";
    return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}
function positive(value: unknown, label: string) {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1)
        throw new Exception(`${label} is invalid`, { status: 422, code: "E_SUPPORT_API_INPUT" });
    return n;
}
function text(value: unknown, label: string, max = 20_000) {
    const v = String(value ?? "").trim();
    if (!v || v.length > max) throw new Exception(`${label} is invalid`, { status: 422, code: "E_SUPPORT_API_INPUT" });
    return v;
}

export default class SupportApiController {
    private async auth(ctx: HttpContext, scope: Parameters<typeof supportApiKeyService.authenticate>[1]) {
        const raw = token(ctx);
        if (!raw) throw new Exception("API key is required", { status: 401, code: "E_SUPPORT_API_KEY" });
        return supportApiKeyService.authenticate(raw, scope, ctx.request.ip());
    }

    async tickets(ctx: HttpContext) {
        const key = await this.auth(ctx, "tickets.read");
        const started = Date.now();
        try {
            const result = await supportTicketService.list({
                page: Number(ctx.request.input("page", 1)),
                limit: Math.min(100, Number(ctx.request.input("limit", 25))),
                q: ctx.request.input("q") ? String(ctx.request.input("q")) : undefined,
            });
            await supportApiKeyService.log(key.id, {
                request_id: ctx.request.header("x-request-id"),
                method: "GET",
                path: ctx.request.url(),
                status_code: 200,
                ip: ctx.request.ip(),
                duration_ms: Date.now() - started,
            });
            return result;
        } catch (error) {
            await supportApiKeyService.log(key.id, {
                request_id: ctx.request.header("x-request-id"),
                method: "GET",
                path: ctx.request.url(),
                status_code: 500,
                ip: ctx.request.ip(),
                error_code: (error as { code?: string }).code ?? "E_SUPPORT_API",
                duration_ms: Date.now() - started,
            });
            throw error;
        }
    }

    async createTicket(ctx: HttpContext) {
        const key = await this.auth(ctx, "tickets.write");
        const started = Date.now();
        const body = ctx.request.all() as Record<string, unknown>;
        const result = await supportTicketService.create(
            {
                requester_name: text(body.requester_name, "requester_name", 180),
                requester_email: body.requester_email ? String(body.requester_email).trim() : null,
                requester_phone: body.requester_phone ? String(body.requester_phone).trim() : null,
                subject: text(body.subject, "subject", 255),
                message: text(body.message, "message"),
                priority: (["low", "normal", "high", "urgent"].includes(String(body.priority))
                    ? String(body.priority)
                    : "normal") as "low" | "normal" | "high" | "urgent",
                channel: "api",
                category: body.category ? String(body.category).trim() : null,
                tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 20) : [],
            },
            null,
        );
        await supportApiKeyService.log(key.id, {
            request_id: ctx.request.header("x-request-id"),
            method: "POST",
            path: ctx.request.url(),
            status_code: 201,
            ip: ctx.request.ip(),
            duration_ms: Date.now() - started,
        });
        ctx.response.status(201);
        await scheduleTicketRealtime(ctx, { type: "created", ticketId: Number(result.data.id) });
        await supportApiWebhookDispatcher.emit("ticket.created", {
            ticket_id: Number(result.data.id),
            reference: result.data.reference,
            channel: result.data.channel,
        });
        return result;
    }

    async ticket(ctx: HttpContext) {
        const key = await this.auth(ctx, "tickets.read");
        const result = await supportTicketService.find(positive(ctx.params.ticketId, "ticketId"));
        await supportApiKeyService.log(key.id, {
            request_id: ctx.request.header("x-request-id"),
            method: "GET",
            path: ctx.request.url(),
            status_code: 200,
            ip: ctx.request.ip(),
        });
        return result;
    }

    async sendMessage(ctx: HttpContext) {
        const key = await this.auth(ctx, "messages.send");
        const ticketId = positive(ctx.params.ticketId, "ticketId");
        const body = ctx.request.all() as Record<string, unknown>;
        const ticket = (await supportTicketService.find(ticketId)).data;
        const expected = positive(body.expected_version ?? ticket.version, "expected_version");
        const message = text(body.message, "message");
        const result =
            String(ticket.channel) === "api"
                ? await supportTicketService.addMessage(ticketId, "reply", message, expected, null)
                : await omnichannelService.sendReply(
                      ticketId,
                      message,
                      expected,
                      null,
                      body.reply_to_external_id ? String(body.reply_to_external_id) : null,
                  );
        await supportApiKeyService.log(key.id, {
            request_id: ctx.request.header("x-request-id"),
            method: "POST",
            path: ctx.request.url(),
            status_code: "ok" in result && result.ok === false ? 502 : 200,
            ip: ctx.request.ip(),
            error_code: "error" in result ? (result.error?.code ?? null) : null,
        });
        await scheduleTicketRealtime(ctx, { type: "message", ticketId });
        if (!("ok" in result) || result.ok !== false)
            await supportApiWebhookDispatcher.emit("message.sent", { ticket_id: ticketId, channel: ticket.channel });
        if ("ok" in result && result.ok === false) ctx.response.status(502);
        return result;
    }

    async requestLogs(ctx: HttpContext) {
        const key = await this.auth(ctx, "tickets.read");
        const rows = await currentTrx()
            .from("support_api_request_logs")
            .where("api_key_id", key.id)
            .orderBy("created_at", "desc")
            .limit(100);
        return { data: rows };
    }
}
