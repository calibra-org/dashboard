import vine from "@vinejs/vine";

const id = () => vine.number().withoutDecimals().positive();
const jsonObject = () => vine.record(vine.any());

export const accountSocialFollowValidator = vine.compile(
    vine.object({
        subject_type: vine.enum(["user", "creator", "brand", "category", "topic", "series"] as const),
        subject_ref: vine.string().trim().minLength(1).maxLength(160),
        following: vine.boolean(),
    }),
);

export const accountSocialInteractionValidator = vine.compile(
    vine.object({
        content_id: id().optional().nullable(),
        product_id: id().optional().nullable(),
        marker_id: id().optional().nullable(),
        event_type: vine.enum([
            "impression",
            "view",
            "watch",
            "progress",
            "completion",
            "replay",
            "like",
            "reaction",
            "save",
            "share",
            "comment",
            "reply",
            "mention",
            "poll_vote",
            "question",
            "report",
            "product_tap",
            "cart",
            "purchase",
        ] as const),
        source_surface: vine.string().trim().minLength(1).maxLength(40),
        position_ms: vine.number().withoutDecimals().min(0).optional().nullable(),
        watch_ms: vine.number().withoutDecimals().min(0).max(86_400_000).optional().nullable(),
        metadata: jsonObject().optional(),
        event_id: vine.string().uuid().optional(),
        session_id: vine.string().trim().maxLength(120).optional().nullable(),
        correlation_id: vine.string().trim().maxLength(120).optional().nullable(),
        causation_id: vine.string().trim().maxLength(120).optional().nullable(),
        consent_context: vine.string().trim().maxLength(80).optional().nullable(),
        dedupe_key: vine.string().trim().maxLength(200).optional().nullable(),
    }),
);

export const accountSocialThreadCreateValidator = vine.compile(
    vine.object({
        kind: vine.enum(["public_qa", "community", "private"] as const),
        channel_id: id().optional().nullable(),
        content_id: id().optional().nullable(),
        subject: vine.string().trim().minLength(1).maxLength(255),
        message: vine.string().trim().minLength(1).maxLength(20_000),
        media_ids: vine.array(id()).maxLength(8).optional(),
    }),
);

export const accountSocialMessageValidator = vine.compile(
    vine.object({
        body: vine.string().trim().minLength(1).maxLength(20_000),
        media_ids: vine.array(id()).maxLength(8).optional(),
    }),
);

export const accountSocialReportValidator = vine.compile(
    vine.object({
        target_type: vine.enum(["content", "message"] as const),
        target_id: id(),
        category: vine.enum([
            "spam",
            "scam",
            "phishing",
            "harassment",
            "unsafe_content",
            "impersonation",
            "duplicate",
            "prohibited_link",
            "misinformation",
            "product_claim_risk",
            "copyright",
            "rights",
        ] as const),
        evidence: jsonObject().optional(),
    }),
);

export const accountSocialMediaUploadIntentValidator = vine.compile(
    vine.object({
        filename: vine.string().trim().minLength(1).maxLength(512),
        mime: vine
            .string()
            .trim()
            .regex(/^video\/[a-z0-9.+-]+$/i),
        size_bytes: vine.number().withoutDecimals().positive(),
        purpose: vine.enum(["story", "video", "review", "message"] as const),
        access_policy: vine.enum(["public", "signed", "members", "private"] as const).optional(),
    }),
);

export const accountSocialReviewMediaValidator = vine.compile(
    vine.object({
        media_id: id(),
        sequence: vine.number().withoutDecimals().min(0).max(20).optional(),
    }),
);

export const accountSocialReviewHelpfulValidator = vine.compile(vine.object({ helpful: vine.boolean() }));

export const accountSocialReviewReportValidator = vine.compile(
    vine.object({
        reason_code: vine.enum([
            "spam",
            "harassment",
            "misinformation",
            "prohibited_content",
            "conflict_of_interest",
            "other",
        ] as const),
        details: vine.string().trim().maxLength(4_000).optional().nullable(),
    }),
);

export const accountSocialAppealValidator = vine.compile(
    vine.object({ reason: vine.string().trim().minLength(10).maxLength(8_000) }),
);
