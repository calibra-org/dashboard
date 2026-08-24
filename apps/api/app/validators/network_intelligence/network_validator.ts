import vine from "@vinejs/vine";

const privacyParameters = vine.object({
    epsilon: vine.number().min(0.000001).max(10).optional(),
    max_cumulative_epsilon: vine.number().min(0.000001).max(100).optional(),
});

export const participationValidator = vine.compile(
    vine.object({
        opted_in: vine.boolean(),
        legal_basis: vine.string().trim().maxLength(96).optional(),
        terms_version: vine.string().trim().maxLength(96).optional(),
        purpose_scopes: vine.array(vine.string().trim().minLength(2).maxLength(96)),
        minimum_cohort_size: vine.number().min(5).max(100000),
        privacy_method: vine.enum(["aggregate_threshold", "laplace_dp", "secure_aggregate"] as const),
        privacy_parameters: privacyParameters.optional(),
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);

export const metricValidator = vine.compile(
    vine.object({
        metric_key: vine.string().trim().minLength(2).maxLength(120).regex(/^[a-z0-9][a-z0-9._-]+$/),
        version: vine.number().min(1).optional(),
        unit: vine.string().trim().minLength(1).maxLength(48),
        numerator_definition: vine.string().trim().minLength(3).maxLength(2000),
        denominator_definition: vine.string().trim().maxLength(2000).optional(),
        aggregation: vine.enum(["mean", "ratio", "median", "percentile", "rate"] as const),
        period_grain: vine.enum(["day", "week", "month", "quarter"] as const),
        minimum_records_per_contribution: vine.number().min(1).max(1000000),
        value_min: vine.number(),
        value_max: vine.number(),
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);

export const contributionValidator = vine.compile(
    vine.object({
        metric_key: vine.string().trim().minLength(2).maxLength(120).regex(/^[a-z0-9][a-z0-9._-]+$/),
        metric_version: vine.number().min(1),
        period_key: vine.string().trim().minLength(2).maxLength(64).regex(/^[A-Za-z0-9._:-]+$/),
        segment_key: vine.string().trim().maxLength(96).regex(/^[A-Za-z0-9._:-]+$/).optional(),
        aggregate_value: vine.number(),
        numerator: vine.number().optional(),
        denominator: vine.number().optional(),
        record_count: vine.number().min(1).max(1000000000),
        source_aggregate_refs: vine.array(vine.string().trim().maxLength(220)).maxLength(32).optional(),
    }),
);

export const exportValidator = vine.compile(
    vine.object({ scope: vine.enum(["participation", "contributions", "all"] as const) }),
);

export const securityReviewValidator = vine.compile(
    vine.object({
        review_type: vine.string().trim().minLength(2).maxLength(64),
        status: vine.enum(["approved", "changes_required", "rejected"] as const),
        artifact_ref: vine.string().trim().minLength(2).maxLength(220),
        findings: vine.array(vine.any()).maxLength(100).optional(),
        decision: vine.string().trim().minLength(3).maxLength(5000),
    }),
);

export const networkAccessPresetValidator = vine.compile(
    vine.object({
        user_id: vine.number().min(1),
        preset: vine.enum(["owner", "privacy_admin", "contributor", "viewer"] as const),
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);
