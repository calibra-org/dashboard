import vine from "@vinejs/vine";

const id = () => vine.number().withoutDecimals().positive();
const jsonObject = () => vine.record(vine.any());

export const storefrontSocialFeedValidator = vine.compile(
    vine.object({
        locale: vine.string().trim().minLength(2).maxLength(8).optional(),
        tab: vine
            .enum(["for_you", "following", "trending", "latest", "live", "tutorials", "reviews", "deals", "questions"] as const)
            .optional(),
        page: vine.number().withoutDecimals().min(1).optional(),
        limit: vine.number().withoutDecimals().min(1).max(40).optional(),
    }),
);

export const storefrontSocialInteractionValidator = vine.compile(
    vine.object({
        anonymous_id: vine.string().trim().minLength(8).maxLength(96),
        content_id: id().optional().nullable(),
        product_id: id().optional().nullable(),
        marker_id: id().optional().nullable(),
        event_type: vine.enum(["impression", "watch", "share", "product_tap", "cart"] as const),
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

export const storefrontSocialSearchValidator = vine.compile(
    vine.object({
        q: vine.string().trim().maxLength(240).optional(),
        kind: vine.enum(["story", "video", "live", "post", "question"] as const).optional(),
        locale: vine.string().trim().minLength(2).maxLength(16).optional(),
        page: vine.number().withoutDecimals().min(1).optional(),
        limit: vine.number().withoutDecimals().min(1).max(40).optional(),
    }),
);

export const storefrontAskVideoValidator = vine.compile(
    vine.object({
        question: vine.string().trim().minLength(3).maxLength(1_000),
        locale: vine.string().trim().minLength(2).maxLength(16).optional(),
    }),
);
