import cache from "@adonisjs/cache/services/main";
import { Exception } from "@adonisjs/core/exceptions";

import {
    computeObservationSummary,
    type LiteCashPolicyInput,
    type LiteCashPurgeScope,
    REGISTERED_PURGE_SCOPES,
    resolvePurgeScope,
    stableFingerprint,
    validateLiteCashImport,
    validateLiteCashPolicy,
} from "#services/lite_cash/policy";
import { recordCacheInvalidate } from "#services/metrics/domain_metrics";
import { currentTenantId, currentTrx } from "#services/tenant_context";
import env from "#start/env";

type JsonRecord = Record<string, unknown>;
type WarmStatus = "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
type ProfileMode = "safe" | "balanced" | "aggressive" | "custom";
type ProfileStatus = "draft" | "active" | "archived";
type EdgeProvider = "none" | "cloudflare" | "quic" | "custom";

type PolicyCreateInput = LiteCashPolicyInput & { policy_key: string; reason: string };
type PolicyUpdateInput = Partial<LiteCashPolicyInput> & { reason: string };
type PurgeInput = { scope: LiteCashPurgeScope; target?: string; idempotency_key: string; reason: string };
type WarmCreateInput = {
    scope: "catalog" | "taxonomy" | "storefront" | "reports" | "custom_registered";
    target_key: string;
    strategy: "cold_fill" | "refresh" | "verify";
    priority: "low" | "normal" | "high";
    concurrency: number;
    plan: JsonRecord;
    idempotency_key: string;
    reason: string;
};
type WarmObservationInput = {
    status: Exclude<WarmStatus, "queued">;
    discovered_count: number;
    processed_count: number;
    success_count: number;
    failure_count: number;
    evidence: JsonRecord;
};
type ProfileCreateInput = {
    profile_key: string;
    name: string;
    mode: ProfileMode;
    status: ProfileStatus;
    css: JsonRecord;
    javascript: JsonRecord;
    images: JsonRecord;
    fonts: JsonRecord;
    navigation: JsonRecord;
    edge: JsonRecord;
    reason: string;
};
type ProfileUpdateInput = Partial<Omit<ProfileCreateInput, "profile_key" | "reason">> & { reason: string };
type SettingsInput = {
    enabled?: boolean;
    default_ttl_seconds?: number;
    default_grace_seconds?: number;
    default_stale_if_error_seconds?: number;
    max_policy_ttl_seconds?: number;
    max_warm_concurrency?: number;
    broad_purge_requires_step_up?: boolean;
    debug_minutes?: number;
    default_profile?: ProfileMode;
    edge_provider?: EdgeProvider;
};
type ObservationInput = {
    source: "api" | "redis" | "edge" | "storefront" | "synthetic" | "worker";
    metric_key: string;
    value?: number;
    unit: string;
    outcome?: string;
    labels: JsonRecord;
    request_id?: string;
    observed_at?: string;
};

function tenantId(): number {
    return Number(currentTenantId());
}

function nowIso(): string {
    return new Date().toISOString();
}

function clampLimit(value: number, maximum = 500): number {
    if (!Number.isFinite(value)) return 100;
    return Math.max(1, Math.min(maximum, Math.trunc(value)));
}

function objectValue(value: unknown): JsonRecord {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonRecord;
        } catch {
            return {};
        }
    }
    return {};
}

function arrayValue(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function comparable(value: unknown): string {
    return stableFingerprint(value);
}

async function settingsRow() {
    const existing = await currentTrx().from("lite_cash_settings").where("tenant_id", tenantId()).first();
    if (existing) return existing;
    const [created] = await currentTrx()
        .table("lite_cash_settings")
        .insert({ tenant_id: tenantId() })
        .onConflict(["tenant_id"])
        .ignore()
        .returning("*");
    if (created) return created;
    const raced = await currentTrx().from("lite_cash_settings").where("tenant_id", tenantId()).first();
    if (!raced) throw new Error("Failed to initialize lite cash settings");
    return raced;
}

async function policyByPublicId(publicId: string) {
    const row = await currentTrx().from("lite_cash_policies").where("public_id", publicId).first();
    if (!row) throw new Exception("lite cash policy not found", { status: 404, code: "E_LITE_CASH_POLICY_NOT_FOUND" });
    return row;
}

async function warmJobByPublicId(publicId: string) {
    const row = await currentTrx().from("lite_cash_warm_jobs").where("public_id", publicId).first();
    if (!row) throw new Exception("lite cash warm job not found", { status: 404, code: "E_LITE_CASH_WARM_JOB_NOT_FOUND" });
    return row;
}

async function profileByPublicId(publicId: string) {
    const row = await currentTrx().from("lite_cash_optimization_profiles").where("public_id", publicId).first();
    if (!row) throw new Exception("lite cash profile not found", { status: 404, code: "E_LITE_CASH_PROFILE_NOT_FOUND" });
    return row;
}

function policyInputFromRow(row: Record<string, unknown>): LiteCashPolicyInput {
    return {
        name: String(row.name ?? ""),
        description: String(row.description ?? ""),
        kind: String(row.kind ?? "api") as LiteCashPolicyInput["kind"],
        route_pattern: String(row.route_pattern ?? ""),
        status: String(row.status ?? "disabled") as LiteCashPolicyInput["status"],
        risk_tier: String(row.risk_tier ?? "medium") as LiteCashPolicyInput["risk_tier"],
        ttl_seconds: Number(row.ttl_seconds ?? 0),
        grace_seconds: Number(row.grace_seconds ?? 0),
        stale_if_error_seconds: Number(row.stale_if_error_seconds ?? 0),
        soft_timeout_ms: Number(row.soft_timeout_ms ?? 0),
        hard_timeout_ms: Number(row.hard_timeout_ms ?? 0),
        tags: arrayValue(row.tags).map(String),
        vary: arrayValue(row.vary).map(String),
        conditions: objectValue(row.conditions),
    };
}

export async function getSettings() {
    return settingsRow();
}

export async function topology() {
    const settings = await settingsRow();
    const driver = String(env.get("CACHE_DRIVER"));
    const latest = await currentTrx().from("lite_cash_observations").max("observed_at as observed_at").first();
    return {
        driver,
        l1_enabled: true,
        l2_enabled: driver === "redis",
        bus_enabled: driver === "redis",
        tenant_namespace: "t<tenant-id>:<domain>:<resource>:...",
        runtime_defaults: {
            ttl_seconds: Number(settings.default_ttl_seconds),
            grace_seconds: Number(settings.default_grace_seconds),
            soft_timeout_ms: 200,
            hard_timeout_ms: 2000,
        },
        registered_purge_scopes: REGISTERED_PURGE_SCOPES.length,
        last_observation_at: latest?.observed_at ?? null,
        secrets_exposed: false,
    };
}

export async function listPolicies(limit = 250, q = "") {
    let query = currentTrx().from("lite_cash_policies").orderBy("updated_at", "desc").limit(clampLimit(limit));
    const needle = q.trim();
    if (needle)
        query = query.where((builder) =>
            builder
                .whereILike("name", `%${needle}%`)
                .orWhereILike("policy_key", `%${needle}%`)
                .orWhereILike("route_pattern", `%${needle}%`),
        );
    return query;
}

export async function getPolicy(publicId: string) {
    return policyByPublicId(publicId);
}

export async function createPolicy(input: PolicyCreateInput, userId: number) {
    const settings = await settingsRow();
    const validation = validateLiteCashPolicy(input, { max_policy_ttl_seconds: Number(settings.max_policy_ttl_seconds) });
    if (!validation.valid) {
        throw new Exception("lite cash policy validation failed", {
            status: 422,
            code: "E_LITE_CASH_POLICY_INVALID",
            cause: validation.errors,
        });
    }
    const [row] = await currentTrx()
        .table("lite_cash_policies")
        .insert({
            tenant_id: tenantId(),
            policy_key: input.policy_key,
            ...validation.normalized,
            validation,
            created_by_user_id: userId,
            updated_by_user_id: userId,
        })
        .returning("*");
    return row;
}

export async function updatePolicy(publicId: string, input: PolicyUpdateInput, userId: number) {
    const current = await policyByPublicId(publicId);
    const currentInput = policyInputFromRow(current);
    const candidate: LiteCashPolicyInput = {
        ...currentInput,
        ...Object.fromEntries(Object.entries(input).filter(([key]) => key !== "reason")),
    } as LiteCashPolicyInput;
    const settings = await settingsRow();
    const validation = validateLiteCashPolicy(candidate, { max_policy_ttl_seconds: Number(settings.max_policy_ttl_seconds) });
    if (!validation.valid) {
        throw new Exception("lite cash policy validation failed", {
            status: 422,
            code: "E_LITE_CASH_POLICY_INVALID",
            cause: validation.errors,
        });
    }
    if (comparable(currentInput) === comparable(validation.normalized)) return { data: current, changed: false, validation };
    const [row] = await currentTrx()
        .from("lite_cash_policies")
        .where("id", current.id)
        .update({
            ...validation.normalized,
            validation,
            version: Number(current.version) + 1,
            updated_by_user_id: userId,
            updated_at: new Date(),
        })
        .returning("*");
    return { data: row, changed: true, validation };
}

export async function validatePolicy(publicId: string) {
    const current = await policyByPublicId(publicId);
    const settings = await settingsRow();
    const validation = validateLiteCashPolicy(policyInputFromRow(current), {
        max_policy_ttl_seconds: Number(settings.max_policy_ttl_seconds),
    });
    await currentTrx().from("lite_cash_policies").where("id", current.id).update({ validation, updated_at: new Date() });
    return validation;
}

export function purgeRegistry() {
    return REGISTERED_PURGE_SCOPES.map((scope) => ({
        scope,
        target_required: scope === "product" || scope === "customer" || scope === "settings_group",
        broad: scope === "full_tenant",
    }));
}

export async function purgePreview(input: Pick<PurgeInput, "scope" | "target">) {
    try {
        const resolved = resolvePurgeScope(tenantId(), input.scope, input.target);
        return { scope: input.scope, target: input.target ?? null, ...resolved };
    } catch (error) {
        throw new Exception(error instanceof Error ? error.message : "Invalid purge scope", {
            status: 422,
            code: "E_LITE_CASH_PURGE_SCOPE_INVALID",
        });
    }
}

export async function broadPurgeRequiresStepUp(input: Pick<PurgeInput, "scope" | "target">) {
    const preview = await purgePreview(input);
    if (preview.blastRadius !== "broad") return false;
    const settings = await settingsRow();
    return Boolean(settings.broad_purge_requires_step_up);
}

async function existingPurgeByIdempotency(key: string) {
    return currentTrx().from("lite_cash_purge_events").where("idempotency_key", key).first();
}

export async function planPurge(input: PurgeInput, userId: number) {
    const existing = await existingPurgeByIdempotency(input.idempotency_key);
    if (existing) return existing;
    const preview = await purgePreview(input);
    const [event] = await currentTrx()
        .table("lite_cash_purge_events")
        .insert({
            tenant_id: tenantId(),
            scope: input.scope,
            target: input.target ?? null,
            mode: "dry_run",
            status: "planned",
            resolved_tags: preview.tags,
            blast_radius: preview.blastRadius,
            idempotency_key: input.idempotency_key,
            reason: input.reason,
            actor_user_id: userId,
            evidence: { executed: false, planned_at: nowIso() },
        })
        .returning("*");
    return event;
}

export async function executePurge(input: PurgeInput, userId: number) {
    const existing = await existingPurgeByIdempotency(input.idempotency_key);
    if (existing) return existing;
    const preview = await purgePreview(input);
    const [planned] = await currentTrx()
        .table("lite_cash_purge_events")
        .insert({
            tenant_id: tenantId(),
            scope: input.scope,
            target: input.target ?? null,
            mode: "execute",
            status: "planned",
            resolved_tags: preview.tags,
            blast_radius: preview.blastRadius,
            idempotency_key: input.idempotency_key,
            reason: input.reason,
            actor_user_id: userId,
            evidence: { tag_count: preview.tags.length },
        })
        .returning("*");
    try {
        await cache.deleteByTag({ tags: preview.tags });
        recordCacheInvalidate(preview.tags);
        const [completed] = await currentTrx()
            .from("lite_cash_purge_events")
            .where("id", planned.id)
            .update({
                status: "succeeded",
                completed_at: new Date(),
                evidence: { tag_count: preview.tags.length, completed: true },
            })
            .returning("*");
        return completed;
    } catch {
        const [failed] = await currentTrx()
            .from("lite_cash_purge_events")
            .where("id", planned.id)
            .update({
                status: "failed",
                completed_at: new Date(),
                evidence: { tag_count: preview.tags.length, completed: false },
            })
            .returning("*");
        return failed;
    }
}

export async function listPurges(limit = 200) {
    return currentTrx().from("lite_cash_purge_events").orderBy("created_at", "desc").limit(clampLimit(limit, 500));
}

export async function createWarmJob(input: WarmCreateInput, userId: number) {
    const existing = await currentTrx().from("lite_cash_warm_jobs").where("idempotency_key", input.idempotency_key).first();
    if (existing) return existing;
    const settings = await settingsRow();
    if (input.concurrency > Number(settings.max_warm_concurrency)) {
        throw new Exception("Warm concurrency exceeds the tenant ceiling", { status: 422, code: "E_LITE_CASH_WARM_CONCURRENCY" });
    }
    const normalizedPlan = {
        scope: input.scope,
        target_key: input.target_key,
        strategy: input.strategy,
        priority: input.priority,
        concurrency: input.concurrency,
        plan: input.plan,
    };
    const [row] = await currentTrx()
        .table("lite_cash_warm_jobs")
        .insert({
            tenant_id: tenantId(),
            scope: input.scope,
            target_key: input.target_key,
            strategy: input.strategy,
            status: "queued",
            priority: input.priority,
            concurrency: input.concurrency,
            plan: normalizedPlan,
            plan_sha256: stableFingerprint(normalizedPlan),
            idempotency_key: input.idempotency_key,
            actor_user_id: userId,
        })
        .returning("*");
    return row;
}

export async function listWarmJobs(limit = 200) {
    return currentTrx().from("lite_cash_warm_jobs").orderBy("created_at", "desc").limit(clampLimit(limit, 500));
}

export async function getWarmJob(publicId: string) {
    return warmJobByPublicId(publicId);
}

export async function cancelWarmJob(publicId: string) {
    const current = await warmJobByPublicId(publicId);
    if (["succeeded", "partial", "failed", "cancelled"].includes(String(current.status)))
        return { data: current, changed: false };
    const [row] = await currentTrx()
        .from("lite_cash_warm_jobs")
        .where("id", current.id)
        .update({ status: "cancelled", completed_at: new Date(), updated_at: new Date() })
        .returning("*");
    return { data: row, changed: true };
}

export async function observeWarmJob(publicId: string, input: WarmObservationInput) {
    const current = await warmJobByPublicId(publicId);
    if (input.processed_count > input.discovered_count || input.success_count + input.failure_count > input.processed_count) {
        throw new Exception("Warm job counters are inconsistent", { status: 422, code: "E_LITE_CASH_WARM_COUNTS" });
    }
    if (
        input.discovered_count < Number(current.discovered_count) ||
        input.processed_count < Number(current.processed_count) ||
        input.success_count < Number(current.success_count) ||
        input.failure_count < Number(current.failure_count)
    ) {
        throw new Exception("Warm job counters must be monotonic", { status: 409, code: "E_LITE_CASH_WARM_COUNTER_REGRESSION" });
    }
    const terminal = ["succeeded", "partial", "failed", "cancelled"].includes(input.status);
    const [row] = await currentTrx()
        .from("lite_cash_warm_jobs")
        .where("id", current.id)
        .update({
            status: input.status,
            discovered_count: input.discovered_count,
            processed_count: input.processed_count,
            success_count: input.success_count,
            failure_count: input.failure_count,
            started_at: current.started_at ?? new Date(),
            completed_at: terminal ? new Date() : null,
            updated_at: new Date(),
        })
        .returning("*");
    await currentTrx()
        .table("lite_cash_observations")
        .insert({
            tenant_id: tenantId(),
            source: "worker",
            metric_key: "warm_job_progress",
            value: input.processed_count,
            unit: "count",
            outcome: input.status,
            labels: { warm_job_public_id: publicId, evidence: input.evidence },
            observed_at: new Date(),
        });
    return row;
}

function profileFingerprint(input: Omit<ProfileCreateInput, "profile_key" | "name" | "status" | "reason">) {
    return stableFingerprint({
        mode: input.mode,
        css: input.css,
        javascript: input.javascript,
        images: input.images,
        fonts: input.fonts,
        navigation: input.navigation,
        edge: input.edge,
    });
}

export async function listProfiles(limit = 100) {
    return currentTrx().from("lite_cash_optimization_profiles").orderBy("updated_at", "desc").limit(clampLimit(limit, 250));
}

export async function getProfile(publicId: string) {
    return profileByPublicId(publicId);
}

export async function createProfile(input: ProfileCreateInput, userId: number) {
    const fingerprint = profileFingerprint(input);
    const [row] = await currentTrx()
        .table("lite_cash_optimization_profiles")
        .insert({
            tenant_id: tenantId(),
            profile_key: input.profile_key,
            name: input.name,
            mode: input.mode,
            status: "draft",
            css: input.css,
            javascript: input.javascript,
            images: input.images,
            fonts: input.fonts,
            navigation: input.navigation,
            edge: input.edge,
            fingerprint_sha256: fingerprint,
            created_by_user_id: userId,
            updated_by_user_id: userId,
        })
        .returning("*");
    return row;
}

export async function updateProfile(publicId: string, input: ProfileUpdateInput, userId: number) {
    const current = await profileByPublicId(publicId);
    const next = {
        name: input.name ?? String(current.name),
        mode: input.mode ?? (String(current.mode) as ProfileMode),
        status: input.status ?? (String(current.status) as ProfileStatus),
        css: input.css ?? objectValue(current.css),
        javascript: input.javascript ?? objectValue(current.javascript),
        images: input.images ?? objectValue(current.images),
        fonts: input.fonts ?? objectValue(current.fonts),
        navigation: input.navigation ?? objectValue(current.navigation),
        edge: input.edge ?? objectValue(current.edge),
    };
    if (next.status === "active" && current.status !== "active") {
        throw new Exception("Use the activate endpoint to make an optimization profile active", {
            status: 422,
            code: "E_LITE_CASH_PROFILE_ACTIVATION_REQUIRED",
        });
    }
    const currentComparable = {
        name: current.name,
        mode: current.mode,
        status: current.status,
        css: objectValue(current.css),
        javascript: objectValue(current.javascript),
        images: objectValue(current.images),
        fonts: objectValue(current.fonts),
        navigation: objectValue(current.navigation),
        edge: objectValue(current.edge),
    };
    if (comparable(currentComparable) === comparable(next)) return { data: current, changed: false };
    const fingerprint = profileFingerprint({
        mode: next.mode,
        css: next.css,
        javascript: next.javascript,
        images: next.images,
        fonts: next.fonts,
        navigation: next.navigation,
        edge: next.edge,
    });
    const [row] = await currentTrx()
        .from("lite_cash_optimization_profiles")
        .where("id", current.id)
        .update({
            ...next,
            fingerprint_sha256: fingerprint,
            version: Number(current.version) + 1,
            updated_by_user_id: userId,
            updated_at: new Date(),
        })
        .returning("*");
    return { data: row, changed: true };
}

export async function activateProfile(publicId: string, userId: number, reason: string) {
    const current = await profileByPublicId(publicId);
    if (current.status === "active") return { data: current, changed: false };
    await currentTrx()
        .from("lite_cash_optimization_profiles")
        .where("status", "active")
        .whereNot("id", current.id)
        .update({ status: "draft", updated_at: new Date() });
    const [row] = await currentTrx()
        .from("lite_cash_optimization_profiles")
        .where("id", current.id)
        .update({ status: "active", version: Number(current.version) + 1, updated_by_user_id: userId, updated_at: new Date() })
        .returning("*");
    await createSnapshot("profile_activation", reason, userId);
    return { data: row, changed: true };
}

export async function listObservations(limit = 400) {
    return currentTrx().from("lite_cash_observations").orderBy("observed_at", "desc").limit(clampLimit(limit, 1000));
}

export async function recordObservation(input: ObservationInput) {
    const observedAt = input.observed_at ? new Date(input.observed_at) : new Date();
    if (Number.isNaN(observedAt.getTime())) {
        throw new Exception("Observation timestamp is invalid", { status: 422, code: "E_LITE_CASH_OBSERVED_AT" });
    }
    const [row] = await currentTrx()
        .table("lite_cash_observations")
        .insert({
            tenant_id: tenantId(),
            source: input.source,
            metric_key: input.metric_key,
            value: input.value ?? null,
            unit: input.unit,
            outcome: input.outcome ?? null,
            labels: input.labels,
            request_id: input.request_id ?? null,
            observed_at: observedAt,
        })
        .returning("*");
    return row;
}

function settingsComparable(row: Record<string, unknown>) {
    return {
        enabled: Boolean(row.enabled),
        default_ttl_seconds: Number(row.default_ttl_seconds),
        default_grace_seconds: Number(row.default_grace_seconds),
        default_stale_if_error_seconds: Number(row.default_stale_if_error_seconds),
        max_policy_ttl_seconds: Number(row.max_policy_ttl_seconds),
        max_warm_concurrency: Number(row.max_warm_concurrency),
        broad_purge_requires_step_up: Boolean(row.broad_purge_requires_step_up),
        debug_until: row.debug_until ? new Date(String(row.debug_until)).toISOString() : null,
        default_profile: String(row.default_profile),
        edge_provider: String(row.edge_provider),
    };
}

export async function updateSettings(input: SettingsInput, userId: number, reason: string) {
    const current = await settingsRow();
    const currentValues = settingsComparable(current);
    const next = {
        ...currentValues,
        ...Object.fromEntries(Object.entries(input).filter(([key]) => key !== "debug_minutes")),
        debug_until:
            input.debug_minutes === undefined
                ? currentValues.debug_until
                : input.debug_minutes === 0
                  ? null
                  : new Date(Date.now() + input.debug_minutes * 60_000).toISOString(),
    };
    if (Number(next.default_ttl_seconds) > Number(next.max_policy_ttl_seconds)) {
        throw new Exception("Default TTL cannot exceed the maximum policy TTL", {
            status: 422,
            code: "E_LITE_CASH_SETTINGS_TTL",
        });
    }
    if (comparable(currentValues) === comparable(next)) return { data: current, changed: false };
    const [row] = await currentTrx()
        .from("lite_cash_settings")
        .where("id", current.id)
        .update({ ...next, updated_by_user_id: userId, updated_at: new Date() })
        .returning("*");
    await createSnapshot("settings_change", reason, userId);
    return { data: row, changed: true };
}

function sanitizedSettings(row: Record<string, unknown>) {
    return settingsComparable(row);
}

function sanitizedPolicy(row: Record<string, unknown>) {
    return {
        policy_key: row.policy_key,
        ...policyInputFromRow(row),
    };
}

function sanitizedProfile(row: Record<string, unknown>) {
    return {
        profile_key: String(row.profile_key),
        name: String(row.name),
        mode: String(row.mode),
        status: String(row.status),
        css: objectValue(row.css),
        javascript: objectValue(row.javascript),
        images: objectValue(row.images),
        fonts: objectValue(row.fonts),
        navigation: objectValue(row.navigation),
        edge: objectValue(row.edge),
    };
}

export async function exportConfiguration() {
    const [settings, policies, profiles] = await Promise.all([settingsRow(), listPolicies(500), listProfiles(250)]);
    return {
        schema: "calibra.lite-cash.v1",
        exported_at: nowIso(),
        settings: sanitizedSettings(settings),
        policies: policies.map(sanitizedPolicy),
        profiles: profiles.map(sanitizedProfile),
    };
}

export async function createSnapshot(
    kind: "manual" | "profile_activation" | "settings_change" | "import",
    reason: string,
    userId: number,
) {
    const document = await exportConfiguration();
    const [row] = await currentTrx()
        .table("lite_cash_snapshots")
        .insert({
            tenant_id: tenantId(),
            snapshot_kind: kind,
            document,
            fingerprint_sha256: stableFingerprint(document),
            reason,
            actor_user_id: userId,
        })
        .returning("*");
    return row;
}

export async function listSnapshots(limit = 100) {
    return currentTrx().from("lite_cash_snapshots").orderBy("created_at", "desc").limit(clampLimit(limit, 250));
}

function importedSettings(document: JsonRecord, current: Record<string, unknown>) {
    const raw = objectValue(document.settings);
    return {
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : Boolean(current.enabled),
        default_ttl_seconds: Number(raw.default_ttl_seconds ?? current.default_ttl_seconds),
        default_grace_seconds: Number(raw.default_grace_seconds ?? current.default_grace_seconds),
        default_stale_if_error_seconds: Number(raw.default_stale_if_error_seconds ?? current.default_stale_if_error_seconds),
        max_policy_ttl_seconds: Number(raw.max_policy_ttl_seconds ?? current.max_policy_ttl_seconds),
        max_warm_concurrency: Number(raw.max_warm_concurrency ?? current.max_warm_concurrency),
        broad_purge_requires_step_up:
            typeof raw.broad_purge_requires_step_up === "boolean"
                ? raw.broad_purge_requires_step_up
                : Boolean(current.broad_purge_requires_step_up),
        debug_until: null,
        default_profile: String(raw.default_profile ?? current.default_profile),
        edge_provider: String(raw.edge_provider ?? current.edge_provider),
    };
}

export async function validateImport(document: JsonRecord) {
    const current = await settingsRow();
    const settings = importedSettings(document, current);
    const errors: Array<{ code: string; message: string }> = [];
    if (
        !Number.isInteger(settings.default_ttl_seconds) ||
        settings.default_ttl_seconds < 1 ||
        settings.default_ttl_seconds > 86400
    ) {
        errors.push({ code: "settings.default_ttl", message: "Imported default TTL is invalid." });
    }
    if (
        !Number.isInteger(settings.max_policy_ttl_seconds) ||
        settings.max_policy_ttl_seconds < settings.default_ttl_seconds ||
        settings.max_policy_ttl_seconds > 604800
    ) {
        errors.push({ code: "settings.max_ttl", message: "Imported max policy TTL is invalid." });
    }
    if (
        !Number.isInteger(settings.max_warm_concurrency) ||
        settings.max_warm_concurrency < 1 ||
        settings.max_warm_concurrency > 32
    ) {
        errors.push({ code: "settings.concurrency", message: "Imported warm concurrency is invalid." });
    }
    if (!["safe", "balanced", "aggressive", "custom"].includes(settings.default_profile)) {
        errors.push({ code: "settings.profile", message: "Imported default profile is invalid." });
    }
    if (!["none", "cloudflare", "quic", "custom"].includes(settings.edge_provider)) {
        errors.push({ code: "settings.edge", message: "Imported edge provider is invalid." });
    }
    const validation = validateLiteCashImport(document, { max_policy_ttl_seconds: settings.max_policy_ttl_seconds });
    return {
        valid: errors.length === 0 && validation.valid,
        errors: [...errors, ...validation.errors],
        warnings: validation.warnings,
        fingerprint: validation.fingerprint,
        normalized_settings: settings,
    };
}

export async function applyImport(document: JsonRecord, reason: string, userId: number) {
    const validation = await validateImport(document);
    if (!validation.valid) {
        throw new Exception("lite cash import validation failed", {
            status: 422,
            code: "E_LITE_CASH_IMPORT_INVALID",
            cause: validation.errors,
        });
    }
    await createSnapshot("import", `Before import: ${reason}`, userId);
    const currentSettings = await settingsRow();
    await currentTrx()
        .from("lite_cash_settings")
        .where("id", currentSettings.id)
        .update({ ...validation.normalized_settings, updated_by_user_id: userId, updated_at: new Date() });

    for (const raw of arrayValue(document.policies)) {
        const policy = raw as JsonRecord;
        const policyKey = String(policy.policy_key);
        const existing = await currentTrx().from("lite_cash_policies").where("policy_key", policyKey).first();
        const input: PolicyCreateInput = {
            policy_key: policyKey,
            name: String(policy.name),
            description: String(policy.description ?? ""),
            kind: String(policy.kind) as PolicyCreateInput["kind"],
            route_pattern: String(policy.route_pattern),
            status: String(policy.status) as PolicyCreateInput["status"],
            risk_tier: String(policy.risk_tier) as PolicyCreateInput["risk_tier"],
            ttl_seconds: Number(policy.ttl_seconds),
            grace_seconds: Number(policy.grace_seconds),
            stale_if_error_seconds: Number(policy.stale_if_error_seconds),
            soft_timeout_ms: Number(policy.soft_timeout_ms),
            hard_timeout_ms: Number(policy.hard_timeout_ms),
            tags: arrayValue(policy.tags).map(String),
            vary: arrayValue(policy.vary).map(String),
            conditions: objectValue(policy.conditions),
            reason,
        };
        if (existing) await updatePolicy(String(existing.public_id), input, userId);
        else await createPolicy(input, userId);
    }

    for (const raw of arrayValue(document.profiles)) {
        const profile = raw as JsonRecord;
        const profileKey = String(profile.profile_key);
        const existing = await currentTrx().from("lite_cash_optimization_profiles").where("profile_key", profileKey).first();
        const input: ProfileCreateInput = {
            profile_key: profileKey,
            name: String(profile.name),
            mode: String(profile.mode) as ProfileMode,
            status: "draft",
            css: objectValue(profile.css),
            javascript: objectValue(profile.javascript),
            images: objectValue(profile.images),
            fonts: objectValue(profile.fonts),
            navigation: objectValue(profile.navigation),
            edge: objectValue(profile.edge),
            reason,
        };
        if (existing) {
            await updateProfile(String(existing.public_id), input, userId);
        } else {
            await createProfile(input, userId);
        }
    }

    const activeProfile = arrayValue(document.profiles).find((raw) => objectValue(raw).status === "active");
    if (activeProfile) {
        const key = String(objectValue(activeProfile).profile_key);
        const row = await currentTrx().from("lite_cash_optimization_profiles").where("profile_key", key).first();
        if (row) await activateProfile(String(row.public_id), userId, `Import activation: ${reason}`);
    }

    return { validation, configuration: await exportConfiguration() };
}

export async function overview() {
    const [settings, policyRows, purgeRows, warmRows, profileRows, observations] = await Promise.all([
        settingsRow(),
        currentTrx().from("lite_cash_policies").select("kind", "status", "risk_tier"),
        currentTrx().from("lite_cash_purge_events").orderBy("created_at", "desc").limit(8),
        currentTrx().from("lite_cash_warm_jobs").orderBy("created_at", "desc").limit(8),
        currentTrx().from("lite_cash_optimization_profiles").orderBy("updated_at", "desc"),
        currentTrx()
            .from("lite_cash_observations")
            .select("metric_key", "value", "observed_at")
            .orderBy("observed_at", "desc")
            .limit(2000),
    ]);

    const counts = {
        policies: policyRows.length,
        enabled_policies: policyRows.filter((row) => row.status === "enabled").length,
        disabled_policies: policyRows.filter((row) => row.status === "disabled").length,
        high_risk_policies: policyRows.filter((row) => row.risk_tier === "high" || row.risk_tier === "critical").length,
        observations: observations.length,
    };
    const kinds = ["api", "page", "asset", "query"].map((kind) => ({
        kind,
        total: policyRows.filter((row) => row.kind === kind).length,
        enabled: policyRows.filter((row) => row.kind === kind && row.status === "enabled").length,
    }));
    const health = computeObservationSummary(observations);
    const latestEvidence = observations[0]?.observed_at ?? null;
    const activeProfile = profileRows.find((row) => row.status === "active") ?? null;
    const debugUntil = settings.debug_until ? new Date(String(settings.debug_until)) : null;

    return {
        counts,
        health,
        policy_health: kinds,
        settings,
        topology: await topology(),
        active_profile: activeProfile,
        recent_purges: purgeRows,
        recent_warm_jobs: warmRows,
        evidence: {
            latest_at: latestEvidence,
            fresh: latestEvidence ? Date.now() - new Date(String(latestEvidence)).getTime() < 15 * 60_000 : false,
        },
        risks: {
            disabled: !settings.enabled,
            debug_active: Boolean(debugUntil && debugUntil.getTime() > Date.now()),
            broad_purge_step_up_disabled: !settings.broad_purge_requires_step_up,
        },
    };
}
