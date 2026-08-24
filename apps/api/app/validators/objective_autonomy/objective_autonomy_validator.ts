import vine from "@vinejs/vine";

const toolKey = vine
    .string()
    .trim()
    .minLength(2)
    .maxLength(160)
    .regex(/^[a-z0-9][a-z0-9._-]+$/);
const evidenceRef = vine.object({
    source: vine.string().trim().minLength(2).maxLength(80),
    id: vine.string().trim().minLength(1).maxLength(160),
    label: vine.string().trim().minLength(2).maxLength(220),
});

export const objectiveValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(3).maxLength(180),
        target_metric: toolKey,
        direction: vine.enum(["maximize", "minimize", "target"] as const),
        baseline_value: vine.number(),
        target_value: vine.number(),
        horizon_end: vine.string().trim().minLength(10).maxLength(64),
        budget_minor: vine.number().min(0).optional(),
        constraints: vine.record(vine.any()),
        allowed_tool_keys: vine.array(toolKey).minLength(1).maxLength(64),
        autonomy_level: vine.enum(["recommend", "propose", "bounded_auto"] as const),
        risk_ceiling: vine.enum(["read_only", "low", "medium", "high", "critical"] as const),
        minimum_confidence: vine.number().min(0).max(1),
        stop_loss: vine.record(vine.any()),
        approvers: vine.array(vine.string().trim().minLength(1).maxLength(160)).maxLength(32),
        scenario_public_id: vine.string().uuid(),
        portfolio_plan_public_id: vine.string().uuid(),
        agent_plan_public_id: vine.string().uuid(),
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);

export const objectiveStateValidator = vine.compile(vine.object({ reason: vine.string().trim().minLength(3).maxLength(2000) }));

export const cycleValidator = vine.compile(vine.object({ seed: vine.number().min(1).max(2147483647).optional() }));

export const executeObjectiveStepValidator = vine.compile(
    vine.object({
        step_public_id: vine.string().uuid(),
        dry_run: vine.boolean(),
    }),
);

export const checkpointValidator = vine.compile(
    vine.object({
        cycle_public_id: vine.string().uuid().optional(),
        observed_value: vine.number(),
        budget_spent_minor: vine.number().min(0),
        confidence: vine.number().min(0).max(1),
        constraint_breaches: vine.array(vine.string().trim().minLength(2).maxLength(180)).maxLength(64),
        unexpected_harm: vine.boolean(),
        evidence_refs: vine.array(evidenceRef).minLength(1).maxLength(64),
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);

export const postmortemValidator = vine.compile(
    vine.object({
        final_value: vine.number(),
        summary: vine.string().trim().minLength(10).maxLength(8000),
        lesson: vine.string().trim().minLength(10).maxLength(8000),
        residual_uncertainty: vine.record(vine.any()),
        confidence: vine.number().min(0).max(1),
        evidence_refs: vine.array(evidenceRef).minLength(1).maxLength(64),
    }),
);

export const autonomyAccessPresetValidator = vine.compile(
    vine.object({
        user_id: vine.number().min(1),
        preset: vine.enum(["owner", "operator", "strategist", "viewer"] as const),
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);
