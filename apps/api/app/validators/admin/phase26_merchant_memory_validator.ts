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

const memorySensitivity = vine.enum(["aggregated", "internal", "restricted"]);
const sourceKind = vine.enum(["decision", "outcome", "approval", "experiment", "portfolio", "incident", "audit", "operator"]);
const evidenceRole = vine.enum(["primary", "supporting", "contradicting"]);

const source = vine.object({
    source_kind: sourceKind,
    source_table: vine.string().trim().minLength(2).maxLength(96),
    source_id: vine.string().trim().minLength(1).maxLength(160),
    source_public_id: vine.string().trim().maxLength(160).nullable().optional(),
    evidence_hash: vine.string().trim().fixedLength(64).nullable().optional(),
    evidence_role: evidenceRole.optional(),
    observed_at: vine.string().trim().minLength(10).maxLength(64).nullable().optional(),
});

const memoryBody = {
    memory_class: memoryClass,
    subject_type: vine.string().trim().maxLength(64).nullable().optional(),
    subject_key: vine.string().trim().maxLength(160).nullable().optional(),
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
    required_permission: vine.string().trim().maxLength(80).nullable().optional(),
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
        principal_kind: vine.enum(["admin", "copilot", "automation"]),
        principal_id: vine.string().trim().maxLength(160).nullable().optional(),
        memory_classes: vine.array(memoryClass).maxLength(8).optional(),
        subject_type: vine.string().trim().maxLength(64).nullable().optional(),
        subject_key: vine.string().trim().maxLength(160).nullable().optional(),
        permissions: vine.array(vine.string().trim().minLength(1).maxLength(80)).maxLength(64).optional(),
        include_restricted: vine.boolean().optional(),
        limit: vine.number().positive().withoutDecimals().max(50).optional(),
    }),
);

export const recordMerchantMemoryEffectivenessValidator = vine.compile(
    vine.object({
        retrieval_public_id: vine.string().trim().maxLength(64),
        memory_public_id: vine.string().trim().maxLength(64).nullable().optional(),
        outcome: vine.enum(["used", "ignored", "misleading", "prevented_repeat_error", "unknown"]),
        usefulness: vine.number().min(0).max(1).nullable().optional(),
        repeat_error_avoided: vine.boolean().nullable().optional(),
        notes: vine.string().trim().maxLength(4000).nullable().optional(),
    }),
);
