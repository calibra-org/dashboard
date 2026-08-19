"use client";
import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { apiGet, apiMutate, type MutationMethod } from "#/lib/queries/api-client";

export function useAgenticGatewayResource<T>(path: string, enabled = true) {
    const locale = useLocale() as Locale;
    return useQuery<{ data: T }, Error, T>({ queryKey: ["admin", "agentic-commerce", path, { locale }], queryFn: () => apiGet<{ data: T }>(`agentic-commerce/${path}`, { locale }), select: (payload) => payload.data, enabled, staleTime: 8_000 });
}
export function useAgenticGatewayMutation<TInput extends { path: string; body?: unknown }, TOutput = unknown>(method: MutationMethod) {
    const locale = useLocale() as Locale;
    const client = useQueryClient();
    return useMutation<{ data: TOutput }, Error, TInput>({ mutationFn: (input) => apiMutate<{ data: TOutput }>(method, `agentic-commerce/${input.path}`, { locale, body: input.body }), onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "agentic-commerce"] }) });
}
