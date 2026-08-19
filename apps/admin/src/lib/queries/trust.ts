"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate, type MutationMethod } from "#/lib/queries/api-client";

export interface TrustEnvelope<T = unknown> {
    data: T;
    meta?: Record<string, unknown>;
}

export function useTrustResource<T>(path: string, enabled = true) {
    const locale = useLocale() as Locale;
    return useQuery<TrustEnvelope<T>, Error, T>({
        queryKey: ["admin", "trust", path, { locale }],
        queryFn: () => apiGet<TrustEnvelope<T>>(`trust/${path}`, { locale }),
        select: (payload) => payload.data,
        enabled,
        staleTime: 8_000,
    });
}

export function useTrustPage<T>(path: string, enabled = true) {
    const locale = useLocale() as Locale;
    return useQuery<TrustEnvelope<T>, Error>({
        queryKey: ["admin", "trust", path, { locale }],
        queryFn: () => apiGet<TrustEnvelope<T>>(`trust/${path}`, { locale }),
        enabled,
        staleTime: 8_000,
    });
}

export function useTrustMutation<TInput extends { path: string; body?: unknown }, TOutput = unknown>(method: MutationMethod) {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<TrustEnvelope<TOutput>, Error, TInput>({
        mutationFn: (input) => apiMutate<TrustEnvelope<TOutput>>(method, `trust/${input.path}`, { locale, body: input.body }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "trust"] }),
    });
}
