import { createHash } from "node:crypto";

import { CacheTags } from "#services/cache_keys";

export type LiteCashPolicyKind = "api" | "page" | "asset" | "query";
export type LiteCashPolicyStatus = "enabled" | "disabled" | "archived";
export type LiteCashRiskTier = "low" | "medium" | "high" | "critical";
export type LiteCashPurgeScope =
    | "catalog_products"
    | "product"
    | "catalog_categories"
    | "catalog_taxonomy"
    | "shipping_zones"
    | "settings_group"
    | "currency"
    | "storefront_tenant"
    | "admin_reports"
    | "admin_customers"
    | "customer"
    | "regional_provinces"
    | "full_tenant";

export type LiteCashPolicyInput = {
    name: string;
    description?: string;
    kind: LiteCashPolicyKind;
    route_pattern: string;
    status: LiteCashPolicyStatus;
    risk_tier: LiteCashRiskTier;
    ttl_seconds: number;
    grace_seconds: number;
    stale_if_error_seconds: number;
    soft_timeout_ms: number;
    hard_timeout_ms: number;
    tags: string[];
    vary: string[];
    conditions: Record<string, unknown>;
};

export type LiteCashPolicySettings = {
    max_policy_ttl_seconds: number;
};

export type LiteCashPolicyValidation = {
    valid: boolean;
    publishable: boolean;
    errors: Array<{ code: string; message: string }>;
    warnings: Array<{ code: string; message: string }>;
    normalized: LiteCashPolicyInput;
    fingerprint: string;
};

export type LiteCashObservation = {
    metric_key: string;
    value: string | number | null;
    observed_at?: string | Date | null;
};

export const REGISTERED_PURGE_SCOPES: readonly LiteCashPurgeScope[] = [
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
] as const;

const REGISTERED_POLICY_TAGS = new Set<string>(REGISTERED_PURGE_SCOPES.filter((scope) => scope !== "full_tenant"));
const PRIVATE_VARY_DIMENSIONS = new Set(["user", "user_id", "session", "session_id", "auth", "authorization", "cookie", "customer"]);
const ALLOWED_VARY_DIMENSIONS = new Set(["tenant", "locale", "device", "country", "currency", "channel", "accept_encoding"]);
const ALLOWED_SETTINGS_GROUPS = new Set([
    "general",
    "tax",
    "shipping",
    "catalog",
    "seo",
    "branding",
    "notifications",
    "regional",
    "currency",
]);
const UNSAFE_ROUTE_PATTERNS = [
    /(^|[/._-])cart([/._-]|$)/i,
    /(^|[/._-])checkout([/._-]|$)/i,
    /(^|[/._-])inventory([/._-]|$)/i,
    /stock[_/-]?status/i,
    /(^|[/._-])orders?([/._-]|$)/i,
    /payment/i,
    /refund/i,
    /(^|[/._-])account([/._-]|$)/i,
    /customer[_/-]?(notes?|timeline)/i,
    /access[_/-]?tokens?/i,
    /sessions?/i,
];

export function stableFingerprint(value: unknown): string {
    return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

export function normalizeUniqueStrings(values: readonly string[]): string[] {
    return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value !== null && typeof value === "object") {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

function normalizedPolicy(input: LiteCashPolicyInput): LiteCashPolicyInput {
    return {
        ...input,
        name: input.name.trim(),
        description: input.description?.trim() ?? "",
        route_pattern: input.route_pattern.trim(),
        tags: normalizeUniqueStrings(input.tags),
        vary: normalizeUniqueStrings(input.vary),
        conditions: input.conditions ?? {},
    };
}

export function validateLiteCashPolicy(input: LiteCashPolicyInput, settings: LiteCashPolicySettings): LiteCashPolicyValidation {
    const normalized = normalizedPolicy(input);
    const errors: Array<{ code: string; message: string }> = [];
    const warnings: Array<{ code: string; message: string }> = [];

    if (normalized.route_pattern.length === 0 || normalized.route_pattern === "*" || normalized.route_pattern === "/") {
        errors.push({ code: "route.invalid", message: "Route pattern must identify a controlled cacheable surface." });
    }
    if (UNSAFE_ROUTE_PATTERNS.some((pattern) => pattern.test(normalized.route_pattern))) {
        errors.push({
            code: "route.correctness_sensitive",
            message: "The route pattern overlaps a correctness-sensitive or private surface and cannot be cached.",
        });
    }
    if (normalized.ttl_seconds <= 0 || normalized.ttl_seconds > settings.max_policy_ttl_seconds) {
        errors.push({ code: "ttl.out_of_range", message: "TTL exceeds the tenant policy ceiling or is not positive." });
    }
    if (normalized.grace_seconds < 0 || normalized.stale_if_error_seconds < 0) {
        errors.push({ code: "stale.negative", message: "Grace and stale-if-error windows cannot be negative." });
    }
    if (normalized.soft_timeout_ms < 0 || normalized.hard_timeout_ms < 0 || normalized.hard_timeout_ms < normalized.soft_timeout_ms) {
        errors.push({ code: "timeout.invalid", message: "Hard timeout must be greater than or equal to soft timeout." });
    }

    for (const tag of normalized.tags) {
        if (!REGISTERED_POLICY_TAGS.has(tag)) {
            errors.push({ code: "tag.unregistered", message: `Unregistered cache tag scope: ${tag}.` });
        }
    }
    if (normalized.tags.length === 0) {
        errors.push({ code: "tag.required", message: "At least one registered invalidation tag is required." });
    }

    for (const dimension of normalized.vary) {
        if (PRIVATE_VARY_DIMENSIONS.has(dimension)) {
            errors.push({ code: "vary.private", message: `Private vary dimension is forbidden: ${dimension}.` });
            continue;
        }
        if (!ALLOWED_VARY_DIMENSIONS.has(dimension)) {
            errors.push({ code: "vary.unknown", message: `Unknown vary dimension: ${dimension}.` });
        }
    }
    if (!normalized.vary.includes("tenant")) {
        errors.push({ code: "vary.tenant_required", message: "Tenant variation is mandatory for managed cache policies." });
    }
    if (normalized.kind !== "asset" && !normalized.vary.includes("locale")) {
        errors.push({ code: "vary.locale_required", message: "Locale variation is mandatory for response cache policies." });
    }

    if (normalized.grace_seconds > normalized.ttl_seconds * 12) {
        warnings.push({ code: "grace.large", message: "Grace is much larger than the fresh TTL; confirm the stale-data tolerance." });
    }
    if (normalized.ttl_seconds > 3600 && /product|catalog|category|search/i.test(normalized.route_pattern)) {
        warnings.push({ code: "ttl.catalog_long", message: "Long catalog TTLs increase stale-listing risk and should rely on proven invalidation." });
    }
    if (normalized.vary.length > 5) {
        warnings.push({ code: "vary.cardinality", message: "Many vary dimensions can collapse cache hit rate." });
    }
    if (normalized.risk_tier === "high" || normalized.risk_tier === "critical") {
        warnings.push({ code: "risk.high", message: "High-risk cache policy changes require deliberate operator review." });
    }

    return {
        valid: errors.length === 0,
        publishable: errors.length === 0,
        errors,
        warnings,
        normalized,
        fingerprint: stableFingerprint(normalized),
    };
}

function numericTarget(target: string | null | undefined, label: string): number {
    if (typeof target !== "string" || !/^\d+$/.test(target) || Number(target) <= 0) {
        throw new Error(`${label} purge requires a positive numeric target id.`);
    }
    return Number(target);
}

export function resolvePurgeScope(tenantId: number, scope: LiteCashPurgeScope, target?: string | null) {
    if (!REGISTERED_PURGE_SCOPES.includes(scope)) throw new Error("Unknown purge scope.");

    if (scope === "catalog_products") return { tags: [CacheTags.catalogProducts(tenantId)], blastRadius: "medium" as const };
    if (scope === "product") {
        const id = numericTarget(target, "Product");
        return { tags: [CacheTags.catalogProduct(tenantId, id)], blastRadius: "narrow" as const };
    }
    if (scope === "catalog_categories") return { tags: [CacheTags.catalogCategories(tenantId)], blastRadius: "medium" as const };
    if (scope === "catalog_taxonomy") return { tags: [CacheTags.catalogTaxonomy(tenantId)], blastRadius: "medium" as const };
    if (scope === "shipping_zones") return { tags: [CacheTags.shippingZones(tenantId)], blastRadius: "medium" as const };
    if (scope === "settings_group") {
        const group = target?.trim().toLowerCase() ?? "";
        if (!ALLOWED_SETTINGS_GROUPS.has(group)) throw new Error("Settings purge requires a registered settings group.");
        return { tags: [CacheTags.settingsGroup(group, tenantId)], blastRadius: "narrow" as const };
    }
    if (scope === "currency") return { tags: [CacheTags.currency(tenantId)], blastRadius: "narrow" as const };
    if (scope === "storefront_tenant") return { tags: [CacheTags.storefrontTenant(tenantId)], blastRadius: "narrow" as const };
    if (scope === "admin_reports") return { tags: [CacheTags.adminReports(tenantId)], blastRadius: "medium" as const };
    if (scope === "admin_customers") return { tags: [CacheTags.adminCustomers(tenantId)], blastRadius: "medium" as const };
    if (scope === "customer") {
        const id = numericTarget(target, "Customer");
        return { tags: [CacheTags.adminCustomer(tenantId, id)], blastRadius: "narrow" as const };
    }
    if (scope === "regional_provinces") return { tags: [CacheTags.regionalProvinces(tenantId)], blastRadius: "medium" as const };

    const tags = [
        CacheTags.catalogProducts(tenantId),
        CacheTags.catalogCategories(tenantId),
        CacheTags.catalogTaxonomy(tenantId),
        CacheTags.shippingZones(tenantId),
        CacheTags.currency(tenantId),
        CacheTags.storefrontTenant(tenantId),
        CacheTags.adminReports(tenantId),
        CacheTags.adminCustomers(tenantId),
        CacheTags.regionalProvinces(tenantId),
        ...[...ALLOWED_SETTINGS_GROUPS].map((group) => CacheTags.settingsGroup(group, tenantId)),
    ];
    return { tags: [...new Set(tags)].sort(), blastRadius: "broad" as const };
}

function percentile95(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? null;
}

export function computeObservationSummary(rows: readonly LiteCashObservation[]) {
    let hits = 0;
    let misses = 0;
    let stale = 0;
    const originLatency: number[] = [];
    const cacheLatency: number[] = [];

    for (const row of rows) {
        const value = Number(row.value);
        if (!Number.isFinite(value)) continue;
        if (row.metric_key === "cache_hit") hits += value;
        if (row.metric_key === "cache_miss") misses += value;
        if (row.metric_key === "cache_stale") stale += value;
        if (row.metric_key === "origin_latency_ms") originLatency.push(value);
        if (row.metric_key === "cache_latency_ms") cacheLatency.push(value);
    }

    const cacheTotal = hits + misses + stale;
    return {
        samples: rows.length,
        hit_rate: cacheTotal > 0 ? hits / cacheTotal : null,
        miss_rate: cacheTotal > 0 ? misses / cacheTotal : null,
        stale_rate: cacheTotal > 0 ? stale / cacheTotal : null,
        p95_origin_latency_ms: percentile95(originLatency),
        p95_cache_latency_ms: percentile95(cacheLatency),
    };
}

export function validateLiteCashImport(document: Record<string, unknown>, settings: LiteCashPolicySettings) {
    const errors: Array<{ code: string; message: string }> = [];
    const warnings: Array<{ code: string; message: string }> = [];
    if (document.schema !== "calibra.lite-cash.v1") {
        errors.push({ code: "schema.unsupported", message: "Unsupported lite cash import schema." });
    }
    const policies = Array.isArray(document.policies) ? document.policies : null;
    const profiles = Array.isArray(document.profiles) ? document.profiles : null;
    if (policies === null) errors.push({ code: "policies.invalid", message: "Import policies must be an array." });
    if (profiles === null) errors.push({ code: "profiles.invalid", message: "Import profiles must be an array." });

    const policyKeys = new Set<string>();
    for (const [index, raw] of (policies ?? []).entries()) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            errors.push({ code: `policy.${index}.invalid`, message: "Imported policy must be an object." });
            continue;
        }
        const policy = raw as Record<string, unknown>;
        const key = String(policy.policy_key ?? "");
        if (!key) errors.push({ code: `policy.${index}.key`, message: "Imported policy key is required." });
        else if (policyKeys.has(key)) errors.push({ code: `policy.${index}.duplicate`, message: `Duplicate policy key: ${key}.` });
        else policyKeys.add(key);
        const validation = validateLiteCashPolicy(
            {
                name: String(policy.name ?? ""),
                description: String(policy.description ?? ""),
                kind: String(policy.kind ?? "") as LiteCashPolicyKind,
                route_pattern: String(policy.route_pattern ?? ""),
                status: String(policy.status ?? "disabled") as LiteCashPolicyStatus,
                risk_tier: String(policy.risk_tier ?? "medium") as LiteCashRiskTier,
                ttl_seconds: Number(policy.ttl_seconds ?? 0),
                grace_seconds: Number(policy.grace_seconds ?? 0),
                stale_if_error_seconds: Number(policy.stale_if_error_seconds ?? 0),
                soft_timeout_ms: Number(policy.soft_timeout_ms ?? 0),
                hard_timeout_ms: Number(policy.hard_timeout_ms ?? 0),
                tags: Array.isArray(policy.tags) ? policy.tags.map(String) : [],
                vary: Array.isArray(policy.vary) ? policy.vary.map(String) : [],
                conditions: policy.conditions && typeof policy.conditions === "object" && !Array.isArray(policy.conditions) ? (policy.conditions as Record<string, unknown>) : {},
            },
            settings,
        );
        errors.push(...validation.errors.map((item) => ({ code: `policy.${index}.${item.code}`, message: item.message })));
        warnings.push(...validation.warnings.map((item) => ({ code: `policy.${index}.${item.code}`, message: item.message })));
    }

    const profileKeys = new Set<string>();
    let activeProfiles = 0;
    for (const [index, raw] of (profiles ?? []).entries()) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            errors.push({ code: `profile.${index}.invalid`, message: "Imported profile must be an object." });
            continue;
        }
        const profile = raw as Record<string, unknown>;
        const key = String(profile.profile_key ?? "");
        if (!key) errors.push({ code: `profile.${index}.key`, message: "Imported profile key is required." });
        else if (profileKeys.has(key)) errors.push({ code: `profile.${index}.duplicate`, message: `Duplicate profile key: ${key}.` });
        else profileKeys.add(key);
        if (profile.status === "active") activeProfiles += 1;
    }
    if (activeProfiles > 1) errors.push({ code: "profiles.multiple_active", message: "Only one optimization profile may be active." });

    return { valid: errors.length === 0, errors, warnings, fingerprint: stableFingerprint(document) };
}
