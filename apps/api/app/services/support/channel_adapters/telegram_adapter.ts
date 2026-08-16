import type {
    NormalizedWebhook,
    OutboundMedia,
    OutboundMessage,
    OutboundResult,
    ProviderContext,
    SupportChannelAdapter,
    WebhookRequest,
} from "#services/support/channel_adapters/adapter";
import { epochDate, ProviderAdapterError, providerJson, requireString } from "#services/support/channel_adapters/adapter";

function objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export class TelegramAdapter implements SupportChannelAdapter {
    readonly channel = "telegram" as const;
    readonly providerKey = "telegram_bot";
    readonly capabilities = [
        "send_text",
        "receive_text",
        "send_image",
        "receive_image",
        "send_document",
        "receive_document",
        "send_audio",
        "receive_audio",
        "reply",
        "edit",
        "delete",
        "reaction",
        "webhook",
    ] as const;

    validateConfiguration(ctx: ProviderContext) {
        requireString(ctx.credentials, "bot_token");
        const secret = requireString(ctx.credentials, "webhook_secret_token");
        if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) throw new Error("Telegram webhook secret token has an invalid format");
    }

    private endpoint(ctx: ProviderContext, method: string) {
        return `https://api.telegram.org/bot${encodeURIComponent(requireString(ctx.credentials, "bot_token"))}/${method}`;
    }

    async verifyConnection(ctx: ProviderContext) {
        this.validateConfiguration(ctx);
        const response = await providerJson(this.endpoint(ctx, "getMe"), { method: "POST" }, { expectedOkField: true });
        const user = objectValue(response.result);
        const webhook = await providerJson(this.endpoint(ctx, "getWebhookInfo"), { method: "POST" }, { expectedOkField: true });
        const info = objectValue(webhook.result);
        return {
            ok: true,
            account: {
                id: String(user.id ?? ""),
                label: String(user.first_name ?? user.username ?? "Telegram bot"),
                username: user.username ? String(user.username) : null,
            },
            webhookOk: typeof info.url === "string" && info.url.length > 0 && !info.last_error_date,
        };
    }

    async connect(ctx: ProviderContext, webhookUrl: string) {
        await providerJson(
            this.endpoint(ctx, "setWebhook"),
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    url: webhookUrl,
                    secret_token: requireString(ctx.credentials, "webhook_secret_token"),
                    allowed_updates: ["message", "edited_message", "message_reaction"],
                }),
            },
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
                    reply_parameters: message.replyToExternalId
                        ? { message_id: Number(message.replyToExternalId) || message.replyToExternalId }
                        : undefined,
                }),
            },
            { expectedOkField: true },
        );
        const result = objectValue(response.result);
        return { providerMessageId: String(result.message_id), state: "sent", providerTimestamp: epochDate(result.date) };
    }

    async sendMedia(ctx: ProviderContext, media: OutboundMedia): Promise<OutboundResult> {
        const mime = media.file.mime.toLowerCase();
        const method = mime.startsWith("image/")
            ? "sendPhoto"
            : mime.startsWith("audio/")
              ? "sendAudio"
              : mime.startsWith("video/")
                ? "sendVideo"
                : "sendDocument";
        const maxBytes = method === "sendPhoto" ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
        if (media.file.size > maxBytes)
            throw new ProviderAdapterError(
                "E_PROVIDER_MEDIA_SIZE",
                "Telegram media exceeds the documented upload size limit",
                422,
            );
        const field =
            method === "sendPhoto" ? "photo" : method === "sendAudio" ? "audio" : method === "sendVideo" ? "video" : "document";
        const form = new FormData();
        form.set("chat_id", media.conversationId);
        if (media.caption) form.set("caption", media.caption);
        if (media.replyToExternalId)
            form.set(
                "reply_parameters",
                JSON.stringify({ message_id: Number(media.replyToExternalId) || media.replyToExternalId }),
            );
        form.set(field, new Blob([Uint8Array.from(media.file.bytes)], { type: media.file.mime }), media.file.filename);
        const response = await providerJson(
            this.endpoint(ctx, method),
            { method: "POST", body: form },
            { expectedOkField: true, timeoutMs: 30_000 },
        );
        const result = objectValue(response.result);
        if (!result.message_id) throw new Error("Telegram did not return message id");
        return { providerMessageId: String(result.message_id), state: "sent", providerTimestamp: epochDate(result.date) };
    }

    verifyWebhook(ctx: ProviderContext, request: WebhookRequest) {
        return request.headers["x-telegram-bot-api-secret-token"] === requireString(ctx.credentials, "webhook_secret_token");
    }

    normalizeWebhook(_ctx: ProviderContext, request: WebhookRequest): NormalizedWebhook {
        const update = objectValue(request.body);
        const message = objectValue(update.message ?? update.edited_message);
        if (!message.message_id) return { messages: [], deliveries: [] };
        const chat = objectValue(message.chat);
        const from = objectValue(message.from);
        const photo = Array.isArray(message.photo) ? message.photo : [];
        const document = objectValue(message.document);
        const audio = objectValue(message.audio ?? message.voice);
        const messageType = photo.length ? "image" : document.file_id ? "document" : audio.file_id ? "audio" : "text";
        const media = photo.length
            ? { file_id: objectValue(photo[photo.length - 1]).file_id }
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
                    mediaReference: media,
                    replyToExternalId: objectValue(message.reply_to_message).message_id
                        ? String(objectValue(message.reply_to_message).message_id)
                        : null,
                    providerTimestamp: epochDate(message.date),
                    metadata: { chat_type: chat.type ?? null, username: from.username ?? null },
                },
            ],
            deliveries: [],
        };
    }
}
