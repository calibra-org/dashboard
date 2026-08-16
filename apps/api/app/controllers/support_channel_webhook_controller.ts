import type { HttpContext } from "@adonisjs/core/http";

import type { SupportChannel } from "#services/support/channel_catalog";
import { omnichannelService } from "#services/support/omnichannel_service";
import { supportChannelOAuthService } from "#services/support/support_channel_oauth_service";
import { scheduleTicketRealtime } from "#services/support/ticket_realtime";

function headers(ctx: HttpContext): Record<string, string | undefined> {
    return {
        "x-hub-signature-256": ctx.request.header("x-hub-signature-256"),
        "x-telegram-bot-api-secret-token": ctx.request.header("x-telegram-bot-api-secret-token"),
        authorization: ctx.request.header("authorization"),
    };
}
function query(ctx: HttpContext): Record<string, string | undefined> {
    const input = ctx.request.qs();
    return Object.fromEntries(
        Object.entries(input).map(([key, value]) => [
            key,
            Array.isArray(value) ? String(value[0]) : value === undefined ? undefined : String(value),
        ]),
    );
}

export default class SupportChannelWebhookController {
    async challenge(ctx: HttpContext) {
        const channel = String(ctx.params.channel) as SupportChannel;
        const integrationId = Number(ctx.params.integrationId);
        const challenge = await omnichannelService.verifyChallenge(channel, integrationId, query(ctx));
        if (!challenge) return ctx.response.status(401).send("invalid verification challenge");
        return ctx.response.status(200).send(challenge);
    }

    async oauthCallback(ctx: HttpContext) {
        const channel = String(ctx.params.channel) as SupportChannel;
        const state = String(ctx.request.input("state", ""));
        const code = String(ctx.request.input("code", ""));
        const error = String(ctx.request.input("error", ""));
        if (error) return ctx.response.redirect(`/tickets/channels?oauth=error&reason=${encodeURIComponent(error)}`);
        try {
            const result = await supportChannelOAuthService.callback(channel, state, code);
            return ctx.response.redirect(`${result.return_path}?oauth=success`);
        } catch (cause) {
            const codeValue =
                cause && typeof cause === "object" && "code" in cause
                    ? String((cause as { code?: unknown }).code ?? "oauth_failed")
                    : "oauth_failed";
            return ctx.response.redirect(`/tickets/channels?oauth=error&reason=${encodeURIComponent(codeValue)}`);
        }
    }

    async receive(ctx: HttpContext) {
        const channel = String(ctx.params.channel) as SupportChannel;
        const integrationId = Number(ctx.params.integrationId);
        const result = await omnichannelService.webhook(channel, integrationId, {
            rawBody: ctx.request.raw() ?? JSON.stringify(ctx.request.all() ?? {}),
            body: ctx.request.all(),
            headers: headers(ctx),
            query: query(ctx),
            pathSecret: ctx.params.pathSecret ? String(ctx.params.pathSecret) : null,
        });
        for (const ticketId of result.ticketIds) await scheduleTicketRealtime(ctx, { type: "message", ticketId });
        return { ok: true, duplicate: result.duplicate };
    }
}
