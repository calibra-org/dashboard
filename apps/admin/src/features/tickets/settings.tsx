"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Combobox } from "#/components/ui/combobox";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { Bot, Braces, Clock3, Network, Plus, Radio, Save, ShieldCheck, SlidersHorizontal, Sparkles, Users } from "#/icons";
import { Link } from "#/lib/i18n/navigation";
import { apiGet } from "#/lib/queries/api-client";

import { ticketCopy } from "./copy";
import {
    useAgentPresence,
    useCreateSupportAutomationRule,
    useCreateSupportRoutingRule,
    useCreateTicketWorkflowStatus,
    useHeartbeat,
    useSupportAutomationRules,
    useSupportChannels,
    useSupportRoutingRules,
    useTicketSettings,
    useTicketWorkflowStatuses,
    useUpdateSupportAutomationRule,
    useUpdateSupportRoutingRule,
    useUpdateTicketSettings,
} from "./queries";
import {
    automationTriggerLabel,
    channelStatusTone,
    EmptySupportState,
    LoadingGrid,
    presenceStateLabel,
    SupportError,
    SupportMetric,
    SupportPageHeader,
    supportChannelLabel,
    supportChannelStatusLabel,
    workflowSemanticLabel,
} from "./ui";
import type {
    AgentPresenceState,
    SupportAutomationRule,
    SupportAutomationTrigger,
    SupportRoutingRule,
    TicketPriority,
    TicketResource,
} from "./types";

interface Envelope<T> {
    data: T;
}

function parseObject(value: FormDataEntryValue | null, fallback: Record<string, unknown> = {}): Record<string, unknown> {
    const text = String(value ?? "").trim();
    if (!text) return fallback;
    const parsed: unknown = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Expected a JSON object");
    return parsed as Record<string, unknown>;
}

function parseActionArray(value: FormDataEntryValue | null): Array<Record<string, unknown>> {
    const text = String(value ?? "").trim();
    if (!text) return [];
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.some((item) => !item || Array.isArray(item) || typeof item !== "object")) {
        throw new Error("Expected a JSON array of objects");
    }
    return parsed as Array<Record<string, unknown>>;
}

function RoutingRuleRow({ rule, locale }: { rule: SupportRoutingRule; locale: Locale }) {
    const update = useUpdateSupportRoutingRule(rule.id);
    return (
        <div className="rounded-xl border p-3 transition-colors hover:bg-muted/15">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="truncate font-medium text-sm">{rule.name}</div>
                    <div className="mt-1 text-[0.7rem] text-muted-foreground">
                        {locale === "en" ? "Execution priority" : "اولویت اجرا"}: {rule.priority.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")} · {locale === "en" ? "version" : "نسخه"} {rule.version.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}
                    </div>
                </div>
                <Switch checked={rule.enabled} disabled={update.isPending} onCheckedChange={(enabled) => update.mutate({ enabled, expected_version: rule.version })} aria-label={locale === "en" ? `Toggle ${rule.name}` : `فعال‌سازی ${rule.name}`} />
            </div>
            <details className="mt-3 rounded-lg border bg-muted/10">
                <summary className="cursor-pointer px-3 py-2 text-[0.68rem] text-muted-foreground">{locale === "en" ? "View technical conditions & actions" : "مشاهده شرط‌ها و اقدامات فنی"}</summary>
                <div className="grid gap-2 border-t p-2 sm:grid-cols-2">
                    <pre className="overflow-x-auto rounded-lg bg-muted p-2 text-[0.65rem] leading-5" dir="ltr">{JSON.stringify(rule.conditions, null, 2)}</pre>
                    <pre className="overflow-x-auto rounded-lg bg-muted p-2 text-[0.65rem] leading-5" dir="ltr">{JSON.stringify(rule.actions, null, 2)}</pre>
                </div>
            </details>
            {update.isError ? <p className="mt-2 text-danger text-xs">{locale === "en" ? "Update failed." : "به‌روزرسانی قانون ناموفق بود."}</p> : null}
        </div>
    );
}

function AutomationRuleRow({ rule, locale }: { rule: SupportAutomationRule; locale: Locale }) {
    const update = useUpdateSupportAutomationRule(rule.id);
    return (
        <div className="rounded-xl border p-3 transition-colors hover:bg-muted/15">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="truncate font-medium text-sm">{rule.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.7rem] text-muted-foreground">
                        <Badge variant="outline">{automationTriggerLabel(rule.trigger, locale)}</Badge>
                        <span>{locale === "en" ? "version" : "نسخه"} {rule.version.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}</span>
                    </div>
                </div>
                <Switch checked={rule.enabled} disabled={update.isPending} onCheckedChange={(enabled) => update.mutate({ enabled, expected_version: rule.version })} aria-label={locale === "en" ? `Toggle ${rule.name}` : `فعال‌سازی ${rule.name}`} />
            </div>
            <details className="mt-3 rounded-lg border bg-muted/10">
                <summary className="cursor-pointer px-3 py-2 text-[0.68rem] text-muted-foreground">{locale === "en" ? "View technical conditions & actions" : "مشاهده شرط‌ها و اقدامات فنی"}</summary>
                <div className="grid gap-2 border-t p-2 sm:grid-cols-2">
                    <pre className="overflow-x-auto rounded-lg bg-muted p-2 text-[0.65rem] leading-5" dir="ltr">{JSON.stringify(rule.conditions, null, 2)}</pre>
                    <pre className="overflow-x-auto rounded-lg bg-muted p-2 text-[0.65rem] leading-5" dir="ltr">{JSON.stringify(rule.actions, null, 2)}</pre>
                </div>
            </details>
            {update.isError ? <p className="mt-2 text-danger text-xs">{locale === "en" ? "Update failed." : "به‌روزرسانی اتوماسیون ناموفق بود."}</p> : null}
        </div>
    );
}

export function TicketSettingsPage() {
    const locale = useLocale() as Locale;
    const { text: t, priorities } = ticketCopy(locale);
    const settings = useTicketSettings();
    const updateSettings = useUpdateTicketSettings();
    const workflowStatuses = useTicketWorkflowStatuses();
    const createWorkflowStatus = useCreateTicketWorkflowStatus();
    const routingRules = useSupportRoutingRules();
    const createRoutingRule = useCreateSupportRoutingRule();
    const automationRules = useSupportAutomationRules();
    const createAutomationRule = useCreateSupportAutomationRule();
    const channels = useSupportChannels();
    const presence = useAgentPresence();
    const heartbeat = useHeartbeat();
    const [priority, setPriority] = useState<TicketPriority>("normal");
    const [assigneeId, setAssigneeId] = useState<number | null>(null);
    const [presenceState, setPresenceState] = useState<AgentPresenceState>("available");
    const [capacity, setCapacity] = useState(8);
    const [routingError, setRoutingError] = useState<string | null>(null);
    const [automationError, setAutomationError] = useState<string | null>(null);
    const numberLocale = locale === "fa" ? "fa-IR" : "en-US";

    useEffect(() => {
        if (!settings.data) return;
        setPriority(settings.data.default_priority);
        setAssigneeId(settings.data.default_assignee_user_id);
    }, [settings.data]);

    const searchAssignees = useCallback(async (query: string) => {
        const response = await apiGet<Envelope<TicketResource[]>>("tickets/resources", { locale, query: { kind: "assignees", q: query || undefined, limit: 50 } });
        return response.data.map((item) => ({ id: item.id, label: item.label, sublabel: item.email ?? undefined }));
    }, [locale]);

    const resolveAssignee = useCallback(async (ids: [number | string]) => {
        const response = await apiGet<Envelope<TicketResource[]>>("tickets/resources", { locale, query: { kind: "assignees", limit: 50 } });
        const wanted = new Set(ids.map(String));
        return response.data.filter((item) => wanted.has(String(item.id))).map((item) => ({ id: item.id, label: item.label, sublabel: item.email ?? undefined }));
    }, [locale]);

    async function submitSettings(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await updateSettings.mutateAsync({
            reference_prefix: String(form.get("reference_prefix") ?? "TKT").trim(),
            first_response_minutes: Number(form.get("first_response_minutes")),
            resolution_minutes: Number(form.get("resolution_minutes")),
            default_priority: priority,
            default_assignee_user_id: assigneeId,
        });
    }

    async function submitWorkflowStatus(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        await createWorkflowStatus.mutateAsync({
            code: String(form.get("code") ?? "").trim(),
            label_fa: String(form.get("label_fa") ?? "").trim(),
            label_en: String(form.get("label_en") ?? "").trim(),
            semantic_group: String(form.get("semantic_group") ?? "active") as "active" | "waiting" | "resolved" | "closed",
            is_terminal: form.get("is_terminal") === "on",
            is_customer_waiting: form.get("is_customer_waiting") === "on",
            is_enabled: true,
            sort_order: Number(form.get("sort_order") || 100),
        });
        formElement.reset();
    }

    async function submitRoutingRule(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setRoutingError(null);
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        try {
            await createRoutingRule.mutateAsync({
                name: String(form.get("name") ?? "").trim(),
                priority: Number(form.get("priority") || 100),
                enabled: true,
                conditions: parseObject(form.get("conditions")),
                actions: parseObject(form.get("actions")),
            });
            formElement.reset();
        } catch (error) {
            setRoutingError(error instanceof SyntaxError ? (locale === "en" ? "Conditions/actions JSON is invalid." : "JSON شرط یا اقدام معتبر نیست.") : null);
        }
    }

    async function submitAutomationRule(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setAutomationError(null);
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        try {
            await createAutomationRule.mutateAsync({
                name: String(form.get("name") ?? "").trim(),
                trigger: String(form.get("trigger") ?? "ticket_created") as SupportAutomationTrigger,
                enabled: true,
                conditions: parseObject(form.get("conditions")),
                actions: parseActionArray(form.get("actions")),
            });
            formElement.reset();
        } catch (error) {
            setAutomationError(error instanceof SyntaxError ? (locale === "en" ? "Conditions/actions JSON is invalid." : "JSON شرط یا اقدام معتبر نیست.") : null);
        }
    }

    const configured = (channels.data ?? []).filter((channel) => channel.status !== "disabled").length;
    const connected = (channels.data ?? []).filter((channel) => channel.status === "connected").length;
    const activeAutomations = (automationRules.data ?? []).filter((rule) => rule.enabled).length;
    const freshPresence = (presence.data ?? []).filter((item) => !item.stale).length;

    return (
        <div className="flex flex-col gap-5">
            <SupportPageHeader
                eyebrow={locale === "en" ? "Support control plane" : "مرکز کنترل پشتیبانی"}
                title={locale === "en" ? "Support settings" : "تنظیمات مرکز پشتیبانی"}
                subtitle={locale === "en" ? "Manage SLA defaults, workflow states, routing, automation, operator capacity and integration posture from persisted support configuration." : "SLA، وضعیت‌های گردش کار، مسیریابی، اتوماسیون، ظرفیت کارشناسان و وضعیت اتصال‌ها را از تنظیمات واقعی پشتیبانی مدیریت کنید."}
                icon={SlidersHorizontal}
                actions={<Button variant="outline" asChild><Link href={"/tickets/channels" as never}><Radio className="size-4" aria-hidden="true" />{locale === "en" ? "Channel settings" : "تنظیم کانال‌ها"}</Link></Button>}
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SupportMetric label={locale === "en" ? "Workflow states" : "وضعیت‌های گردش کار"} value={(workflowStatuses.data?.length ?? 0).toLocaleString(numberLocale)} icon={Network} tone="info" />
                <SupportMetric label={locale === "en" ? "Active automations" : "اتوماسیون‌های فعال"} value={activeAutomations.toLocaleString(numberLocale)} icon={Bot} tone="primary" />
                <SupportMetric label={locale === "en" ? "Connected channels" : "کانال‌های متصل"} value={connected.toLocaleString(numberLocale)} hint={`${configured.toLocaleString(numberLocale)} ${locale === "en" ? "configured/enabled" : "پیکربندی‌شده/فعال"}`} icon={Radio} tone="success" />
                <SupportMetric label={locale === "en" ? "Fresh agent presence" : "کارشناسان با حضور تازه"} value={freshPresence.toLocaleString(numberLocale)} icon={Users} tone="neutral" />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="size-4" aria-hidden="true" />{t.responsePolicy}</CardTitle></CardHeader>
                    <CardContent>
                        {settings.isLoading ? <LoadingGrid rows={4} /> : settings.isError || !settings.data ? <SupportError title={t.settingsFailed} retryLabel={t.retry} onRetry={() => void settings.refetch()} /> : (
                            <form key={`${settings.data.reference_prefix}:${settings.data.first_response_minutes}:${settings.data.resolution_minutes}`} onSubmit={submitSettings} className="grid gap-4 sm:grid-cols-2">
                                <label className="space-y-1.5 text-sm"><span className="font-medium text-xs">{t.referencePrefix}</span><Input name="reference_prefix" defaultValue={settings.data.reference_prefix} required maxLength={12} pattern="[A-Za-z0-9-]+" dir="ltr" /></label>
                                <label className="space-y-1.5 text-sm"><span className="font-medium text-xs">{t.defaultPriority}</span><Select value={priority} onValueChange={(value) => setPriority(value as TicketPriority)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(priorities).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
                                <label className="space-y-1.5 text-sm"><span className="font-medium text-xs">{t.firstResponseMinutes}</span><Input name="first_response_minutes" type="number" min={1} max={10_080} defaultValue={settings.data.first_response_minutes} required /></label>
                                <label className="space-y-1.5 text-sm"><span className="font-medium text-xs">{t.resolutionMinutes}</span><Input name="resolution_minutes" type="number" min={1} max={43_200} defaultValue={settings.data.resolution_minutes} required /></label>
                                <div className="space-y-1.5 sm:col-span-2"><span className="font-medium text-xs">{t.defaultAssignee}</span><div className="flex flex-wrap items-center gap-2"><Combobox value={assigneeId} onValueChange={(value) => setAssigneeId(value === null ? null : Number(value))} onSearch={searchAssignees} onResolve={resolveAssignee} preload labels={{ placeholder: t.noDefaultAssignee, search: t.searchAdmin, empty: t.noAdmin }} />{assigneeId !== null ? <Button type="button" variant="ghost" size="sm" onClick={() => setAssigneeId(null)}>{t.clearDefaultAssignee}</Button> : null}</div></div>
                                <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-[0.7rem] text-muted-foreground">{locale === "en" ? "Same-value saves are no-ops to avoid audit noise." : "ذخیره مقدار بدون تغییر، رویداد ممیزی اضافی تولید نمی‌کند."}</p><Button type="submit" disabled={updateSettings.isPending}><Save className="size-4" aria-hidden="true" />{updateSettings.isPending ? t.saving : t.saveSettings}</Button></div>
                            </form>
                        )}
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="size-4" aria-hidden="true" />{locale === "en" ? "My availability & capacity" : "حضور و ظرفیت من"}</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1.5"><span className="font-medium text-xs">{locale === "en" ? "Presence state" : "وضعیت حضور"}</span><Select value={presenceState} onValueChange={(value) => setPresenceState(value as AgentPresenceState)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["available", "busy", "away", "offline"] as AgentPresenceState[]).map((value) => <SelectItem key={value} value={value}>{presenceStateLabel(value, locale)}</SelectItem>)}</SelectContent></Select></label>
                            <label className="space-y-1.5"><span className="font-medium text-xs">{locale === "en" ? "Active-ticket capacity" : "ظرفیت تیکت فعال"}</span><Input type="number" min={1} max={500} value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} /></label>
                        </div>
                        <Button onClick={() => heartbeat.mutate({ state: presenceState, capacity })} disabled={heartbeat.isPending || capacity < 1 || capacity > 500}><Radio className="size-4" aria-hidden="true" />{heartbeat.isPending ? (locale === "en" ? "Publishing…" : "در حال ثبت…") : locale === "en" ? "Publish availability" : "ثبت حضور و ظرفیت"}</Button>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-xl border p-3 text-center"><div className="font-semibold text-lg tabular-nums">{freshPresence.toLocaleString(numberLocale)}</div><div className="text-[0.65rem] text-muted-foreground">{locale === "en" ? "fresh" : "حضور تازه"}</div></div>
                            <div className="rounded-xl border p-3 text-center"><div className="font-semibold text-lg tabular-nums">{(presence.data ?? []).filter((item) => item.effective_state === "available").length.toLocaleString(numberLocale)}</div><div className="text-[0.65rem] text-muted-foreground">{locale === "en" ? "available" : "آماده"}</div></div>
                            <div className="rounded-xl border p-3 text-center"><div className="font-semibold text-lg tabular-nums">{(presence.data ?? []).reduce((sum, item) => sum + item.active_count, 0).toLocaleString(numberLocale)}</div><div className="text-[0.65rem] text-muted-foreground">{locale === "en" ? "active load" : "بار فعال"}</div></div>
                        </div>
                        <p className="text-[0.7rem] text-muted-foreground leading-5">{locale === "en" ? "Presence uses a real heartbeat TTL; stale operators are not displayed as online." : "حضور آنلاین بر مبنای heartbeat و TTL واقعی است؛ کارشناس stale آنلاین نمایش داده نمی‌شود."}</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-sm">
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Network className="size-4" aria-hidden="true" />{locale === "en" ? "Workflow status catalog" : "کاتالوگ وضعیت‌های گردش کار"}</CardTitle></CardHeader>
                <CardContent className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {workflowStatuses.isLoading ? Array.from({ length: 6 }, (_, index) => `workflow-${index + 1}`).map((key) => <Skeleton key={key} className="h-24 rounded-xl" />) : (workflowStatuses.data ?? []).length === 0 ? <div className="sm:col-span-2 lg:col-span-3"><EmptySupportState title={locale === "en" ? "No workflow statuses" : "وضعیت گردش کاری ثبت نشده"} /></div> : (workflowStatuses.data ?? []).map((status) => (
                            <div key={status.id} className="rounded-xl border p-3">
                                <div className="flex items-center justify-between gap-2"><span className="font-medium text-xs">{locale === "en" ? status.label_en : status.label_fa}</span><Badge variant="outline">{workflowSemanticLabel(status.semantic_group, locale)}</Badge></div>
                                <div className="mt-2 text-[0.65rem] text-muted-foreground" dir="ltr">{status.code}</div>
                                <div className="mt-2 flex flex-wrap gap-1.5">{status.is_terminal ? <Badge variant="outline">{locale === "en" ? "Terminal" : "نهایی"}</Badge> : null}{status.is_customer_waiting ? <Badge variant="outline">{locale === "en" ? "Customer waiting" : "انتظار مشتری"}</Badge> : null}{!status.is_enabled ? <Badge variant="outline">{locale === "en" ? "Disabled" : "غیرفعال"}</Badge> : null}</div>
                            </div>
                        ))}
                    </div>
                    <form onSubmit={submitWorkflowStatus} className="rounded-xl border bg-muted/20 p-4">
                        <div className="mb-3 flex items-center gap-2 font-medium text-sm"><Plus className="size-4" aria-hidden="true" />{locale === "en" ? "Add custom status" : "افزودن وضعیت سفارشی"}</div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Input name="code" required pattern="[a-z0-9_-]+" placeholder="qa_review" dir="ltr" />
                            <Input name="sort_order" type="number" min={0} max={10_000} defaultValue={100} placeholder={locale === "en" ? "Sort" : "ترتیب"} />
                            <Input name="label_fa" required maxLength={80} placeholder="عنوان فارسی" />
                            <Input name="label_en" required maxLength={80} placeholder="English label" dir="ltr" />
                            <Select name="semantic_group" defaultValue="active"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["active", "waiting", "resolved", "closed"] as const).map((value) => <SelectItem key={value} value={value}>{workflowSemanticLabel(value, locale)}</SelectItem>)}</SelectContent></Select>
                            <div className="flex flex-wrap items-center gap-4 text-xs"><label className="inline-flex items-center gap-2"><input type="checkbox" name="is_terminal" />{locale === "en" ? "Terminal" : "نهایی"}</label><label className="inline-flex items-center gap-2"><input type="checkbox" name="is_customer_waiting" />{locale === "en" ? "Customer waiting" : "انتظار مشتری"}</label></div>
                        </div>
                        <Button type="submit" size="sm" className="mt-3" disabled={createWorkflowStatus.isPending}>{locale === "en" ? "Create status" : "ساخت وضعیت"}</Button>
                    </form>
                </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4" aria-hidden="true" />{locale === "en" ? "Routing rules" : "قوانین مسیریابی"}</CardTitle><p className="text-xs text-muted-foreground">{locale === "en" ? "Rules are evaluated by priority; technical JSON stays behind the advanced editor." : "قوانین بر اساس اولویت اجرا می‌شوند؛ JSON فنی داخل ویرایشگر پیشرفته قرار دارد."}</p></CardHeader>
                    <CardContent className="space-y-4">
                        {routingRules.isLoading ? <LoadingGrid rows={3} /> : (routingRules.data ?? []).length === 0 ? <EmptySupportState title={locale === "en" ? "No routing rules" : "قانون مسیریابی ثبت نشده"} /> : (routingRules.data ?? []).map((rule) => <RoutingRuleRow key={rule.id} rule={rule} locale={locale} />)}
                        <details className="rounded-xl border border-dashed">
                            <summary className="cursor-pointer px-4 py-3 font-medium text-xs">{locale === "en" ? "Advanced: add routing rule" : "پیشرفته: افزودن قانون مسیریابی"}</summary>
                            <form onSubmit={submitRoutingRule} className="border-t p-4">
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]"><Input name="name" required maxLength={120} placeholder={locale === "en" ? "Rule name" : "نام قانون"} /><Input name="priority" type="number" min={0} max={10_000} defaultValue={100} /></div>
                                <Textarea name="conditions" className="mt-3 min-h-24 font-mono text-xs" dir="ltr" defaultValue={'{"priority":"urgent"}'} />
                                <Textarea name="actions" className="mt-3 min-h-24 font-mono text-xs" dir="ltr" defaultValue={'{"assign":"support"}'} />
                                {routingError ? <p className="mt-2 text-danger text-xs">{routingError}</p> : null}
                                <Button type="submit" size="sm" className="mt-3" disabled={createRoutingRule.isPending}><Plus className="size-3.5" aria-hidden="true" />{locale === "en" ? "Add routing rule" : "افزودن قانون مسیریابی"}</Button>
                            </form>
                        </details>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="size-4" aria-hidden="true" />{locale === "en" ? "Automation rules" : "اتوماسیون و گردش کار"}</CardTitle><p className="text-xs text-muted-foreground">{locale === "en" ? "Enabled automations execute on persisted support events only." : "اتوماسیون‌های فعال فقط روی رویدادهای واقعی و ثبت‌شده پشتیبانی اجرا می‌شوند."}</p></CardHeader>
                    <CardContent className="space-y-4">
                        {automationRules.isLoading ? <LoadingGrid rows={3} /> : (automationRules.data ?? []).length === 0 ? <EmptySupportState title={locale === "en" ? "No automation rules" : "اتوماسیونی ثبت نشده"} /> : (automationRules.data ?? []).map((rule) => <AutomationRuleRow key={rule.id} rule={rule} locale={locale} />)}
                        <details className="rounded-xl border border-dashed">
                            <summary className="cursor-pointer px-4 py-3 font-medium text-xs">{locale === "en" ? "Advanced: add automation" : "پیشرفته: افزودن اتوماسیون"}</summary>
                            <form onSubmit={submitAutomationRule} className="border-t p-4">
                                <div className="grid gap-3 sm:grid-cols-2"><Input name="name" required maxLength={120} placeholder={locale === "en" ? "Automation name" : "نام اتوماسیون"} /><Select name="trigger" defaultValue="ticket_created"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["ticket_created", "ticket_updated", "status_changed", "message_received", "sla_breached"] as SupportAutomationTrigger[]).map((value) => <SelectItem key={value} value={value}>{automationTriggerLabel(value, locale)}</SelectItem>)}</SelectContent></Select></div>
                                <Textarea name="conditions" className="mt-3 min-h-24 font-mono text-xs" dir="ltr" defaultValue="{}" />
                                <Textarea name="actions" className="mt-3 min-h-24 font-mono text-xs" dir="ltr" defaultValue={'[{"type":"add_tag","value":"automated"}]'} />
                                {automationError ? <p className="mt-2 text-danger text-xs">{automationError}</p> : null}
                                <Button type="submit" size="sm" className="mt-3" disabled={createAutomationRule.isPending}><Plus className="size-3.5" aria-hidden="true" />{locale === "en" ? "Add automation" : "افزودن اتوماسیون"}</Button>
                            </form>
                        </details>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Radio className="size-4" aria-hidden="true" />{locale === "en" ? "Channel posture" : "وضعیت کانال‌های ارتباطی"}</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-2"><div className="rounded-xl border p-3"><div className="font-semibold text-xl tabular-nums">{configured.toLocaleString(numberLocale)}</div><div className="text-[0.7rem] text-muted-foreground">{locale === "en" ? "configured or enabled" : "پیکربندی‌شده یا فعال"}</div></div><div className="rounded-xl border p-3"><div className="font-semibold text-xl tabular-nums">{connected.toLocaleString(numberLocale)}</div><div className="text-[0.7rem] text-muted-foreground">{locale === "en" ? "provider-verified" : "اتصال تأییدشده"}</div></div></div>
                        {(channels.data ?? []).slice(0, 6).map((channel) => <div key={channel.channel} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"><span className="text-xs">{supportChannelLabel(channel.channel, locale)}</span><Badge variant="outline" className={channelStatusTone(channel.status)}>{supportChannelStatusLabel(channel.status, locale)}</Badge></div>)}
                        <Button variant="outline" size="sm" className="w-full" asChild><Link href={"/tickets/channels" as never}>{locale === "en" ? "Manage all channels" : "مدیریت همه کانال‌ها"}</Link></Button>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4" aria-hidden="true" />{locale === "en" ? "Security & governance boundary" : "مرز امنیت و حاکمیت"}</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {[
                            locale === "en" ? "Tenant-scoped RLS remains mandatory for support records." : "RLS مبتنی بر tenant برای رکوردهای پشتیبانی اجباری است.",
                            locale === "en" ? "Provider credentials are environment references and are never returned as plaintext." : "اعتبارنامه ارائه‌دهنده با env ref نگه‌داری می‌شود و plaintext به مرورگر برنمی‌گردد.",
                            locale === "en" ? "Sensitive mutations use version guards, authorization, rate limits and audit events." : "تغییرات حساس با version guard، مجوز، rate limit و audit event انجام می‌شود.",
                            locale === "en" ? "Connected status requires provider evidence; configuration alone is not treated as healthy." : "وضعیت Connected به شواهد ارائه‌دهنده نیاز دارد و صرف پیکربندی اتصال سالم محسوب نمی‌شود.",
                        ].map((item) => <div key={item} className="flex gap-2 rounded-xl border p-3 text-xs leading-5"><Braces className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" /><span>{item}</span></div>)}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
