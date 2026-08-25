import vine from "@vinejs/vine";

const jsonRecord = vine.record(vine.any());
const resolverKey = vine
    .string()
    .trim()
    .minLength(6)
    .maxLength(190)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._~-]+$/);
const nodeRef = vine.string().trim().minLength(1).maxLength(190);

export const productPassportCreateValidator = vine.compile(
    vine.object({
        product_id: vine.number().min(1),
        variation_id: vine.number().min(1).optional(),
        identity_level: vine.enum(["product", "model", "batch", "item"] as const),
        batch_code: vine.string().trim().minLength(1).maxLength(120).optional(),
        serial_number: vine.string().trim().minLength(1).maxLength(190).optional(),
        resolver_key: resolverKey,
        identifiers: jsonRecord,
        public_fields: jsonRecord,
        private_fields: jsonRecord,
        resolver_config: jsonRecord,
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);

export const productPassportUpdateValidator = vine.compile(
    vine.object({
        identifiers: jsonRecord.optional(),
        public_fields: jsonRecord.optional(),
        private_fields: jsonRecord.optional(),
        resolver_config: jsonRecord.optional(),
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);

export const productPassportStateValidator = vine.compile(
    vine.object({
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);

export const productPassportEvidenceValidator = vine.compile(
    vine.object({
        evidence_type: vine.string().trim().minLength(2).maxLength(48),
        visibility: vine.enum(["public", "private"] as const),
        source_kind: vine.string().trim().minLength(2).maxLength(64),
        source_ref: vine.string().trim().minLength(1).maxLength(190).optional(),
        issuer: vine.string().trim().minLength(1).maxLength(190).optional(),
        summary: vine.string().trim().maxLength(8000).optional(),
        payload: jsonRecord,
        occurred_at: vine.string().trim().minLength(10).maxLength(64).optional(),
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);

export const productPassportEvidenceStateValidator = vine.compile(
    vine.object({
        verification_status: vine.enum(["verified", "rejected", "expired"] as const),
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);

export const productPassportEdgeValidator = vine.compile(
    vine.object({
        from_node_type: vine.string().trim().minLength(2).maxLength(32),
        from_node_ref: nodeRef,
        relation_type: vine.string().trim().minLength(2).maxLength(64),
        to_node_type: vine.string().trim().minLength(2).maxLength(32),
        to_node_ref: nodeRef,
        visibility: vine.enum(["public", "private"] as const),
        metadata: jsonRecord,
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);

export const productPassportRegulatoryMappingValidator = vine.compile(
    vine.object({
        jurisdiction: vine.string().trim().minLength(2).maxLength(64),
        framework: vine.string().trim().minLength(2).maxLength(120),
        framework_version: vine.string().trim().minLength(1).maxLength(64),
        mapping_version: vine.number().min(1),
        field_mapping: jsonRecord,
        conformance_note: vine.string().trim().minLength(10).maxLength(8000),
        effective_from: vine.string().trim().minLength(10).maxLength(64).optional(),
        effective_to: vine.string().trim().minLength(10).maxLength(64).optional(),
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);

export const productPassportRegulatoryStateValidator = vine.compile(
    vine.object({
        status: vine.enum(["active", "retired"] as const),
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);

export const productPassportAccessPresetValidator = vine.compile(
    vine.object({
        user_id: vine.number().min(1),
        preset: vine.enum(["owner", "compliance", "operator", "viewer"] as const),
        reason: vine.string().trim().minLength(3).maxLength(2000),
    }),
);
