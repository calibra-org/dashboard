import vine from "@vinejs/vine";

const memoryClass = vine.enum([
    "operational_incident",
    "supplier_lesson",
    "campaign_lesson",
    "pricing_lesson",
    "customer_segment_behavior",
    "product_quality",
    "architecture_process_decision",
    "policy_precedent",
]);

const evidenceInput = vine.object({
    source_type: vine.enum([
        "phase10_case",
        "phase10_decision",
        "phase10_action",
        "phase10_outcome",
        "phase11_approval",
        "phase11_policy",
        "phase17_experiment",
        "phase17_analysis",
        "phase22_plan",
        "phase22_outcome_hook",
        "phase25_portfolio_run",
        "phase25_portfolio_outcome",
        "phase25_rebalance",
    ]),
    source_record_ref: vine.string().trim().minLength(1).maxLength(180),
    evidence_role: vine.enum(["supporting", "contradicting", "outcome", "approval", "context"]),
    content_hash: vine.string().trim().fixedLength(64).nullable().optional(),
    source_metadata: vine.record(vine.any()).optional(),
    observed_at: vine.string().trim().nullable().optional(),
});

export const createMerchantMemoryValidator = vine.compile(
    vine.object({
        memory_class: memoryClass,
        stable_key: vine.string().trim().minLength(3).maxLength(180),
        context: vine.string().trim().minLength(3).maxLength(8000),
        observed_signals: vine.array(vine.record(vine.any())).maxLength(64).optional(),
        decision: vine.string().trim().maxLength(8000).nullable().optional(),
        reason: vine.string().trim().minLength(3).maxLength(8000),
        alternatives_rejected: vine.array(vine.record(vine.any())).maxLength(64).optional(),
        actors_and_approvals: vine.array(vine.record(vine.any())).maxLength(64).optional(),
        action: vine.string().trim().maxLength(8000).nullable().optional(),
        outcome: vine.string().trim().maxLength(8000).nullable().optional(),
        lesson: vine.string().trim().minLength(3).maxLength(8000),
        confidence: vine.number().min(0).max(1),
        strength: vine.number().min(0).max(1),
        privacy_mode: vine.enum(["aggregated", "redacted", "restricted"]),
        visibility_scope: vine.enum(["tenant_admin", "approved_agents", "restricted_humans"]),
        purpose_tags: vine.array(vine.string().trim().minLength(1).maxLength(80)).maxLength(32).optional(),
        valid_from: vine.string().trim(),
        expires_at: vine.string().trim().nullable().optional(),
        evidence: vine.array(evidenceInput).minLength(1).maxLength(64),
    }),
);

export const addMerchantMemoryEvidenceValidator = vine.compile(evidenceInput);

export const supersedeMerchantMemoryValidator = vine.compile(
    vine.object({
        relation: vine.enum(["supersedes", "refines", "contradicts", "revalidates"]),
        reason: vine.string().trim().minLength(3).maxLength(4000),
        replacement: vine.object({
            memory_class: memoryClass,
            context: vine.string().trim().minLength(3).maxLength(8000),
            observed_signals: vine.array(vine.record(vine.any())).maxLength(64).optional(),
            decision: vine.string().trim().maxLength(8000).nullable().optional(),
            reason: vine.string().trim().minLength(3).maxLength(8000),
            alternatives_rejected: vine.array(vine.record(vine.any())).maxLength(64).optional(),
            actors_and_approvals: vine.array(vine.record(vine.any())).maxLength(64).optional(),
            action: vine.string().trim().maxLength(8000).nullable().optional(),
            outcome: vine.string().trim().maxLength(8000).nullable().optional(),
            lesson: vine.string().trim().minLength(3).maxLength(8000),
            confidence: vine.number().min(0).max(1),
            strength: vine.number().min(0).max(1),
            privacy_mode: vine.enum(["aggregated", "redacted", "restricted"]),
            visibility_scope: vine.enum(["tenant_admin", "approved_agents", "restricted_humans"]),
            purpose_tags: vine.array(vine.string().trim().minLength(1).maxLength(80)).maxLength(32).optional(),
            valid_from: vine.string().trim(),
            expires_at: vine.string().trim().nullable().optional(),
            evidence: vine.array(evidenceInput).minLength(1).maxLength(64),
        }),
    }),
);

export const retrieveMerchantMemoryValidator = vine.compile(
    vine.object({
        requester_type: vine.enum(["human", "agent", "system"]),
        requester_ref: vine.string().trim().maxLength(180).nullable().optional(),
        purpose: vine.string().trim().minLength(2).maxLength(64),
        query: vine.string().trim().minLength(2).maxLength(2000),
        memory_classes: vine.array(memoryClass).maxLength(8).optional(),
        min_confidence: vine.number().min(0).max(1).optional(),
        include_history: vine.boolean().optional(),
        limit: vine.number().positive().withoutDecimals().max(50).optional(),
    }),
);

export const merchantMemoryFeedbackValidator = vine.compile(
    vine.object({
        usefulness: vine.number().min(0).max(1).nullable().optional(),
        memory_applied: vine.boolean().nullable().optional(),
        repeat_error_avoided: vine.boolean().nullable().optional(),
        realized_impact_minor: vine.number().nullable().optional(),
        attribution_confidence: vine.number().min(0).max(1).nullable().optional(),
        notes: vine.string().trim().maxLength(4000).nullable().optional(),
    }),
);
