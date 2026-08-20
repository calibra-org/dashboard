"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { apiGet, apiMutate } from "#/lib/queries/api-client";

export interface SocialContent {
    id: number;
    kind: string;
    status: string;
    title: string;
    description?: string | null;
    moderation_state: string;
    version: number;
    primary_media_id?: number | null;
    product_markers?: Array<{ id: number }>;
}
export interface SocialThread {
    id: number;
    kind: string;
    subject: string;
    status: string;
    converted_ticket_id?: number | null;
}
export interface SocialModerationCase {
    id: number;
    target_type: string;
    target_id: number;
    category: string;
    status: string;
    version: number;
}
export interface SocialMediaInspection {
    media_id: number;
    asset: Record<string, unknown>;
    tracks: Array<{ id: number; kind: string; status: string; text_content?: string | null }>;
    rights: Array<{ id: number; rights_basis: string; consent_confirmed: boolean }>;
    variants: unknown[];
    security_scans?: unknown[];
}
export interface SocialUploadIntent {
    media_id: number;
    asset_id: number;
    provider: string;
    provider_ref: string;
    upload_url: string;
    upload_protocol: "basic" | "tus";
    expires_at: string;
    max_duration_seconds: number;
    max_size_bytes: number;
}
const root = ["admin", "social-commerce"] as const;
const invalidate = (c: ReturnType<typeof useQueryClient>) => c.invalidateQueries({ queryKey: root });
export function useSocialSummary() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...root, "summary", locale],
        queryFn: ({ signal }) => apiGet<{ data: Record<string, unknown> }>("social/summary", { locale, signal }),
        select: (r) => r.data,
    });
}
export function useSocialContents() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...root, "contents", locale],
        queryFn: ({ signal }) => apiGet<{ data: SocialContent[] }>("social/contents", { locale, signal, query: { limit: 100 } }),
    });
}
export function useCreateSocialContent() {
    const locale = useLocale(),
        c = useQueryClient();
    return useMutation({
        mutationFn: (body: { kind: "story" | "video" | "live" | "post" | "question"; title: string; description?: string }) =>
            apiMutate<{ data: SocialContent }>("POST", "social/contents", { locale, body }),
        onSuccess: () => invalidate(c),
    });
}
export function useTransitionSocialContent() {
    const locale = useLocale(),
        c = useQueryClient();
    return useMutation({
        mutationFn: (x: { id: number; expected_version: number; status: string }) =>
            apiMutate<{ data: SocialContent }>("POST", `social/contents/${x.id}/transition`, {
                locale,
                body: { expected_version: x.expected_version, status: x.status },
            }),
        onSuccess: () => invalidate(c),
    });
}
export function useUpdateSocialContent() {
    const locale = useLocale(),
        c = useQueryClient();
    return useMutation({
        mutationFn: (x: { id: number; expected_version: number; patch: Record<string, unknown> }) =>
            apiMutate<{ data: SocialContent }>("PATCH", `social/contents/${x.id}`, {
                locale,
                body: { expected_version: x.expected_version, ...x.patch },
            }),
        onSuccess: () => invalidate(c),
    });
}
export function useSocialThreads() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...root, "threads", locale],
        queryFn: ({ signal }) => apiGet<{ data: SocialThread[] }>("social/threads", { locale, signal, query: { limit: 100 } }),
    });
}
export function useConvertSocialThreadToTicket() {
    const locale = useLocale(),
        c = useQueryClient();
    return useMutation({
        mutationFn: (id: number) =>
            apiMutate<{ data: { ticket_id: number; changed: boolean } }>("POST", `social/threads/${id}/convert-to-ticket`, {
                locale,
            }),
        onSuccess: () => invalidate(c),
    });
}
export function useSocialModeration() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...root, "moderation", locale],
        queryFn: ({ signal }) =>
            apiGet<{ data: SocialModerationCase[] }>("social/moderation", { locale, signal, query: { limit: 100 } }),
    });
}
export function useModerateSocialCase() {
    const locale = useLocale(),
        c = useQueryClient();
    return useMutation({
        mutationFn: (x: { id: number; expected_version: number; action: "limit" | "remove" | "restore" | "finalize" }) =>
            apiMutate("POST", `social/moderation/${x.id}/actions`, {
                locale,
                body: { expected_version: x.expected_version, action: x.action },
            }),
        onSuccess: () => invalidate(c),
    });
}
export function useSocialAnalytics() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...root, "analytics", locale],
        queryFn: ({ signal }) => apiGet<{ data: Record<string, unknown> }>("social/analytics", { locale, signal }),
        select: (r) => r.data,
    });
}
export function useSocialContract() {
    const locale = useLocale();
    return useQuery({
        queryKey: [...root, "contract", locale],
        queryFn: ({ signal }) => apiGet<{ data: Record<string, unknown> }>("social/contract", { locale, signal }),
        select: (r) => r.data,
    });
}
export function useSocialMedia(id?: number | null) {
    const locale = useLocale();
    return useQuery({
        queryKey: [...root, "media", id, locale],
        enabled: Boolean(id),
        queryFn: ({ signal }) => apiGet<{ data: SocialMediaInspection }>(`social/media/${id}`, { locale, signal }),
        select: (r) => r.data,
    });
}
export function useCreateSocialMediaUploadIntent() {
    const locale = useLocale(),
        c = useQueryClient();
    return useMutation({
        mutationFn: (body: {
            filename: string;
            mime: string;
            size_bytes: number;
            purpose: "story" | "video" | "live_replay" | "review" | "message";
            access_policy?: "public" | "signed" | "members" | "private";
        }) => apiMutate<{ data: SocialUploadIntent }>("POST", "social/media/upload-intents", { locale, body }),
        onSuccess: () => invalidate(c),
    });
}
export function useAcknowledgeSocialMedia() {
    const locale = useLocale(),
        c = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => apiMutate("POST", `social/media/${id}/acknowledge`, { locale }),
        onSuccess: () => invalidate(c),
    });
}
export function useAddSocialMediaTrack() {
    const locale = useLocale(),
        c = useQueryClient();
    return useMutation({
        mutationFn: (x: {
            mediaId: number;
            kind: "caption" | "transcript" | "chapter" | "audio_description";
            text_content: string;
            trackLocale?: string;
        }) =>
            apiMutate("POST", `social/media/${x.mediaId}/tracks`, {
                locale,
                body: { kind: x.kind, text_content: x.text_content, locale: x.trackLocale },
            }),
        onSuccess: () => invalidate(c),
    });
}
export function useReviewSocialMediaTrack() {
    const locale = useLocale(),
        c = useQueryClient();
    return useMutation({
        mutationFn: (x: { trackId: number; decision: "approved" | "rejected" }) =>
            apiMutate("POST", `social/media/tracks/${x.trackId}/review`, { locale, body: { decision: x.decision } }),
        onSuccess: () => invalidate(c),
    });
}
export function useRecordSocialMediaRights() {
    const locale = useLocale(),
        c = useQueryClient();
    return useMutation({
        mutationFn: (x: { mediaId: number; rights_basis: string; holder_ref?: string; consent_confirmed: boolean }) =>
            apiMutate("POST", `social/media/${x.mediaId}/rights`, {
                locale,
                body: { rights_basis: x.rights_basis, holder_ref: x.holder_ref ?? null, consent_confirmed: x.consent_confirmed },
            }),
        onSuccess: () => invalidate(c),
    });
}
export function useMarkSocialMediaPublishable() {
    const locale = useLocale(),
        c = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => apiMutate("POST", `social/media/${id}/publishable`, { locale }),
        onSuccess: () => invalidate(c),
    });
}
