import vine from "@vinejs/vine";

const variant = vine.object({
    key: vine.string().trim().minLength(1).maxLength(80),
    name: vine.string().trim().minLength(1).maxLength(160),
    weight_bps: vine.number().withoutDecimals().min(1).max(10000),
    is_control: vine.boolean().optional(),
    payload: vine.record(vine.any()).optional(),
});

export const createExperimentValidator = vine.compile(
    vine.object({
        experiment_key: vine
            .string()
            .trim()
            .regex(/^[a-z0-9][a-z0-9._-]{2,119}$/),
        name: vine.string().trim().minLength(3).maxLength(190),
        hypothesis: vine.string().trim().minLength(10).maxLength(3000),
        surface: vine.enum([
            "price",
            "discount",
            "image_gallery",
            "title_copy",
            "product_layout",
            "search_ranking",
            "recommendation_rank",
            "cta",
            "landing_page",
            "checkout",
            "shipping_message",
            "email_push",
            "content_seo",
            "story_video",
        ]),
        risk_level: vine.enum(["low", "medium", "high", "critical"]).optional(),
        randomization_unit: vine.enum(["visitor", "customer", "session", "account", "order", "product", "request"]),
        layer_key: vine.string().trim().minLength(1).maxLength(96).optional(),
        layer_start_bps: vine.number().withoutDecimals().min(0).max(9999).optional(),
        layer_end_bps: vine.number().withoutDecimals().min(1).max(10000).optional(),
        primary_metric_key: vine.string().trim().minLength(1).maxLength(120),
        primary_metric_kind: vine.enum(["binary", "continuous", "count", "money"]).optional(),
        secondary_metrics: vine.array(vine.string().trim().maxLength(120)).optional(),
        guardrails: vine.array(vine.record(vine.any())).optional(),
        eligibility: vine.record(vine.any()).optional(),
        exclusions: vine.array(vine.string().trim().maxLength(190)).optional(),
        sample_plan: vine.record(vine.any()).optional(),
        analysis_method: vine.string().trim().maxLength(48).optional(),
        approval_reference: vine.string().trim().maxLength(190).nullable().optional(),
        variants: vine.array(variant).minLength(2).maxLength(8),
    }),
);

export const transitionExperimentValidator = vine.compile(
    vine.object({
        status: vine.enum(["review", "scheduled", "running", "paused", "stopped", "completed", "archived"]),
        expected_version: vine.number().withoutDecimals().positive(),
        reason: vine.string().trim().maxLength(1000).optional(),
        approval_reference: vine.string().trim().maxLength(190).nullable().optional(),
    }),
);

export const assignExperimentValidator = vine.compile(
    vine.object({
        experiment_key: vine.string().trim().maxLength(120),
        subject_type: vine.enum(["visitor", "customer", "session", "account", "order", "product", "request"]),
        subject_key: vine.string().trim().minLength(1).maxLength(190),
    }),
);

export const exposureValidator = vine.compile(
    vine.object({
        exposure_id: vine.string().uuid(),
        experiment_key: vine.string().trim().maxLength(120),
        subject_type: vine.enum(["visitor", "customer", "session", "account", "order", "product", "request"]),
        subject_key: vine.string().trim().minLength(1).maxLength(190),
        surface: vine.string().trim().minLength(1).maxLength(64),
        placement: vine.string().trim().maxLength(96).nullable().optional(),
        context: vine.record(vine.any()).optional(),
        occurred_at: vine.string().trim(),
    }),
);

export const observationValidator = vine.compile(
    vine.object({
        observation_id: vine.string().uuid(),
        experiment_key: vine.string().trim().maxLength(120),
        subject_type: vine.enum(["visitor", "customer", "session", "account", "order", "product", "request"]),
        subject_key: vine.string().trim().minLength(1).maxLength(190),
        metric_key: vine.string().trim().minLength(1).maxLength(120),
        metric_kind: vine.enum(["binary", "continuous", "count", "money"]),
        value: vine.number(),
        currency: vine.string().trim().fixedLength(3).nullable().optional(),
        context: vine.record(vine.any()).optional(),
        occurred_at: vine.string().trim(),
    }),
);

export const createHoldoutValidator = vine.compile(
    vine.object({
        holdout_key: vine
            .string()
            .trim()
            .regex(/^[a-z0-9][a-z0-9._-]{2,119}$/),
        name: vine.string().trim().minLength(3).maxLength(190),
        scope: vine.enum(["recommendation", "automation", "ai_intervention", "marketing"]),
        allocation_bps: vine.number().withoutDecimals().min(1).max(5000),
        purpose: vine.string().trim().minLength(10).maxLength(2000),
    }),
);
