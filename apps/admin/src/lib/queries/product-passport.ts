"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate, type MutationMethod } from "#/lib/queries/api-client";

const base = "product-passports";

export type PassportStatus = "draft" | "published" | "revoked";
export type PassportIdentityLevel = "product" | "model" | "batch" | "item";

export type ProductPassport = {
    id: number;
    public_id: string;
    product_id: number;
    variation_id: number | null;
    identity_level: PassportIdentityLevel;
    batch_code: string | null;
    serial_number: string | null;
    resolver_key: string;
    status: PassportStatus;
    current_version: number;
    identifiers: Record<string, unknown> | string;
    public_fields: Record<string, unknown> | string;
    private_fields: Record<string, unknown> | string;
    resolver_config: Record<string, unknown> | string;
    published_at: string | null;
    revoked_at: string | null;
    created_at: string;
    updated_at: string;
};

export type PassportVersion = {
    id: number;
    public_id: string;
    version: number;
    schema_version: string;
    public_snapshot: Record<string, unknown> | string;
    content_hash: string;
    published_at: string;
};

export type PassportEvidence = {
    id: number;
    public_id: string;
    evidence_type: string;
    visibility: "public" | "private";
    verification_status: "unverified" | "verified" | "rejected" | "expired";
    source_kind: string;
    source_ref: string | null;
    issuer: string | null;
    summary: string | null;
    payload: Record<string, unknown> | string;
    content_hash: string;
    occurred_at: string | null;
    verified_at: string | null;
    created_at: string;
};

export type PassportEdge = {
    id: number;
    public_id: string;
    from_node_type: string;
    from_node_ref: string;
    relation_type: string;
    to_node_type: string;
    to_node_ref: string;
    visibility: "public" | "private";
    metadata: Record<string, unknown> | string;
    created_at: string;
};

export type RegulatoryMapping = {
    id: number;
    public_id: string;
    jurisdiction: string;
    framework: string;
    framework_version: string;
    mapping_version: number;
    status: "draft" | "active" | "retired";
    field_mapping: Record<string, unknown> | string;
    conformance_note: string;
    effective_from: string | null;
    effective_to: string | null;
    updated_at: string;
};

export type ProductPassportOverview = {
    engine_version: string;
    kpis: {
        passports: number;
        published: number;
        revoked: number;
        evidence: number;
        verified_evidence: number;
        active_regulatory_mappings: number;
    };
    standards_posture: string;
};

export type ProductPassportDetail = {
    passport: ProductPassport;
    product: Record<string, unknown> | null;
    variation: Record<string, unknown> | null;
    versions: PassportVersion[];
    evidence: PassportEvidence[];
    edges: PassportEdge[];
    quality_cases: Array<Record<string, unknown>>;
};

export type ProductPassportAccessRow = {
    id: number;
    identity: string;
    permissions: Record<string, boolean>;
};

export type ProductPassportVariation = {
    id: number;
    sku?: string | null;
    gtin?: string | null;
    attributes?: Array<{ name?: string; value?: string }> | Record<string, unknown> | null;
};

export function useProductPassportResource<T>(path: string, enabled = true) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: T }, Error, T>({
        queryKey: ["admin", "product-passport", path, { locale }],
        queryFn: () => apiGet<{ data: T }>(`${base}/${path}`, { locale }),
        select: (payload) => payload.data,
        enabled,
        staleTime: 5_000,
    });
}

export function useProductPassportMutation<T = unknown, B = Record<string, unknown>>(method: MutationMethod = "POST") {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<T, Error, { path: string; body: B }>({
        mutationFn: async ({ path, body }) => (await apiMutate<{ data: T }>(method, `${base}/${path}`, { locale, body })).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "product-passport"] }),
    });
}

export function useProductPassportVariations(productId: number | null) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: ProductPassportVariation[] }, Error, ProductPassportVariation[]>({
        queryKey: ["admin", "product-passport", "variations", productId, { locale }],
        queryFn: () => apiGet<{ data: ProductPassportVariation[] }>(`products/${productId}/variations`, { locale }),
        select: (payload) => payload.data ?? [],
        enabled: productId !== null,
        staleTime: 10_000,
    });
}
