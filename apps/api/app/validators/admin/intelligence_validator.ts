import vine from "@vinejs/vine";

export const adminIntelligenceInboxValidator = vine.compile(
    vine.object({
        page: vine.number().withoutDecimals().min(1).optional(),
        limit: vine.number().withoutDecimals().min(1).max(100).optional(),
        domain: vine.enum(["payments", "fulfillment", "support", "inventory", "seo"] as const).optional(),
        severity: vine.enum(["low", "medium", "high", "critical"] as const).optional(),
        state: vine.enum(["open", "cleared"] as const).optional(),
        q: vine.string().trim().minLength(1).maxLength(160).optional(),
    }),
);

export const adminIntelligenceDecisionValidator = vine.compile(
    vine.object({
        decision: vine.enum(["accept", "reject", "defer", "watch"] as const),
        reason: vine.string().trim().minLength(3).maxLength(2_000),
        version: vine.number().withoutDecimals().min(1),
    }),
);

export const adminIntelligenceOutcomeValidator = vine.compile(
    vine.object({
        metric_name: vine.string().trim().minLength(2).maxLength(160),
        baseline_value: vine.number().optional(),
        observed_value: vine.number().optional(),
        measurement_window: vine.string().trim().maxLength(80).optional(),
        attribution_confidence: vine.number().min(0).max(1).optional(),
        notes: vine.string().trim().maxLength(4_000).optional(),
        observed_at: vine.string().trim().maxLength(80),
    }),
);
