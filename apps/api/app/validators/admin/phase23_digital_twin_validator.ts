import vine from "@vinejs/vine";

const assumptions = vine.object({
    demand_multiplier: vine.number().min(0.1).max(5),
    price_multiplier: vine.number().min(0.5).max(2),
    cost_multiplier: vine.number().min(0.5).max(3),
    lead_time_multiplier: vine.number().min(0.25).max(4),
    capacity_multiplier: vine.number().min(0.1).max(5),
    capital_limit_minor: vine.number().min(0).nullable().optional(),
    campaign_lift: vine.number().min(-0.9).max(5).optional(),
    service_level_target: vine.number().min(0.5).max(0.999).optional(),
});

export const createDigitalTwinScenarioValidator = vine.compile(
    vine.object({
        title: vine.string().trim().minLength(3).maxLength(180),
        objective: vine.string().trim().minLength(8).maxLength(2000),
        assumptions,
        source_refs: vine.record(vine.any()).optional(),
    }),
);

export const updateDigitalTwinScenarioValidator = vine.compile(
    vine.object({
        title: vine.string().trim().minLength(3).maxLength(180),
        objective: vine.string().trim().minLength(8).maxLength(2000),
        assumptions,
        source_refs: vine.record(vine.any()).optional(),
    }),
);

export const runDigitalTwinValidator = vine.compile(
    vine.object({
        seed: vine.number().min(1).max(2147483647).optional(),
    }),
);
