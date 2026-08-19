import vine from "@vinejs/vine";

export const trustCaseListValidator = vine.compile(
    vine.object({
        status: vine.enum(["open", "in_review", "waiting_step_up", "held", "resolved", "dismissed", "appealed"]).optional(),
        risk_band: vine.enum(["trusted", "low", "medium", "elevated", "high", "severe"]).optional(),
        q: vine.string().trim().maxLength(190).optional(),
        page: vine.number().min(1).max(100000).optional(),
        limit: vine.number().min(1).max(100).optional(),
    }),
);

export const trustSignalListValidator = vine.compile(
    vine.object({
        risk_band: vine.enum(["trusted", "low", "medium", "elevated", "high", "severe"]).optional(),
        source: vine.string().trim().maxLength(80).optional(),
        signal_type: vine.string().trim().maxLength(120).optional(),
        limit: vine.number().min(1).max(250).optional(),
    }),
);

export const trustGraphValidator = vine.compile(
    vine.object({
        subject_type: vine.string().trim().maxLength(48).optional(),
        subject_id: vine.string().trim().maxLength(190).optional(),
        case_id: vine.string().uuid().optional(),
        depth: vine.number().min(1).max(3).optional(),
    }),
);

export const trustCaseAssignValidator = vine.compile(
    vine.object({
        assignee_user_id: vine.number().positive().nullable(),
        expected_version: vine.number().min(1),
        reason: vine.string().trim().minLength(4).maxLength(500),
    }),
);

export const trustCaseDecisionValidator = vine.compile(
    vine.object({
        action: vine.enum(["allow", "monitor", "step_up", "hold", "block", "dismiss"]),
        reason_code: vine
            .string()
            .trim()
            .regex(/^[a-z0-9][a-z0-9_.-]{1,99}$/),
        reason: vine.string().trim().minLength(8).maxLength(1000),
        expected_version: vine.number().min(1),
        idempotency_key: vine.string().trim().minLength(8).maxLength(160),
    }),
);

export const trustAppealValidator = vine.compile(
    vine.object({
        reason: vine.string().trim().minLength(8).maxLength(1000),
        expected_version: vine.number().min(1),
    }),
);

export const trustOutcomeValidator = vine.compile(
    vine.object({
        outcome: vine.string().trim().minLength(2).maxLength(48),
        is_false_positive: vine.boolean().nullable().optional(),
        appeal_outcome: vine.string().trim().maxLength(48).nullable().optional(),
        baseline: vine.record(vine.any()).optional(),
        predicted_p10_minor: vine.number().min(0).max(9_000_000_000_000).nullable().optional(),
        predicted_p50_minor: vine.number().min(0).max(9_000_000_000_000).nullable().optional(),
        predicted_p90_minor: vine.number().min(0).max(9_000_000_000_000).nullable().optional(),
        actual_loss_minor: vine.number().min(0).max(9_000_000_000_000).nullable().optional(),
        incremental_effect_minor: vine.number().min(-9_000_000_000_000).max(9_000_000_000_000).nullable().optional(),
        prevented_loss_minor: vine.number().min(0).max(9_000_000_000_000).nullable().optional(),
        guardrails: vine.record(vine.any()).optional(),
        final_assessment: vine.string().trim().maxLength(80).nullable().optional(),
        measurement_confidence_bp: vine.number().min(0).max(10000),
        unexpected_effects: vine.array(vine.string().trim().maxLength(190)).maxLength(20).optional(),
        notes: vine.string().trim().maxLength(2000).nullable().optional(),
    }),
);

const policyCondition = vine.object({
    field: vine.enum(["risk_score", "signal_type", "redemptions_48h", "refunds_30d", "returns_30d", "auth_failures_10m", "automation_class"]),
    operator: vine.enum(["eq", "neq", "gte", "gt", "lte", "lt", "in"]),
    value: vine.any(),
});

export const trustPolicyValidator = vine.compile(
    vine.object({
        policy_key: vine
            .string()
            .trim()
            .regex(/^[a-z0-9][a-z0-9_.-]{1,119}$/),
        status: vine.enum(["draft", "active"]),
        scope: vine.record(vine.any()),
        conditions: vine.array(policyCondition).minLength(1).maxLength(20),
        effect: vine.enum(["allow", "monitor", "step_up", "hold", "block"]),
        approval_required: vine.boolean(),
        reason: vine.string().trim().minLength(8).maxLength(1000),
    }),
);

export const trustPolicySimulationValidator = vine.compile(
    vine.object({
        policy_key: vine.string().trim().maxLength(120),
        version: vine.number().min(1).optional(),
        context: vine.record(vine.any()),
    }),
);

export const trustModelRegisterValidator = vine.compile(
    vine.object({
        model_id: vine
            .string()
            .trim()
            .regex(/^[a-z0-9][a-z0-9_.-]{1,119}$/),
        version: vine.string().trim().minLength(1).maxLength(80),
        purpose: vine.string().trim().minLength(4).maxLength(190),
        owner: vine.string().trim().minLength(2).maxLength(190),
        features: vine.array(vine.string().trim().maxLength(120)).maxLength(100),
        privacy_controls: vine.record(vine.any()),
        evaluation: vine.record(vine.any()),
        calibration: vine.record(vine.any()),
        deployment: vine.record(vine.any()).optional(),
        limitations: vine.array(vine.string().trim().maxLength(500)).maxLength(50),
        rollback_version: vine.string().trim().maxLength(80).nullable().optional(),
        reason: vine.string().trim().minLength(8).maxLength(1000),
    }),
);

export const trustModelRolloutValidator = vine.compile(
    vine.object({
        status: vine.enum(["challenger", "champion", "rollback_ready", "disabled"]),
        rollout_percent: vine.number().min(0).max(100),
        reason: vine.string().trim().minLength(8).maxLength(1000),
    }),
);

export const trustAccessPresetValidator = vine.compile(
    vine.object({
        user_id: vine.number().positive(),
        preset: vine.enum(["owner", "risk_admin", "reviewer", "analyst"]),
        reason: vine.string().trim().minLength(8).maxLength(1000),
    }),
);
