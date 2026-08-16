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

function obj(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export class MicrosoftGraphMailAdapter implements SupportChannelAdapter {
    readonly channel = "email" as const;
    readonly providerKey = "microsoft_graph_mail";
    readonly capabilities = ["send_text", "receive_text", "receive_document", "reply", "webhook", "oauth"] as const;

    validateConfiguration(ctx: ProviderContext) {
        requireString(ctx.credentials, "client_id");
        requireString(ctx.credentials, "client_secret");
        requireString(ctx.credentials, "refresh_token");
        requireString(ctx.configuration, "tenant");
        requireString(ctx.configuration, "mailbox");
        requireString(ctx.credentials, "webhook_client_state");
    }
    async refreshCredentials(ctx: ProviderContext) {
        this.validateConfiguration(ctx);
        const tenant = encodeURIComponent(requireString(ctx.configuration, "tenant"));
        const refreshed = await refreshOAuthToken(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
            client_id: requireString(ctx.credentials, "client_id"),
            client_secret: requireString(ctx.credentials, "client_secret"),
            refresh_token: requireString(ctx.credentials, "refresh_token"),
            grant_type: "refresh_token",
            scope: "offline_access Mail.Read Mail.Send",
        });
        return {
            credentials: {
                ...ctx.credentials,
                access_token: refreshed.accessToken,
                ...(refreshed.refreshToken ? { refresh_token: refreshed.refreshToken } : {}),
            },
            tokenExpiresAt: refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null,
        };
    }
    private async token(ctx: ProviderContext) {
        return (await this.refreshCredentials(ctx)).credentials.access_token;
    }
    async verifyConnection(ctx: ProviderContext) {
        const access = await this.token(ctx);
        const mailbox = encodeURIComponent(requireString(ctx.configuration, "mailbox"));
        const info = await providerJson(
            `https://graph.microsoft.com/v1.0/users/${mailbox}?$select=id,displayName,mail,userPrincipalName`,
            { method: "GET", headers: { authorization: `Bearer ${access}` } },
        );
        if (!info.id) throw new ProviderAdapterError("E_PROVIDER_RESPONSE", "Microsoft Graph did not return mailbox identity");
        return {
            ok: true,
            account: { id: String(info.id), label: String(info.displayName ?? info.mail ?? info.userPrincipalName ?? info.id) },
            webhookOk: false,
            scopes: ["Mail.Read", "Mail.Send"],
        };
    }
    async connect(ctx: ProviderContext, webhookUrl: string) {
        const health = await this.verifyConnection(ctx);
        const access = await this.token(ctx);
        const mailbox = encodeURIComponent(requireString(ctx.configuration, "mailbox"));
        const expirationDateTime = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        const sub = await providerJson("https://graph.microsoft.com/v1.0/subscriptions", {
            method: "POST",
            headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
            body: JSON.stringify({
                changeType: "created",
                notificationUrl: webhookUrl,
                resource: `users/${mailbox}/mailFolders('Inbox')/messages`,
                expirationDateTime,
                clientState: requireString(ctx.credentials, "webhook_client_state"),
            }),
        });
        return {
            ...health,
            webhookOk: Boolean(sub.id),
            account: {
                ...health.account!,
                metadata: { subscription_id: sub.id ?? null, subscription_expiration: sub.expirationDateTime ?? null },
            },
        };
    }
    async disconnect() {
        /* Subscription ids are persisted as provider metadata; revoke is performed by the service when present. */
    }
    async sendMessage(ctx: ProviderContext, message: OutboundMessage): Promise<OutboundResult> {
        const access = await this.token(ctx);
        const mailbox = encodeURIComponent(requireString(ctx.configuration, "mailbox"));
        const to = message.recipientExternalId ?? message.conversationId;
        const response = await fetch(`https://graph.microsoft.com/v1.0/users/${mailbox}/sendMail`, {
            method: "POST",
            headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
            body: JSON.stringify({
                message: {
                    subject: String(ctx.configuration.default_subject ?? "Support reply"),
                    body: { contentType: "Text", content: message.text },
                    toRecipients: [{ emailAddress: { address: to } }],
                },
                saveToSentItems: true,
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (response.status !== 202)
            throw new ProviderAdapterError(
                "E_PROVIDER_HTTP",
                `Microsoft Graph request failed (${response.status})`,
                response.status === 429 ? 429 : 502,
            );
        return { providerMessageId: `graph:${crypto.randomUUID()}`, state: "sent", metadata: { evidence: "202_accepted" } };
    }
    verifyWebhook(ctx: ProviderContext, request: WebhookRequest) {
        const root = obj(request.body);
        const values = Array.isArray(root.value) ? root.value.map(obj) : [];
        return (
            values.length > 0 &&
            values.every((entry) => entry.clientState === requireString(ctx.credentials, "webhook_client_state"))
        );
    }
    normalizeWebhook(_ctx: ProviderContext, request: WebhookRequest): NormalizedWebhook {
        const root = obj(request.body);
        const values = Array.isArray(root.value) ? root.value.map(obj) : [];
        return {
            messages: [],
            deliveries: [],
            metadata: {
                graph_notifications: values.map((entry) => ({
                    subscription_id: entry.subscriptionId ?? null,
                    resource: entry.resource ?? null,
                    resource_data: entry.resourceData ?? null,
                })),
            },
        };
    }
    verifyChallenge(_ctx: ProviderContext, query: Record<string, string | undefined>) {
        return query.validationToken ?? null;
    }
    async expandWebhook(ctx: ProviderContext, normalized: NormalizedWebhook): Promise<NormalizedWebhook> {
        const meta = normalized.metadata ?? {};
        const notifications = Array.isArray(meta.graph_notifications) ? meta.graph_notifications : [];
        const access = await this.token(ctx);
        const messages = [...normalized.messages];
        for (const raw of notifications) {
            const note = obj(raw);
            const data = obj(note.resource_data);
            const id = data.id ? String(data.id) : null;
            if (!id) continue;
            const mailbox = encodeURIComponent(requireString(ctx.configuration, "mailbox"));
            const message = await providerJson(
                `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${encodeURIComponent(id)}?$select=id,conversationId,internetMessageId,subject,bodyPreview,receivedDateTime,from,toRecipients`,
                { method: "GET", headers: { authorization: `Bearer ${access}` } },
            );
            const fromAddress = obj(obj(message.from).emailAddress);
            const from = fromAddress.address ? String(fromAddress.address) : "";
            messages.push({
                providerEventId: id,
                providerMessageId: String(message.internetMessageId ?? message.id),
                providerConversationId: String(message.conversationId ?? message.id),
                providerAccountId: String(ctx.configuration.mailbox),
                senderExternalId: from || id,
                senderEmail: from || null,
                senderName: fromAddress.name ? String(fromAddress.name) : null,
                text: String(message.bodyPreview ?? ""),
                messageType: "text",
                providerTimestamp: message.receivedDateTime ? new Date(String(message.receivedDateTime)) : null,
                metadata: { subject: message.subject ?? null, graph_message_id: message.id ?? null },
            });
        }
        return { ...normalized, messages };
    }
}
