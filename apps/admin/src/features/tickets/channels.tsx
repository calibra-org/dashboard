"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { type FormEvent, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { AlertCircle, CheckCircle2, Clock3, KeyRound, Radio, Save, ShieldCheck, SlidersHorizontal } from "#/icons";
import { cn } from "#/lib/utils";

import { useSupportChannels, useUpdateSupportChannel } from "./queries";
import { channelStatusTone, SupportPageHeader, supportChannelLabel, supportChannelStatusLabel } from "./ui";
import type { SupportChannel, SupportChannelIntegration } from "./types";

const PRIMARY_CHANNELS: SupportChannel[] = ["whatsapp", "telegram", "instagram", "rubika", "bale", "eitaa"];
const SECONDARY_CHANNELS: SupportChannel[] = ["sms", "email", "web", "phone", "api"];

function stringValue(config: Record<string, unknown>, key: string): string {
    return typeof config[key] === "string" ? String(config[key]) : "";
}

function booleanValue(config: Record<string, unknown>, key: string, fallback = false): boolean {
    return typeof config[key] === "boolean" ? Boolean(config[key]) : fallback;
}

function ChannelCard({
    channel,
    selected,
    locale,
    index,
    onSelect,
    onToggle,
    busy,
}: {
    channel: SupportChannelIntegration;
    selected: boolean;
    locale: Locale;
    index: number;
    onSelect: () => void;
    onToggle: (enabled: boolean) => void;
    busy: boolean;
}) {
    return (
        <Card
            className={cn(
                "overflow-hidden shadow-sm transition-[border-color,box-shadow]",
                selected ? "border-primary/35 ring-1 ring-primary/10" : "hover:border-primary/20 hover:shadow-md",
            )}
        >
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-start">
                        <div className="flex items-center gap-3">
                            <span className="relative grid size-10 shrink-0 place-items-center rounded-xl border bg-muted/40">
                                <Radio className="size-4" aria-hidden="true" />
                                <span className="absolute -end-1 -top-1 grid size-4 place-items-center rounded-full border bg-card text-[0.55rem] text-muted-foreground">
                                    {index + 1}
                                </span>
                            </span>
                            <div className="min-w-0">
                                <div className="truncate font-medium text-sm">{supportChannelLabel(channel.channel, locale)}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    <Badge variant="outline" className={channelStatusTone(channel.status)}>
                                        {supportChannelStatusLabel(channel.status, locale)}
                                    </Badge>
                                    {channel.credential_configured ? (
                                        <Badge variant="outline" className="border-success/20 text-success">
                                            {locale === "en" ? "Credential ready" : "اعتبارنامه موجود"}
                                        </Badge>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </button>
                    <Switch
                        checked={channel.status !== "disabled"}
                        disabled={busy}
                        onCheckedChange={onToggle}
                        aria-label={`${supportChannelLabel(channel.channel, locale)} ${locale === "en" ? "enabled" : "فعال"}`}
                    />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-[0.65rem] text-muted-foreground">
                    <span>{locale === "en" ? "Last verified" : "آخرین تأیید"}</span>
                    <span className="truncate" dir="ltr">
                        {channel.last_verified_at ?? "—"}
                    </span>
                </div>
                {channel.last_error ? (
                    <div className="mt-3 flex gap-2 rounded-lg border border-danger/15 bg-danger/5 p-2.5 text-[0.68rem] text-danger">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        <span className="line-clamp-2">{channel.last_error}</span>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}

function ChannelConfigurationForm({
    selected,
    locale,
    onSave,
    pending,
    success,
    error,
}: {
    selected: SupportChannelIntegration;
    locale: Locale;
    onSave: (payload: { credential_env_ref: string | null; configuration: Record<string, unknown> }) => Promise<void>;
    pending: boolean;
    success: boolean;
    error: boolean;
}) {
    const configuration = selected.configuration ?? {};
    const [autoReply, setAutoReply] = useState(() => booleanValue(configuration, "auto_reply_enabled"));
    const [syncIncoming, setSyncIncoming] = useState(() => booleanValue(configuration, "sync_incoming", true));
    const [incomingWebhook, setIncomingWebhook] = useState(() => booleanValue(configuration, "incoming_webhook_enabled", true));
    const [deliveryNotifications, setDeliveryNotifications] = useState(() =>
        booleanValue(configuration, "delivery_status_notifications", true),
    );
    const [errorAlerts, setErrorAlerts] = useState(() => booleanValue(configuration, "connection_error_alerts", true));
    const [fallbackEnabled, setFallbackEnabled] = useState(() => booleanValue(configuration, "fallback_enabled"));
    const [jsonError, setJsonError] = useState(false);

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setJsonError(false);
        const form = new FormData(event.currentTarget);
        let advanced: Record<string, unknown> = {};
        try {
            const raw = String(form.get("advanced_configuration") ?? "{}").trim();
            const parsed = JSON.parse(raw || "{}") as unknown;
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
            advanced = parsed as Record<string, unknown>;
        } catch {
            setJsonError(true);
            return;
        }
        const next = {
            ...advanced,
            account_label: String(form.get("account_label") ?? "").trim(),
            default_sender: String(form.get("default_sender") ?? "").trim(),
            default_team: String(form.get("default_team") ?? "").trim(),
            working_hours_start: String(form.get("working_hours_start") ?? "").trim(),
            working_hours_end: String(form.get("working_hours_end") ?? "").trim(),
            auto_reply_enabled: autoReply,
            auto_reply_message: String(form.get("auto_reply_message") ?? "").trim(),
            sync_incoming: syncIncoming,
            incoming_webhook_enabled: incomingWebhook,
            webhook_url: String(form.get("webhook_url") ?? "").trim(),
            delivery_status_notifications: deliveryNotifications,
            connection_error_alerts: errorAlerts,
            fallback_enabled: fallbackEnabled,
            fallback_channel: String(form.get("fallback_channel") ?? "").trim(),
        };
        await onSave({
            credential_env_ref: String(form.get("credential_env_ref") ?? "").trim() || null,
            configuration: next,
        });
    }

    return (
        <form onSubmit={save} className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs sm:col-span-2">
                    <span className="font-medium">
                        {locale === "en" ? "Credential environment reference" : "نام متغیر محیطی اعتبارنامه"}
                    </span>
                    <Input
                        name="credential_env_ref"
                        defaultValue={selected.credential_env_ref ?? ""}
                        placeholder="CALIBRA_SUPPORT_WHATSAPP_TOKEN"
                        dir="ltr"
                        pattern="CALIBRA_SUPPORT_[A-Z0-9_]+"
                    />
                    <span className="block text-[0.65rem] text-muted-foreground">
                        {locale === "en"
                            ? "Only the environment variable name is stored; the secret value is never shown here."
                            : "فقط نام متغیر محیطی ذخیره می‌شود؛ مقدار رمز در پنل نمایش داده نمی‌شود."}
                    </span>
                </label>
                <label className="space-y-1.5 text-xs">
                    <span className="font-medium">{locale === "en" ? "Account / bot identifier" : "شناسه حساب / ربات"}</span>
                    <Input name="account_label" defaultValue={stringValue(configuration, "account_label")} dir="auto" />
                </label>
                <label className="space-y-1.5 text-xs">
                    <span className="font-medium">{locale === "en" ? "Default sender" : "فرستنده پیش‌فرض"}</span>
                    <Input name="default_sender" defaultValue={stringValue(configuration, "default_sender")} />
                </label>
                <label className="space-y-1.5 text-xs sm:col-span-2">
                    <span className="font-medium">{locale === "en" ? "Default support team" : "تیم پشتیبانی پیش‌فرض"}</span>
                    <Input name="default_team" defaultValue={stringValue(configuration, "default_team")} />
                </label>
            </div>

            <div className="rounded-xl border p-4">
                <div className="mb-3 flex items-center gap-2 font-medium text-sm">
                    <Clock3 className="size-4 text-primary" aria-hidden="true" />
                    {locale === "en" ? "Working hours & fallback" : "ساعات پاسخ‌گویی و مسیر جایگزین"}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 text-xs">
                        <span className="font-medium">{locale === "en" ? "Start" : "شروع"}</span>
                        <Input
                            type="time"
                            name="working_hours_start"
                            defaultValue={stringValue(configuration, "working_hours_start")}
                            dir="ltr"
                        />
                    </label>
                    <label className="space-y-1.5 text-xs">
                        <span className="font-medium">{locale === "en" ? "End" : "پایان"}</span>
                        <Input
                            type="time"
                            name="working_hours_end"
                            defaultValue={stringValue(configuration, "working_hours_end")}
                            dir="ltr"
                        />
                    </label>
                    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 sm:col-span-2">
                        <div>
                            <div className="font-medium text-xs">
                                {locale === "en" ? "Enable fallback" : "فعال‌سازی مسیر جایگزین"}
                            </div>
                            <div className="mt-1 text-[0.65rem] text-muted-foreground">
                                {locale === "en"
                                    ? "Store the fallback preference for this channel."
                                    : "مسیر جایگزین این کانال را در پیکربندی نگه‌داری می‌کند."}
                            </div>
                        </div>
                        <Switch checked={fallbackEnabled} onCheckedChange={setFallbackEnabled} />
                    </div>
                    <label className="space-y-1.5 text-xs sm:col-span-2">
                        <span className="font-medium">{locale === "en" ? "Fallback channel key" : "کلید کانال جایگزین"}</span>
                        <Input
                            name="fallback_channel"
                            defaultValue={stringValue(configuration, "fallback_channel")}
                            placeholder="sms"
                            dir="ltr"
                            disabled={!fallbackEnabled}
                        />
                    </label>
                </div>
            </div>

            <div className="rounded-xl border p-4">
                <div className="mb-3 flex items-center gap-2 font-medium text-sm">
                    <AlertCircle className="size-4 text-primary" aria-hidden="true" />
                    {locale === "en" ? "Automatic reply" : "پاسخ خودکار"}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                    <div>
                        <div className="font-medium text-xs">
                            {locale === "en" ? "Enable auto reply" : "فعال‌سازی پاسخ خودکار"}
                        </div>
                        <div className="mt-1 text-[0.65rem] text-muted-foreground">
                            {locale === "en"
                                ? "This only stores configuration; actual delivery still requires a verified adapter."
                                : "این گزینه فقط پیکربندی را ذخیره می‌کند؛ ارسال واقعی همچنان به آداپتر تأییدشده نیاز دارد."}
                        </div>
                    </div>
                    <Switch checked={autoReply} onCheckedChange={setAutoReply} />
                </div>
                <Textarea
                    name="auto_reply_message"
                    defaultValue={stringValue(configuration, "auto_reply_message")}
                    className="mt-3 min-h-24"
                    maxLength={4000}
                    disabled={!autoReply}
                    placeholder={locale === "en" ? "Automatic acknowledgement message…" : "متن پاسخ خودکار…"}
                />
            </div>

            <div className="rounded-xl border p-4">
                <div className="mb-3 flex items-center gap-2 font-medium text-sm">
                    <Radio className="size-4 text-primary" aria-hidden="true" />
                    {locale === "en" ? "Webhook & synchronization" : "وب‌هوک و همگام‌سازی"}
                </div>
                <div className="space-y-2">
                    {[
                        [syncIncoming, setSyncIncoming, locale === "en" ? "Sync incoming messages" : "همگام‌سازی پیام‌های ورودی"],
                        [incomingWebhook, setIncomingWebhook, locale === "en" ? "Incoming webhook" : "وب‌هوک پیام ورودی"],
                        [
                            deliveryNotifications,
                            setDeliveryNotifications,
                            locale === "en" ? "Delivery status updates" : "به‌روزرسانی وضعیت تحویل",
                        ],
                        [errorAlerts, setErrorAlerts, locale === "en" ? "Connection/error alerts" : "هشدار اتصال و خطا"],
                    ].map(([checked, setter, label]) => (
                        <div
                            key={String(label)}
                            className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                        >
                            <span className="text-xs">{String(label)}</span>
                            <Switch checked={Boolean(checked)} onCheckedChange={setter as (value: boolean) => void} />
                        </div>
                    ))}
                    <label className="block space-y-1.5 pt-1 text-xs">
                        <span className="font-medium">{locale === "en" ? "Webhook URL" : "آدرس وب‌هوک"}</span>
                        <Input
                            name="webhook_url"
                            defaultValue={stringValue(configuration, "webhook_url")}
                            placeholder="https://..."
                            dir="ltr"
                            disabled={!incomingWebhook}
                        />
                    </label>
                </div>
            </div>

            <details className="rounded-xl border bg-muted/10">
                <summary className="cursor-pointer px-4 py-3 font-medium text-xs">
                    {locale === "en" ? "Advanced provider configuration (JSON)" : "پیکربندی پیشرفته ارائه‌دهنده (JSON)"}
                </summary>
                <div className="border-t p-4">
                    <Textarea
                        name="advanced_configuration"
                        defaultValue={JSON.stringify(configuration, null, 2)}
                        dir="ltr"
                        className="min-h-48 font-mono text-xs"
                    />
                    <p className="mt-2 text-[0.65rem] text-muted-foreground">
                        {locale === "en"
                            ? "Unknown provider-specific keys are preserved. Structured fields above take precedence when saving."
                            : "کلیدهای اختصاصی ناشناخته حفظ می‌شوند و هنگام ذخیره، فیلدهای ساختاریافته بالا اولویت دارند."}
                    </p>
                </div>
            </details>

            <div className="rounded-xl border bg-muted/20 p-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{locale === "en" ? "Stored state" : "وضعیت ثبت‌شده"}</span>
                    <Badge variant="outline" className={channelStatusTone(selected.status)}>
                        {supportChannelStatusLabel(selected.status, locale)}
                    </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{locale === "en" ? "Runtime credential" : "اعتبارنامه runtime"}</span>
                    <span>
                        {selected.credential_configured
                            ? locale === "en"
                                ? "Available"
                                : "موجود"
                            : locale === "en"
                              ? "Not available"
                              : "موجود نیست"}
                    </span>
                </div>
            </div>

            {jsonError ? (
                <p className="text-danger text-xs">
                    {locale === "en" ? "Advanced JSON is not valid." : "JSON پیشرفته معتبر نیست."}
                </p>
            ) : null}
            {success ? (
                <p className="text-success text-xs">
                    {locale === "en"
                        ? "Configuration saved. Connectivity remains evidence-driven."
                        : "پیکربندی ذخیره شد؛ وضعیت اتصال همچنان فقط بر پایه شواهد واقعی تغییر می‌کند."}
                </p>
            ) : null}
            {error ? (
                <p className="text-danger text-xs">
                    {locale === "en" ? "Configuration could not be saved." : "ذخیره پیکربندی ناموفق بود."}
                </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending}>
                <Save className="size-4" aria-hidden="true" />
                {pending
                    ? locale === "en"
                        ? "Saving…"
                        : "در حال ذخیره…"
                    : locale === "en"
                      ? "Save channel settings"
                      : "ذخیره تنظیمات کانال"}
            </Button>
        </form>
    );
}

export function TicketChannelsPage() {
    const locale = useLocale() as Locale;
    const channels = useSupportChannels();
    const update = useUpdateSupportChannel();
    const [selectedChannel, setSelectedChannel] = useState<SupportChannel>("whatsapp");
    const rows = channels.data ?? [];
    const byChannel = useMemo(() => new Map(rows.map((item) => [item.channel, item])), [rows]);
    const selected = byChannel.get(selectedChannel);
    const connected = rows.filter((item) => item.status === "connected").length;
    const configured = rows.filter((item) => item.status === "configured").length;
    const errors = rows.filter((item) => item.status === "error").length;
    const enabled = rows.filter((item) => item.status !== "disabled").length;
    const numberLocale = locale === "fa" ? "fa-IR" : "en-US";

    async function toggle(channel: SupportChannelIntegration, enabledValue: boolean) {
        await update.mutateAsync({
            channel: channel.channel,
            enabled: enabledValue,
            credential_env_ref: channel.credential_env_ref,
            configuration: channel.configuration,
        });
    }

    async function saveStructured(payload: { credential_env_ref: string | null; configuration: Record<string, unknown> }) {
        if (!selected) return;
        await update.mutateAsync({
            channel: selected.channel,
            enabled: selected.status !== "disabled",
            credential_env_ref: payload.credential_env_ref,
            configuration: payload.configuration,
        });
    }

    const fallbackRow = (name: SupportChannel): SupportChannelIntegration => ({
        id: 0,
        channel: name,
        status: "disabled",
        credential_env_ref: null,
        configuration: {},
        credential_configured: false,
        last_error: null,
        last_verified_at: null,
        created_at: "",
        updated_at: "",
    });

    return (
        <div className="flex flex-col gap-5">
            <SupportPageHeader
                eyebrow={locale === "en" ? "Omnichannel registry" : "رجیستری کانال‌های ارتباطی"}
                title={locale === "en" ? "Messaging channels" : "تنظیمات پیام‌رسان‌ها"}
                subtitle={
                    locale === "en"
                        ? "Configure messaging, working hours, automatic replies and synchronization without exposing secrets. Connected state is shown only when the backend has provider evidence."
                        : "پیام‌رسان‌ها، ساعات پاسخ‌گویی، پاسخ خودکار و همگام‌سازی را بدون نمایش رمزها تنظیم کنید. وضعیت «متصل» فقط با شواهد واقعی سمت بک‌اند نمایش داده می‌شود."
                }
                icon={Radio}
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="shadow-sm">
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-muted-foreground text-xs">{locale === "en" ? "Enabled" : "فعال‌شده"}</p>
                            <div className="mt-1 font-semibold text-2xl tabular-nums">{enabled.toLocaleString(numberLocale)}</div>
                        </div>
                        <SlidersHorizontal className="size-5 text-primary" aria-hidden="true" />
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-muted-foreground text-xs">
                                {locale === "en" ? "Verified connected" : "متصلِ تأییدشده"}
                            </p>
                            <div className="mt-1 font-semibold text-2xl tabular-nums">
                                {connected.toLocaleString(numberLocale)}
                            </div>
                        </div>
                        <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-muted-foreground text-xs">{locale === "en" ? "Configured" : "پیکربندی‌شده"}</p>
                            <div className="mt-1 font-semibold text-2xl tabular-nums">
                                {configured.toLocaleString(numberLocale)}
                            </div>
                        </div>
                        <KeyRound className="size-5 text-warning" aria-hidden="true" />
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-muted-foreground text-xs">{locale === "en" ? "Errors" : "دارای خطا"}</p>
                            <div className="mt-1 font-semibold text-2xl tabular-nums">{errors.toLocaleString(numberLocale)}</div>
                        </div>
                        <AlertCircle className="size-5 text-danger" aria-hidden="true" />
                    </CardContent>
                </Card>
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
                <div className="min-w-0 space-y-4">
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">
                                {locale === "en" ? "Primary messengers" : "پیام‌رسان‌های اصلی"}
                            </CardTitle>
                            <p className="text-muted-foreground text-xs">
                                {locale === "en"
                                    ? "Select a card to edit its operational settings."
                                    : "برای ویرایش تنظیمات عملیاتی، کارت کانال را انتخاب کنید."}
                            </p>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                                {channels.isLoading
                                    ? PRIMARY_CHANNELS.map((name) => <Skeleton key={name} className="h-40 rounded-xl" />)
                                    : PRIMARY_CHANNELS.map((name, index) => {
                                          const channel = byChannel.get(name) ?? fallbackRow(name);
                                          return (
                                              <ChannelCard
                                                  key={name}
                                                  channel={channel}
                                                  selected={selectedChannel === name}
                                                  locale={locale}
                                                  index={index}
                                                  onSelect={() => setSelectedChannel(name)}
                                                  onToggle={(value) => void toggle(channel, value)}
                                                  busy={update.isPending}
                                              />
                                          );
                                      })}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">
                                {locale === "en" ? "Other support channels" : "سایر کانال‌های پشتیبانی"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {SECONDARY_CHANNELS.map((name, index) => {
                                    const channel = byChannel.get(name) ?? fallbackRow(name);
                                    return (
                                        <ChannelCard
                                            key={name}
                                            channel={channel}
                                            selected={selectedChannel === name}
                                            locale={locale}
                                            index={PRIMARY_CHANNELS.length + index}
                                            onSelect={() => setSelectedChannel(name)}
                                            onToggle={(value) => void toggle(channel, value)}
                                            busy={update.isPending}
                                        />
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-primary/15 bg-primary/[0.02] shadow-sm">
                        <CardContent className="flex gap-3 p-4">
                            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                            <div>
                                <div className="font-medium text-sm">
                                    {locale === "en" ? "Truthful connection semantics" : "معنای دقیق وضعیت اتصال"}
                                </div>
                                <p className="mt-1 text-muted-foreground text-xs leading-5">
                                    {locale === "en"
                                        ? "Enabled does not mean connected. Configured means settings exist, Connected requires backend provider evidence, and Error means a real integration failure is recorded."
                                        : "فعال‌بودن به معنی اتصال نیست. «پیکربندی‌شده» یعنی تنظیمات وجود دارد، «متصل» نیازمند شواهد واقعی ارائه‌دهنده است و «خطا» یعنی شکست واقعی یکپارچه‌سازی ثبت شده است."}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <aside className="space-y-4 xl:sticky xl:top-4">
                    <Card className="overflow-hidden shadow-sm">
                        <CardHeader className="border-b bg-muted/10">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <CardTitle className="text-base">{supportChannelLabel(selectedChannel, locale)}</CardTitle>
                                    <p className="mt-1 text-muted-foreground text-xs">
                                        {locale === "en" ? "Channel configuration" : "پیکربندی کانال"}
                                    </p>
                                </div>
                                {selected ? (
                                    <Badge variant="outline" className={channelStatusTone(selected.status)}>
                                        {supportChannelStatusLabel(selected.status, locale)}
                                    </Badge>
                                ) : null}
                            </div>
                        </CardHeader>
                        <CardContent className="p-4">
                            {selected ? (
                                <ChannelConfigurationForm
                                    key={`${selected.channel}-${selected.updated_at}`}
                                    selected={selected}
                                    locale={locale}
                                    onSave={saveStructured}
                                    pending={update.isPending}
                                    success={update.isSuccess}
                                    error={update.isError}
                                />
                            ) : (
                                <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-xs">
                                    {locale === "en"
                                        ? "Enable the channel once to create its configuration row."
                                        : "برای ایجاد ردیف پیکربندی، ابتدا کانال را فعال کنید."}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </div>
    );
}
