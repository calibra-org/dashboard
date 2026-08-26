import vine from "@vinejs/vine";

const publicId = vine.string().trim().uuid();
const reason = vine.string().trim().minLength(3).maxLength(2000);
const jsonRecord = vine.record(vine.any());

export const reliabilityInvariantValidator = vine.compile(
    vine.object({
        invariant_key: vine.string().trim().minLength(2).maxLength(120).regex(/^[a-z0-9._~-]+$/),
        name: vine.string().trim().minLength(2).maxLength(190),
        domain: vine.string().trim().minLength(2).maxLength(64),
        severity: vine.enum(["info", "warning", "critical"] as const),
        source_kind: vine.enum(["synthetic_pass_rate", "fulfillment_promise_accuracy", "manual_metric"] as const),
        source_config: jsonRecord,
        operator: vine.enum(["gte", "lte", "gt", "lt", "eq"] as const),
        threshold: vine.number().min(-1000000000).max(1000000000),
        window_seconds: vine.number().min(60).max(604800).withoutDecimals(),
        min_consecutive_failures: vine.number().min(1).max(20).withoutDecimals(),
        recovery_consecutive_passes: vine.number().min(1).max(20).withoutDecimals(),
        remediation_policy_public_id: publicId.optional(),
        reason,
    }),
);

export const reliabilityPolicyValidator = vine.compile(
    vine.object({
        policy_key: vine.string().trim().minLength(2).maxLength(120).regex(/^[a-z0-9._~-]+$/),
        name: vine.string().trim().minLength(2).maxLength(190),
        action_type: vine.enum(["rollback_configuration", "pause_experiment", "disable_policy"] as const),
        risk_level: vine.enum(["low", "medium", "high", "critical"] as const),
        auto_execute: vine.boolean(),
        target: jsonRecord,
        cooldown_seconds: vine.number().min(60).max(604800).withoutDecimals(),
        max_executions_per_hour: vine.number().min(1).max(12).withoutDecimals(),
        rollback_required: vine.boolean(),
        reason,
    }),
);

export const reliabilityObservationValidator = vine.compile(
    vine.object({
        value: vine.number().min(-1000000000).max(1000000000),
        evidence: jsonRecord,
    }),
);

export const reliabilityRemediationExecuteValidator = vine.compile(
    vine.object({ reason }),
);
