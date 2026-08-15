import vine from "@vinejs/vine";

const positiveId = () => vine.number().withoutDecimals().positive();
const version = () => vine.number().withoutDecimals().positive();
const jsonObject = () => vine.record(vine.any());

export const ticketSavedViewCreateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(120),
        query: jsonObject(),
        is_shared: vine.boolean().optional(),
    }),
);

export const ticketSavedViewUpdateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(120).optional(),
        query: jsonObject().optional(),
        is_shared: vine.boolean().optional(),
    }),
);

export const ticketBulkOperationValidator = vine.compile(
    vine.object({
        tickets: vine
            .array(vine.object({ id: positiveId(), expected_version: version() }))
            .minLength(1)
            .maxLength(100),
        operation: vine.enum(["assign", "priority", "category", "tags", "transition"] as const),
        assigned_user_id: positiveId().nullable().optional(),
        priority: vine.enum(["low", "normal", "high", "urgent"] as const).optional(),
        category: vine.string().trim().maxLength(80).nullable().optional(),
        tags: vine.array(vine.string().trim().minLength(1).maxLength(40)).maxLength(20).optional(),
        status: vine.enum(["open", "pending", "waiting_customer", "resolved", "closed"] as const).optional(),
        reason: vine.string().trim().maxLength(1000).nullable().optional(),
    }),
);

export const ticketAttachmentValidator = vine.compile(
    vine.object({
        media_id: positiveId(),
        message_id: positiveId().nullable().optional(),
        sha256: vine
            .string()
            .trim()
            .regex(/^[a-f0-9]{64}$/i)
            .nullable()
            .optional(),
    }),
);

export const ticketAttachmentScanValidator = vine.compile(
    vine.object({
        status: vine.enum(["clean", "infected", "error"] as const),
        evidence: vine.string().trim().maxLength(512).nullable().optional(),
    }),
);

export const ticketMergeValidator = vine.compile(
    vine.object({
        target_ticket_id: positiveId(),
        expected_source_version: version(),
        expected_target_version: version(),
        reason: vine.string().trim().maxLength(500).nullable().optional(),
    }),
);

export const ticketPresenceValidator = vine.compile(
    vine.object({
        state: vine.enum(["offline", "available", "busy", "away"] as const),
        capacity: vine.number().withoutDecimals().min(0).max(500),
    }),
);

export const ticketChannelUpdateValidator = vine.compile(
    vine.object({
        channel: vine.enum([
            "web",
            "email",
            "phone",
            "api",
            "whatsapp",
            "telegram",
            "instagram",
            "rubika",
            "bale",
            "eitaa",
            "sms",
        ] as const),
        enabled: vine.boolean(),
        credential_env_ref: vine
            .string()
            .trim()
            .regex(/^CALIBRA_SUPPORT_[A-Z0-9_]{1,120}$/)
            .nullable()
            .optional(),
        configuration: jsonObject().optional(),
    }),
);

export const ticketRuleCreateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(140),
        priority: vine.number().withoutDecimals().min(0).max(10000).optional(),
        enabled: vine.boolean().optional(),
        conditions: jsonObject(),
        actions: jsonObject(),
    }),
);

export const ticketRuleUpdateValidator = vine.compile(
    vine.object({
        expected_version: version(),
        name: vine.string().trim().minLength(1).maxLength(140).optional(),
        priority: vine.number().withoutDecimals().min(0).max(10000).optional(),
        enabled: vine.boolean().optional(),
        conditions: jsonObject().optional(),
        actions: jsonObject().optional(),
    }),
);

export const ticketAutomationCreateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(140),
        trigger: vine.enum(["ticket_created", "ticket_updated", "status_changed", "message_received", "sla_breached"] as const),
        enabled: vine.boolean().optional(),
        conditions: jsonObject(),
        actions: vine.array(jsonObject()).minLength(1).maxLength(20),
    }),
);

export const ticketAutomationUpdateValidator = vine.compile(
    vine.object({
        expected_version: version(),
        name: vine.string().trim().minLength(1).maxLength(140).optional(),
        enabled: vine.boolean().optional(),
        conditions: jsonObject().optional(),
        actions: vine.array(jsonObject()).minLength(1).maxLength(20).optional(),
    }),
);

export const ticketCampaignCreateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(180),
        channel: vine.enum(["email", "whatsapp", "telegram", "instagram", "rubika", "bale", "eitaa", "sms"] as const),
        template_body: vine.string().trim().minLength(1).maxLength(20_000),
        quiet_hours: jsonObject().optional(),
        estimated_cost_minor: vine.number().withoutDecimals().min(0).optional(),
        scheduled_at: vine
            .date({ formats: ["iso8601"] })
            .nullable()
            .optional(),
    }),
);

export const ticketCampaignRecipientsValidator = vine.compile(
    vine.object({
        expected_version: version(),
        recipients: vine.array(vine.string().trim().minLength(1).maxLength(254)).minLength(1).maxLength(5000),
    }),
);

export const ticketCampaignTransitionValidator = vine.compile(
    vine.object({
        expected_version: version(),
        status: vine.enum(["scheduled", "paused", "cancelled"] as const),
    }),
);

export const ticketWorkflowStatusValidator = vine.compile(
    vine.object({
        code: vine
            .string()
            .trim()
            .regex(/^[a-z][a-z0-9_]{1,47}$/),
        label_fa: vine.string().trim().minLength(1).maxLength(120),
        label_en: vine.string().trim().minLength(1).maxLength(120),
        semantic_group: vine.enum(["active", "waiting", "resolved", "closed"] as const),
        is_terminal: vine.boolean().optional(),
        is_customer_waiting: vine.boolean().optional(),
        is_enabled: vine.boolean().optional(),
        sort_order: vine.number().withoutDecimals().min(0).max(10000).optional(),
    }),
);
