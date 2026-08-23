import vine from "@vinejs/vine";

const memoryClasses = [
    "operational_incident",
    "supplier_lesson",
    "campaign_lesson",
    "pricing_lesson",
    "customer_segment_behavior",
    "product_quality",
    "architecture_process_decision",
    "policy_precedent",
] as const;

const evidenceRoles = ["supporting", "contradicting", "outcome", "approval", "context"] as const;
const sourceAuthorities = [
    "phase10_case",
    "phase10_decision",
    "phase10_outcome",
    "phase11_approval",
    "phase11_policy_version",
    "phase11_action_ledger",
    "phase17_experiment",
    "phase17_causal_knowledge",
    "phase22_agent_plan",
    "phase22_tool_run",
    "phase22_outcome_hook",
    "phase25_portfolio_run",
    "phase25_portfolio_outcome",
] as const;

const evidenceInput = vine.object({
    source_type: vine.string().trim().minLength(2).maxLength(64),
    source_authority: vine.enum(sourceAuthorities),
    source_record_ref: vine.string().trim().minLength(1).maxLength(180),
    evidence_role: vine.enum(evidenceRoles).optional(),
    content_hash: vine.string().trim().fixedLength(64).nullable().optional(),
    source_metadata: vine.record(vine.any()).optional(),
    observed_at: vine.string().trim().nullable().optional(),
});

export const createMerchantMemoryValidator = vine.compile(
    vine.object({
        memory_class: vine.enum(memoryClasses),
        stable_key: vine.string().trim().minLength(3).maxLength(180),
        context: vine.string().trim().minLength(4).maxLength(12000),
        observed_signals: vine.array(vine.any()).maxLength(128).optional(),
        decision: vine.string().trim().maxLength(8000).nullable().optional(),
        reason: vine.string().trim().minLength(4).maxLength(12000),
        alternatives_rejected: vine.array(vine.any()).maxLength(64).optional(),
        actors_and_approvals: vine.array(vine.any()).maxLength(64).optional(),
        action: vine.string().trim().maxLength(8000).nullable().optional(),
        outcome: vine.string().trim().maxLength(8000).nullable().optional(),
        lesson: vine.string().trim().minLength(4).maxLength(12000),
        confidence: vine.number().min(0).max(1).optional(),
        strength: vine.number().min(0).max(1).optional(),
        privacy_mode: vine.enum(["aggregated", "redacted", "restricted"]).optional(),
        visibility_scope: vine.enum(["tenant_admin", "approved_agents", "restricted_humans"]).optional(),
        purpose_tags: vine.array(vine.string().trim().minLength(1).maxLength(64)).maxLength(32).optional(),
        valid_from: vine.string().trim().optional(),
        expires_at: vine.string().trim().nullable().optional(),
        evidence: vine.array(evidenceInput).minLength(1).maxLength(64),
    }),
);

export const retrieveMerchantMemoryValidator = vine.compile(
    vine.object({
        query: vine.string().trim().maxLength(2000).nullable().optional(),
        memory_classes: vine.array(vine.enum(memoryClasses)).maxLength(8).optional(),
        purpose_tags: vine.array(vine.string().trim().minLength(1).maxLength(64)).maxLength(32).optional(),
        purpose: vine.string().trim().minLength(2).maxLength(64),
        limit: vine.number().positive().withoutDecimals().max(50).optional(),
    }),
);

export const supersedeMerchantMemoryValidator = vine.compile(
    vine.object({
        successor_public_id: vine.string().uuid(),
        reason: vine.string().trim().minLength(4).maxLength(4000),
    }),
);

export const merchantMemoryEffectivenessValidator = vine.compile(
    vine.object({
        usefulness: vine.number().min(0).max(1).nullable().optional(),
        memory_applied: vine.boolean().nullable().optional(),
        repeat_error_avoided: vine.boolean().nullable().optional(),
        realized_impact_minor: vine.number().nullable().optional(),
        attribution_confidence: vine.number().min(0).max(1).nullable().optional(),
        notes: vine.string().trim().maxLength(4000).nullable().optional(),
    }),
);
