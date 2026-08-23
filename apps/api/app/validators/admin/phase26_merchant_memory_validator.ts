import vine from "@vinejs/vine";

const source = vine.object({
    source_domain: vine.enum(["phase10", "phase11", "phase17", "phase22", "phase25"]),
    source_kind: vine.string().trim().minLength(2).maxLength(80),
    source_id: vine.unionOfTypes([vine.number().positive().withoutDecimals(), vine.string().trim().minLength(1).maxLength(190)]).optional(),
    source_route: vine.string().trim().maxLength(500).nullable().optional(),
    source_version: vine.string().trim().maxLength(80).nullable().optional(),
    evidence_role: vine.enum(["primary", "supporting", "contradicting", "outcome", "approval", "action"]).optional(),
    evidence_snapshot: vine.record(vine.any()).optional(),
    freshness_at: vine.string().trim().maxLength(64).optional(),
});

const memoryShape = {
    memory_key: vine.string().trim().minLength(3).maxLength(190),
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
    subject_scope: vine.enum(["merchant", "aggregate", "segment", "supplier", "product", "process", "policy"]).optional(),
    subject_key: vine.string().trim().maxLength(190).nullable().optional(),
    title: vine.string().trim().minLength(3).maxLength(300),
    context: vine.record(vine.any()).optional(),
    observed_signals: vine.array(vine.any()).maxLength(100).optional(),
    decision: vine.string().trim().maxLength(4000).nullable().optional(),
    reason: vine.string().trim().minLength(3).maxLength(4000),
    alternatives_rejected: vine.array(vine.any()).maxLength(100).optional(),
    actor_snapshot: vine.record(vine.any()).optional(),
    approval_references: vine.array(vine.any()).maxLength(100).optional(),
    action_snapshot: vine.record(vine.any()).optional(),
    outcome_snapshot: vine.record(vine.any()).optional(),
    lesson: vine.string().trim().minLength(3).maxLength(4000),
    confidence: vine.number().min(0).max(1),
    strength: vine.number().min(0).max(1).optional(),
    sensitivity: vine.enum(["aggregate", "internal", "restricted"]).optional(),
    retention_class: vine.enum(["short", "standard", "extended", "legal_hold"]).optional(),
    minimum_role: vine.enum(["agent", "admin"]).optional(),
    relevant_from: vine.string().trim().maxLength(64).optional(),
    expires_at: vine.string().trim().maxLength(64).nullable().optional(),
    sources: vine.array(source).minLength(1).maxLength(50),
};

export const createMerchantMemoryValidator = vine.compile(vine.object(memoryShape));

export const retrieveMerchantMemoryValidator = vine.compile(
    vine.object({
        query: vine.string().trim().maxLength(2000),
        purpose: vine.string().trim().minLength(2).maxLength(80),
        requester_kind: vine.enum(["human", "agent", "system"]),
        requester_id: vine.string().trim().maxLength(190).nullable().optional(),
        memory_class: vine.string().trim().maxLength(48).nullable().optional(),
        subject_scope: vine.string().trim().maxLength(24).nullable().optional(),
        subject_key: vine.string().trim().maxLength(190).nullable().optional(),
        limit: vine.number().positive().withoutDecimals().max(20).optional(),
    }),
);

export const supersedeMerchantMemoryValidator = vine.compile(
    vine.object({
        ...memoryShape,
        relationship: vine.enum(["supersedes", "refines", "contradicts"]).optional(),
        reason_kind: vine.enum(["new_evidence", "market_change", "policy_change", "correction", "expiry_refresh"]),
        lineage_reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);

export const merchantMemoryFeedbackValidator = vine.compile(
    vine.object({
        feedback_kind: vine.enum(["useful", "not_useful", "applied", "ignored", "harmful"]),
        usefulness_score: vine.number().min(0).max(1).nullable().optional(),
        repeat_error_prevented: vine.boolean().nullable().optional(),
        decision_changed: vine.boolean().nullable().optional(),
        applied_memory_public_ids: vine.array(vine.string().uuid()).maxLength(20).optional(),
        notes: vine.string().trim().maxLength(4000).nullable().optional(),
    }),
);