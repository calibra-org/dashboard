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

const memoryConsumer = vine.enum(["human", "agent"]);
const memorySensitivity = vine.enum(["aggregate", "internal", "customer_level_sensitive"]);
const retentionClass = vine.enum(["short", "standard", "extended", "legal_hold"]);
const sourcePhase = vine.enum(["phase10", "phase11", "phase17", "phase22", "phase25", "manual_reviewed"]);
const evidenceRole = vine.enum(["primary", "supporting", "contradicting", "outcome"]);

const source = vine.object({
    source_phase: sourcePhase,
    source_kind: vine.string().trim().minLength(2).maxLength(100),
    source_id: vine.string().trim().minLength(1).maxLength(180),
    source_route: vine.string().trim().maxLength(400).nullable().optional(),
    source_hash: vine.string().trim().fixedLength(64).nullable().optional(),
    label: vine.string().trim().minLength(2).maxLength(240),
    evidence_role: evidenceRole.optional(),
    evidence_summary: vine.record(vine.any()).optional(),
    sensitivity: memorySensitivity.optional(),
    observed_at: vine.string().trim().minLength(10).maxLength(64),
});

const memoryBody = {
    memory_class: memoryClass,
    subject_type: vine.string().trim().maxLength(80).nullable().optional(),
    subject_id: vine.string().trim().maxLength(160).nullable().optional(),
    title: vine.string().trim().minLength(3).maxLength(220),
    context: vine.string().trim().minLength(3).maxLength(12000),
    observed_signals: vine.array(vine.any()).maxLength(128).optional(),
    decision: vine.string().trim().maxLength(8000).nullable().optional(),
    reason: vine.string().trim().maxLength(8000).nullable().optional(),
    alternatives_rejected: vine.array(vine.any()).maxLength(64).optional(),
    actors_and_approvals: vine.array(vine.any()).maxLength(64).optional(),
    action: vine.string().trim().maxLength(8000).nullable().optional(),
    outcome: vine.string().trim().maxLength(8000).nullable().optional(),
    lesson: vine.string().trim().minLength(3).maxLength(12000),
    confidence: vine.number().min(0).max(1),
    strength: vine.number().min(0).max(1),
    sensitivity: memorySensitivity.optional(),
    retention_class: retentionClass.optional(),
    allowed_consumers: vine.array(memoryConsumer).minLength(1).maxLength(2).optional(),
    purposes: vine.array(vine.string().trim().minLength(2).maxLength(80)).maxLength(32).optional(),
    relevant_from: vine.string().trim().minLength(10).maxLength(64).optional(),
    expires_at: vine.string().trim().minLength(10).maxLength(64).nullable().optional(),
    sources: vine.array(source).minLength(1).maxLength(128),
};

export const createMerchantMemoryValidator = vine.compile(vine.object(memoryBody));

export const supersedeMerchantMemoryValidator = vine.compile(
    vine.object({
        ...memoryBody,
        relation: vine.enum(["supersedes", "contradicts", "refines"]).optional(),
        supersession_reason: vine.string().trim().minLength(3).maxLength(4000),
    }),
);

export const retrieveMerchantMemoryValidator = vine.compile(
    vine.object({
        query: vine.string().trim().maxLength(4000),
        purpose: vine.string().trim().minLength(2).maxLength(80),
        consumer: memoryConsumer,
        memory_classes: vine.array(memoryClass).maxLength(8).optional(),
        subject_type: vine.string().trim().maxLength(80).nullable().optional(),
        subject_id: vine.string().trim().maxLength(160).nullable().optional(),
        min_confidence: vine.number().min(0).max(1).optional(),
        include_customer_sensitive: vine.boolean().optional(),
        limit: vine.number().positive().withoutDecimals().max(50).optional(),
        request_correlation_id: vine.string().trim().maxLength(160).nullable().optional(),
    }),
);

export const recordMerchantMemoryEffectivenessValidator = vine.compile(
    vine.object({
        memory_public_id: vine.string().trim().maxLength(64).nullable().optional(),
        signal: vine.enum(["used", "ignored", "helpful", "harmful", "repeat_error"]),
        usefulness: vine.number().min(0).max(1).nullable().optional(),
        repeat_error_avoided: vine.boolean().nullable().optional(),
        notes: vine.string().trim().maxLength(4000).nullable().optional(),
        source_outcome_record_id: vine.number().positive().withoutDecimals().nullable().optional(),
    }),
);
