import vine from "@vinejs/vine";

const reason = vine.string().trim().minLength(3).maxLength(2000);
const jsonRecord = vine.record(vine.any());
const stringList = vine.array(vine.string().trim().minLength(1).maxLength(190));
const idempotencyKey = vine.string().trim().minLength(8).maxLength(190);
const policyKind = vine.enum(["api", "page", "asset", "query"] as const);
const policyStatus = vine.enum(["enabled", "disabled", "archived"] as const);
const riskTier = vine.enum(["low", "medium", "high", "critical"] as const);
const profileMode = vine.enum(["safe", "balanced", "aggressive", "custom"] as const);
const profileStatus = vine.enum(["draft", "active", "archived"] as const);
const edgeProvider = vine.enum(["none", "cloudflare", "quic", "custom"] as const);
const warmScope = vine.enum(["catalog", "taxonomy", "storefront", "reports", "custom_registered"] as const);
const warmStrategy = vine.enum(["cold_fill", "refresh", "verify"] as const);
const warmPriority = vine.enum(["low", "normal", "high"] as const);
const observationSource = vine.enum(["api", "redis", "edge", "storefront", "synthetic", "worker"] as const);
const purgeScope = vine.enum([
    "catalog_products",
    "product",
    "catalog_categories",
    "catalog_taxonomy",
    "shipping_zones",
    "settings_group",
    "currency",
    "storefront_tenant",
    "admin_reports",
    "admin_customers",
    "customer",
    "regional_provinces",
    "full_tenant",
] as const);
const controlledKey = vine
    .string()
    .trim()
    .minLength(2)
    .maxLength(120)
    .regex(/^[a-z0-9._~-]+$/);

const policyShape = {
    name: vine.string().trim().minLength(2).maxLength(190),
    description: vine.string().trim().maxLength(4000).optional(),
    kind: policyKind,
    route_pattern: vine.string().trim().minLength(2).maxLength(300),
    status: policyStatus,
    risk_tier: riskTier,
    ttl_seconds: vine.number().min(1).max(604800).withoutDecimals(),
    grace_seconds: vine.number().min(0).max(604800).withoutDecimals(),
    stale_if_error_seconds: vine.number().min(0).max(604800).withoutDecimals(),
    soft_timeout_ms: vine.number().min(10).max(60000).withoutDecimals(),
    hard_timeout_ms: vine.number().min(10).max(120000).withoutDecimals(),
    tags: stringList,
    vary: stringList,
    conditions: jsonRecord,
};

export const liteCashPolicyCreateValidator = vine.compile(
    vine.object({
        policy_key: controlledKey,
        ...policyShape,
        reason,
    }),
);

export const liteCashPolicyUpdateValidator = vine.compile(
    vine.object({
        name: policyShape.name.optional(),
        description: vine.string().trim().maxLength(4000).optional(),
        kind: policyKind.optional(),
        route_pattern: policyShape.route_pattern.optional(),
        status: policyStatus.optional(),
        risk_tier: riskTier.optional(),
        ttl_seconds: policyShape.ttl_seconds.optional(),
        grace_seconds: policyShape.grace_seconds.optional(),
        stale_if_error_seconds: policyShape.stale_if_error_seconds.optional(),
        soft_timeout_ms: policyShape.soft_timeout_ms.optional(),
        hard_timeout_ms: policyShape.hard_timeout_ms.optional(),
        tags: stringList.optional(),
        vary: stringList.optional(),
        conditions: jsonRecord.optional(),
        reason,
    }),
);

export const liteCashPurgeValidator = vine.compile(
    vine.object({
        scope: purgeScope,
        target: vine.string().trim().maxLength(190).optional(),
        idempotency_key: idempotencyKey,
        reason,
    }),
);

export const liteCashWarmJobCreateValidator = vine.compile(
    vine.object({
        scope: warmScope,
        target_key: controlledKey,
        strategy: warmStrategy,
        priority: warmPriority,
        concurrency: vine.number().min(1).max(32).withoutDecimals(),
        plan: jsonRecord,
        idempotency_key: idempotencyKey,
        reason,
    }),
);

export const liteCashWarmJobObservationValidator = vine.compile(
    vine.object({
        status: vine.enum(["running", "succeeded", "partial", "failed", "cancelled"] as const),
        discovered_count: vine.number().min(0).withoutDecimals(),
        processed_count: vine.number().min(0).withoutDecimals(),
        success_count: vine.number().min(0).withoutDecimals(),
        failure_count: vine.number().min(0).withoutDecimals(),
        evidence: jsonRecord,
    }),
);

export const liteCashActionValidator = vine.compile(vine.object({ reason }));

const profileShape = {
    name: vine.string().trim().minLength(2).maxLength(190),
    mode: profileMode,
    status: profileStatus,
    css: jsonRecord,
    javascript: jsonRecord,
    images: jsonRecord,
    fonts: jsonRecord,
    navigation: jsonRecord,
    edge: jsonRecord,
};

export const liteCashProfileCreateValidator = vine.compile(
    vine.object({
        profile_key: controlledKey,
        ...profileShape,
        reason,
    }),
);

export const liteCashProfileUpdateValidator = vine.compile(
    vine.object({
        name: profileShape.name.optional(),
        mode: profileMode.optional(),
        status: profileStatus.optional(),
        css: jsonRecord.optional(),
        javascript: jsonRecord.optional(),
        images: jsonRecord.optional(),
        fonts: jsonRecord.optional(),
        navigation: jsonRecord.optional(),
        edge: jsonRecord.optional(),
        reason,
    }),
);

export const liteCashSettingsValidator = vine.compile(
    vine.object({
        enabled: vine.boolean().optional(),
        default_ttl_seconds: vine.number().min(1).max(86400).withoutDecimals().optional(),
        default_grace_seconds: vine.number().min(0).max(604800).withoutDecimals().optional(),
        default_stale_if_error_seconds: vine.number().min(0).max(604800).withoutDecimals().optional(),
        max_policy_ttl_seconds: vine.number().min(1).max(604800).withoutDecimals().optional(),
        max_warm_concurrency: vine.number().min(1).max(32).withoutDecimals().optional(),
        broad_purge_requires_step_up: vine.boolean().optional(),
        debug_minutes: vine.number().min(0).max(1440).withoutDecimals().optional(),
        default_profile: profileMode.optional(),
        edge_provider: edgeProvider.optional(),
        reason,
    }),
);

export const liteCashObservationValidator = vine.compile(
    vine.object({
        source: observationSource,
        metric_key: controlledKey,
        value: vine.number().optional(),
        unit: vine.string().trim().minLength(1).maxLength(24),
        outcome: vine.string().trim().maxLength(24).optional(),
        labels: jsonRecord,
        request_id: vine.string().trim().maxLength(120).optional(),
        observed_at: vine.string().trim().optional(),
    }),
);

export const liteCashSnapshotValidator = vine.compile(
    vine.object({
        snapshot_kind: vine.enum(["manual", "profile_activation", "settings_change", "import"] as const),
        reason,
    }),
);

export const liteCashImportValidator = vine.compile(
    vine.object({
        document: jsonRecord,
        reason,
    }),
);
