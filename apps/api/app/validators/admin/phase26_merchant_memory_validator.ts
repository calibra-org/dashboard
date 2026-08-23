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

const subjectScopes = ["merchant", "supplier", "campaign", "pricing", "customer_segment", "product", "architecture", "policy"] as const;
const accessScopes = ["merchant_internal", "decision_center", "copilot", "governance_only"] as const;
const evidenceSourceTypes = [
    "phase10_case",
    "phase10_decision",
    "phase10_outcome",
    "phase11_policy",
    "phase11_approval",
    "phase11_ledger",
    "phase17_experiment",
    "phase17_analysis",
    "phase22_plan",
    "phase22_conflict",
    "phase22_outcome",
    "phase25_run",
    "phase25_outcome",
    "phase25_rebalance",
] as const;
const evidenceRelations = ["supports", "contradicts", "context", "outcome", "approval", "experiment", "portfolio", "orchestration"] as const;

const evidenceInput = vine.object({
    source_type: vine.enum(evidenceSourceTypes),
    source_stable_key: vine.string().trim().minLength(1).maxLength(190),
    relation: vine.enum(evidenceRelations).optional(),
});

const memoryBody = {
    memory_class: vine.enum(memoryClasses),
    subject_scope: vine.enum(subjectScopes),
    subject_key: vine.string().trim().maxLength(180).nullable().optional(),
    title: vine.string().trim().minLength(3).maxLength(220),
    context: vine.string().trim().minLength(3).maxLength(8000),
    observed_signals: vine.array(vine.any()).maxLength(100).optional(),
    decision: vine.string().trim().maxLength(4000).nullable().optional(),
    reason: vine.string().trim().maxLength(4000).nullable().optional(),
    alternatives_rejected: vine.array(vine.any()).maxLength(50).optional(),
    actor_approvals: vine.array(vine.any()).maxLength(50).optional(),
    action: vine.string().trim().maxLength(4000).nullable().optional(),
    outcome: vine.string().trim().maxLength(4000).nullable().optional(),
    lesson: vine.string().trim().minLength(3).maxLength(8000),
    confidence: vine.number().min(0).max(1),
    strength: vine.number().min(0).max(1),
    sensitivity: vine.enum(["internal", "restricted", "sensitive"]).optional(),
    access_scope: vine.enum(accessScopes).optional(),
    retention_class: vine.string().trim().minLength(2).maxLength(40).optional(),
    contains_customer_level_data: vine.boolean().optional(),
    aggregated_fact: vine.boolean().optional(),
    effective_at: vine.string().trim().maxLength(64).optional(),
    expires_at: vine.string().trim().maxLength(64).nullable().optional(),
    evidence: vine.array(evidenceInput).minLength(1).maxLength(50),
};

export const createMerchantMemoryValidator = vine.compile(vine.object(memoryBody));

export const supersedeMerchantMemoryValidator = vine.compile(
    vine.object({
        ...memoryBody,
        relation: vine.enum(["supersedes", "contradicts", "refines", "reaffirms"]),
        lineage_reason: vine.string().trim().minLength(3).maxLength(4000),
    }),
);

export const retrieveMerchantMemoryValidator = vine.compile(
    vine.object({
        query: vine.string().trim().maxLength(2000),
        principal_type: vine.enum(["human", "agent", "system"]),
        principal_id: vine.string().trim().minLength(1).maxLength(120),
        purpose: vine.string().trim().minLength(2).maxLength(80),
        access_scope: vine.enum(accessScopes),
        memory_classes: vine.array(vine.enum(memoryClasses)).maxLength(memoryClasses.length).optional(),
        subject_scope: vine.enum(subjectScopes).optional(),
        subject_key: vine.string().trim().maxLength(180).optional(),
        limit: vine.number().positive().withoutDecimals().max(50).optional(),
        include_history: vine.boolean().optional(),
    }),
);

export const merchantMemoryFeedbackValidator = vine.compile(
    vine.object({
        observation_kind: vine.enum(["retrieval_feedback", "decision_followup", "incident_followup", "supersession_quality"]),
        useful: vine.boolean().nullable().optional(),
        accepted: vine.boolean().nullable().optional(),
        repeat_error_avoided: vine.boolean().nullable().optional(),
        stale_memory_avoided: vine.boolean().nullable().optional(),
        notes: vine.string().trim().maxLength(4000).nullable().optional(),
    }),
);
