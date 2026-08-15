import vine from "@vinejs/vine";

const positiveId = () => vine.number().withoutDecimals().positive();
const jsonObject = () => vine.record(vine.any());

export const seoActionCreateValidator = vine.compile(
    vine.object({
        action_type: vine.enum(["media_alt", "content_refresh", "seo_profile"] as const),
        entity_kind: vine.enum(["media", "content_post", "product", "category", "brand", "attribute", "page"] as const),
        entity_id: positiveId().optional().nullable(),
        entity_key: vine.string().trim().maxLength(255).optional().nullable(),
        expected_version: positiveId().optional().nullable(),
        after_payload: jsonObject(),
    }),
);

export const seoActionReviewValidator = vine.compile(
    vine.object({
        decision: vine.enum(["approved", "rejected"] as const),
        note: vine.string().trim().maxLength(2000).optional().nullable(),
    }),
);

export const seoMediaBulkAltValidator = vine.compile(
    vine.object({
        items: vine
            .array(
                vine.object({
                    media_id: positiveId(),
                    alt: vine.string().trim().maxLength(512).nullable(),
                }),
            )
            .minLength(1)
            .maxLength(100),
    }),
);

export const seoCrawlCreateValidator = vine.compile(
    vine.object({
        urls: vine.array(vine.string().trim().url()).minLength(1).maxLength(100),
    }),
);

export const seoExportCreateValidator = vine.compile(
    vine.object({
        report_kind: vine.enum(["overview", "issues", "keywords", "entities", "crawl"] as const),
        format: vine.enum(["csv", "json"] as const),
        filters: jsonObject().optional(),
    }),
);
