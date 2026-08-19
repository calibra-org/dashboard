import vine from "@vinejs/vine";

export const agenticChannelValidator = vine.compile(
    vine.object({
        channel_key: vine.string().trim().minLength(2).maxLength(120),
        display_name: vine.string().trim().minLength(2).maxLength(190),
        adapter_key: vine.enum(["native", "ucp", "acp", "mcp", "a2a", "custom"]),
        mode: vine.enum(["disabled", "shadow", "read_only", "live"]),
        protocol_version: vine.string().trim().maxLength(80).optional().nullable(),
        eligible_product_scope: vine.record(vine.any()).optional(),
        policy_boundary: vine.record(vine.any()).optional(),
        reason: vine.string().trim().minLength(8).maxLength(1000),
    }),
);

export const agenticCapabilityValidator = vine.compile(
    vine.object({
        channel_public_id: vine.string().uuid(),
        capability_key: vine.string().trim().minLength(2).maxLength(120),
        protocol_version: vine.string().trim().maxLength(80).optional().nullable(),
        transport: vine.enum(["rest", "jsonrpc", "stdio", "sse", "webhook"]),
        endpoint_path: vine.string().trim().maxLength(320).optional().nullable(),
        input_schema: vine.record(vine.any()),
        output_schema: vine.record(vine.any()),
        required_scopes: vine.array(vine.string().trim().maxLength(120)).maxLength(50),
        risk_class: vine.enum(["read_only", "low", "medium", "high", "critical"]),
        reason: vine.string().trim().minLength(8).maxLength(1000),
    }),
);

export const agenticConformanceValidator = vine.compile(
    vine.object({
        channel_public_id: vine.string().uuid(),
        reason: vine.string().trim().minLength(8).maxLength(1000),
    }),
);

export const readinessRefreshValidator = vine.compile(
    vine.object({
        product_id: vine.number().positive().withoutDecimals(),
        locale: vine.string().trim().maxLength(8).optional(),
    }),
);

export const agenticPrincipalValidator = vine.compile(
    vine.object({
        principal_key: vine.string().trim().minLength(2).maxLength(120),
        display_name: vine.string().trim().minLength(2).maxLength(190),
        principal_type: vine.string().trim().minLength(2).maxLength(32),
        status: vine.enum(["disabled", "shadow", "active", "revoked"]),
        scopes: vine.array(vine.string().trim().maxLength(120)).maxLength(64),
        rate_limit_policy: vine.record(vine.any()),
        credential_fingerprint: vine.string().trim().maxLength(190).nullable().optional(),
        reason: vine.string().trim().minLength(8).maxLength(500),
    }),
);

export const agenticActionValidator = vine.compile(
    vine.object({
        channel_public_id: vine.string().uuid(),
        principal_public_id: vine.string().uuid(),
        capability_key: vine.string().trim().minLength(2).maxLength(120),
        idempotency_key: vine.string().trim().minLength(8).maxLength(160),
        payload: vine.record(vine.any()),
    }),
);

export const publicAgenticActionValidator = vine.compile(
    vine.object({
        channel_public_id: vine.string().uuid(),
        capability_key: vine.string().trim().minLength(2).maxLength(120),
        idempotency_key: vine.string().trim().minLength(8).maxLength(160),
        payload: vine.record(vine.any()),
    }),
);

export const publicAgenticEventValidator = vine.compile(
    vine.object({
        event_id: vine.string().trim().minLength(8).maxLength(160),
        event_type: vine.string().trim().minLength(2).maxLength(160),
        channel_public_id: vine.string().uuid().nullable().optional(),
        aggregate_type: vine.string().trim().minLength(2).maxLength(64),
        aggregate_id: vine.string().trim().minLength(1).maxLength(190),
        session_id: vine.string().trim().maxLength(160).nullable().optional(),
        correlation_id: vine.string().trim().maxLength(160).nullable().optional(),
        causation_id: vine.string().trim().maxLength(160).nullable().optional(),
        occurred_at: vine.string().trim().maxLength(64),
        payload: vine.record(vine.any()).optional(),
    }),
);
