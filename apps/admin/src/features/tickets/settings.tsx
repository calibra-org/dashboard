"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Combobox } from "#/components/ui/combobox";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { ArrowStart, Clock3, Save, SlidersHorizontal } from "#/icons";
import { Link } from "#/lib/i18n/navigation";
import { apiGet } from "#/lib/queries/api-client";

import { ticketCopy } from "./copy";
import { useTicketSettings, useUpdateTicketSettings } from "./queries";
import type { TicketPriority, TicketResource } from "./types";

interface Envelope<T> {
    data: T;
}

export function TicketSettingsPage() {
    const locale = useLocale() as Locale;
    const { text: t, priorities } = ticketCopy(locale);
    const settings = useTicketSettings();
    const update = useUpdateTicketSettings();
    const [priority, setPriority] = useState<TicketPriority>("normal");
    const [assigneeId, setAssigneeId] = useState<number | null>(null);

    useEffect(() => {
        if (!settings.data) return;
        setPriority(settings.data.default_priority);
        setAssigneeId(settings.data.default_assignee_user_id);
    }, [settings.data]);

    const searchAssignees = useCallback(
        async (query: string) => {
            const response = await apiGet<Envelope<TicketResource[]>>("tickets/resources", {
                locale,
                query: { kind: "assignees", q: query || undefined, limit: 50 },
            });
            return response.data.map((item) => ({
                id: item.id,
                label: item.label,
                sublabel: item.email ?? undefined,
            }));
        },
        [locale],
    );

    const resolveAssignee = useCallback(
        async (ids: [number | string]) => {
            const response = await apiGet<Envelope<TicketResource[]>>("tickets/resources", {
                locale,
                query: { kind: "assignees", limit: 50 },
            });
            const wanted = new Set(ids.map(String));
            return response.data
                .filter((item) => wanted.has(String(item.id)))
                .map((item) => ({ id: item.id, label: item.label, sublabel: item.email ?? undefined }));
        },
        [locale],
    );

    if (settings.isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-16" />
                <Skeleton className="h-80" />
            </div>
        );
    }
    if (!settings.data) {
        return (
            <Card>
                <CardContent className="grid min-h-64 place-items-center">
                    <Button variant="outline" onClick={() => void settings.refetch()}>
                        {t.retry}
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const formKey = [settings.data.reference_prefix, settings.data.first_response_minutes, settings.data.resolution_minutes].join(
        ":",
    );

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await update.mutateAsync({
            reference_prefix: String(form.get("reference_prefix") ?? "TKT").trim(),
            first_response_minutes: Number(form.get("first_response_minutes")),
            resolution_minutes: Number(form.get("resolution_minutes")),
            default_priority: priority,
            default_assignee_user_id: assigneeId,
        });
    }

    return (
        <div className="flex max-w-4xl flex-col gap-5">
            <div>
                <Link
                    href={"/tickets" as never}
                    className="mb-2 inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
                >
                    <ArrowStart className="size-3.5" aria-hidden="true" />
                    {t.back}
                </Link>
                <h1 className="flex items-center gap-2 font-semibold text-2xl tracking-tight">
                    <SlidersHorizontal className="size-5" aria-hidden="true" />
                    {t.settingsTitle}
                </h1>
                <p className="mt-1 text-muted-foreground text-sm">{t.settingsSubtitle}</p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Clock3 className="size-4" aria-hidden="true" />
                        {t.responsePolicy}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form key={formKey} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-1.5 text-sm">
                            <span className="font-medium text-xs">{t.referencePrefix}</span>
                            <Input
                                name="reference_prefix"
                                defaultValue={settings.data.reference_prefix}
                                required
                                maxLength={12}
                                pattern="[A-Za-z0-9-]+"
                                dir="ltr"
                            />
                        </label>
                        <label className="space-y-1.5 text-sm">
                            <span className="font-medium text-xs">{t.defaultPriority}</span>
                            <Select value={priority} onValueChange={(value) => setPriority(value as TicketPriority)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(priorities).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </label>
                        <label className="space-y-1.5 text-sm">
                            <span className="font-medium text-xs">{t.firstResponseMinutes}</span>
                            <Input
                                name="first_response_minutes"
                                type="number"
                                min={1}
                                max={10_080}
                                defaultValue={settings.data.first_response_minutes}
                                required
                            />
                        </label>
                        <label className="space-y-1.5 text-sm">
                            <span className="font-medium text-xs">{t.resolutionMinutes}</span>
                            <Input
                                name="resolution_minutes"
                                type="number"
                                min={1}
                                max={43_200}
                                defaultValue={settings.data.resolution_minutes}
                                required
                            />
                        </label>
                        <div className="space-y-1.5 text-sm sm:col-span-2">
                            <span className="font-medium text-xs">{t.defaultAssignee}</span>
                            <div className="flex flex-wrap items-center gap-2">
                                <Combobox
                                    value={assigneeId}
                                    onValueChange={(value) => setAssigneeId(value === null ? null : Number(value))}
                                    onSearch={searchAssignees}
                                    onResolve={resolveAssignee}
                                    preload
                                    labels={{
                                        placeholder: t.noDefaultAssignee,
                                        search: t.searchAdmin,
                                        empty: t.noAdmin,
                                    }}
                                />
                                {assigneeId !== null ? (
                                    <Button type="button" variant="ghost" size="sm" onClick={() => setAssigneeId(null)}>
                                        {t.clearDefaultAssignee}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                        <div className="flex items-end justify-end sm:col-span-2">
                            <Button type="submit" disabled={update.isPending}>
                                <Save className="size-4" aria-hidden="true" />
                                {update.isPending ? t.saving : t.saveSettings}
                            </Button>
                        </div>
                        {update.isSuccess ? <p className="text-success text-xs sm:col-span-2">{t.settingsSaved}</p> : null}
                        {update.isError ? <p className="text-danger text-xs sm:col-span-2">{t.settingsFailed}</p> : null}
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
