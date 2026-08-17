"use client";

import type { AdminSchemas } from "@calibra/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

export type ConfigurationCapability = AdminSchemas["schemas"]["ConfigurationCapability"];
export type ConfigurationRevision = AdminSchemas["schemas"]["ConfigurationRevision"];
export type ConfigurationScope = AdminSchemas["schemas"]["ConfigurationScope"];
export type ConfigurationGroup = AdminSchemas["schemas"]["ConfigurationGroup"];
export type ConfigurationGroupDetail = AdminSchemas["schemas"]["ConfigurationGroupDetail"];
export type ConfigurationChangeInput = AdminSchemas["schemas"]["ConfigurationChangeInput"];
export type ConfigurationPreview = AdminSchemas["schemas"]["ConfigurationPreview"];

const REGISTRY_KEY = (locale: string) => ["admin", "settings", "configuration", "registry", { locale }] as const;
const HISTORY_KEY = (locale: string) => ["admin", "settings", "configuration", "history", { locale }] as const;
const GROUP_KEY = (locale: string, group: string) => ["admin", "settings", "configuration", "group", group, { locale }] as const;

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

export function useConfigurationHistory(limit = 8, scope?: ConfigurationScope) {
    const locale = useLocale();
    return useQuery({
        queryKey: [...HISTORY_KEY(locale), limit, scope],
        queryFn: ({ signal }) =>
            apiGet<{ data: ConfigurationRevision[] }>("settings/configuration/history", {
                locale,
                signal,
                query: { limit, ...(scope ? { scope } : {}) },
            }),
        select: (response) => response.data,
        staleTime: 30 * 1000,
    });
}

export function useConfigurationGroup(group: ConfigurationGroup) {
    const locale = useLocale();
    return useQuery({
        queryKey: GROUP_KEY(locale, group),
        queryFn: ({ signal }) =>
            apiGet<{ data: ConfigurationGroupDetail }>(`settings/configuration/groups/${group}`, { locale, signal }),
        select: (response) => response.data,
        staleTime: 30 * 1000,
    });
}

export function usePreviewConfiguration(group: ConfigurationGroup) {
    const locale = useLocale();
    return useMutation({
        mutationFn: (change: ConfigurationChangeInput) =>
            apiMutate<{ data: ConfigurationPreview }>("POST", `settings/configuration/groups/${group}/preview`, {
                locale,
                body: change,
            }),
    });
}

export function useTestConfiguration(group: ConfigurationGroup) {
    const locale = useLocale();
    return useMutation({
        mutationFn: (change: ConfigurationChangeInput) =>
            apiMutate<{ data: { passed: boolean; mode: string; external_checks: unknown[]; preview: ConfigurationPreview } }>(
                "POST",
                `settings/configuration/groups/${group}/test`,
                { locale, body: change },
            ),
    });
}

export function useUpdateConfiguration(group: ConfigurationGroup) {
    const locale = useLocale();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (change: ConfigurationChangeInput) =>
            apiMutate<{ data: ConfigurationGroupDetail; meta: { revision: number; version: number } }>(
                "PUT",
                `settings/configuration/groups/${group}`,
                { locale, body: change },
            ),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: GROUP_KEY(locale, group) }),
                queryClient.invalidateQueries({ queryKey: ["admin", "settings", "configuration", "history"] }),
            ]);
        },
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
