import type {
    NormalizedWebhook,
    OutboundMessage,
    OutboundResult,
    ProviderContext,
    SupportChannelAdapter,
    WebhookRequest,
} from "#services/support/channel_adapters/adapter";
import { ProviderAdapterError, providerJson, requireString } from "#services/support/channel_adapters/adapter";
import { refreshOAuthToken } from "#services/support/channel_adapters/oauth";

function base64url(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
}

export class GmailAdapter implements SupportChannelAdapter {
    readonly channel = "email" as const;
    readonly providerKey = "gmail_api";
    readonly capabilities = ["send_text", "receive_text", "receive_document", "reply", "webhook", "oauth"] as const;

    validateConfiguration(ctx: ProviderContext) {
        requireString(ctx.credentials, "client_id");
        requireString(ctx.credentials, "client_secret");
        requireString(ctx.credentials, "refresh_token");
        requireString(ctx.configuration, "email_address");
        requireString(ctx.credentials, "webhook_path_secret");
    }

    async refreshCredentials(ctx: ProviderContext) {
        this.validateConfiguration(ctx);
        const refreshed = await refreshOAuthToken("https://oauth2.googleapis.com/token", {
            client_id: requireString(ctx.credentials, "client_id"),
            client_secret: requireString(ctx.credentials, "client_secret"),
            refresh_token: requireString(ctx.credentials, "refresh_token"),
            grant_type: "refresh_token",
        });
        return {
            credentials: { ...ctx.credentials, access_token: refreshed.accessToken },
            tokenExpiresAt: refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null,
        };
    }

    private async token(ctx: ProviderContext) {
        return (await this.refreshCredentials(ctx)).credentials.access_token;
    }

    async verifyConnection(ctx: ProviderContext) {
        const access = await this.token(ctx);
        const profile = await providerJson("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
            method: "GET",
            headers: { authorization: `Bearer ${access}` },
        });
        if (!profile.emailAddress) throw new ProviderAdapterError("E_PROVIDER_RESPONSE", "Gmail did not return mailbox identity");
        return {
            ok: true,
            account: { id: String(profile.emailAddress), label: String(profile.emailAddress) },
            webhookOk: false,
            scopes: ["gmail.modify", "gmail.send"],
        };
    }

    async connect(ctx: ProviderContext, webhookUrl: string) {
        const health = await this.verifyConnection(ctx);
        const topic = String(ctx.configuration.pubsub_topic ?? "").trim();
        if (!topic) return health;
        const access = await this.token(ctx);
        const watch = await providerJson("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
            method: "POST",
            headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
            body: JSON.stringify({ topicName: topic, labelIds: ["INBOX"], labelFilterBehavior: "INCLUDE" }),
        });
        return {
            ...health,
            webhookOk: false,
            account: {
                ...health.account!,
                metadata: {
                    history_id: watch.historyId ?? null,
                    watch_expiration: watch.expiration ?? null,
                    webhook_url: webhookUrl,
                },
            },
        };
    }

    async disconnect(ctx: ProviderContext) {
        const access = await this.token(ctx);
        await providerJson("https://gmail.googleapis.com/gmail/v1/users/me/stop", {
            method: "POST",
            headers: { authorization: `Bearer ${access}` },
        });
    }

    async sendMessage(ctx: ProviderContext, message: OutboundMessage): Promise<OutboundResult> {
        const access = await this.token(ctx);
        const from = requireString(ctx.configuration, "email_address");
        const to = message.recipientExternalId ?? message.conversationId;
        const subject =
            typeof ctx.configuration.default_subject === "string" ? ctx.configuration.default_subject : "Support reply";
        const headers = [
            `From: ${from}`,
            `To: ${to}`,
            `Subject: ${subject}`,
            "MIME-Version: 1.0",
            'Content-Type: text/plain; charset="UTF-8"',
        ];
        if (message.replyToExternalId)
            headers.push(`In-Reply-To: ${message.replyToExternalId}`, `References: ${message.replyToExternalId}`);
        const response = await providerJson("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
            method: "POST",
            headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
            body: JSON.stringify({ raw: base64url(`${headers.join("\r\n")}\r\n\r\n${message.text}`) }),
        });
        if (!response.id) throw new ProviderAdapterError("E_PROVIDER_RESPONSE", "Gmail did not return a message id");
        return { providerMessageId: String(response.id), state: "sent", metadata: { thread_id: response.threadId ?? null } };
    }

    verifyWebhook(ctx: ProviderContext, request: WebhookRequest) {
        // Gmail push is delivered through a Google Cloud Pub/Sub push subscription. Authentication
        // of the Pub/Sub push request is deployment-specific (OIDC audience/service-account policy)
        // and is enforced at ingress; here we require the expected envelope shape before processing.
        const root = request.body as Record<string, unknown>;
        return (
            request.pathSecret === requireString(ctx.credentials, "webhook_path_secret") &&
            Boolean(root && typeof root === "object" && root.message && typeof root.message === "object")
        );
    }

    normalizeWebhook(_ctx: ProviderContext, request: WebhookRequest): NormalizedWebhook {
        const root = request.body as Record<string, unknown>;
        const message = (root.message && typeof root.message === "object" ? root.message : {}) as Record<string, unknown>;
        if (typeof message.data !== "string") return { messages: [], deliveries: [] };
        try {
            const notification = JSON.parse(Buffer.from(message.data, "base64").toString("utf8")) as Record<string, unknown>;
            return {
                messages: [],
                deliveries: [],
                cursor: typeof notification.historyId === "string" ? notification.historyId : null,
                metadata: { email_address: notification.emailAddress ?? null },
            };
        } catch {
            return { messages: [], deliveries: [] };
        }
    }

    async expandWebhook(ctx: ProviderContext, normalized: NormalizedWebhook): Promise<NormalizedWebhook> {
        if (!normalized.cursor) return normalized;
        const state = (
            ctx.configuration._provider_state && typeof ctx.configuration._provider_state === "object"
                ? ctx.configuration._provider_state
                : {}
        ) as Record<string, unknown>;
        const startHistoryId = typeof state.gmail_history_id === "string" ? state.gmail_history_id : null;
        if (!startHistoryId) return normalized;
        const access = await this.token(ctx);
        const history = await providerJson(
            `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(startHistoryId)}&historyTypes=messageAdded&labelId=INBOX`,
            { method: "GET", headers: { authorization: `Bearer ${access}` } },
        );
        const records = Array.isArray(history.history) ? history.history : [];
        const ids = new Set<string>();
        for (const recordRaw of records) {
            const record = recordRaw && typeof recordRaw === "object" ? (recordRaw as Record<string, unknown>) : {};
            for (const addedRaw of Array.isArray(record.messagesAdded) ? record.messagesAdded : []) {
                const added = addedRaw && typeof addedRaw === "object" ? (addedRaw as Record<string, unknown>) : {};
                const msg = added.message && typeof added.message === "object" ? (added.message as Record<string, unknown>) : {};
                if (typeof msg.id === "string") ids.add(msg.id);
            }
        }
        const messages = [...normalized.messages];
        for (const id of ids) {
            const message = await providerJson(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
                { method: "GET", headers: { authorization: `Bearer ${access}` } },
            );
            const payload =
                message.payload && typeof message.payload === "object" ? (message.payload as Record<string, unknown>) : {};
            const headers = Array.isArray(payload.headers) ? payload.headers : [];
            const header = (name: string) => {
                const item = headers.find(
                    (raw) =>
                        raw &&
                        typeof raw === "object" &&
                        String((raw as Record<string, unknown>).name ?? "").toLowerCase() === name.toLowerCase(),
                ) as Record<string, unknown> | undefined;
                return item?.value ? String(item.value) : null;
            };
            const fromRaw = header("From") ?? "";
            const fromMatch = fromRaw.match(/<([^>]+)>/) ?? fromRaw.match(/([^\s]+@[^\s]+)/);
            const from = fromMatch?.[1] ?? fromRaw;
            const body = payload.body && typeof payload.body === "object" ? (payload.body as Record<string, unknown>) : {};
            let text = typeof body.data === "string" ? Buffer.from(body.data, "base64url").toString("utf8") : "";
            if (!text && Array.isArray(payload.parts)) {
                const part = payload.parts.find(
                    (raw) => raw && typeof raw === "object" && (raw as Record<string, unknown>).mimeType === "text/plain",
                ) as Record<string, unknown> | undefined;
                const partBody = part?.body && typeof part.body === "object" ? (part.body as Record<string, unknown>) : {};
                if (typeof partBody.data === "string") text = Buffer.from(partBody.data, "base64url").toString("utf8");
            }
            messages.push({
                providerEventId: id,
                providerMessageId: id,
                providerConversationId: String(message.threadId ?? id),
                providerAccountId: String(ctx.configuration.email_address),
                senderExternalId: from,
                senderEmail: from.includes("@") ? from : null,
                senderName:
                    fromRaw
                        .replace(/<[^>]+>/, "")
                        .replace(/^"|"$/g, "")
                        .trim() || null,
                text,
                messageType: "text",
                replyToExternalId: header("In-Reply-To"),
                providerTimestamp: message.internalDate ? new Date(Number(message.internalDate)) : null,
                metadata: { subject: header("Subject"), gmail_thread_id: message.threadId ?? null },
            });
        }
        return { ...normalized, messages, cursor: typeof history.historyId === "string" ? history.historyId : normalized.cursor };
    }
}
