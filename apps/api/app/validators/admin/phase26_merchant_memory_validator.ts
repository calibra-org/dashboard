import vine from "@vinejs/vine";

const evidenceInput = vine.object({
    source_domain: vine.enum(["phase10", "phase11", "phase17", "phase22", "phase25", "operations"]),
    source_type: vine.string().trim().minLength(2).maxLength(80),
    source_stable_key: vine.string().trim().minLength(2).maxLength(180),
    source_record_id: vine.string().trim().maxLength(160).nullable().optional(),
    source_version: vine.string().trim().maxLength(80).nullable().optional(),
    source_integrity_hash: vine.string().trim().fixedLength(64).nullable().optional(),
    relation: vine.enum(["supports", "contradicts", "context", "outcome", "approval", "experiment", "portfolio", "orchestration"]),
    evidence_summary: vine.record(vine.any()).optional(),
    observed_at: vine.string().trim().nullable().optional(),
});

export const createMerchantMemoryValidator = vine.compile(
    vine.object({
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
        subject_scope: vine.enum(["merchant", "supplier", "campaign", "pricing", "customer_segment", "product", "architecture", "policy"]),
        subject_key: vine.string().trim().maxLength(180).nullable().optional(),
        title: vine.string().trim().minLength(3).maxLength(220),
        context: vine.string().trim().minLength(3).maxLength(8000),
        observed_signals: vine.array(vine.record(vine.any())).maxLength(64).optional(),
        decision: vine.string().trim().maxLength(8000).nullable().optional(),
        reason: vine.string().trim().maxLength(8000).nullable().optional(),
        alternatives_rejected: vine.array(vine.record(vine.any())).maxLength(64).optional(),
        actor_approvals: vine.array(vine.record(vine.any())).maxLength(64).optional(),
        action: vine.string().trim().maxLength(8000).nullable().optional(),
        outcome: vine.string().trim().maxLength(8000).nullable().optional(),
        lesson: vine.string().trim().minLength(3).maxLength(8000),
        confidence: vine.number().min(0).max(1),
        strength: vine.number().min(0).max(1),
        sensitivity: vine.enum(["internal", "restricted", "sensitive"]),
        access_scope: vine.enum(["merchant_internal", "decision_center", "copilot", "governance_only"]),
        retention_class: vine.string().trim().minLength(2).maxLength(40),
        contains_customer_level_data: vine.boolean(),
        aggregated_fact: vine.boolean(),
        effective_at: vine.string().trim(),
        expires_at: vine.string().trim().nullable().optional(),
        evidence: vine.array(evidenceInput).minLength(1).maxLength(64),
    }),
);

export const addMerchantMemoryEvidenceValidator = vine.compile(evidenceInput);

export const supersedeMerchantMemoryValidator = vine.compile(
    vine.object({
        relation: vine.enum(["supersedes", "contradicts", "refines", "reaffirms"]),
        reason: vine.string().trim().minLength(3).maxLength(4000),
        replacement: createMerchantMemoryValidator,
    }),
);

export const retrieveMerchantMemoryValidator = vine.compile(
    vine.object({
        principal_type: vine.enum(["human", "agent", "system"]),
        principal_id: vine.string().trim().minLength(1).maxLength(120),
        purpose: vine.string().trim().minLength(2).maxLength(80),
        access_scope: vine.enum(["merchant_internal", "decision_center", "copilot", "governance_only"]),
        query: vine.string().trim().minLength(2).maxLength(2000),
        memory_classes: vine
            .array(
                vine.enum([
                    "operational_incident",
                    "supplier_lesson",
                    "campaign_lesson",
                    "pricing_lesson",
                    "customer_segment_behavior",
                    "product_quality",
                    "architecture_process_decision",
                    "policy_precedent",
                ]),
            )
            .maxLength(8)
            .optional(),
        min_confidence: vine.number().min(0).max(1).optional(),
        include_history: vine.boolean().optional(),
        limit: vine.number().positive().withoutDecimals().max(50).optional(),
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
