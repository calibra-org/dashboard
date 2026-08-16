import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import type { SupportChannel } from "#services/support/channel_catalog";
import { omnichannelService } from "#services/support/omnichannel_service";
import { supportApiKeyService } from "#services/support/support_api_key_service";
import { supportCampaignDispatchService } from "#services/support/support_campaign_dispatch_service";
import { supportChannelOAuthService } from "#services/support/support_channel_oauth_service";
import { scheduleTicketRealtime } from "#services/support/ticket_realtime";
import {
    supportApiKeyCreateValidator,
    supportApiWebhookCreateValidator,
    supportCampaignProviderTemplateValidator,
    supportChannelConfigureValidator,
    supportChannelDisconnectValidator,
    supportChannelMediaReplyValidator,
    supportChannelReplyValidator,
} from "#validators/admin/ticket_omnichannel_validator";

function channel(ctx: HttpContext): SupportChannel {
    return String(ctx.params.channel) as SupportChannel;
}
function id(ctx: HttpContext, name = "id") {
    const value = Number(ctx.params[name]);
    if (!Number.isSafeInteger(value) || value < 1)
        throw new Exception("Invalid support identifier", { status: 422, code: "E_SUPPORT_INVALID_ID" });
    return value;
}
async function actor(ctx: HttpContext) {
    const user = await ctx.auth.authenticate();
    return Number(user.id);
}
async function audit(
    ctx: HttpContext,
    action: string,
    entityKind: string,
    entityId: number | null,
    payload: Record<string, unknown> = {},
) {
    await recordAudit({ ctx, action, entityKind, entityId, payload });
}

export default class TicketOmnichannelController {
    catalog() {
        return omnichannelService.catalog();
    }
    integrations() {
        return omnichannelService.integrations();
    }
    conversations(ctx: HttpContext) {
        const page = Number(ctx.request.input("page", 1));
        const limit = Number(ctx.request.input("limit", 40));
        const q = String(ctx.request.input("q", ""));
        const selected = ctx.request.input("channel") as SupportChannel | undefined;
        return omnichannelService.conversations(selected, page, limit, q);
    }
    logs(ctx: HttpContext) {
        return omnichannelService.connectionLogs(channel(ctx), Number(ctx.request.input("limit", 100)));
    }

    async configure(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(supportChannelConfigureValidator);
        const result = await omnichannelService.configure(payload as never, await actor(ctx));
        await audit(ctx, "support.channel.omnichannel.configure", "support_channel_integration", result.data.id, {
            channel: payload.channel,
            provider_key: payload.provider_key,
            enabled: payload.enabled ?? null,
            credential_fields_changed: Object.keys(payload.credentials ?? {}),
        });
        return result;
    }

    async verify(ctx: HttpContext) {
        const result = await omnichannelService.verify(channel(ctx), await actor(ctx));
        await audit(ctx, "support.channel.omnichannel.verify", "support_channel_integration", result.data.id, {
            channel: channel(ctx),
            ok: !result.error,
            error_code: result.error?.code ?? null,
        });
        if (result.error) ctx.response.status(result.error.code === "E_PROVIDER_AUTH" ? 401 : 502);
        return result;
    }

    async connect(ctx: HttpContext) {
        const origin = `${ctx.request.protocol()}://${ctx.request.host() ?? "localhost"}`;
        const result = await omnichannelService.connect(channel(ctx), await actor(ctx), origin);
        await audit(ctx, "support.channel.omnichannel.connect", "support_channel_integration", result.data.id, {
            channel: channel(ctx),
            status: result.data.status,
            error_code: result.error?.code ?? null,
        });
        if (result.error) ctx.response.status(502);
        return result;
    }

    async oauthBegin(ctx: HttpContext) {
        const origin = `${ctx.request.protocol()}://${ctx.request.host() ?? "localhost"}`;
        const result = await supportChannelOAuthService.begin(
            channel(ctx),
            origin,
            await actor(ctx),
            String(ctx.request.input("return_path", "/fa/tickets/channels")),
        );
        await audit(ctx, "support.channel.oauth.begin", "support_channel_integration", null, { channel: channel(ctx) });
        return result;
    }

    async disconnect(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(supportChannelDisconnectValidator);
        const result = await omnichannelService.disconnect(channel(ctx), await actor(ctx), payload.revoke ?? false);
        await audit(
            ctx,
            payload.revoke ? "support.channel.omnichannel.revoke" : "support.channel.omnichannel.disconnect",
            "support_channel_integration",
            result.data.id,
            { channel: channel(ctx) },
        );
        return result;
    }

    async reply(ctx: HttpContext) {
        const ticketId = id(ctx, "ticketId");
        const payload = await ctx.request.validateUsing(supportChannelReplyValidator);
        const result = await omnichannelService.sendReply(
            ticketId,
            payload.body,
            payload.expected_version,
            await actor(ctx),
            payload.reply_to_external_id,
        );
        await audit(ctx, "support.channel.omnichannel.reply", "support_ticket", ticketId, {
            provider_message_id: "provider_message_id" in result.data ? result.data.provider_message_id : null,
            delivery_state: result.data.delivery_state,
            error_code: result.error?.code ?? null,
        });
        await scheduleTicketRealtime(ctx, { type: "message", ticketId });
        if (!result.ok) ctx.response.status(502);
        return result;
    }

    async mediaReply(ctx: HttpContext) {
        const ticketId = id(ctx, "ticketId");
        const payload = await ctx.request.validateUsing(supportChannelMediaReplyValidator);
        const result = await omnichannelService.sendAttachment(
            ticketId,
            payload.attachment_id,
            payload.caption ?? "",
            payload.expected_version,
            await actor(ctx),
            payload.reply_to_external_id,
        );
        await audit(ctx, "support.channel.omnichannel.media_reply", "support_ticket", ticketId, {
            attachment_id: payload.attachment_id,
            provider_message_id: "provider_message_id" in result.data ? result.data.provider_message_id : null,
            delivery_state: result.data.delivery_state,
            error_code: result.error?.code ?? null,
        });
        await scheduleTicketRealtime(ctx, { type: "message", ticketId });
        if (!result.ok) ctx.response.status(502);
        return result;
    }

    async markRead(ctx: HttpContext) {
        const ticketId = id(ctx, "ticketId");
        const result = await omnichannelService.markRead(ticketId);
        await scheduleTicketRealtime(ctx, { type: "updated", ticketId });
        return result;
    }

    async campaignProviderTemplateVerify(ctx: HttpContext) {
        const campaignId = id(ctx);
        const payload = await ctx.request.validateUsing(supportCampaignProviderTemplateValidator);
        const result = await supportCampaignDispatchService.verifyProviderTemplate(campaignId, payload);
        await audit(ctx, "support.campaign.provider_template.verify", "support_campaign", campaignId, {
            provider_template_key: result.data.provider_template_key,
            provider_template_status: result.data.provider_template_status,
        });
        return result;
    }

    async campaignDispatch(ctx: HttpContext) {
        const campaignId = id(ctx);
        const result = await supportCampaignDispatchService.dispatch(campaignId, Number(ctx.request.input("limit", 250)));
        await audit(ctx, "support.campaign.dispatch", "support_campaign", campaignId, result.data);
        return result;
    }

    apiKeys() {
        return supportApiKeyService.list();
    }
    async apiKeyCreate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(supportApiKeyCreateValidator);
        const result = await supportApiKeyService.create(payload as never, await actor(ctx));
        ctx.response.status(201);
        await audit(ctx, "support.api_key.create", "support_api_key", result.data.id, {
            scopes: result.data.scopes,
            key_prefix: result.data.key_prefix,
        });
        return result;
    }
    async apiKeyRevoke(ctx: HttpContext) {
        const keyId = id(ctx);
        const result = await supportApiKeyService.revoke(keyId);
        await audit(ctx, "support.api_key.revoke", "support_api_key", keyId);
        return result;
    }
    async apiKeyRotate(ctx: HttpContext) {
        const keyId = id(ctx);
        const result = await supportApiKeyService.rotate(keyId, await actor(ctx));
        await audit(ctx, "support.api_key.rotate", "support_api_key", keyId, {
            replacement_id: result.data.id,
            key_prefix: result.data.key_prefix,
        });
        return result;
    }
    apiRequestLogs(ctx: HttpContext) {
        return supportApiKeyService.requestLogs(Number(ctx.request.input("limit", 100)));
    }
    apiWebhooks() {
        return supportApiKeyService.webhookSubscriptions();
    }
    async apiWebhookCreate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(supportApiWebhookCreateValidator);
        const result = await supportApiKeyService.createWebhook(payload, await actor(ctx));
        ctx.response.status(201);
        await audit(ctx, "support.api_webhook.create", "support_api_webhook_subscription", result.data.id, {
            url: result.data.url,
            events: result.data.events,
        });
        return result;
    }
    async apiWebhookRotate(ctx: HttpContext) {
        const webhookId = id(ctx);
        const result = await supportApiKeyService.rotateWebhookSecret(webhookId);
        await audit(ctx, "support.api_webhook.rotate", "support_api_webhook_subscription", webhookId, {
            secret_prefix: result.data.secret_prefix,
        });
        return result;
    }
    async apiWebhookRevoke(ctx: HttpContext) {
        const webhookId = id(ctx);
        const result = await supportApiKeyService.revokeWebhook(webhookId);
        await audit(ctx, "support.api_webhook.revoke", "support_api_webhook_subscription", webhookId);
        return result;
    }
}
