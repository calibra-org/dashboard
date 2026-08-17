"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate, type MutationMethod } from "#/lib/queries/api-client";

export interface IdentityEnvelope<T = unknown> {
    data: T;
}

export function useIdentityResource<T>(path: string, enabled = true) {
    const locale = useLocale() as Locale;
    return useQuery<IdentityEnvelope<T>, Error, T>({
        queryKey: ["admin", "identity", path, { locale }],
        queryFn: () => apiGet<IdentityEnvelope<T>>(`identity/${path}`, { locale }),
        select: (payload) => payload.data,
        enabled,
        staleTime: 10_000,
    });
}

export function useIdentityMutation<TInput extends { path: string; body?: unknown }, TOutput = unknown>(method: MutationMethod) {
    const locale = useLocale() as Locale;
    const queryClient = useQueryClient();
    return useMutation<IdentityEnvelope<TOutput>, Error, TInput>({
        mutationFn: (input) =>
            apiMutate<IdentityEnvelope<TOutput>>(method, `identity/${input.path}`, { locale, body: input.body }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "identity"] }),
    });
}
