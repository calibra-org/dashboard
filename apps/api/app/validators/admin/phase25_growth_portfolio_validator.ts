import vine from "@vinejs/vine";

export const createGrowthPortfolioPlanValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(3).maxLength(180),
        objective: vine.string().trim().minLength(8).maxLength(2000),
        cash_budget_minor: vine.number().min(0).nullable().optional(),
        team_hours_budget: vine.number().min(0).nullable().optional(),
        warehouse_capacity_budget: vine.number().min(0).nullable().optional(),
        supplier_capacity_budget: vine.number().min(0).nullable().optional(),
        max_risk: vine.number().min(0).max(1).nullable().optional(),
        channel_limits: vine.record(vine.number().min(0)).optional(),
        policy_constraints: vine.record(vine.any()).optional(),
    }),
);

export const addGrowthPortfolioCandidateValidator = vine.compile(
    vine.object({
        intelligence_case_id: vine.number().positive().withoutDecimals(),
        expected_incremental_contribution_minor: vine.number(),
        confidence: vine.number().min(0).max(1),
        required_cash_minor: vine.number().min(0),
        team_hours: vine.number().min(0),
        warehouse_capacity: vine.number().min(0),
        supplier_capacity: vine.number().min(0),
        risk: vine.number().min(0).max(1),
        reversibility: vine.number().min(0).max(1),
        time_to_value: vine.number().min(0).max(1),
        customer_impact: vine.number().min(0).max(1),
        strategic_alignment: vine.number().min(0).max(1),
        dependencies: vine.array(vine.number().positive().withoutDecimals()).maxLength(24).optional(),
        exclusive_with: vine.array(vine.number().positive().withoutDecimals()).maxLength(24).optional(),
        channel_requirements: vine.record(vine.number().min(0)).optional(),
    }),
);

export const measureGrowthPortfolioRunValidator = vine.compile(
    vine.object({
        realized_value_minor: vine.number(),
        attribution_confidence: vine.number().min(0).max(1),
        source_outcome_ids: vine.array(vine.number().positive().withoutDecimals()).maxLength(256),
        notes: vine.string().trim().maxLength(4000).optional(),
    }),
);
