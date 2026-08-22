import vine from "@vinejs/vine";
export const agentValidator = vine.compile(
    vine.object({
        agent_key: vine.string().trim().minLength(2).maxLength(96),
        display_name: vine.string().trim().minLength(2).maxLength(160),
        specialty: vine.enum([
            "finance",
            "inventory",
            "procurement",
            "pricing",
            "growth",
            "customer",
            "seo",
            "content",
            "support",
            "risk",
            "quality",
            "operations_sre",
        ]),
        scopes: vine.array(vine.string().trim().maxLength(128)).maxLength(64),
        budget_minor: vine.number().min(0),
        is_active: vine.boolean(),
        reason: vine.string().trim().minLength(8).maxLength(500),
    }),
);
export const toolValidator = vine.compile(
    vine.object({
        tool_key: vine.string().trim().minLength(3).maxLength(128),
        version: vine.number().min(1),
        handler_key: vine.string().trim().minLength(3).maxLength(128),
        input_schema: vine.record(vine.any()),
        output_schema: vine.record(vine.any()),
        required_scopes: vine.array(vine.string().trim().maxLength(128)).maxLength(64),
        required_permission: vine.string().trim().maxLength(128).nullable().optional(),
        risk_class: vine.enum(["read_only", "low", "medium", "high", "critical"]),
        supports_dry_run: vine.boolean(),
        reversible: vine.boolean(),
        rollback_plan: vine.string().trim().maxLength(2000).nullable().optional(),
        approval_required: vine.boolean(),
        side_effects: vine.array(vine.string().trim().maxLength(160)).maxLength(32),
        reason: vine.string().trim().minLength(8).maxLength(500),
    }),
);
export const planValidator = vine.compile(
    vine.object({
        agent_public_id: vine.string().uuid(),
        goal: vine.string().trim().minLength(8).maxLength(2000),
        context_snapshot: vine.record(vine.any()),
        constraints: vine.record(vine.any()),
        evidence: vine.array(vine.any()).maxLength(128),
        options: vine.array(vine.any()).maxLength(64),
        expected_outcomes: vine.record(vine.any()),
        risk: vine.record(vine.any()),
        policy_evaluation: vine.record(vine.any()),
        verification_plan: vine.record(vine.any()),
        learning_plan: vine.record(vine.any()),
        steps: vine
            .array(
                vine.object({
                    tool_key: vine.string().trim().maxLength(128),
                    tool_version: vine.number().min(1),
                    input: vine.record(vine.any()),
                    risk_class: vine.enum(["read_only", "low", "medium", "high", "critical"]),
                    idempotency_key: vine.string().trim().minLength(8).maxLength(160),
                }),
            )
            .minLength(1)
            .maxLength(32),
    }),
);
export const conflictValidator = vine.compile(
    vine.object({
        plan_public_id: vine.string().uuid(),
        participants: vine.array(vine.string().trim().maxLength(96)).minLength(2).maxLength(16),
        summary: vine.string().trim().minLength(8).maxLength(2000),
        objective_key: vine.string().trim().minLength(2).maxLength(96),
        priority_order: vine.array(vine.string().trim().maxLength(96)).minLength(1).maxLength(32),
        evidence: vine.array(vine.any()).minLength(1).maxLength(128),
        alternatives: vine.array(vine.any()).minLength(1).maxLength(64),
        resolution: vine.record(vine.any()),
    }),
);
export const approvalValidator = vine.compile(
    vine.object({
        step_public_id: vine.string().uuid(),
        status: vine.enum(["approved", "rejected"]),
        reason: vine.string().trim().minLength(8).maxLength(1000),
    }),
);
export const executeValidator = vine.compile(
    vine.object({
        step_public_id: vine.string().uuid(),
        idempotency_key: vine.string().trim().minLength(8).maxLength(160),
        dry_run: vine.boolean(),
    }),
);
export const killSwitchValidator = vine.compile(
    vine.object({
        agent_public_id: vine.string().uuid(),
        enabled: vine.boolean(),
        reason: vine.string().trim().minLength(8).maxLength(500),
    }),
);

export const outcomeHookValidator = vine.compile(
    vine.object({
        plan_public_id: vine.string().uuid(),
        metric_key: vine.string().trim().minLength(2).maxLength(128),
        evaluate_after_iso: vine.string().trim().minLength(10).maxLength(64),
        baseline: vine.record(vine.any()),
        predicted: vine.record(vine.any()),
    }),
);
