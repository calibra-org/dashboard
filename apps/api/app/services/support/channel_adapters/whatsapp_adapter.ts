import type {
    NormalizedWebhook,
    OutboundMedia,
    OutboundMessage,
    OutboundResult,
    OutboundTemplate,
    ProviderContext,
    SupportChannelAdapter,
    WebhookRequest,
} from "#services/support/channel_adapters/adapter";
import { epochDate, ProviderAdapterError, providerJson, requireString } from "#services/support/channel_adapters/adapter";
import { verifyMetaSignature } from "#services/support/channel_adapters/meta_signature";

function obj(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function arr(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

export class WhatsAppAdapter implements SupportChannelAdapter {
    readonly channel = "whatsapp" as const;
    readonly providerKey = "whatsapp_cloud";
    readonly capabilities = [
        "send_text",
        "receive_text",
        "send_image",
        "receive_image",
        "send_document",
        "receive_document",
        "send_audio",
        "receive_audio",
        "delivery_receipt",
        "read_receipt",
        "reply",
        "mark_read",
        "templates",
        "webhook",
    ] as const;

    validateConfiguration(ctx: ProviderContext) {
        requireString(ctx.credentials, "access_token");
        requireString(ctx.credentials, "app_secret");
        requireString(ctx.credentials, "webhook_verify_token");
        requireString(ctx.configuration, "phone_number_id");
        requireString(ctx.configuration, "waba_id");
        const version = requireString(ctx.configuration, "graph_version");
        if (!/^v\d+\.\d+$/.test(version))
            throw new ProviderAdapterError("E_PROVIDER_CONFIGURATION", "Graph API version must use vNN.N format", 422);
    }
    private url(ctx: ProviderContext, path: string) {
        return `https://graph.facebook.com/${requireString(ctx.configuration, "graph_version")}/${path}`;
    }
    private auth(ctx: ProviderContext) {
        return { authorization: `Bearer ${requireString(ctx.credentials, "access_token")}` };
    }

    async verifyConnection(ctx: ProviderContext) {
        this.validateConfiguration(ctx);
        const phoneId = requireString(ctx.configuration, "phone_number_id");
        const info = await providerJson(`${this.url(ctx, phoneId)}?fields=id,display_phone_number,verified_name`, {
            method: "GET",
            headers: this.auth(ctx),
        });
        if (!info.id) throw new ProviderAdapterError("E_PROVIDER_RESPONSE", "WhatsApp did not return phone identity");
        return {
            ok: true,
            account: {
                id: String(info.id),
                label: String(info.verified_name ?? info.display_phone_number ?? info.id),
                metadata: { display_phone_number: info.display_phone_number ?? null, waba_id: ctx.configuration.waba_id },
            },
            webhookOk: false,
        };
    }

    async connect(ctx: ProviderContext) {
        const health = await this.verifyConnection(ctx);
        // Meta App webhook callback is configured at App Dashboard/app subscription level. Connection is not
        // considered fully connected by the service until Calibra records a successful verification challenge/event.
        return health;
    }
    async disconnect() {
        /* Meta access is revoked outside Calibra; Calibra disables local use and drops stored credentials. */
    }

    async sendMessage(ctx: ProviderContext, message: OutboundMessage): Promise<OutboundResult> {
        const phoneId = requireString(ctx.configuration, "phone_number_id");
        const body: Record<string, unknown> = {
            messaging_product: "whatsapp",
            to: message.recipientExternalId ?? message.conversationId,
            type: "text",
            text: { body: message.text },
        };
        if (message.replyToExternalId) body.context = { message_id: message.replyToExternalId };
        const response = await providerJson(this.url(ctx, `${phoneId}/messages`), {
            method: "POST",
            headers: { ...this.auth(ctx), "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        const first = obj(arr(response.messages)[0]);
        if (!first.id) throw new ProviderAdapterError("E_PROVIDER_RESPONSE", "WhatsApp did not return a message id");
        return { providerMessageId: String(first.id), state: "sent" };
    }

    async sendMedia(ctx: ProviderContext, media: OutboundMedia): Promise<OutboundResult> {
        const phoneId = requireString(ctx.configuration, "phone_number_id");
        const mime = media.file.mime.toLowerCase();
        const type = mime.startsWith("image/")
            ? "image"
            : mime.startsWith("audio/")
              ? "audio"
              : mime.startsWith("video/")
                ? "video"
                : "document";
        const maxBytes = type === "image" ? 5 * 1024 * 1024 : type === "document" ? 100 * 1024 * 1024 : 16 * 1024 * 1024;
        if (media.file.size > maxBytes)
            throw new ProviderAdapterError(
                "E_PROVIDER_MEDIA_SIZE",
                "WhatsApp media exceeds the documented upload size limit",
                422,
            );
        const form = new FormData();
        form.set("messaging_product", "whatsapp");
        form.set("file", new Blob([Uint8Array.from(media.file.bytes)], { type: media.file.mime }), media.file.filename);
        const upload = await providerJson(
            this.url(ctx, `${phoneId}/media`),
            { method: "POST", headers: this.auth(ctx), body: form },
            { timeoutMs: 30_000 },
        );
        if (!upload.id) throw new ProviderAdapterError("E_PROVIDER_RESPONSE", "WhatsApp did not return a media id");
        const mediaObject: Record<string, unknown> = { id: String(upload.id) };
        if (media.caption && type !== "audio") mediaObject.caption = media.caption;
        if (type === "document") mediaObject.filename = media.file.filename;
        const body: Record<string, unknown> = {
            messaging_product: "whatsapp",
            to: media.recipientExternalId ?? media.conversationId,
            type,
            [type]: mediaObject,
        };
        if (media.replyToExternalId) body.context = { message_id: media.replyToExternalId };
        const sent = await providerJson(this.url(ctx, `${phoneId}/messages`), {
            method: "POST",
            headers: { ...this.auth(ctx), "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        const first = obj(arr(sent.messages)[0]);
        if (!first.id) throw new ProviderAdapterError("E_PROVIDER_RESPONSE", "WhatsApp did not return a message id");
        return {
            providerMessageId: String(first.id),
            state: "sent",
            metadata: { provider_media_id: String(upload.id), media_type: type },
        };
    }

    async verifyTemplate(ctx: ProviderContext, input: { name: string; languageCode: string }) {
        const wabaId = requireString(ctx.configuration, "waba_id");
        const query = new URLSearchParams({ name: input.name, fields: "id,name,status,language" });
        const response = await providerJson(`${this.url(ctx, `${wabaId}/message_templates`)}?${query.toString()}`, {
            method: "GET",
            headers: this.auth(ctx),
        });
        const candidate = arr(response.data)
            .map(obj)
            .find((item) => String(item.name ?? "") === input.name && String(item.language ?? "") === input.languageCode);
        if (!candidate) {
            return {
                name: input.name,
                languageCode: input.languageCode,
                approved: false,
                status: "NOT_FOUND",
                providerTemplateId: null,
            };
        }
        const status = String(candidate.status ?? "UNKNOWN").toUpperCase();
        return {
            name: input.name,
            languageCode: input.languageCode,
            approved: status === "APPROVED",
            status,
            providerTemplateId: candidate.id ? String(candidate.id) : null,
        };
    }

    async sendTemplate(ctx: ProviderContext, template: OutboundTemplate): Promise<OutboundResult> {
        const phoneId = requireString(ctx.configuration, "phone_number_id");
        const body = {
            messaging_product: "whatsapp",
            to: template.recipientExternalId ?? template.conversationId,
            type: "template",
            template: {
                name: template.name,
                language: { code: template.languageCode },
                ...(template.components?.length ? { components: template.components } : {}),
            },
        };
        const response = await providerJson(this.url(ctx, `${phoneId}/messages`), {
            method: "POST",
            headers: { ...this.auth(ctx), "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        const first = obj(arr(response.messages)[0]);
        if (!first.id) throw new ProviderAdapterError("E_PROVIDER_RESPONSE", "WhatsApp did not return a campaign message id");
        return {
            providerMessageId: String(first.id),
            state: "sent",
            metadata: { template_name: template.name, language_code: template.languageCode },
        };
    }

    async markRead(ctx: ProviderContext, providerMessageId: string) {
        const phoneId = requireString(ctx.configuration, "phone_number_id");
        await providerJson(this.url(ctx, `${phoneId}/messages`), {
            method: "POST",
            headers: { ...this.auth(ctx), "content-type": "application/json" },
            body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: providerMessageId }),
        });
    }

    verifyChallenge(ctx: ProviderContext, query: Record<string, string | undefined>) {
        return query["hub.mode"] === "subscribe" &&
            query["hub.verify_token"] === requireString(ctx.credentials, "webhook_verify_token")
            ? (query["hub.challenge"] ?? null)
            : null;
    }
    verifyWebhook(ctx: ProviderContext, request: WebhookRequest) {
        return verifyMetaSignature(
            request.rawBody,
            request.headers["x-hub-signature-256"],
            requireString(ctx.credentials, "app_secret"),
        );
    }

    normalizeWebhook(_ctx: ProviderContext, request: WebhookRequest): NormalizedWebhook {
        const root = obj(request.body);
        const messages: NormalizedWebhook["messages"] = [];
        const deliveries: NormalizedWebhook["deliveries"] = [];
        for (const entryRaw of arr(root.entry))
            for (const changeRaw of arr(obj(entryRaw).changes)) {
                const value = obj(obj(changeRaw).value);
                const metadata = obj(value.metadata);
                const accountId = metadata.phone_number_id ? String(metadata.phone_number_id) : null;
                const contacts = arr(value.contacts).map(obj);
                const contactByWa = new Map(
                    contacts.map((contact) => [
                        String(contact.wa_id ?? ""),
                        obj(contact.profile).name ? String(obj(contact.profile).name) : null,
                    ]),
                );
                for (const raw of arr(value.messages)) {
                    const message = obj(raw);
                    const from = String(message.from ?? "");
                    if (!message.id || !from) continue;
                    const type = String(message.type ?? "text");
                    const typed = obj(message[type]);
                    const normalizedType = ["image", "video", "audio", "document", "sticker", "location", "contact"].includes(
                        type,
                    )
                        ? (type as "image" | "video" | "audio" | "document" | "sticker" | "location" | "contact")
                        : "text";
                    messages.push({
                        providerEventId: String(message.id),
                        providerMessageId: String(message.id),
                        providerConversationId: from,
                        providerAccountId: accountId,
                        senderExternalId: from,
                        recipientExternalId: metadata.display_phone_number ? String(metadata.display_phone_number) : accountId,
                        senderName: contactByWa.get(from) ?? null,
                        senderPhone: from,
                        text: type === "text" ? String(obj(message.text).body ?? "") : String(typed.caption ?? ""),
                        messageType: normalizedType,
                        mediaReference: typed.id
                            ? { id: typed.id, mime_type: typed.mime_type ?? null, filename: typed.filename ?? null }
                            : null,
                        replyToExternalId: obj(message.context).id ? String(obj(message.context).id) : null,
                        providerTimestamp: epochDate(message.timestamp),
                        metadata: { wa_type: type },
                    });
                }
                for (const raw of arr(value.statuses)) {
                    const status = obj(raw);
                    if (!status.id) continue;
                    const state = String(status.status);
                    if (!["sent", "delivered", "read", "failed"].includes(state)) continue;
                    const errors = arr(status.errors).map(obj);
                    deliveries.push({
                        providerEventId: `${String(status.id)}:${state}:${String(status.timestamp ?? "")}`,
                        providerMessageId: String(status.id),
                        state: state as "sent" | "delivered" | "read" | "failed",
                        occurredAt: epochDate(status.timestamp),
                        safeCode: errors[0]?.code ? String(errors[0].code) : null,
                        safeMessage: state === "failed" ? "WhatsApp reported message delivery failure" : null,
                    });
                }
            }
        return { messages, deliveries };
    }
}
