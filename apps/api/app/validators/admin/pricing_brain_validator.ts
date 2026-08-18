import vine from "@vinejs/vine";

const jsonRecord = () => vine.record(vine.any()).optional();
const nullablePositiveId = () => vine.number().withoutDecimals().positive().nullable().optional();

export const simulatePricingCandidateValidator = vine.compile(
    vine.object({
        reference_price: vine.number().withoutDecimals().positive(),
        candidate_price: vine.number().withoutDecimals().min(0),
        quantity: vine.number().withoutDecimals().positive().optional(),
        promotion_discount: vine.number().withoutDecimals().min(0).optional(),
        product_id: vine.number().withoutDecimals().positive().optional(),
        variation_id: nullablePositiveId(),
        floor_price: vine.number().withoutDecimals().min(0).nullable().optional(),
        cogs: vine.number().withoutDecimals().min(0).nullable().optional(),
        minimum_margin_percent: vine.number().min(0).max(100).nullable().optional(),
        maximum_discount_percent: vine.number().min(0).max(100).nullable().optional(),
    }),
);

export const createPricingPolicyValidator = vine.compile(
    vine.object({
        policy_key: vine.string().trim().minLength(2).maxLength(120),
        name: vine.string().trim().minLength(2).maxLength(180),
        objective: vine.string().trim().maxLength(120).nullable().optional(),
        currency: vine.string().trim().fixedLength(3),
        product_id: nullablePositiveId(),
        variation_id: nullablePositiveId(),
        scope: jsonRecord(),
        guardrails: jsonRecord(),
        evidence: jsonRecord(),
        reason: vine.string().trim().maxLength(2000).nullable().optional(),
    }),
);

export const createPricingVersionValidator = vine.compile(
    vine.object({
        currency: vine.string().trim().fixedLength(3).optional(),
        product_id: nullablePositiveId(),
        variation_id: nullablePositiveId(),
        scope: jsonRecord(),
        guardrails: jsonRecord(),
        evidence: jsonRecord(),
        reason: vine.string().trim().maxLength(2000).nullable().optional(),
    }),
);

export const createPricingProposalValidator = vine.compile(
    vine.object({
        policy_id: vine.number().withoutDecimals().positive(),
        policy_version_id: nullablePositiveId(),
        product_id: vine.number().withoutDecimals().positive(),
        variation_id: nullablePositiveId(),
        reference_price_minor: vine.number().withoutDecimals().min(0),
        candidate_price_minor: vine.number().withoutDecimals().min(0),
        currency: vine.string().trim().fixedLength(3),
        objective: vine.string().trim().maxLength(120).nullable().optional(),
        rationale: vine.string().trim().maxLength(4000).nullable().optional(),
        evidence: jsonRecord(),
    }),
);

export const transitionPricingPolicyValidator = vine.compile(
    vine.object({
        expected_version: vine.number().withoutDecimals().positive(),
        reason: vine.string().trim().minLength(3).maxLength(2000),
        evidence: jsonRecord(),
        correlation_id: vine.string().trim().maxLength(120).nullable().optional(),
        idempotency_key: vine.string().trim().maxLength(180).nullable().optional(),
        scheduled_at: vine.string().trim().nullable().optional(),
        rollback_to_version: vine.number().withoutDecimals().positive().nullable().optional(),
    }),
);

export const freezePricingPolicyValidator = vine.compile(
    vine.object({
        frozen: vine.boolean(),
        reason: vine.string().trim().minLength(3).maxLength(2000),
        idempotency_key: vine.string().trim().maxLength(180).nullable().optional(),
    }),
);
