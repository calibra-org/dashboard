"use client";

import type { AdminSchemas } from "@calibra/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

export type ConfigurationCapability = AdminSchemas["schemas"]["ConfigurationCapability"];
export type ConfigurationRevision = AdminSchemas["schemas"]["ConfigurationRevision"];
export type ConfigurationScope = AdminSchemas["schemas"]["ConfigurationScope"];

const REGISTRY_KEY = (locale: string) => ["admin", "settings", "configuration", "registry", { locale }] as const;
const HISTORY_KEY = (locale: string) => ["admin", "settings", "configuration", "history", { locale }] as const;

export function useConfigurationRegistry() {
    const locale = useLocale();
    return useQuery({
        queryKey: REGISTRY_KEY(locale),
        queryFn: ({ signal }) =>
            apiGet<{ data: ConfigurationCapability[] }>("settings/configuration/registry", { locale, signal }),
        select: (response) => response.data,
        staleTime: 5 * 60 * 1000,
    });
}

export function useConfigurationHistory(limit = 8) {
    const locale = useLocale();
    return useQuery({
        queryKey: [...HISTORY_KEY(locale), limit],
        queryFn: ({ signal }) =>
            apiGet<{ data: ConfigurationRevision[] }>("settings/configuration/history", {
                locale,
                signal,
                query: { limit },
            }),
        select: (response) => response.data,
        staleTime: 30 * 1000,
    });
}

export function useRollbackConfigurationRevision() {
    const locale = useLocale();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ scope, revision }: { scope: ConfigurationScope; revision: number }) =>
            apiMutate<{ data: ConfigurationRevision; meta: { changed: boolean } }>(
                "POST",
                `settings/configuration/history/${scope}/${revision}/rollback`,
                { locale },
            ),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
        },
    });
}
