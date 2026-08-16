import vine from "@vinejs/vine";

const channels = ["web", "email", "phone", "api", "whatsapp", "telegram", "instagram", "rubika", "bale", "eitaa", "sms"] as const;
const positiveId = () => vine.number().withoutDecimals().positive();
const jsonObject = () => vine.record(vine.any());

export const supportChannelConfigureValidator = vine.compile(
    vine.object({
        channel: vine.enum(channels),
        provider_key: vine.string().trim().minLength(1).maxLength(64),
        enabled: vine.boolean().optional(),
        configuration: jsonObject().optional(),
        credentials: jsonObject().optional(),
    }),
);

export const supportChannelReplyValidator = vine.compile(
    vine.object({
        body: vine.string().trim().minLength(1).maxLength(20_000),
        expected_version: positiveId(),
        reply_to_external_id: vine.string().trim().maxLength(255).nullable().optional(),
    }),
);

export const supportChannelMediaReplyValidator = vine.compile(
    vine.object({
        attachment_id: positiveId(),
        caption: vine.string().trim().maxLength(1024).optional(),
        expected_version: positiveId(),
        reply_to_external_id: vine.string().trim().maxLength(255).nullable().optional(),
    }),
);

export const supportChannelDisconnectValidator = vine.compile(vine.object({ revoke: vine.boolean().optional() }));

export const supportApiKeyCreateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(120),
        scopes: vine
            .array(vine.enum(["tickets.read", "tickets.write", "messages.read", "messages.send", "webhooks.manage"] as const))
            .minLength(1)
            .maxLength(5),
        allowed_ips: vine.array(vine.string().trim().minLength(2).maxLength(64)).maxLength(32).optional(),
        rate_limit_per_minute: vine.number().withoutDecimals().min(1).max(10_000).optional(),
        expires_at: vine
            .date({ formats: ["iso8601"] })
            .nullable()
            .optional(),
    }),
);

export const supportApiWebhookCreateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(120),
        url: vine.string().trim().url(),
        events: vine.array(vine.string().trim().minLength(1).maxLength(80)).minLength(1).maxLength(20),
    }),
);

export const supportCampaignProviderTemplateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(512),
        language_code: vine.string().trim().minLength(2).maxLength(35),
        components: vine.array(vine.record(vine.any())).maxLength(20).optional(),
    }),
);
