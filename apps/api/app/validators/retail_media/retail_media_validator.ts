import vine from "@vinejs/vine";

const jsonRecord = vine.record(vine.any());
const publicId = vine.string().trim().uuid();
const currency = vine
    .string()
    .trim()
    .fixedLength(3)
    .regex(/^[A-Za-z]{3}$/);
const code = vine
    .string()
    .trim()
    .minLength(4)
    .maxLength(96)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._~-]+$/);
const subjectHash = vine
    .string()
    .trim()
    .fixedLength(64)
    .regex(/^[a-fA-F0-9]{64}$/);
const reason = vine.string().trim().minLength(3).maxLength(2000);
const isoDate = vine.string().trim().minLength(10).maxLength(64);

export const retailMediaAdvertiserCreateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(2).maxLength(190),
        kind: vine.enum(["brand", "supplier", "merchant", "agency"] as const),
        supplier_id: vine.number().positive().withoutDecimals().optional(),
        metadata: jsonRecord,
        reason,
    }),
);

export const retailMediaCampaignCreateValidator = vine.compile(
    vine.object({
        advertiser_public_id: publicId,
        name: vine.string().trim().minLength(3).maxLength(190),
        objective: vine.string().trim().minLength(3).maxLength(48),
        bid_model: vine.enum(["cpc", "cpm"] as const),
        default_bid_minor: vine.number().min(0).withoutDecimals(),
        budget_total_minor: vine.number().positive().withoutDecimals(),
        daily_pacing_cap_minor: vine.number().positive().withoutDecimals().optional(),
        currency,
        attribution_window_days: vine.number().min(1).max(90).withoutDecimals(),
        experiment_id: vine.number().positive().withoutDecimals().optional(),
        holdout_id: vine.number().positive().withoutDecimals().optional(),
        starts_at: isoDate.optional(),
        ends_at: isoDate.optional(),
        reason,
    }),
);

export const retailMediaCampaignUpdateValidator = vine.compile(
    vine.object({
        version: vine.number().positive().withoutDecimals(),
        default_bid_minor: vine.number().min(0).withoutDecimals().optional(),
        budget_total_minor: vine.number().positive().withoutDecimals().optional(),
        daily_pacing_cap_minor: vine.number().positive().withoutDecimals().nullable().optional(),
        attribution_window_days: vine.number().min(1).max(90).withoutDecimals().optional(),
        starts_at: isoDate.nullable().optional(),
        ends_at: isoDate.nullable().optional(),
        reason,
    }),
);

export const retailMediaCampaignStateValidator = vine.compile(
    vine.object({
        status: vine.enum(["review", "active", "paused", "ended", "archived"] as const),
        reason,
    }),
);

export const retailMediaCampaignProductValidator = vine.compile(
    vine.object({
        product_id: vine.number().positive().withoutDecimals(),
        variation_id: vine.number().positive().withoutDecimals().optional(),
        relevance_bps: vine.number().min(0).max(10000).withoutDecimals(),
        quality_bps: vine.number().min(0).max(10000).withoutDecimals(),
        safety_status: vine.enum(["review", "approved", "blocked"] as const),
        custom_bid_minor: vine.number().min(0).withoutDecimals().optional(),
        reason,
    }),
);

export const retailMediaPlacementCreateValidator = vine.compile(
    vine.object({
        placement_key: vine
            .string()
            .trim()
            .minLength(3)
            .maxLength(120)
            .regex(/^[A-Za-z0-9][A-Za-z0-9._~-]+$/),
        name: vine.string().trim().minLength(2).maxLength(190),
        surface: vine.enum(["search", "category", "product", "story", "video", "collection", "live", "email", "push"] as const),
        disclosure_text: vine.string().trim().minLength(2).maxLength(80),
        minimum_relevance_bps: vine.number().min(0).max(10000).withoutDecimals(),
        minimum_quality_bps: vine.number().min(0).max(10000).withoutDecimals(),
        privacy_min_cohort: vine.number().min(20).max(100000).withoutDecimals(),
        metadata: jsonRecord,
        reason,
    }),
);

export const retailMediaPlacementStateValidator = vine.compile(
    vine.object({
        status: vine.enum(["active", "paused", "archived"] as const),
        reason,
    }),
);

export const retailMediaCampaignPlacementValidator = vine.compile(
    vine.object({
        placement_public_id: publicId,
        bid_multiplier_bps: vine.number().min(0).max(50000).withoutDecimals(),
        creative: jsonRecord,
        creative_source_ref: vine.string().trim().minLength(1).maxLength(190).optional(),
        reason,
    }),
);

export const retailMediaFundingValidator = vine.compile(
    vine.object({
        amount_minor: vine.number().positive().withoutDecimals(),
        funding_source: vine.enum(["merchant", "supplier", "brand"] as const),
        source_ref: vine.string().trim().minLength(1).maxLength(190).optional(),
        idempotency_key: vine.string().trim().minLength(8).maxLength(190),
        metadata: jsonRecord,
        reason,
    }),
);

export const retailMediaServeValidator = vine.compile(
    vine.object({
        subject_hash: subjectHash.optional(),
        consent_context: vine.string().trim().minLength(2).maxLength(32).optional(),
        context: jsonRecord,
    }),
);

export const retailMediaClickValidator = vine.compile(
    vine.object({
        context: jsonRecord,
    }),
);

export const retailMediaCreatorCreateValidator = vine.compile(
    vine.object({
        display_name: vine.string().trim().minLength(2).maxLength(190),
        handle: vine.string().trim().minLength(2).maxLength(120).optional(),
        holding_days: vine.number().min(1).max(90).withoutDecimals(),
        disclosure_text: vine.string().trim().minLength(2).maxLength(120),
        payout_ref: vine.string().trim().minLength(1).maxLength(190).optional(),
        metadata: jsonRecord,
        reason,
    }),
);

export const retailMediaAffiliateLinkValidator = vine.compile(
    vine.object({
        campaign_public_id: publicId.optional(),
        product_id: vine.number().positive().withoutDecimals().optional(),
        variation_id: vine.number().positive().withoutDecimals().optional(),
        code,
        commission_bps: vine.number().min(0).max(10000).withoutDecimals(),
        fixed_commission_minor: vine.number().min(0).withoutDecimals().optional(),
        attribution_window_days: vine.number().min(1).max(90).withoutDecimals(),
        starts_at: isoDate.optional(),
        ends_at: isoDate.optional(),
        reason,
    }),
);

export const retailMediaPayoutValidator = vine.compile(
    vine.object({
        amount_minor: vine.number().positive().withoutDecimals(),
        currency,
        payout_ref: vine.string().trim().minLength(3).maxLength(190),
        idempotency_key: vine.string().trim().minLength(8).maxLength(190),
        reason,
    }),
);

export const retailMediaAccessPresetValidator = vine.compile(
    vine.object({
        user_id: vine.number().positive().withoutDecimals(),
        preset: vine.enum(["owner", "growth", "operator", "finance", "analyst", "viewer"] as const),
        reason,
    }),
);
