import type { SupportCapability, SupportChannel } from "#services/support/channel_catalog";

export type ProviderConfiguration = Record<string, unknown>;
export type ProviderCredentials = Record<string, string>;

export type ProviderContext = {
    channel: SupportChannel;
    providerKey: string;
    configuration: ProviderConfiguration;
    credentials: ProviderCredentials;
};

export type ProviderAccountInfo = {
    id: string;
    label: string;
    username?: string | null;
    metadata?: Record<string, unknown>;
};

export type ProviderHealth = {
    ok: boolean;
    account?: ProviderAccountInfo;
    webhookOk?: boolean;
    safeCode?: string;
    safeMessage?: string;
    tokenExpiresAt?: Date | null;
    scopes?: string[];
};

export type OutboundMessage = {
    conversationId: string;
    recipientExternalId?: string | null;
    text: string;
    replyToExternalId?: string | null;
    messageType?: "text";
};

export type OutboundMedia = {
    conversationId: string;
    recipientExternalId?: string | null;
    caption?: string | null;
    replyToExternalId?: string | null;
    file: { filename: string; mime: string; size: number; bytes: Uint8Array };
};

export type OutboundTemplate = {
    conversationId: string;
    recipientExternalId?: string | null;
    name: string;
    languageCode: string;
    components?: Array<Record<string, unknown>>;
};

export type ProviderTemplateCheck = {
    name: string;
    languageCode: string;
    approved: boolean;
    status: string;
    providerTemplateId?: string | null;
};

export type OutboundResult = {
    providerMessageId: string;
    state: "sent" | "queued";
    providerTimestamp?: Date | null;
    metadata?: Record<string, unknown>;
};

export type InboundMessage = {
    providerEventId?: string | null;
    providerMessageId: string;
    providerConversationId: string;
    providerAccountId?: string | null;
    senderExternalId: string;
    recipientExternalId?: string | null;
    senderName?: string | null;
    senderEmail?: string | null;
    senderPhone?: string | null;
    text: string;
    messageType: "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | "contact" | "system";
    mediaReference?: Record<string, unknown> | null;
    replyToExternalId?: string | null;
    providerTimestamp?: Date | null;
    metadata?: Record<string, unknown>;
};

export type DeliveryEvent = {
    providerEventId?: string | null;
    providerMessageId: string;
    state: "sent" | "delivered" | "read" | "failed";
    occurredAt?: Date | null;
    safeCode?: string | null;
    safeMessage?: string | null;
};

export type NormalizedWebhook = {
    messages: InboundMessage[];
    deliveries: DeliveryEvent[];
    cursor?: string | null;
    metadata?: Record<string, unknown>;
};

export type WebhookRequest = {
    rawBody: string;
    body: unknown;
    headers: Record<string, string | undefined>;
    query: Record<string, string | undefined>;
    pathSecret?: string | null;
};

export interface SupportChannelAdapter {
    readonly channel: SupportChannel;
    readonly providerKey: string;
    readonly capabilities: readonly SupportCapability[];
    validateConfiguration(ctx: ProviderContext): void | Promise<void>;
    verifyConnection(ctx: ProviderContext): Promise<ProviderHealth>;
    connect?(ctx: ProviderContext, webhookUrl: string): Promise<ProviderHealth>;
    disconnect?(ctx: ProviderContext): Promise<void>;
    refreshCredentials?(ctx: ProviderContext): Promise<{ credentials: ProviderCredentials; tokenExpiresAt?: Date | null }>;
    sendMessage(ctx: ProviderContext, message: OutboundMessage): Promise<OutboundResult>;
    sendMedia?(ctx: ProviderContext, media: OutboundMedia): Promise<OutboundResult>;
    sendTemplate?(ctx: ProviderContext, template: OutboundTemplate): Promise<OutboundResult>;
    verifyTemplate?(ctx: ProviderContext, input: { name: string; languageCode: string }): Promise<ProviderTemplateCheck>;
    markRead?(ctx: ProviderContext, providerMessageId: string): Promise<void>;
    verifyWebhook(ctx: ProviderContext, request: WebhookRequest): boolean | Promise<boolean>;
    normalizeWebhook(ctx: ProviderContext, request: WebhookRequest): NormalizedWebhook | Promise<NormalizedWebhook>;
    expandWebhook?(ctx: ProviderContext, normalized: NormalizedWebhook): Promise<NormalizedWebhook>;
    verifyChallenge?(ctx: ProviderContext, query: Record<string, string | undefined>): string | null;
}

export class ProviderAdapterError extends Error {
    constructor(
        public readonly safeCode: string,
        public readonly safeMessage: string,
        public readonly status = 502,
    ) {
        super(safeMessage);
        this.name = "ProviderAdapterError";
    }
}

export function requireString(source: Record<string, unknown>, key: string): string {
    const value = source[key];
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new ProviderAdapterError("E_PROVIDER_CONFIGURATION", `Required provider field is missing: ${key}`, 422);
    }
    return value.trim();
}

export async function providerJson(
    url: string,
    init: RequestInit,
    options: { timeoutMs?: number; expectedOkField?: boolean } = {},
): Promise<Record<string, unknown>> {
    let response: Response;
    try {
        response = await fetch(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs ?? 12_000) });
    } catch {
        throw new ProviderAdapterError("E_PROVIDER_UNAVAILABLE", "Provider is unavailable or timed out", 503);
    }
    const text = await response.text();
    let body: unknown = {};
    try {
        body = text ? JSON.parse(text) : {};
    } catch {
        body = {};
    }
    const json = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    if (!response.ok || (options.expectedOkField && json.ok !== true)) {
        const code =
            response.status === 401 || response.status === 403
                ? "E_PROVIDER_AUTH"
                : response.status === 429
                  ? "E_PROVIDER_RATE_LIMIT"
                  : "E_PROVIDER_REQUEST";
        const safe =
            code === "E_PROVIDER_AUTH"
                ? "Provider rejected the credentials or permissions"
                : code === "E_PROVIDER_RATE_LIMIT"
                  ? "Provider rate limit reached"
                  : "Provider request failed";
        throw new ProviderAdapterError(code, safe, response.status >= 400 && response.status < 600 ? response.status : 502);
    }
    return json;
}

export function epochDate(value: unknown): Date | null {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}
