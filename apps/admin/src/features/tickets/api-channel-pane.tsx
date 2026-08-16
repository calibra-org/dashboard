"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { KeyRound, ShieldCheck } from "#/icons";
import { apiGet, apiMutate } from "#/lib/queries/api-client";

type Envelope<T> = { data: T };
type ApiKey = {
    id: number;
    name: string;
    key_prefix: string;
    scopes: string[];
    allowed_ips: string[];
    rate_limit_per_minute: number;
    expires_at: string | null;
    last_used_at: string | null;
    revoked_at: string | null;
    created_at: string;
};
type ApiKeyCreated = ApiKey & { secret: string };
type ApiWebhook = {
    id: number;
    name: string;
    url: string;
    events: string[];
    secret_prefix: string;
    active: boolean;
    last_delivery_at: string | null;
    last_error: string | null;
    created_at: string;
};
type ApiWebhookCreated = ApiWebhook & { signing_secret: string };
type RequestLog = {
    id: number;
    request_id: string | null;
    method: string;
    path: string;
    status_code: number;
    ip: string | null;
    error_code: string | null;
    duration_ms: number | null;
    created_at: string;
};

const SCOPES = ["tickets.read", "tickets.write", "messages.read", "messages.send", "webhooks.manage"] as const;
const EVENTS = [
    "ticket.created",
    "ticket.updated",
    "message.sent",
    "message.received",
    "message.delivered",
    "message.read",
    "message.failed",
] as const;

function when(value: string | null, locale: Locale) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "—"
        : new Intl.DateTimeFormat(locale === "en" ? "en" : "fa-IR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function OneTimeSecret({ value, locale }: { value: string; locale: Locale }) {
    return (
        <div className="rounded-xl border border-warning/25 bg-warning/5 p-3">
            <div className="font-semibold text-xs">
                {locale === "en" ? "Copy now — shown once" : "همین حالا کپی کنید — فقط یک‌بار نمایش داده می‌شود"}
            </div>
            <code className="mt-2 block overflow-x-auto rounded-md bg-background p-2 text-[0.68rem]" dir="ltr">
                {value}
            </code>
        </div>
    );
}

export function ApiChannelPane({ locale, mode }: { locale: Locale; mode: "security" | "webhooks" | "logs" }) {
    const client = useQueryClient();
    const keys = useQuery({
        queryKey: ["ticket-omnichannel", "api-keys"],
        queryFn: ({ signal }) => apiGet<Envelope<ApiKey[]>>("tickets/omnichannel/api-keys/list", { locale, signal }),
        select: (value) => value.data,
        enabled: mode === "security",
    });
    const hooks = useQuery({
        queryKey: ["ticket-omnichannel", "api-webhooks"],
        queryFn: ({ signal }) => apiGet<Envelope<ApiWebhook[]>>("tickets/omnichannel/api-webhooks/list", { locale, signal }),
        select: (value) => value.data,
        enabled: mode === "webhooks",
    });
    const logs = useQuery({
        queryKey: ["ticket-omnichannel", "api-request-logs"],
        queryFn: ({ signal }) => apiGet<Envelope<RequestLog[]>>("tickets/omnichannel/api-request-logs/list", { locale, signal }),
        select: (value) => value.data,
        enabled: mode === "logs",
    });
    const [secret, setSecret] = useState<string | null>(null);
    const [webhookSecret, setWebhookSecret] = useState<string | null>(null);

    const createKey = useMutation({
        mutationFn: (body: unknown) =>
            apiMutate<Envelope<ApiKeyCreated>>("POST", "tickets/omnichannel/api-keys", { locale, body }),
        onSuccess: async (result) => {
            setSecret(result.data.secret);
            await client.invalidateQueries({ queryKey: ["ticket-omnichannel", "api-keys"] });
        },
    });
    const rotateKey = useMutation({
        mutationFn: (id: number) =>
            apiMutate<Envelope<ApiKeyCreated>>("POST", `tickets/omnichannel/api-keys/${id}/rotate`, { locale }),
        onSuccess: async (result) => {
            setSecret(result.data.secret);
            await client.invalidateQueries({ queryKey: ["ticket-omnichannel", "api-keys"] });
        },
    });
    const revokeKey = useMutation({
        mutationFn: (id: number) => apiMutate("POST", `tickets/omnichannel/api-keys/${id}/revoke`, { locale }),
        onSuccess: async () => client.invalidateQueries({ queryKey: ["ticket-omnichannel", "api-keys"] }),
    });
    const createWebhook = useMutation({
        mutationFn: (body: unknown) =>
            apiMutate<Envelope<ApiWebhookCreated>>("POST", "tickets/omnichannel/api-webhooks", { locale, body }),
        onSuccess: async (result) => {
            setWebhookSecret(result.data.signing_secret);
            await client.invalidateQueries({ queryKey: ["ticket-omnichannel", "api-webhooks"] });
        },
    });
    const rotateWebhook = useMutation({
        mutationFn: (id: number) =>
            apiMutate<Envelope<ApiWebhookCreated>>("POST", `tickets/omnichannel/api-webhooks/${id}/rotate`, { locale }),
        onSuccess: async (result) => {
            setWebhookSecret(result.data.signing_secret);
            await client.invalidateQueries({ queryKey: ["ticket-omnichannel", "api-webhooks"] });
        },
    });
    const revokeWebhook = useMutation({
        mutationFn: (id: number) => apiMutate("POST", `tickets/omnichannel/api-webhooks/${id}/revoke`, { locale }),
        onSuccess: async () => client.invalidateQueries({ queryKey: ["ticket-omnichannel", "api-webhooks"] }),
    });

    async function submitKey(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const scopes = SCOPES.filter((scope) => form.get(`scope:${scope}`) === "on");
        const allowedIps = String(form.get("allowed_ips") ?? "")
            .split(/[\n,]+/)
            .map((item) => item.trim())
            .filter(Boolean);
        await createKey.mutateAsync({
            name: String(form.get("name") ?? "").trim(),
            scopes,
            allowed_ips: allowedIps,
            rate_limit_per_minute: Number(form.get("rate_limit_per_minute") ?? 120),
            expires_at: String(form.get("expires_at") ?? "").trim() || null,
        });
        event.currentTarget.reset();
    }

    async function submitWebhook(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const events = EVENTS.filter((item) => form.get(`event:${item}`) === "on");
        await createWebhook.mutateAsync({
            name: String(form.get("name") ?? "").trim(),
            url: String(form.get("url") ?? "").trim(),
            events,
        });
        event.currentTarget.reset();
    }

    if (mode === "security")
        return (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-3">
                    {secret ? <OneTimeSecret value={secret} locale={locale} /> : null}
                    {(keys.data ?? []).length ? (
                        keys.data?.map((key) => (
                            <Card key={key.id}>
                                <CardContent className="p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="font-semibold text-sm">{key.name}</div>
                                            <code className="mt-1 block text-[0.65rem] text-muted-foreground" dir="ltr">
                                                {key.key_prefix}••••••••
                                            </code>
                                        </div>
                                        <Badge variant="outline">
                                            {key.revoked_at
                                                ? locale === "en"
                                                    ? "Revoked"
                                                    : "لغوشده"
                                                : locale === "en"
                                                  ? "Active"
                                                  : "فعال"}
                                        </Badge>
                                    </div>
                                    <div className="mt-3 grid gap-2 text-[0.68rem] sm:grid-cols-2">
                                        <span>{key.scopes.join(", ")}</span>
                                        <span>
                                            {locale === "en"
                                                ? `Rate: ${key.rate_limit_per_minute}/min`
                                                : `نرخ: ${key.rate_limit_per_minute}/دقیقه`}
                                        </span>
                                        <span>
                                            {locale === "en" ? "Last used" : "آخرین استفاده"}: {when(key.last_used_at, locale)}
                                        </span>
                                        <span>
                                            {locale === "en" ? "Expires" : "انقضا"}: {when(key.expires_at, locale)}
                                        </span>
                                    </div>
                                    {!key.revoked_at ? (
                                        <div className="mt-3 flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => rotateKey.mutate(key.id)}
                                                disabled={rotateKey.isPending}
                                            >
                                                {locale === "en" ? "Rotate" : "چرخش کلید"}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => revokeKey.mutate(key.id)}
                                                disabled={revokeKey.isPending}
                                            >
                                                {locale === "en" ? "Revoke" : "لغو"}
                                            </Button>
                                        </div>
                                    ) : null}
                                </CardContent>
                            </Card>
                        ))
                    ) : (
                        <div className="rounded-xl border p-8 text-center text-muted-foreground text-xs">
                            {locale === "en" ? "No API keys created yet." : "هنوز API Key ساخته نشده است."}
                        </div>
                    )}
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <KeyRound className="size-4" />
                            {locale === "en" ? "Create API key" : "ساخت API Key"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={submitKey} className="space-y-3">
                            <Input required name="name" placeholder={locale === "en" ? "Integration name" : "نام یکپارچه‌سازی"} />
                            <div className="space-y-1.5">
                                {SCOPES.map((scope) => (
                                    <label key={scope} className="flex items-center gap-2 text-xs">
                                        <input
                                            type="checkbox"
                                            name={`scope:${scope}`}
                                            defaultChecked={scope === "tickets.read" || scope === "messages.send"}
                                        />
                                        <code>{scope}</code>
                                    </label>
                                ))}
                            </div>
                            <Textarea
                                name="allowed_ips"
                                className="min-h-20"
                                placeholder={
                                    locale === "en"
                                        ? "Allowed IPs, one per line (optional)"
                                        : "IPهای مجاز، هر خط یک مورد (اختیاری)"
                                }
                            />
                            <Input type="number" name="rate_limit_per_minute" min={1} max={10000} defaultValue={120} />
                            <Input type="datetime-local" name="expires_at" />
                            <Button type="submit" disabled={createKey.isPending}>
                                {locale === "en" ? "Create" : "ساخت"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );

    if (mode === "webhooks")
        return (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-3">
                    {webhookSecret ? <OneTimeSecret value={webhookSecret} locale={locale} /> : null}
                    {(hooks.data ?? []).length ? (
                        hooks.data?.map((hook) => (
                            <Card key={hook.id}>
                                <CardContent className="p-4">
                                    <div className="flex justify-between gap-3">
                                        <div>
                                            <div className="font-semibold text-sm">{hook.name}</div>
                                            <div className="mt-1 break-all text-[0.65rem] text-muted-foreground" dir="ltr">
                                                {hook.url}
                                            </div>
                                        </div>
                                        <Badge variant="outline">
                                            {hook.active
                                                ? locale === "en"
                                                    ? "Active"
                                                    : "فعال"
                                                : locale === "en"
                                                  ? "Revoked"
                                                  : "لغوشده"}
                                        </Badge>
                                    </div>
                                    <div className="mt-3 text-[0.68rem]">{hook.events.join(", ")}</div>
                                    <div className="mt-2 text-[0.68rem] text-muted-foreground">
                                        {locale === "en" ? "Last delivery" : "آخرین تحویل"}: {when(hook.last_delivery_at, locale)}
                                        {hook.last_error ? ` · ${hook.last_error}` : ""}
                                    </div>
                                    {hook.active ? (
                                        <div className="mt-3 flex gap-2">
                                            <Button size="sm" variant="outline" onClick={() => rotateWebhook.mutate(hook.id)}>
                                                {locale === "en" ? "Rotate secret" : "چرخش Secret"}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => revokeWebhook.mutate(hook.id)}>
                                                {locale === "en" ? "Revoke" : "لغو"}
                                            </Button>
                                        </div>
                                    ) : null}
                                </CardContent>
                            </Card>
                        ))
                    ) : (
                        <div className="rounded-xl border p-8 text-center text-muted-foreground text-xs">
                            {locale === "en" ? "No outbound webhook subscriptions yet." : "هنوز Webhook خروجی ساخته نشده است."}
                        </div>
                    )}
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-sm">
                            <ShieldCheck className="size-4" />
                            {locale === "en" ? "Create signed webhook" : "ساخت Webhook امضاشده"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={submitWebhook} className="space-y-3">
                            <Input required name="name" placeholder={locale === "en" ? "Subscription name" : "نام اشتراک"} />
                            <Input required type="url" name="url" placeholder="https://example.com/calibra-hook" dir="ltr" />
                            <div className="space-y-1.5">
                                {EVENTS.map((item) => (
                                    <label key={item} className="flex items-center gap-2 text-xs">
                                        <input
                                            type="checkbox"
                                            name={`event:${item}`}
                                            defaultChecked={item === "ticket.created" || item === "message.sent"}
                                        />
                                        <code>{item}</code>
                                    </label>
                                ))}
                            </div>
                            <Button type="submit" disabled={createWebhook.isPending}>
                                {locale === "en" ? "Create webhook" : "ساخت وب‌هوک"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );

    return (
        <div className="overflow-hidden rounded-xl border">
            <div className="grid grid-cols-[1fr_1fr_2fr_1fr_1fr] border-b bg-muted/30 px-3 py-2 font-medium text-[0.65rem]">
                <span>{locale === "en" ? "Time" : "زمان"}</span>
                <span>Method</span>
                <span>Path</span>
                <span>Status</span>
                <span>{locale === "en" ? "Error" : "خطا"}</span>
            </div>
            {logs.data?.length ? (
                logs.data.map((row) => (
                    <div
                        key={row.id}
                        className="grid grid-cols-[1fr_1fr_2fr_1fr_1fr] border-b px-3 py-2 text-[0.65rem] last:border-0"
                    >
                        <span dir="ltr">{when(row.created_at, locale)}</span>
                        <span>{row.method}</span>
                        <span className="truncate" dir="ltr">
                            {row.path}
                        </span>
                        <span>{row.status_code}</span>
                        <span>{row.error_code ?? "—"}</span>
                    </div>
                ))
            ) : (
                <div className="p-8 text-center text-muted-foreground text-xs">
                    {locale === "en" ? "No API requests have been recorded." : "هنوز درخواست API ثبت نشده است."}
                </div>
            )}
        </div>
    );
}
