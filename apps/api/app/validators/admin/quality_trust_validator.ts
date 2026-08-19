import vine from "@vinejs/vine";

const id = () => vine.number().withoutDecimals().positive();
const optionalId = () => id().optional().nullable();
export const listQualityValidator = vine.compile(
    vine.object({
        page: id().max(10000).optional(),
        limit: id().max(200).optional(),
        q: vine.string().trim().maxLength(190).optional(),
        status: vine.string().trim().maxLength(48).optional(),
        severity: vine.string().trim().maxLength(24).optional(),
    }),
);
export const createCaseValidator = vine.compile(
    vine.object({
        case_type: vine.string().trim().minLength(2).maxLength(64),
        severity: vine.enum(["low", "medium", "high", "critical"] as const).optional(),
        title: vine.string().trim().minLength(3).maxLength(255),
        summary: vine.string().trim().maxLength(8000).optional().nullable(),
        product_id: optionalId(),
        variation_id: optionalId(),
        owner_user_id: optionalId(),
        due_at: vine.string().trim().optional().nullable(),
    }),
);
export const updateCaseValidator = vine.compile(
    vine.object({
        expected_version: id(),
        status: vine
            .enum(["open", "triaged", "investigating", "action_required", "verifying", "resolved", "closed"] as const)
            .optional(),
        severity: vine.enum(["low", "medium", "high", "critical"] as const).optional(),
        title: vine.string().trim().minLength(3).maxLength(255).optional(),
        summary: vine.string().trim().maxLength(8000).optional().nullable(),
        owner_user_id: optionalId(),
        due_at: vine.string().trim().optional().nullable(),
        resolution_summary: vine.string().trim().maxLength(8000).optional().nullable(),
        closure_waiver_reason: vine.string().trim().minLength(8).maxLength(4000).optional().nullable(),
    }),
);
export const sourceValidator = vine.compile(
    vine.object({
        return_item_id: optionalId(),
        product_review_id: optionalId(),
        support_ticket_id: optionalId(),
        refund_id: optionalId(),
        source_role: vine.string().trim().maxLength(48).optional(),
    }),
);
export const evidenceValidator = vine.compile(
    vine.object({
        evidence_type: vine.string().trim().minLength(2).maxLength(64),
        source_system: vine.string().trim().minLength(2).maxLength(96),
        source_ref: vine.string().trim().maxLength(190).optional().nullable(),
        provenance_type: vine.enum(["operator", "customer", "system", "rule", "ai", "external"] as const),
        summary: vine.string().trim().minLength(2).maxLength(20000),
        ai_provenance: vine.record(vine.any()).optional(),
    }),
);
export const findingValidator = vine.compile(
    vine.object({
        truth_state: vine.enum(["observed", "inferred"] as const).optional(),
        finding_type: vine.string().trim().minLength(2).maxLength(64),
        statement: vine.string().trim().minLength(3).maxLength(20000),
        confidence: vine.number().min(0).max(1).optional().nullable(),
        evidence_summary: vine.string().trim().maxLength(8000).optional().nullable(),
    }),
);
export const adjudicateFindingValidator = vine.compile(
    vine.object({ expected_version: id(), truth_state: vine.enum(["validated", "disproven"] as const) }),
);
export const inspectionValidator = vine.compile(
    vine.object({
        reason_definition_id: optionalId(),
        condition: vine.enum(["sealed", "unused", "used", "damaged", "defective", "incomplete", "unknown"] as const),
        disposition: vine.enum([
            "restock",
            "quarantine",
            "refurbish",
            "scrap",
            "return_to_supplier",
            "hold_for_investigation",
        ] as const),
        inspected_quantity: id().max(10000),
        defect_quantity: vine.number().withoutDecimals().min(0).max(10000).optional(),
        note: vine.string().trim().maxLength(8000).optional().nullable(),
        evidence_refs: vine.array(vine.string().trim().maxLength(500)).maxLength(50).optional(),
    }),
);
export const classifyValidator = vine.compile(
    vine.object({
        return_item_id: optionalId(),
        product_review_id: optionalId(),
        support_ticket_id: optionalId(),
        theme_code: vine.string().trim().minLength(2).maxLength(96),
        sentiment: vine
            .enum(["positive", "neutral", "negative", "mixed"] as const)
            .optional()
            .nullable(),
        confidence: vine.number().min(0).max(1).optional().nullable(),
        provenance_type: vine.enum(["operator", "rule", "ai"] as const).optional(),
        ai_provenance: vine.record(vine.any()).optional(),
    }),
);
export const actionValidator = vine.compile(
    vine.object({
        quality_case_id: id(),
        action_type: vine.string().trim().minLength(2).maxLength(64),
        title: vine.string().trim().minLength(3).maxLength(255),
        description: vine.string().trim().maxLength(8000).optional().nullable(),
        owner_user_id: optionalId(),
        due_at: vine.string().trim().optional().nullable(),
        verification_metric_key: vine.string().trim().maxLength(96).optional().nullable(),
    }),
);
export const updateActionValidator = vine.compile(
    vine.object({
        expected_version: id(),
        status: vine.enum([
            "proposed",
            "accepted",
            "in_progress",
            "verification_pending",
            "completed",
            "rejected",
            "cancelled",
        ] as const),
    }),
);
export const outcomeValidator = vine.compile(
    vine.object({
        quality_case_id: id(),
        quality_action_id: optionalId(),
        metric_key: vine.string().trim().minLength(2).maxLength(96),
        unit: vine.string().trim().minLength(1).maxLength(32),
        baseline_value: vine.number().optional().nullable(),
        actual_value: vine.number().optional().nullable(),
        assessment: vine.string().trim().minLength(3).maxLength(8000),
    }),
);
export const reasonValidator = vine.compile(
    vine.object({
        code: vine
            .string()
            .trim()
            .regex(/^[a-z0-9_.-]+$/i)
            .minLength(2)
            .maxLength(96),
        category: vine.string().trim().minLength(2).maxLength(64),
        label_fa: vine.string().trim().minLength(2).maxLength(190),
        label_en: vine.string().trim().maxLength(190).optional().nullable(),
        description_fa: vine.string().trim().maxLength(8000).optional().nullable(),
        default_severity: vine.enum(["low", "medium", "high", "critical"] as const).optional(),
    }),
);
export const signalEvaluateValidator = vine.compile(
    vine.object({
        days: id().min(7).max(180).optional(),
        minimum_delivered_units: id().min(5).max(10000).optional(),
        threshold_rate: vine.number().min(0.001).max(1).optional(),
    }),
);
