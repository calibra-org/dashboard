import type {
    NormalizedWebhook,
    OutboundMessage,
    OutboundResult,
    ProviderContext,
    SupportChannelAdapter,
    WebhookRequest,
} from "#services/support/channel_adapters/adapter";
import { epochDate, ProviderAdapterError, providerJson, requireString } from "#services/support/channel_adapters/adapter";

function obj(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export class RubikaAdapter implements SupportChannelAdapter {
    readonly channel = "rubika" as const;
    readonly providerKey = "rubika_bot";
    readonly capabilities = [
        "send_text",
        "receive_text",
        "receive_image",
        "receive_document",
        "receive_audio",
        "reply",
        "edit",
        "delete",
        "webhook",
    ] as const;

    validateConfiguration(ctx: ProviderContext) {
        requireString(ctx.credentials, "bot_token");
        requireString(ctx.credentials, "webhook_path_secret");
    }
    private endpoint(ctx: ProviderContext, method: string) {
        return `https://botapi.rubika.ir/v3/${encodeURIComponent(requireString(ctx.credentials, "bot_token"))}/${method}`;
    }
    private async call(ctx: ProviderContext, method: string, body: Record<string, unknown> = {}) {
        return providerJson(this.endpoint(ctx, method), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    async verifyConnection(ctx: ProviderContext) {
        const response = await this.call(ctx, "getMe");
        const bot = obj(response.bot ?? response.data ?? response);
        const id = bot.bot_id ?? bot.id;
        if (!id) throw new ProviderAdapterError("E_PROVIDER_RESPONSE", "Rubika did not return bot identity");
        return {
            ok: true,
            account: {
                id: String(id),
                label: String(bot.bot_title ?? bot.first_name ?? bot.username ?? "Rubika bot"),
                username: bot.username ? String(bot.username) : null,
            },
            webhookOk: false,
        };
    }

    async connect(ctx: ProviderContext, webhookUrl: string) {
        await this.call(ctx, "updateBotEndpoints", { url: webhookUrl, type: "ReceiveUpdate" });
        const health = await this.verifyConnection(ctx);
        return { ...health, webhookOk: true };
    }
    async disconnect(ctx: ProviderContext) {
        await this.call(ctx, "updateBotEndpoints", { url: "", type: "ReceiveUpdate" });
    }

    async sendMessage(ctx: ProviderContext, message: OutboundMessage): Promise<OutboundResult> {
        const result = await this.call(ctx, "sendMessage", {
            chat_id: message.conversationId,
            text: message.text,
            reply_to_message_id: message.replyToExternalId || undefined,
        });
        const id = result.message_id ?? obj(result.data).message_id;
        if (!id) throw new ProviderAdapterError("E_PROVIDER_RESPONSE", "Rubika did not return a message id");
        return { providerMessageId: String(id), state: "sent" };
    }

    verifyWebhook(ctx: ProviderContext, request: WebhookRequest) {
        return request.pathSecret === requireString(ctx.credentials, "webhook_path_secret");
    }
    normalizeWebhook(_ctx: ProviderContext, request: WebhookRequest): NormalizedWebhook {
        const root = obj(request.body);
        const update = obj(root.update);
        const message = obj(update.new_message);
        if (update.type !== "NewMessage" || !message.message_id) return { messages: [], deliveries: [] };
        return {
            messages: [
                {
                    providerEventId: `${String(update.chat_id)}:${String(message.message_id)}`,
                    providerMessageId: String(message.message_id),
                    providerConversationId: String(update.chat_id),
                    senderExternalId: String(message.sender_id ?? update.chat_id),
                    text: String(message.text ?? ""),
                    messageType: "text",
                    replyToExternalId: message.reply_to_message_id ? String(message.reply_to_message_id) : null,
                    providerTimestamp: epochDate(message.time),
                    metadata: { sender_type: message.sender_type ?? null, is_edited: message.is_edited ?? false },
                },
            ],
            deliveries: [],
        };
    }
}
