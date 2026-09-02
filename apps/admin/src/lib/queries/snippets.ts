"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate, type MutationMethod } from "#/lib/queries/api-client";

const base = "snippets";

export type SnippetValidation = {
    valid: boolean;
    publishable: boolean;
    checksum: string;
    errors: Array<{ code: string; message: string }>;
    warnings: Array<{ code: string; message: string }>;
    boundary: string;
    validated_at: string;
};

export type Snippet = {
    id: number;
    public_id: string;
    snippet_key: string;
    name: string;
    description: string;
    language: "typescript" | "javascript" | "css" | "html" | "json";
    runtime: "storefront" | "admin" | "server" | "worker" | "build";
    placement: string;
    status: "draft" | "published" | "paused" | "quarantined" | "archived";
    risk_level: "low" | "medium" | "high" | "critical";
    source: string;
    conditions: Record<string, unknown>;
    capabilities: string[];
    active_revision_id: number | null;
    version: number;
    last_validation: SnippetValidation | Record<string, never>;
    consecutive_failures: number;
    has_unpublished_changes: boolean;
    created_at: string;
    updated_at: string;
};

export type SnippetSettings = {
    id: number;
    safe_mode: boolean;
    production_publish_requires_step_up: boolean;
    auto_quarantine_threshold: number;
    default_environment: "preview" | "staging" | "production";
    max_rollout_percent: number;
    updated_at: string;
};

export type SnippetsOverview = {
    counts: {
        total: number;
        published: number;
        drafts: number;
        paused: number;
        quarantined: number;
        high_risk: number;
    };
    health: { samples_30d: number; success_rate: number | null; p95_duration_ms: number | null };
    runtimes: Record<string, number>;
    settings: SnippetSettings;
    recent_deployments: SnippetDeployment[];
    recent_failures: SnippetExecution[];
    boundary: string;
};

export type SnippetRevision = {
    id: number;
    snippet_id: number;
    revision: number;
    source: string;
    conditions: Record<string, unknown>;
    capabilities: string[];
    source_sha256: string;
    validation: SnippetValidation;
    reason: string;
    created_at: string;
};

export type SnippetDeployment = {
    id: number;
    public_id: string;
    snippet_public_id?: string;
    snippet_name?: string;
    environment: string;
    action: string;
    status: string;
    rollout_percent: number;
    metadata?: Record<string, unknown>;
    created_at: string;
};

export type SnippetExecution = {
    id: number;
    snippet_public_id: string;
    snippet_name: string;
    consumer_key: string;
    outcome: string;
    duration_ms: number | null;
    request_id?: string | null;
    evidence?: Record<string, unknown>;
    observed_at: string;
};

export type SnippetTemplate = {
    key: string;
    title: string;
    language: Snippet["language"];
    runtime: Snippet["runtime"];
    placement: string;
    risk_level: Snippet["risk_level"];
    source: string;
    conditions: Record<string, unknown>;
    capabilities: string[];
};

export function useSnippetsResource<T>(path: string, query?: Record<string, string | number | boolean | undefined>) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: T }, Error, T>({
        queryKey: ["admin", "snippets", path, query ?? {}, { locale }],
        queryFn: () => apiGet<{ data: T }>(`${base}${path ? `/${path}` : ""}`, { locale, query }),
        select: (payload) => payload.data,
        staleTime: 5_000,
    });
}

export function useSnippetsMutation<T = unknown, B = Record<string, unknown>>(method: MutationMethod = "POST") {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<T, Error, { path: string; body: B }>({
        mutationFn: async ({ path, body }) =>
            (await apiMutate<{ data: T }>(method, `${base}${path ? `/${path}` : ""}`, { locale, body })).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "snippets"] }),
    });
}
