import type {
    NormalizedWebhook,
    OutboundMessage,
    OutboundResult,
    ProviderContext,
    SupportChannelAdapter,
    WebhookRequest,
} from "#services/support/channel_adapters/adapter";
import { epochDate, providerJson, requireString } from "#services/support/channel_adapters/adapter";

function obj(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export class BaleAdapter implements SupportChannelAdapter {
    readonly channel = "bale" as const;
    readonly providerKey = "bale_bot";
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
        return `https://tapi.bale.ai/bot${encodeURIComponent(requireString(ctx.credentials, "bot_token"))}/${method}`;
    }

    async verifyConnection(ctx: ProviderContext) {
        const response = await providerJson(this.endpoint(ctx, "getMe"), { method: "POST" }, { expectedOkField: true });
        const user = obj(response.result);
        const webhook = await providerJson(this.endpoint(ctx, "getWebhookInfo"), { method: "POST" }, { expectedOkField: true });
        const info = obj(webhook.result);
        return {
            ok: true,
            account: {
                id: String(user.id ?? ""),
                label: String(user.first_name ?? user.username ?? "Bale bot"),
                username: user.username ? String(user.username) : null,
            },
            webhookOk: typeof info.url === "string" && info.url.length > 0,
        };
    }

    async connect(ctx: ProviderContext, webhookUrl: string) {
        await providerJson(
            this.endpoint(ctx, "setWebhook"),
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: webhookUrl }) },
            { expectedOkField: true },
        );
        return this.verifyConnection(ctx);
    }
    async disconnect(ctx: ProviderContext) {
        await providerJson(this.endpoint(ctx, "deleteWebhook"), { method: "POST" }, { expectedOkField: true });
    }

    async sendMessage(ctx: ProviderContext, message: OutboundMessage): Promise<OutboundResult> {
        const response = await providerJson(
            this.endpoint(ctx, "sendMessage"),
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    chat_id: message.conversationId,
                    text: message.text,
                    reply_to_message_id: message.replyToExternalId || undefined,
                }),
            },
            { expectedOkField: true },
        );
        const result = obj(response.result);
        return { providerMessageId: String(result.message_id), state: "sent", providerTimestamp: epochDate(result.date) };
    }

    verifyWebhook(ctx: ProviderContext, request: WebhookRequest) {
        return request.pathSecret === requireString(ctx.credentials, "webhook_path_secret");
    }
    normalizeWebhook(_ctx: ProviderContext, request: WebhookRequest): NormalizedWebhook {
        const update = obj(request.body);
        const message = obj(update.message ?? update.edited_message);
        if (!message.message_id) return { messages: [], deliveries: [] };
        const chat = obj(message.chat);
        const from = obj(message.from);
        const document = obj(message.document);
        const audio = obj(message.audio ?? message.voice);
        const photos = Array.isArray(message.photo) ? message.photo : [];
        const messageType = photos.length ? "image" : document.file_id ? "document" : audio.file_id ? "audio" : "text";
        const mediaReference = photos.length
            ? { file_id: obj(photos[photos.length - 1]).file_id }
            : document.file_id
              ? { file_id: document.file_id, file_name: document.file_name, mime_type: document.mime_type }
              : audio.file_id
                ? { file_id: audio.file_id, mime_type: audio.mime_type }
                : null;
        return {
            messages: [
                {
                    providerEventId: update.update_id ? String(update.update_id) : null,
                    providerMessageId: String(message.message_id),
                    providerConversationId: String(chat.id),
                    senderExternalId: String(from.id ?? chat.id),
                    senderName:
                        [from.first_name, from.last_name].filter(Boolean).join(" ") ||
                        (from.username ? String(from.username) : null),
                    text: String(message.text ?? message.caption ?? ""),
                    messageType,
                    mediaReference,
                    replyToExternalId: obj(message.reply_to_message).message_id
                        ? String(obj(message.reply_to_message).message_id)
                        : null,
                    providerTimestamp: epochDate(message.date),
                    metadata: { chat_type: chat.type ?? null, username: from.username ?? null },
                },
            ],
            deliveries: [],
        };
    }
}
