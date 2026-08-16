import type {
    NormalizedWebhook,
    OutboundMessage,
    OutboundResult,
    ProviderContext,
    SupportChannelAdapter,
    WebhookRequest,
} from "#services/support/channel_adapters/adapter";
import { ProviderAdapterError, providerJson, requireString } from "#services/support/channel_adapters/adapter";
import { verifyMetaSignature } from "#services/support/channel_adapters/meta_signature";

function obj(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function arr(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

export class InstagramAdapter implements SupportChannelAdapter {
    readonly channel = "instagram" as const;
    readonly providerKey = "instagram_messaging";
    readonly capabilities = ["send_text", "receive_text", "receive_image", "reply", "webhook", "oauth"] as const;

    validateConfiguration(ctx: ProviderContext) {
        requireString(ctx.credentials, "access_token");
        requireString(ctx.credentials, "app_secret");
        requireString(ctx.credentials, "webhook_verify_token");
        requireString(ctx.configuration, "ig_user_id");
        const login = requireString(ctx.configuration, "login_type");
        if (!["instagram_login", "facebook_login"].includes(login))
            throw new ProviderAdapterError("E_PROVIDER_CONFIGURATION", "Unsupported Instagram login type", 422);
        requireString(ctx.configuration, "graph_version");
    }
    private base(ctx: ProviderContext) {
        const version = requireString(ctx.configuration, "graph_version");
        return ctx.configuration.login_type === "facebook_login"
            ? `https://graph.facebook.com/${version}`
            : `https://graph.instagram.com/${version}`;
    }
    private headers(ctx: ProviderContext) {
        return { authorization: `Bearer ${requireString(ctx.credentials, "access_token")}` };
    }

    async verifyConnection(ctx: ProviderContext) {
        this.validateConfiguration(ctx);
        const id = requireString(ctx.configuration, "ig_user_id");
        const info = await providerJson(`${this.base(ctx)}/${id}?fields=id,username,name`, {
            method: "GET",
            headers: this.headers(ctx),
        });
        if (!info.id)
            throw new ProviderAdapterError("E_PROVIDER_RESPONSE", "Instagram did not return professional account identity");
        return {
            ok: true,
            account: {
                id: String(info.id),
                label: String(info.name ?? info.username ?? info.id),
                username: info.username ? String(info.username) : null,
            },
            webhookOk: false,
            scopes: ["instagram_business_basic", "instagram_business_manage_messages"],
        };
    }
    async connect(ctx: ProviderContext) {
        return this.verifyConnection(ctx);
    }
    async disconnect() {
        /* OAuth revoke is provider/account-type specific. Calibra disables and removes local grants. */
    }

    async sendMessage(ctx: ProviderContext, message: OutboundMessage): Promise<OutboundResult> {
        const id = requireString(ctx.configuration, "ig_user_id");
        const recipient = message.recipientExternalId ?? message.conversationId;
        const response = await providerJson(`${this.base(ctx)}/${id}/messages`, {
            method: "POST",
            headers: { ...this.headers(ctx), "content-type": "application/json" },
            body: JSON.stringify({ recipient: { id: recipient }, message: { text: message.text } }),
        });
        const mid = response.message_id ?? response.id;
        if (!mid) throw new ProviderAdapterError("E_PROVIDER_RESPONSE", "Instagram did not return a message id");
        return { providerMessageId: String(mid), state: "sent" };
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
        for (const entryRaw of arr(root.entry)) {
            const entry = obj(entryRaw);
            const account = entry.id ? String(entry.id) : null;
            for (const eventRaw of arr(entry.messaging)) {
                const event = obj(eventRaw);
                const message = obj(event.message);
                const sender = obj(event.sender);
                const recipient = obj(event.recipient);
                if (message.mid && sender.id)
                    messages.push({
                        providerEventId: String(message.mid),
                        providerMessageId: String(message.mid),
                        providerConversationId: String(sender.id),
                        providerAccountId: account,
                        senderExternalId: String(sender.id),
                        recipientExternalId: recipient.id ? String(recipient.id) : account,
                        text: String(message.text ?? ""),
                        messageType: arr(message.attachments).length ? "image" : "text",
                        mediaReference: arr(message.attachments).length ? { attachments: arr(message.attachments) } : null,
                        replyToExternalId: obj(message.reply_to).mid ? String(obj(message.reply_to).mid) : null,
                        providerTimestamp: event.timestamp ? new Date(Number(event.timestamp)) : null,
                        metadata: { is_echo: Boolean(message.is_echo) },
                    });
                const delivery = obj(event.delivery);
                if (delivery.mids && Array.isArray(delivery.mids))
                    for (const mid of delivery.mids)
                        deliveries.push({
                            providerEventId: `${String(mid)}:delivered:${String(event.timestamp ?? "")}`,
                            providerMessageId: String(mid),
                            state: "delivered",
                            occurredAt: event.timestamp ? new Date(Number(event.timestamp)) : null,
                        });
                const read = obj(event.read);
                if (read.mid)
                    deliveries.push({
                        providerEventId: `${String(read.mid)}:read:${String(event.timestamp ?? "")}`,
                        providerMessageId: String(read.mid),
                        state: "read",
                        occurredAt: event.timestamp ? new Date(Number(event.timestamp)) : null,
                    });
            }
        }
        return { messages, deliveries };
    }
}
