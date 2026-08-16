import vine from "@vinejs/vine";

export const runPlanningForecastValidator = vine.compile(
    vine.object({
        history_days: vine.number().withoutDecimals().min(14).max(365).optional(),
        horizon_days: vine.number().withoutDecimals().min(1).max(90).optional(),
    }),
);

export const createPlanningCycleValidator = vine.compile(
    vine.object({
        title: vine.string().trim().minLength(3).maxLength(160),
        forecast_run_id: vine.number().withoutDecimals().positive().optional(),
    }),
);

export const transitionPlanningCycleValidator = vine.compile(
    vine.object({
        status: vine.enum(["data_ready", "forecasted", "under_review", "approved", "published", "superseded", "cancelled"]),
        expected_version: vine.number().withoutDecimals().positive(),
        note: vine.string().trim().maxLength(1000).optional(),
    }),
);

export const createPlanningScenarioValidator = vine.compile(
    vine.object({
        title: vine.string().trim().minLength(3).maxLength(160),
        base_forecast_run_id: vine.number().withoutDecimals().positive().optional(),
        demand_multiplier: vine.number().min(0.1).max(5),
        lead_time_days: vine.number().withoutDecimals().min(0).max(365).optional(),
        capital_limit_minor: vine.number().withoutDecimals().min(0).optional(),
        notes: vine.string().trim().maxLength(2000).optional(),
    }),
);

export const createPlanningOverrideValidator = vine.compile(
    vine.object({
        forecast_point_id: vine.number().withoutDecimals().positive(),
        override_quantity: vine.number().min(0),
        reason: vine.string().trim().minLength(5).maxLength(320),
        evidence: vine.record(vine.any()).optional(),
    }),
);

export const reviewPlanningOverrideValidator = vine.compile(
    vine.object({
        decision: vine.enum(["approved", "rejected"]),
    }),
);
