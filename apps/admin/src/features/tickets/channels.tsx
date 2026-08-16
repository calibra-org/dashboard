"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { AlertCircle, KeyRound, Save, ShieldCheck, SlidersHorizontal } from "#/icons";
import { apiGet, apiMutate } from "#/lib/queries/api-client";
import { cn } from "#/lib/utils";

import { ApiChannelPane } from "./api-channel-pane";
import { SupportProviderIcon } from "./channel-icons";
import { SupportPageHeader } from "./ui";

type Channel = "whatsapp" | "telegram" | "instagram" | "rubika" | "bale" | "eitaa" | "email" | "sms" | "api" | "web" | "phone";
type State = "disabled" | "configured" | "connecting" | "connected" | "degraded" | "error" | "expired";
type Field = {
    key: string;
    label_fa: string;
    label_en: string;
    required: boolean;
    type?: "text" | "url" | "number" | "select" | "boolean";
    options?: Array<{ value: string; label_fa: string; label_en: string }>;
    placeholder?: string;
    configured?: boolean;
    value?: string;
};
type Provider = {
    channel: Channel;
    provider_key: string;
    label_fa: string;
    label_en: string;
    official_api: boolean;
    production_available: boolean;
    availability_note_fa?: string | null;
    availability_note_en?: string | null;
    auth_model: string;
    credential_fields: Field[];
    configuration_fields: Field[];
    capabilities: string[];
    requires_webhook_verification: boolean;
};
type Integration = {
    id: number | null;
    channel: Channel;
    provider_key: string;
    status: State;
    enabled: boolean;
    configuration: Record<string, unknown>;
    capabilities: string[];
    account_identifier: string | null;
    credential_health: { configured: boolean; fields: Field[] };
    token_expires_at: string | null;
    last_verified_at: string | null;
    last_rotated_at: string | null;
    last_inbound_at: string | null;
    last_outbound_at: string | null;
    last_webhook_at: string | null;
    last_successful_api_at: string | null;
    webhook_status: string;
    webhook_verified_at: string | null;
    granted_scopes: string[];
    failed_verification_attempts: number;
    last_error: string | null;
    production_available: boolean;
    availability_note_fa?: string | null;
    availability_note_en?: string | null;
    unread_count: number;
};
type Conversation = {
    id: number;
    reference: string;
    requester_name: string;
    requester_email: string | null;
    requester_phone: string | null;
    subject: string;
    channel: Channel;
    provider_account_id: string | null;
    provider_conversation_id: string | null;
    unread_count: number;
    status: string;
    priority: string;
    assigned_user_id: number | null;
    last_message_at: string;
    first_response_due_at: string | null;
    resolution_due_at: string | null;
};
type Ticket = {
    id: number;
    version: number;
    reference: string;
    requester_name: string;
    subject: string;
    status: string;
    priority: string;
    category: string | null;
    tags: string[];
    assigned_user_id: number | null;
    messages: Array<{
        id: number;
        kind: string;
        body: string;
        created_at: string;
        direction?: string;
        delivery_state?: string | null;
        provider_message_id?: string | null;
    }>;
};
type Envelope<T> = { data: T };
type TicketAttachment = {
    id: number;
    filename: string;
    mime: string;
    size_bytes: number;
    scan_status: "pending" | "clean" | "infected" | "error";
    message_id: number | null;
};
type ChatState = { search: string; selected: number | null; draft: string; scrollTop: number };
const EMPTY_CHAT_STATE: ChatState = { search: "", selected: null, draft: "", scrollTop: 0 };

const PRIMARY: Channel[] = ["whatsapp", "telegram", "instagram", "rubika", "bale", "eitaa", "email", "sms", "api"];
const SECTIONS = ["connections", "chats", "security", "webhooks", "logs"] as const;
type Section = (typeof SECTIONS)[number];

function statusLabel(state: State, locale: Locale) {
    const fa: Record<State, string> = {
        disabled: "غیرفعال",
        configured: "پیکربندی‌شده",
        connecting: "در حال اتصال",
        connected: "متصل",
        degraded: "ناپایدار",
        error: "خطا",
        expired: "منقضی",
    };
    const en: Record<State, string> = {
        disabled: "Disabled",
        configured: "Configured",
        connecting: "Connecting",
        connected: "Connected",
        degraded: "Degraded",
        error: "Error",
        expired: "Expired",
    };
    return locale === "en" ? en[state] : fa[state];
}
function statusClass(state: State) {
    if (state === "connected") return "border-success/25 bg-success/5 text-success";
    if (state === "error" || state === "expired") return "border-danger/25 bg-danger/5 text-danger";
    if (state === "degraded" || state === "connecting") return "border-warning/25 bg-warning/5 text-warning";
    return "text-muted-foreground";
}
function formatTime(value: string | null, locale: Locale) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime())
        ? "—"
        : new Intl.DateTimeFormat(locale === "en" ? "en" : "fa-IR", { dateStyle: "short", timeStyle: "short" }).format(d);
}
function fieldLabel(field: Field, locale: Locale) {
    return locale === "en" ? field.label_en : field.label_fa;
}

function ProviderCard({
    provider,
    integration,
    active,
    locale,
    onOpen,
}: {
    provider: Provider;
    integration: Integration;
    active: boolean;
    locale: Locale;
    onOpen: () => void;
}) {
    const label = locale === "en" ? provider.label_en : provider.label_fa;
    return (
        <button
            type="button"
            onClick={onOpen}
            className={cn(
                "w-full rounded-xl border bg-card p-4 text-start transition hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "border-primary/35 ring-1 ring-primary/10",
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-muted/35">
                        <SupportProviderIcon provider={provider.channel} className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <div className="truncate font-semibold text-sm">{label}</div>
                        <div className="mt-1 truncate text-[0.68rem] text-muted-foreground" dir="ltr">
                            {integration.account_identifier ?? provider.provider_key}
                        </div>
                    </div>
                </div>
                <span
                    className={cn(
                        "mt-1 size-2.5 shrink-0 rounded-full",
                        integration.status === "connected"
                            ? "bg-success"
                            : integration.status === "error" || integration.status === "expired"
                              ? "bg-danger"
                              : integration.status === "connecting" || integration.status === "degraded"
                                ? "bg-warning"
                                : "bg-muted-foreground/35",
                    )}
                />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={statusClass(integration.status)}>
                    {statusLabel(integration.status, locale)}
                </Badge>
                {integration.unread_count > 0 ? <Badge>{`+${integration.unread_count}`}</Badge> : null}
                {integration.credential_health.configured ? (
                    <Badge variant="outline" className="border-success/20 text-success">
                        {locale === "en" ? "Credentials ready" : "اعتبارنامه آماده"}
                    </Badge>
                ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-[0.65rem] text-muted-foreground">
                <span>{locale === "en" ? "Last verified" : "آخرین تأیید"}</span>
                <span className="truncate text-end" dir="ltr">
                    {formatTime(integration.last_verified_at, locale)}
                </span>
                <span>{locale === "en" ? "Webhook" : "وب‌هوک"}</span>
                <span className="truncate text-end">{integration.webhook_status}</span>
            </div>
        </button>
    );
}

function InternalTabs({
    opened,
    active,
    integrations,
    providers,
    locale,
    onSelect,
    onClose,
}: {
    opened: string[];
    active: string;
    integrations: Map<string, Integration>;
    providers: Map<string, Provider>;
    locale: Locale;
    onSelect: (key: string) => void;
    onClose: (key: string) => void;
}) {
    return (
        <div className="flex max-w-full gap-1 overflow-x-auto border-b bg-muted/20 px-2 pt-2" role="tablist">
            {opened.map((key) => {
                const provider = providers.get(key);
                const integration = integrations.get(key);
                if (!provider || !integration) return null;
                const label = locale === "en" ? provider.label_en : provider.label_fa;
                return (
                    <div
                        key={key}
                        className={cn(
                            "flex min-w-36 max-w-56 items-center gap-2 rounded-t-lg border border-b-0 px-3 py-2 text-xs",
                            active === key ? "bg-background text-foreground shadow-sm" : "bg-muted/40 text-muted-foreground",
                        )}
                    >
                        <button
                            type="button"
                            role="tab"
                            aria-selected={active === key}
                            onClick={() => onSelect(key)}
                            className="flex min-w-0 flex-1 items-center gap-2"
                        >
                            <SupportProviderIcon provider={provider.channel} className="size-4 shrink-0" />
                            <span className="truncate">{label}</span>
                            {integration.unread_count > 0 ? (
                                <span className="rounded-full bg-primary px-1.5 text-[0.6rem] text-primary-foreground">
                                    {integration.unread_count}
                                </span>
                            ) : null}
                            <span
                                className={cn(
                                    "size-1.5 rounded-full",
                                    integration.status === "connected" ? "bg-success" : "bg-muted-foreground/40",
                                )}
                            />
                        </button>
                        <button
                            type="button"
                            onClick={() => onClose(key)}
                            className="rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={locale === "en" ? `Close ${label}` : `بستن ${label}`}
                        >
                            ×
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

function ConfigurationPane({ provider, integration, locale }: { provider: Provider; integration: Integration; locale: Locale }) {
    const client = useQueryClient();
    const [enabled, setEnabled] = useState(integration.enabled);
    useEffect(() => setEnabled(integration.enabled), [integration.enabled]);
    const configure = useMutation({
        mutationFn: (body: unknown) => apiMutate("PUT", "tickets/omnichannel/integrations", { locale, body }),
        onSuccess: async () => {
            await client.invalidateQueries({ queryKey: ["ticket-omnichannel"] });
        },
    });
    const verify = useMutation({
        mutationFn: () => apiMutate("POST", `tickets/omnichannel/${integration.channel}/test`, { locale }),
        onSuccess: async () => client.invalidateQueries({ queryKey: ["ticket-omnichannel"] }),
    });
    const connect = useMutation({
        mutationFn: () => apiMutate("POST", `tickets/omnichannel/${integration.channel}/connect`, { locale }),
        onSuccess: async () => client.invalidateQueries({ queryKey: ["ticket-omnichannel"] }),
    });
    const disconnect = useMutation({
        mutationFn: (revoke: boolean) =>
            apiMutate("POST", `tickets/omnichannel/${integration.channel}/disconnect`, { locale, body: { revoke } }),
        onSuccess: async () => client.invalidateQueries({ queryKey: ["ticket-omnichannel"] }),
    });
    const oauth = useMutation({
        mutationFn: () =>
            apiMutate<Envelope<{ authorization_url: string }>>("POST", `tickets/omnichannel/${integration.channel}/oauth/start`, {
                locale,
                body: { return_path: window.location.pathname },
            }),
        onSuccess: (result) => {
            window.location.assign(result.data.authorization_url);
        },
    });
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const configuration: Record<string, unknown> = {};
        const credentials: Record<string, unknown> = {};
        for (const field of provider.configuration_fields)
            configuration[field.key] =
                field.type === "boolean"
                    ? form.get(field.key) === "on"
                    : field.type === "number"
                      ? Number(form.get(field.key) ?? 0)
                      : String(form.get(field.key) ?? "").trim();
        for (const field of provider.credential_fields) {
            const value = String(form.get(`secret:${field.key}`) ?? "").trim();
            if (value) credentials[field.key] = value;
        }
        await configure.mutateAsync({
            channel: provider.channel,
            provider_key: provider.provider_key,
            enabled,
            configuration,
            credentials,
        });
    }
    const unavailable = !provider.production_available || !integration.production_available;
    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <form onSubmit={submit} className="space-y-4">
                {unavailable ? (
                    <div className="rounded-xl border border-warning/25 bg-warning/5 p-4 text-sm">
                        <div className="font-semibold">
                            {locale === "en"
                                ? "Official production integration unavailable"
                                : "اتصال رسمی Production در دسترس نیست"}
                        </div>
                        <p className="mt-1 text-muted-foreground text-xs">
                            {locale === "en" ? provider.availability_note_en : provider.availability_note_fa}
                        </p>
                    </div>
                ) : null}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <SlidersHorizontal className="size-4" />
                            {locale === "en" ? "Provider configuration" : "پیکربندی Provider"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                        {provider.configuration_fields.length ? (
                            provider.configuration_fields.map((field) => (
                                <label key={field.key} htmlFor={`provider-config-${field.key}`} className="space-y-1.5 text-xs">
                                    <span className="font-medium">
                                        {fieldLabel(field, locale)}
                                        {field.required ? " *" : ""}
                                    </span>
                                    {field.type === "select" ? (
                                        <select
                                            id={`provider-config-${field.key}`}
                                            name={field.key}
                                            defaultValue={String(integration.configuration[field.key] ?? "")}
                                            className="h-9 w-full rounded-md border bg-background px-3 text-xs"
                                        >
                                            {field.options?.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {locale === "en" ? option.label_en : option.label_fa}
                                                </option>
                                            ))}
                                        </select>
                                    ) : field.type === "boolean" ? (
                                        <input
                                            id={`provider-config-${field.key}`}
                                            type="checkbox"
                                            name={field.key}
                                            defaultChecked={Boolean(integration.configuration[field.key])}
                                            className="ms-2"
                                        />
                                    ) : (
                                        <Input
                                            id={`provider-config-${field.key}`}
                                            name={field.key}
                                            type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
                                            defaultValue={String(integration.configuration[field.key] ?? "")}
                                            placeholder={field.placeholder}
                                            dir="ltr"
                                        />
                                    )}
                                </label>
                            ))
                        ) : (
                            <div className="text-muted-foreground text-xs sm:col-span-2">
                                {locale === "en"
                                    ? "No provider-specific public configuration is required."
                                    : "تنظیم عمومی اختصاصی دیگری برای این Provider لازم نیست."}
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <KeyRound className="size-4" />
                            {locale === "en" ? "Credentials" : "اعتبارنامه‌ها"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                        {provider.credential_fields.map((field) => {
                            const saved = integration.credential_health.fields.find((item) => item.key === field.key)?.configured;
                            return (
                                <label key={field.key} className="space-y-1.5 text-xs">
                                    <span className="flex items-center justify-between gap-2 font-medium">
                                        <span>
                                            {fieldLabel(field, locale)}
                                            {field.required ? " *" : ""}
                                        </span>
                                        {saved ? (
                                            <Badge variant="outline" className="text-[0.6rem]">
                                                {locale === "en" ? "Saved" : "ذخیره‌شده"}
                                            </Badge>
                                        ) : null}
                                    </span>
                                    <Input
                                        name={`secret:${field.key}`}
                                        type="password"
                                        autoComplete="new-password"
                                        placeholder={saved ? "••••••••••••" : ""}
                                        dir="ltr"
                                    />
                                    <span className="text-[0.62rem] text-muted-foreground">
                                        {saved
                                            ? locale === "en"
                                                ? "Leave blank to preserve. Enter a new value to rotate."
                                                : "برای حفظ مقدار خالی بگذارید؛ مقدار جدید یعنی جایگزینی/چرخش."
                                            : locale === "en"
                                              ? "Secret is encrypted server-side and never returned."
                                              : "رمز فقط سمت سرور رمزنگاری می‌شود و هرگز بازگردانده نمی‌شود."}
                                    </span>
                                </label>
                            );
                        })}
                    </CardContent>
                </Card>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="me-auto flex items-center gap-2 rounded-lg border px-3 py-2">
                        <Switch checked={enabled} onCheckedChange={setEnabled} disabled={unavailable} />
                        <span className="text-xs">{locale === "en" ? "Enable channel" : "فعال‌سازی کانال"}</span>
                    </div>
                    <Button type="submit" disabled={configure.isPending || unavailable}>
                        <Save className="me-1.5 size-4" />
                        {locale === "en" ? "Save" : "ذخیره"}
                    </Button>
                    {["gmail_api", "microsoft_graph_mail"].includes(provider.provider_key) ? (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={oauth.isPending || unavailable}
                            onClick={() => oauth.mutate()}
                        >
                            {locale === "en" ? "Authorize OAuth" : "اتصال OAuth"}
                        </Button>
                    ) : null}
                    <Button
                        type="button"
                        variant="outline"
                        disabled={verify.isPending || unavailable || !integration.credential_health.configured}
                        onClick={() => verify.mutate()}
                    >
                        {locale === "en" ? "Test connection" : "تست اتصال"}
                    </Button>
                    <Button
                        type="button"
                        disabled={connect.isPending || unavailable || !enabled || !integration.credential_health.configured}
                        onClick={() => connect.mutate()}
                    >
                        {locale === "en" ? "Connect" : "اتصال"}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={disconnect.isPending || integration.status === "disabled"}
                        onClick={() => disconnect.mutate(false)}
                    >
                        {locale === "en" ? "Disconnect" : "قطع اتصال"}
                    </Button>
                </div>
                {configure.isError || oauth.isError || verify.isError || connect.isError || disconnect.isError ? (
                    <div className="flex gap-2 rounded-lg border border-danger/20 bg-danger/5 p-3 text-danger text-xs">
                        <AlertCircle className="size-4 shrink-0" />
                        {locale === "en"
                            ? "The operation failed. No connected state was fabricated; review the provider error and credentials."
                            : "عملیات ناموفق بود. وضعیت اتصال جعلی ساخته نشد؛ خطا و اعتبارنامه Provider را بررسی کنید."}
                    </div>
                ) : null}
            </form>
            <div className="space-y-3">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">{locale === "en" ? "Connection progress" : "روند اتصال"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {[
                            { n: 1, fa: "نیازمندی‌ها", en: "Requirements", ok: provider.production_available },
                            { n: 2, fa: "اعتبارنامه", en: "Credentials", ok: integration.credential_health.configured },
                            {
                                n: 3,
                                fa: "وب‌هوک",
                                en: "Webhook",
                                ok: !provider.capabilities.includes("webhook") || integration.webhook_status === "verified",
                            },
                            { n: 4, fa: "تست واقعی", en: "Provider test", ok: Boolean(integration.last_verified_at) },
                            { n: 5, fa: "متصل", en: "Connected", ok: integration.status === "connected" },
                        ].map((step) => (
                            <div key={step.n} className="flex items-center gap-2 text-xs">
                                <span
                                    className={cn(
                                        "grid size-6 place-items-center rounded-full border",
                                        step.ok && "border-success/25 bg-success/10 text-success",
                                    )}
                                >
                                    {step.ok ? "✓" : step.n}
                                </span>
                                <span>{locale === "en" ? step.en : step.fa}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="space-y-2 p-4 text-xs">
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{locale === "en" ? "Last verified" : "آخرین تأیید"}</span>
                            <span dir="ltr">{formatTime(integration.last_verified_at, locale)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">
                                {locale === "en" ? "Last API success" : "آخرین API موفق"}
                            </span>
                            <span dir="ltr">{formatTime(integration.last_successful_api_at, locale)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{locale === "en" ? "Token expiry" : "انقضای توکن"}</span>
                            <span dir="ltr">{formatTime(integration.token_expires_at, locale)}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function ChatPane({
    provider,
    integration,
    locale,
    state,
    onState,
}: {
    provider: Provider;
    integration: Integration;
    locale: Locale;
    state: ChatState;
    onState: (patch: Partial<ChatState>) => void;
}) {
    const client = useQueryClient();
    const { search, selected, draft } = state;
    const setSearch = (value: string) => onState({ search: value });
    const setSelected = useCallback((value: number | null) => onState({ selected: value }), [onState]);
    const setDraft = (value: string) => onState({ draft: value });
    const scrollRef = useRef<HTMLDivElement>(null);
    const conversations = useQuery({
        queryKey: ["ticket-omnichannel", "conversations", provider.channel, search],
        queryFn: ({ signal }) =>
            apiGet<Envelope<Conversation[]>>("tickets/omnichannel/conversations/list", {
                locale,
                query: { channel: provider.channel, q: search, limit: 60 },
                signal,
            }),
        select: (value) => value.data,
        refetchInterval: integration.status === "connected" ? 15_000 : false,
    });
    useEffect(() => {
        if (selected === null && conversations.data?.[0]) setSelected(conversations.data[0].id);
    }, [conversations.data, selected, setSelected]);
    const ticket = useQuery({
        queryKey: ["ticket-omnichannel", "ticket", selected],
        queryFn: ({ signal }) => apiGet<Envelope<Ticket>>(`tickets/${selected}`, { locale, signal }),
        select: (value) => value.data,
        enabled: Boolean(selected),
    });
    const attachments = useQuery({
        queryKey: ["ticket-omnichannel", "attachments", selected],
        queryFn: ({ signal }) => apiGet<Envelope<TicketAttachment[]>>(`tickets/${selected}/attachments`, { locale, signal }),
        select: (value) => value.data,
        enabled: Boolean(selected),
    });
    const cleanAttachments = (attachments.data ?? []).filter((item) => item.scan_status === "clean" && !item.message_id);
    const [attachmentId, setAttachmentId] = useState<number | null>(null);
    const send = useMutation({
        mutationFn: () => {
            if (!ticket.data) throw new Error("ticket missing");
            return apiMutate("POST", `tickets/omnichannel/tickets/${ticket.data.id}/reply`, {
                locale,
                body: { body: draft.trim(), expected_version: ticket.data.version },
            });
        },
        onSuccess: async () => {
            setDraft("");
            await Promise.all([
                client.invalidateQueries({ queryKey: ["ticket-omnichannel", "ticket", selected] }),
                client.invalidateQueries({ queryKey: ["ticket-omnichannel", "conversations"] }),
                client.invalidateQueries({ queryKey: ["ticket-omnichannel", "integrations"] }),
            ]);
        },
    });
    const sendMedia = useMutation({
        mutationFn: () => {
            if (!ticket.data || !attachmentId) throw new Error("attachment missing");
            return apiMutate("POST", `tickets/omnichannel/tickets/${ticket.data.id}/media`, {
                locale,
                body: { attachment_id: attachmentId, caption: draft.trim(), expected_version: ticket.data.version },
            });
        },
        onSuccess: async () => {
            setDraft("");
            setAttachmentId(null);
            await Promise.all([
                client.invalidateQueries({ queryKey: ["ticket-omnichannel", "ticket", selected] }),
                client.invalidateQueries({ queryKey: ["ticket-omnichannel", "attachments", selected] }),
                client.invalidateQueries({ queryKey: ["ticket-omnichannel", "conversations"] }),
            ]);
        },
    });
    useEffect(() => {
        if (!selected) return;
        void apiMutate("POST", `tickets/omnichannel/tickets/${selected}/read`, { locale }).catch(() => undefined);
    }, [selected, locale]);
    useEffect(() => {
        if (!scrollRef.current || !ticket.data) return;
        scrollRef.current.scrollTop = state.scrollTop > 0 ? state.scrollTop : scrollRef.current.scrollHeight;
    }, [ticket.data, state.scrollTop]);
    return (
        <div className="grid min-h-[620px] overflow-hidden rounded-xl border bg-card lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_280px]">
            <aside className="border-b lg:border-e lg:border-b-0">
                <div className="border-b p-3">
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={locale === "en" ? "Search conversations…" : "جست‌وجوی گفتگو…"}
                    />
                </div>
                <div className="max-h-[560px] overflow-y-auto">
                    {conversations.isLoading ? (
                        <div className="space-y-2 p-3">
                            {[1, 2, 3, 4, 5].map((key) => (
                                <Skeleton key={key} className="h-16 w-full" />
                            ))}
                        </div>
                    ) : conversations.data?.length ? (
                        conversations.data.map((item) => (
                            <button
                                type="button"
                                key={item.id}
                                onClick={() => setSelected(item.id)}
                                className={cn(
                                    "w-full border-b p-3 text-start hover:bg-muted/40",
                                    selected === item.id && "bg-primary/5",
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="grid size-8 place-items-center rounded-full bg-muted font-semibold text-xs">
                                        {item.requester_name.slice(0, 1)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate font-medium text-xs">{item.requester_name}</span>
                                            <span className="text-[0.6rem] text-muted-foreground">
                                                {formatTime(item.last_message_at, locale)}
                                            </span>
                                        </div>
                                        <div className="mt-1 flex items-center gap-1.5">
                                            <SupportProviderIcon
                                                provider={provider.channel}
                                                className="size-3 text-muted-foreground"
                                            />
                                            <span className="truncate text-[0.65rem] text-muted-foreground">{item.subject}</span>
                                            {item.unread_count > 0 ? (
                                                <Badge className="ms-auto px-1.5 py-0 text-[0.55rem]">{item.unread_count}</Badge>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))
                    ) : (
                        <div className="p-8 text-center text-muted-foreground text-xs">
                            {locale === "en" ? "No real conversations yet." : "هنوز گفت‌وگوی واقعی ثبت نشده است."}
                        </div>
                    )}
                </div>
            </aside>
            <main className="flex min-w-0 flex-col">
                <div className="sticky top-0 z-10 flex min-h-14 items-center justify-between gap-3 border-b bg-card/95 px-4 backdrop-blur">
                    <div className="flex min-w-0 items-center gap-2">
                        <SupportProviderIcon provider={provider.channel} className="size-4" />
                        <div className="min-w-0">
                            <div className="truncate font-semibold text-sm">
                                {ticket.data?.requester_name ??
                                    (locale === "en" ? "Select a conversation" : "یک گفتگو را انتخاب کنید")}
                            </div>
                            <div className="text-[0.65rem] text-muted-foreground" dir="ltr">
                                {integration.account_identifier ?? provider.provider_key}
                            </div>
                        </div>
                    </div>
                    {ticket.data ? <Badge variant="outline">{ticket.data.reference}</Badge> : null}
                </div>
                <div
                    ref={scrollRef}
                    onScroll={(event) => onState({ scrollTop: event.currentTarget.scrollTop })}
                    className="flex-1 space-y-3 overflow-y-auto bg-muted/10 p-4"
                >
                    {ticket.isLoading ? (
                        <Skeleton className="h-40 w-full" />
                    ) : (
                        (ticket.data?.messages.map((message) => (
                            <div
                                key={message.id}
                                className={cn(
                                    "max-w-[82%] rounded-xl border px-3 py-2 text-xs shadow-sm",
                                    message.kind === "internal_note"
                                        ? "mx-auto border-warning/20 bg-warning/5"
                                        : message.direction === "inbound" || message.kind === "requester_message"
                                          ? "me-auto bg-card"
                                          : "ms-auto bg-primary/5",
                                )}
                            >
                                <div className="whitespace-pre-wrap leading-6">{message.body}</div>
                                <div className="mt-1 flex items-center justify-end gap-1.5 text-[0.58rem] text-muted-foreground">
                                    <span>{formatTime(message.created_at, locale)}</span>
                                    {message.delivery_state ? <span>· {message.delivery_state}</span> : null}
                                    {message.kind === "internal_note" ? (
                                        <span>· {locale === "en" ? "Internal only" : "فقط داخلی"}</span>
                                    ) : null}
                                </div>
                            </div>
                        )) ?? null)
                    )}
                </div>
                <div className="border-t p-3">
                    <div className="flex gap-2">
                        <Textarea
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            className="min-h-12 resize-none"
                            placeholder={
                                integration.status === "connected"
                                    ? locale === "en"
                                        ? "Write a reply…"
                                        : "پاسخ را بنویسید…"
                                    : locale === "en"
                                      ? "Connect this provider before replying."
                                      : "برای پاسخ، Provider را متصل کنید."
                            }
                            disabled={!ticket.data || integration.status !== "connected"}
                        />
                        <Button
                            onClick={() => send.mutate()}
                            disabled={
                                !draft.trim() ||
                                !ticket.data ||
                                integration.status !== "connected" ||
                                send.isPending ||
                                Boolean(attachmentId)
                            }
                        >
                            {locale === "en" ? "Send" : "ارسال"}
                        </Button>
                    </div>
                    {provider.capabilities.some((capability) =>
                        ["send_image", "send_document", "send_audio"].includes(capability),
                    ) && ticket.data ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <select
                                value={attachmentId ?? ""}
                                onChange={(event) => setAttachmentId(event.target.value ? Number(event.target.value) : null)}
                                className="h-8 min-w-48 rounded-md border bg-background px-2 text-[0.68rem]"
                            >
                                <option value="">{locale === "en" ? "Clean attachment…" : "پیوست اسکن‌شده…"}</option>
                                {cleanAttachments.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.filename}
                                    </option>
                                ))}
                            </select>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => sendMedia.mutate()}
                                disabled={!attachmentId || integration.status !== "connected" || sendMedia.isPending}
                            >
                                {locale === "en" ? "Send attachment" : "ارسال پیوست"}
                            </Button>
                            <span className="text-[0.62rem] text-muted-foreground">
                                {cleanAttachments.length
                                    ? locale === "en"
                                        ? "Only clean scanned Ticket attachments are eligible."
                                        : "فقط پیوست‌های Ticket با اسکن Clean قابل ارسال‌اند."
                                    : locale === "en"
                                      ? "No clean unsent attachment is available."
                                      : "پیوست Clean ارسال‌نشده‌ای موجود نیست."}
                            </span>
                        </div>
                    ) : null}
                    {send.isError || sendMedia.isError ? (
                        <div className="mt-2 text-danger text-xs">
                            {locale === "en"
                                ? "Send failed; Calibra did not mark the message delivered."
                                : "ارسال ناموفق بود؛ کالیبرا پیام را Delivered علامت نزد."}
                        </div>
                    ) : null}
                </div>
            </main>
            <aside className="hidden border-s 2xl:block">
                <div className="border-b p-4 font-semibold text-sm">{locale === "en" ? "Ticket context" : "کانتکست تیکت"}</div>
                {ticket.data ? (
                    <div className="space-y-3 p-4 text-xs">
                        <div>
                            <span className="text-muted-foreground">{locale === "en" ? "Status" : "وضعیت"}</span>
                            <div className="mt-1 font-medium">{ticket.data.status}</div>
                        </div>
                        <div>
                            <span className="text-muted-foreground">{locale === "en" ? "Priority" : "اولویت"}</span>
                            <div className="mt-1 font-medium">{ticket.data.priority}</div>
                        </div>
                        <div>
                            <span className="text-muted-foreground">{locale === "en" ? "Category" : "دسته"}</span>
                            <div className="mt-1 font-medium">{ticket.data.category ?? "—"}</div>
                        </div>
                        <div>
                            <span className="text-muted-foreground">SLA</span>
                            <div className="mt-1 font-medium">
                                {locale === "en" ? "See ticket detail for full timeline" : "جزئیات کامل در Timeline تیکت"}
                            </div>
                        </div>
                        <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-[0.68rem]">
                            {locale === "en"
                                ? "Internal notes remain inside Calibra and are never sent through this composer."
                                : "یادداشت داخلی فقط داخل کالیبرا می‌ماند و از این Composer هرگز به Provider ارسال نمی‌شود."}
                        </div>
                    </div>
                ) : (
                    <div className="p-6 text-muted-foreground text-xs">—</div>
                )}
            </aside>
        </div>
    );
}

function SecurityPane({ integration, locale }: { integration: Integration; locale: Locale }) {
    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
                [
                    locale === "en" ? "Credential status" : "وضعیت اعتبارنامه",
                    integration.credential_health.configured
                        ? locale === "en"
                            ? "Ready"
                            : "آماده"
                        : locale === "en"
                          ? "Incomplete"
                          : "ناقص",
                ],
                [locale === "en" ? "Token expiry" : "انقضای توکن", formatTime(integration.token_expires_at, locale)],
                [locale === "en" ? "Last rotation" : "آخرین چرخش", formatTime(integration.last_rotated_at, locale)],
                [locale === "en" ? "Last verified" : "آخرین تأیید", formatTime(integration.last_verified_at, locale)],
                [locale === "en" ? "Webhook signature" : "امضای وب‌هوک", integration.webhook_status],
                [locale === "en" ? "Failed verifications" : "تأییدهای ناموفق", String(integration.failed_verification_attempts)],
            ].map(([label, value]) => (
                <Card key={label}>
                    <CardContent className="p-4">
                        <div className="text-[0.68rem] text-muted-foreground">{label}</div>
                        <div className="mt-2 font-semibold text-sm">{value}</div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

function LogsPane({ integration, locale }: { integration: Integration; locale: Locale }) {
    const logs = useQuery({
        queryKey: ["ticket-omnichannel", "logs", integration.channel],
        queryFn: ({ signal }) =>
            apiGet<Envelope<Array<Record<string, unknown>>>>(`tickets/omnichannel/${integration.channel}/logs`, {
                locale,
                signal,
            }),
        select: (value) => value.data,
    });
    return (
        <div className="overflow-hidden rounded-xl border">
            <div className="grid grid-cols-[1fr_1fr_1fr_2fr] border-b bg-muted/30 px-3 py-2 font-medium text-[0.65rem]">
                <span>{locale === "en" ? "Time" : "زمان"}</span>
                <span>{locale === "en" ? "Event" : "رویداد"}</span>
                <span>{locale === "en" ? "State" : "وضعیت"}</span>
                <span>{locale === "en" ? "Reason" : "دلیل"}</span>
            </div>
            {logs.data?.length ? (
                logs.data.map((row) => (
                    <div
                        key={String(row.id)}
                        className="grid grid-cols-[1fr_1fr_1fr_2fr] border-b px-3 py-2 text-[0.65rem] last:border-0"
                    >
                        <span dir="ltr">{formatTime(String(row.created_at ?? ""), locale)}</span>
                        <span>{String(row.event_type ?? "")}</span>
                        <span>{String(row.to_state ?? "—")}</span>
                        <span className="truncate">{String(row.safe_message ?? row.reason_code ?? "—")}</span>
                    </div>
                ))
            ) : (
                <div className="p-8 text-center text-muted-foreground text-xs">
                    {locale === "en" ? "No connection history yet." : "هنوز تاریخچه اتصال ثبت نشده است."}
                </div>
            )}
        </div>
    );
}

export function TicketChannelsPage() {
    const locale = useLocale() as Locale;
    const catalog = useQuery({
        queryKey: ["ticket-omnichannel", "catalog"],
        queryFn: ({ signal }) => apiGet<Envelope<Provider[]>>("tickets/omnichannel/catalog", { locale, signal }),
        select: (value) => value.data,
    });
    const integrations = useQuery({
        queryKey: ["ticket-omnichannel", "integrations"],
        queryFn: ({ signal }) => apiGet<Envelope<Integration[]>>("tickets/omnichannel/integrations", { locale, signal }),
        select: (value) => value.data,
        refetchInterval: 30_000,
    });
    const providersByKey = useMemo(
        () => new Map((catalog.data ?? []).map((item) => [`${item.channel}:${item.provider_key}`, item])),
        [catalog.data],
    );
    const integrationsByKey = useMemo(
        () => new Map((integrations.data ?? []).map((item) => [`${item.channel}:${item.provider_key}`, item])),
        [integrations.data],
    );
    const visibleKeys = useMemo(
        () =>
            PRIMARY.flatMap((channel) =>
                (catalog.data ?? [])
                    .filter((item) => item.channel === channel)
                    .map((item) => `${item.channel}:${item.provider_key}`),
            ),
        [catalog.data],
    );
    const [opened, setOpened] = useState<string[]>([]);
    const [active, setActive] = useState("");
    const [section, setSection] = useState<Section>("connections");
    const [chatStates, setChatStates] = useState<Record<string, ChatState>>({});
    useEffect(() => {
        if (!active && visibleKeys[0]) {
            setActive(visibleKeys[0]);
            setOpened([visibleKeys[0]]);
        }
    }, [active, visibleKeys]);
    const provider = providersByKey.get(active);
    const integration = integrationsByKey.get(active);
    function open(key: string) {
        setActive(key);
        setOpened((current) => (current.includes(key) ? current : [...current, key]));
    }
    function close(key: string) {
        setOpened((current) => {
            const next = current.filter((item) => item !== key);
            if (active === key) setActive(next.at(-1) ?? visibleKeys[0] ?? "");
            return next;
        });
    }
    const updateActiveChatState = useCallback(
        (patch: Partial<ChatState>) => {
            setChatStates((current) => ({ ...current, [active]: { ...(current[active] ?? EMPTY_CHAT_STATE), ...patch } }));
        },
        [active],
    );
    return (
        <div className="space-y-5">
            <SupportPageHeader
                eyebrow={locale === "en" ? "Tickets" : "تیکت‌ها"}
                title={locale === "en" ? "Channels" : "کانال‌ها"}
                subtitle={
                    locale === "en"
                        ? "Production-grade omnichannel connections, conversations, credentials, webhooks and health inside Tickets."
                        : "اتصال، گفتگو، اعتبارنامه، وب‌هوک و Health واقعی همه کانال‌ها داخل Tickets؛ بدون وضعیت جعلی."
                }
            />
            {catalog.isLoading || integrations.isLoading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map((key) => (
                        <Skeleton key={key} className="h-40 w-full" />
                    ))}
                </div>
            ) : (
                <>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {visibleKeys.map((key) => {
                            const p = providersByKey.get(key);
                            const i = integrationsByKey.get(key);
                            return p && i ? (
                                <ProviderCard
                                    key={key}
                                    provider={p}
                                    integration={i}
                                    active={active === key}
                                    locale={locale}
                                    onOpen={() => open(key)}
                                />
                            ) : null;
                        })}
                    </div>
                    <Card className="overflow-hidden">
                        <InternalTabs
                            opened={opened}
                            active={active}
                            integrations={integrationsByKey}
                            providers={providersByKey}
                            locale={locale}
                            onSelect={setActive}
                            onClose={close}
                        />
                        {provider && integration ? (
                            <>
                                <div className="flex gap-1 overflow-x-auto border-b px-3 py-2">
                                    {SECTIONS.map((item) => (
                                        <button
                                            key={item}
                                            type="button"
                                            onClick={() => setSection(item)}
                                            className={cn(
                                                "rounded-md px-3 py-1.5 text-xs",
                                                section === item
                                                    ? "bg-primary text-primary-foreground"
                                                    : "text-muted-foreground hover:bg-muted",
                                            )}
                                        >
                                            {locale === "en"
                                                ? (
                                                      {
                                                          connections: "Connections",
                                                          chats: "Chats",
                                                          security: "Security",
                                                          webhooks: "Webhooks",
                                                          logs: "Logs",
                                                      } as Record<Section, string>
                                                  )[item]
                                                : (
                                                      {
                                                          connections: "اتصال",
                                                          chats: "گفتگوها",
                                                          security: "امنیت",
                                                          webhooks: "وب‌هوک",
                                                          logs: "لاگ‌ها",
                                                      } as Record<Section, string>
                                                  )[item]}
                                        </button>
                                    ))}
                                </div>
                                <div className="p-4">
                                    {section === "connections" ? (
                                        <ConfigurationPane provider={provider} integration={integration} locale={locale} />
                                    ) : section === "chats" ? (
                                        <ChatPane
                                            provider={provider}
                                            integration={integration}
                                            locale={locale}
                                            state={chatStates[active] ?? EMPTY_CHAT_STATE}
                                            onState={updateActiveChatState}
                                        />
                                    ) : section === "security" ? (
                                        provider.channel === "api" ? (
                                            <ApiChannelPane locale={locale} mode="security" />
                                        ) : (
                                            <SecurityPane integration={integration} locale={locale} />
                                        )
                                    ) : section === "webhooks" ? (
                                        provider.channel === "api" ? (
                                            <ApiChannelPane locale={locale} mode="webhooks" />
                                        ) : (
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <Card>
                                                    <CardContent className="p-4">
                                                        <div className="flex items-center gap-2 font-semibold text-sm">
                                                            <ShieldCheck className="size-4" />
                                                            {locale === "en" ? "Webhook health" : "سلامت وب‌هوک"}
                                                        </div>
                                                        <div className="mt-4 space-y-2 text-xs">
                                                            <div className="flex justify-between">
                                                                <span className="text-muted-foreground">Status</span>
                                                                <span>{integration.webhook_status}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-muted-foreground">
                                                                    {locale === "en" ? "Verified" : "تأیید"}
                                                                </span>
                                                                <span dir="ltr">
                                                                    {formatTime(integration.webhook_verified_at, locale)}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-muted-foreground">
                                                                    {locale === "en" ? "Last event" : "آخرین رویداد"}
                                                                </span>
                                                                <span dir="ltr">
                                                                    {formatTime(integration.last_webhook_at, locale)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                                <Card>
                                                    <CardContent className="p-4 text-muted-foreground text-xs">
                                                        {locale === "en"
                                                            ? "Webhook URLs are generated server-side from the current tenant origin. Secrets are never revealed after saving; Meta signatures, Telegram secret headers and provider-specific verification are validated before ingest."
                                                            : "URL وب‌هوک سمت سرور از Origin همان Tenant ساخته می‌شود. Secret پس از ذخیره نمایش داده نمی‌شود و پیش از ورود پیام، امضای Meta، Secret Header تلگرام و اعتبارسنجی اختصاصی Provider بررسی می‌شود."}
                                                    </CardContent>
                                                </Card>
                                            </div>
                                        )
                                    ) : provider.channel === "api" ? (
                                        <ApiChannelPane locale={locale} mode="logs" />
                                    ) : (
                                        <LogsPane integration={integration} locale={locale} />
                                    )}
                                </div>
                            </>
                        ) : null}
                    </Card>
                </>
            )}
        </div>
    );
}
