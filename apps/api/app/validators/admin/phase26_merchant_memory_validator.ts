import vine from "@vinejs/vine";

const source = vine.object({
    source_type: vine.enum([
        "phase10_case",
        "phase10_decision",
        "phase10_action",
        "phase10_outcome",
        "phase11_approval",
        "phase17_experiment",
        "phase17_analysis",
        "phase22_plan",
        "phase22_tool_run",
        "phase22_outcome",
        "phase25_portfolio_run",
        "manual_evidence",
    ]),
    source_reference: vine.string().trim().minLength(1).maxLength(180),
    source_uri: vine.string().trim().maxLength(500).nullable().optional(),
    evidence_hash: vine.string().trim().fixedLength(64).nullable().optional(),
    evidence_role: vine.enum(["supporting", "contradicting", "outcome", "approval", "policy"]).optional(),
    evidence_snapshot: vine.record(vine.any()).optional(),
    observed_at: vine.string().trim().nullable().optional(),
});

const memoryBody = {
    memory_class: vine.enum([
        "operational_incident",
        "supplier_lesson",
        "campaign_lesson",
        "pricing_lesson",
        "customer_segment_behavior",
        "product_quality",
        "architecture_process_decision",
        "policy_precedent",
    ]),
    title: vine.string().trim().minLength(3).maxLength(220),
    context: vine.string().trim().minLength(3).maxLength(6000),
    observed_signals: vine.array(vine.any()).maxLength(128).optional(),
    decision: vine.string().trim().minLength(2).maxLength(6000),
    reason: vine.string().trim().minLength(2).maxLength(6000),
    alternatives_rejected: vine.array(vine.any()).maxLength(64).optional(),
    actors_approvals: vine.array(vine.any()).maxLength(64).optional(),
    action: vine.string().trim().maxLength(6000).nullable().optional(),
    outcome: vine.string().trim().maxLength(6000).nullable().optional(),
    lesson: vine.string().trim().minLength(2).maxLength(6000),
    confidence: vine.number().min(0).max(1),
    strength: vine.number().min(0).max(1),
    visibility_scope: vine.enum(["admin_only", "admin_agent"]).optional(),
    sensitivity_level: vine.enum(["internal", "restricted", "sensitive"]).optional(),
    aggregation_level: vine.enum(["aggregate", "cohort", "record_level"]).optional(),
    retention_class: vine.string().trim().minLength(2).maxLength(32).optional(),
    effective_from: vine.string().trim().optional(),
    expires_at: vine.string().trim().nullable().optional(),
    sources: vine.array(source).minLength(1).maxLength(64),
};

export const createMerchantMemoryValidator = vine.compile(vine.object(memoryBody));

export const supersedeMerchantMemoryValidator = vine.compile(
    vine.object({ ...memoryBody, lineage_reason: vine.string().trim().minLength(3).maxLength(3000) }),
);

export const retrieveMerchantMemoryValidator = vine.compile(
    vine.object({
        query_text: vine.string().trim().maxLength(1000),
        purpose: vine.string().trim().minLength(2).maxLength(80),
        memory_classes: vine.array(vine.string().trim().maxLength(48)).maxLength(8).optional(),
        limit: vine.number().positive().withoutDecimals().max(50).optional(),
        requester_type: vine.enum(["human", "agent", "system"]),
        requester_reference: vine.string().trim().maxLength(180).nullable().optional(),
    }),
);

export const merchantMemoryEffectivenessValidator = vine.compile(
    vine.object({
        retrieval_public_id: vine.string().trim().maxLength(64).nullable().optional(),
        effect_kind: vine.enum(["useful", "not_useful", "prevented_repeat_error", "decision_influenced", "outcome_supported"]),
        usefulness_score: vine.number().min(0).max(1).nullable().optional(),
        repeat_error_avoided: vine.boolean().nullable().optional(),
        decision_reference: vine.string().trim().maxLength(180).nullable().optional(),
        outcome_reference: vine.string().trim().maxLength(180).nullable().optional(),
        source_outcome_record_id: vine.number().positive().withoutDecimals().nullable().optional(),
        notes: vine.string().trim().maxLength(4000).nullable().optional(),
    }),
);
