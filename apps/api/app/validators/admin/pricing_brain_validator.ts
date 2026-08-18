import vine from "@vinejs/vine";

export const simulatePricingCandidateValidator = vine.compile(
    vine.object({
        reference_price: vine.number().withoutDecimals().positive(),
        candidate_price: vine.number().withoutDecimals().min(0),
        quantity: vine.number().withoutDecimals().positive().optional(),
        product_id: vine.number().withoutDecimals().positive().optional(),
        variation_id: vine.number().withoutDecimals().positive().nullable().optional(),
        floor_price: vine.number().withoutDecimals().min(0).nullable().optional(),
        cogs: vine.number().withoutDecimals().min(0).nullable().optional(),
        minimum_margin_percent: vine.number().min(0).max(100).nullable().optional(),
        maximum_discount_percent: vine.number().min(0).max(100).nullable().optional(),
    }),
);
