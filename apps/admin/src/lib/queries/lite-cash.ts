"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate, type MutationMethod } from "#/lib/queries/api-client";

const base = "lite-cash";

export type LiteCashSettings = {
    id: number;
    enabled: boolean;
    default_ttl_seconds: number;
    default_grace_seconds: number;
    default_stale_if_error_seconds: number;
    max_policy_ttl_seconds: number;
    max_warm_concurrency: number;
    broad_purge_requires_step_up: boolean;
    debug_until: string | null;
    default_profile: "safe" | "balanced" | "aggressive" | "custom";
    edge_provider: "none" | "cloudflare" | "quic" | "custom";
    updated_at: string;
};

export type LiteCashTopology = {
    driver: "memory" | "redis" | string;
    l1_enabled: boolean;
    l2_enabled: boolean;
    bus_enabled: boolean;
    tenant_namespace: string;
    runtime_defaults: {
        ttl_seconds: number;
        grace_seconds: number;
        soft_timeout_ms: number;
        hard_timeout_ms: number;
    };
    registered_purge_scopes: number;
    last_observation_at: string | null;
    secrets_exposed: boolean;
};

export type LiteCashPolicyValidation = {
    valid: boolean;
    publishable: boolean;
    errors: Array<{ code: string; message: string }>;
    warnings: Array<{ code: string; message: string }>;
    fingerprint: string;
};

export type LiteCashPolicy = {
    id: number;
    public_id: string;
    policy_key: string;
    name: string;
    description: string;
    kind: "api" | "page" | "asset" | "query";
    route_pattern: string;
    status: "enabled" | "disabled" | "archived";
    risk_tier: "low" | "medium" | "high" | "critical";
    ttl_seconds: number;
    grace_seconds: number;
    stale_if_error_seconds: number;
    soft_timeout_ms: number;
    hard_timeout_ms: number;
    tags: string[];
    vary: string[];
    conditions: Record<string, unknown>;
    version: number;
    validation: LiteCashPolicyValidation | Record<string, never>;
    updated_at: string;
};

export type LiteCashPurgeEvent = {
    id: number;
    public_id: string;
    scope: string;
    target: string | null;
    mode: "dry_run" | "execute";
    status: "planned" | "succeeded" | "failed" | "rejected";
    resolved_tags: string[];
    blast_radius: "narrow" | "medium" | "broad";
    idempotency_key: string;
    reason: string;
    evidence: Record<string, unknown>;
    completed_at: string | null;
    created_at: string;
};

export type LiteCashWarmJob = {
    id: number;
    public_id: string;
    scope: string;
    target_key: string;
    strategy: "cold_fill" | "refresh" | "verify";
    status: "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
    priority: "low" | "normal" | "high";
    concurrency: number;
    plan: Record<string, unknown>;
    plan_sha256: string;
    discovered_count: number;
    processed_count: number;
    success_count: number;
    failure_count: number;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
};

export type LiteCashProfile = {
    id: number;
    public_id: string;
    profile_key: string;
    name: string;
    mode: "safe" | "balanced" | "aggressive" | "custom";
    status: "draft" | "active" | "archived";
    css: Record<string, unknown>;
    javascript: Record<string, unknown>;
    images: Record<string, unknown>;
    fonts: Record<string, unknown>;
    navigation: Record<string, unknown>;
    edge: Record<string, unknown>;
    version: number;
    fingerprint_sha256: string;
    updated_at: string;
};

export type LiteCashObservation = {
    id: number;
    source: "api" | "redis" | "edge" | "storefront" | "synthetic" | "worker";
    metric_key: string;
    value: string | number | null;
    unit: string;
    outcome: string | null;
    labels: Record<string, unknown>;
    request_id: string | null;
    observed_at: string;
};

export type LiteCashSnapshot = {
    id: number;
    public_id: string;
    snapshot_kind: "manual" | "profile_activation" | "settings_change" | "import";
    fingerprint_sha256: string;
    reason: string;
    created_at: string;
};

export type LiteCashPurgeScope = {
    scope: string;
    target_required: boolean;
    broad: boolean;
};

export type LiteCashOverview = {
    counts: {
        policies: number;
        enabled_policies: number;
        disabled_policies: number;
        high_risk_policies: number;
        observations: number;
    };
    health: {
        samples: number;
        hit_rate: number | null;
        miss_rate: number | null;
        stale_rate: number | null;
        p95_origin_latency_ms: number | null;
        p95_cache_latency_ms: number | null;
    };
    policy_health: Array<{ kind: string; total: number; enabled: number }>;
    settings: LiteCashSettings;
    topology: LiteCashTopology;
    active_profile: LiteCashProfile | null;
    recent_purges: LiteCashPurgeEvent[];
    recent_warm_jobs: LiteCashWarmJob[];
    evidence: { latest_at: string | null; fresh: boolean };
    risks: {
        disabled: boolean;
        debug_active: boolean;
        broad_purge_step_up_disabled: boolean;
    };
};

export function useLiteCashResource<T>(path: string, query?: Record<string, string | number | boolean | undefined>) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: T }, Error, T>({
        queryKey: ["admin", "lite-cash", path, query ?? {}, { locale }],
        queryFn: () => apiGet<{ data: T }>(`${base}${path ? `/${path}` : ""}`, { locale, query }),
        select: (payload) => payload.data,
        staleTime: 5_000,
    });
}

export function useLiteCashMutation<T = unknown, B = Record<string, unknown>>(method: MutationMethod = "POST") {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<T, Error, { path: string; body: B; idempotencyKey?: string }>({
        mutationFn: async ({ path, body, idempotencyKey }) =>
            (await apiMutate<{ data: T }>(method, `${base}${path ? `/${path}` : ""}`, { locale, body, idempotencyKey })).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "lite-cash"] }),
    });
}
