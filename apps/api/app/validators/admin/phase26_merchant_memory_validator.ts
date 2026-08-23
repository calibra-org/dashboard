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

const scopeKind = vine.enum(["merchant", "supplier", "campaign", "pricing", "customer_segment", "product", "process", "policy"]);

const evidence = vine.object({
    source_kind: vine.enum([
        "intelligence_case",
        "intelligence_decision",
        "intelligence_action",
        "intelligence_outcome",
        "governance_policy",
        "governance_approval",
        "governance_ledger",
        "experiment",
        "experiment_analysis",
        "orchestrator_plan",
        "orchestrator_tool_run",
        "orchestrator_outcome",
        "growth_portfolio_run",
        "growth_portfolio_outcome",
    ]),
    source_ref: vine.string().trim().minLength(1).maxLength(180),
    source_version: vine.string().trim().maxLength(80).nullable().optional(),
    source_route: vine.string().trim().maxLength(500).nullable().optional(),
    label: vine.string().trim().minLength(2).maxLength(300),
    evidence_role: vine.enum(["supporting", "contradicting", "outcome", "approval", "context"]).optional(),
    excerpt: vine.string().trim().maxLength(1200).nullable().optional(),
    metadata: vine.record(vine.any()).optional(),
    observed_at: vine.string().trim().maxLength(80).nullable().optional(),
});

const memoryPayload = {
    memory_key: vine.string().trim().minLength(3).maxLength(190),
    memory_class: memoryClass,
    scope_kind: scopeKind,
    scope_key: vine.string().trim().maxLength(160).nullable().optional(),
    title: vine.string().trim().minLength(3).maxLength(300),
    context: vine.string().trim().minLength(3).maxLength(12000),
    observed_signals: vine.array(vine.record(vine.any())).maxLength(128).optional(),
    decision: vine.string().trim().maxLength(8000).nullable().optional(),
    reason: vine.string().trim().maxLength(8000).nullable().optional(),
    alternatives_rejected: vine.array(vine.record(vine.any())).maxLength(64).optional(),
    actors_and_approvals: vine.array(vine.record(vine.any())).maxLength(64).optional(),
    action: vine.string().trim().maxLength(8000).nullable().optional(),
    outcome: vine.string().trim().maxLength(8000).nullable().optional(),
    lesson: vine.string().trim().minLength(3).maxLength(12000),
    confidence: vine.number().min(0).max(1),
    strength: vine.number().min(0).max(1),
    privacy_level: vine.enum(["internal", "restricted", "aggregated"]).optional(),
    retention_class: vine.enum(["short", "standard", "long", "legal_hold"]).optional(),
    effective_from: vine.string().trim().minLength(10).maxLength(80),
    expires_at: vine.string().trim().maxLength(80).nullable().optional(),
    evidence: vine.array(evidence).minLength(1).maxLength(128),
};

export const createMerchantMemoryValidator = vine.compile(vine.object(memoryPayload));

export const supersedeMerchantMemoryValidator = vine.compile(
    vine.object({
        replacement: vine.object(memoryPayload),
        relation: vine.enum(["supersedes", "contradicts", "refines"]),
        reason: vine.string().trim().minLength(3).maxLength(4000),
    }),
);

export const retrieveMerchantMemoryValidator = vine.compile(
    vine.object({
        query: vine.string().trim().minLength(2).maxLength(4000),
        purpose: vine.string().trim().minLength(2).maxLength(80).optional(),
        memory_classes: vine.array(memoryClass).maxLength(8).optional(),
        scope_kind: scopeKind.optional(),
        scope_key: vine.string().trim().maxLength(160).nullable().optional(),
        min_confidence: vine.number().min(0).max(1).optional(),
        include_history: vine.boolean().optional(),
        include_restricted: vine.boolean().optional(),
        limit: vine.number().positive().withoutDecimals().max(50).optional(),
    }),
);

export const merchantMemoryFeedbackValidator = vine.compile(
    vine.object({
        memory_public_id: vine.string().uuid(),
        feedback: vine.enum(["useful", "irrelevant", "applied", "incorrect"]),
        usefulness_score: vine.number().min(0).max(1).nullable().optional(),
        prevented_repeat_error: vine.boolean().nullable().optional(),
        outcome_delta: vine.number().nullable().optional(),
        note: vine.string().trim().maxLength(4000).nullable().optional(),
    }),
);
