import vine from "@vinejs/vine";

const evidence = vine.object({
    source_kind: vine.enum([
        "intelligence_case",
        "intelligence_decision",
        "intelligence_action",
        "intelligence_outcome",
        "governance_approval",
        "governance_ledger",
        "experiment",
        "experiment_analysis",
        "agent_orchestration",
        "growth_portfolio_run",
        "growth_portfolio_outcome",
        "architecture_decision",
        "audit_event",
    ]),
    source_ref: vine.string().trim().minLength(1).maxLength(180),
    source_version: vine.string().trim().maxLength(80).optional(),
    source_route: vine.string().trim().maxLength(500).optional(),
    label: vine.string().trim().minLength(2).maxLength(300),
    evidence_role: vine.enum(["supporting", "contradicting", "outcome", "approval", "context"]).optional(),
    excerpt: vine.string().trim().maxLength(2000).optional(),
    metadata: vine.record(vine.any()).optional(),
    observed_at: vine.string().trim().maxLength(80).optional(),
});

export const createMerchantMemoryValidator = vine.compile(
    vine.object({
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
        scope_kind: vine.enum(["merchant", "supplier", "campaign", "pricing", "customer_segment", "product", "process", "policy"]),
        scope_key: vine.string().trim().maxLength(160).optional(),
        title: vine.string().trim().minLength(3).maxLength(300),
        context: vine.string().trim().minLength(3).maxLength(8000),
        observed_signals: vine.array(vine.any()).maxLength(64).optional(),
        decision: vine.string().trim().maxLength(8000).optional(),
        reason: vine.string().trim().maxLength(8000).optional(),
        alternatives_rejected: vine.array(vine.any()).maxLength(64).optional(),
        actors_and_approvals: vine.array(vine.any()).maxLength(64).optional(),
        action: vine.string().trim().maxLength(8000).optional(),
        outcome: vine.string().trim().maxLength(8000).optional(),
        lesson: vine.string().trim().minLength(3).maxLength(8000),
        confidence: vine.number().min(0).max(1),
        strength: vine.number().min(0).max(1),
        privacy_level: vine.enum(["internal", "restricted", "aggregated"]).optional(),
        retention_class: vine.enum(["short", "standard", "long", "legal_hold"]).optional(),
        effective_from: vine.string().trim().maxLength(80).optional(),
        expires_at: vine.string().trim().maxLength(80).optional(),
        evidence: vine.array(evidence).minLength(1).maxLength(64),
    }),
);

export const supersedeMerchantMemoryValidator = vine.compile(
    vine.object({
        replacement: createMerchantMemoryValidator.schema,
        relation: vine.enum(["supersedes", "contradicts", "refines"]),
        reason: vine.string().trim().minLength(3).maxLength(4000),
    }),
);

export const retrieveMerchantMemoryValidator = vine.compile(
    vine.object({
        query: vine.string().trim().minLength(2).maxLength(500),
        purpose: vine.string().trim().minLength(2).maxLength(80),
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
        limit: vine.number().positive().withoutDecimals().max(50).optional(),
        include_superseded: vine.boolean().optional(),
        include_expired: vine.boolean().optional(),
    }),
);

export const merchantMemoryFeedbackValidator = vine.compile(
    vine.object({
        memory_public_id: vine.string().uuid(),
        feedback: vine.enum(["useful", "irrelevant", "applied", "incorrect"]),
        usefulness_score: vine.number().min(0).max(1).optional(),
        prevented_repeat_error: vine.boolean().optional(),
        outcome_delta: vine.number().optional(),
        note: vine.string().trim().maxLength(4000).optional(),
    }),
);
