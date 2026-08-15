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
import { AlertCircle, CheckCircle2, KeyRound, Radio, Save, ShieldCheck } from "#/icons";

import { useSupportChannels, useUpdateSupportChannel } from "./queries";
import { channelStatusTone, SupportPageHeader, supportChannelLabel } from "./ui";
import type { SupportChannel, SupportChannelIntegration } from "./types";

const CHANNEL_ORDER: SupportChannel[] = [
    "whatsapp",
    "telegram",
    "instagram",
    "rubika",
    "bale",
    "eitaa",
    "sms",
    "email",
    "web",
    "phone",
    "api",
];

function statusLabel(status: SupportChannelIntegration["status"], locale: Locale): string {
    const labels = {
        disabled: locale === "en" ? "Disabled" : "غیرفعال",
        configured: locale === "en" ? "Configured" : "پیکربندی‌شده",
        connected: locale === "en" ? "Verified connected" : "متصلِ تأییدشده",
        error: locale === "en" ? "Error" : "خطا",
    };
    return labels[status];
}

function ChannelCard({
    channel,
    selected,
    locale,
    onSelect,
    onToggle,
    busy,
}: {
    channel: SupportChannelIntegration;
    selected: boolean;
    locale: Locale;
    onSelect: () => void;
    onToggle: (enabled: boolean) => void;
    busy: boolean;
}) {
    return (
        <Card
            className={`overflow-hidden shadow-sm transition-all ${selected ? "border-primary/35 ring-1 ring-primary/10" : "hover:border-primary/20"}`}
        >
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-start">
                        <div className="flex items-center gap-3">
                            <span className="grid size-10 place-items-center rounded-xl border bg-muted/40">
                                <Radio className="size-4" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                                <div className="truncate font-medium text-sm">{supportChannelLabel(channel.channel, locale)}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    <Badge variant="outline" className={channelStatusTone(channel.status)}>
                                        {statusLabel(channel.status, locale)}
                                    </Badge>
                                    {channel.credential_configured ? (
                                        <Badge variant="outline" className="border-success/20 text-success">
                                            {locale === "en" ? "Credential present" : "کلید محیطی موجود"}
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
    const numberLocale = locale === "fa" ? "fa-IR" : "en-US";

    async function toggle(channel: SupportChannelIntegration, enabled: boolean) {
        await update.mutateAsync({
            channel: channel.channel,
            enabled,
            credential_env_ref: channel.credential_env_ref,
            configuration: channel.configuration,
        });
    }

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selected) return;
        const form = new FormData(event.currentTarget);
        const raw = String(form.get("configuration") ?? "{}").trim();
        let configuration: Record<string, unknown>;
        try {
            const parsed = JSON.parse(raw || "{}") as unknown;
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
            configuration = parsed as Record<string, unknown>;
        } catch {
            return;
        }
        await update.mutateAsync({
            channel: selected.channel,
            enabled: selected.status !== "disabled",
            credential_env_ref: String(form.get("credential_env_ref") ?? "").trim() || null,
            configuration,
        });
    }

    return (
        <div className="flex flex-col gap-5">
            <SupportPageHeader
                eyebrow={locale === "en" ? "Omnichannel registry" : "رجیستری کانال‌های ارتباطی"}
                title={locale === "en" ? "Messaging channels" : "پیام‌رسان‌ها و کانال‌ها"}
                subtitle={
                    locale === "en"
                        ? "Configure supported channels without exposing secrets. A channel is shown as connected only when the backend has provider evidence; enabling a card never fabricates connectivity."
                        : "کانال‌های پشتیبانی را بدون نمایش رمزها پیکربندی کنید. وضعیت «متصل» فقط با شواهد واقعی سمت بک‌اند نمایش داده می‌شود و روشن‌کردن یک کارت اتصال جعلی ایجاد نمی‌کند."
                }
                icon={Radio}
            />

            <div className="grid gap-3 sm:grid-cols-3">
                <Card className="shadow-sm">
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-muted-foreground text-xs">
                                {locale === "en" ? "Verified connected" : "متصلِ تأییدشده"}
                            </p>
                            <div className="mt-1 font-semibold text-2xl">{connected.toLocaleString(numberLocale)}</div>
                        </div>
                        <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-muted-foreground text-xs">{locale === "en" ? "Configured" : "پیکربندی‌شده"}</p>
                            <div className="mt-1 font-semibold text-2xl">{configured.toLocaleString(numberLocale)}</div>
                        </div>
                        <KeyRound className="size-5 text-warning" aria-hidden="true" />
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-muted-foreground text-xs">{locale === "en" ? "Error" : "دارای خطا"}</p>
                            <div className="mt-1 font-semibold text-2xl">{errors.toLocaleString(numberLocale)}</div>
                        </div>
                        <AlertCircle className="size-5 text-danger" aria-hidden="true" />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {channels.isLoading
                        ? Array.from({ length: 9 }, (_, index) => `channel-card-${index + 1}`).map((key) => (
                              <Skeleton key={key} className="h-32 rounded-xl" />
                          ))
                        : CHANNEL_ORDER.map((name) => {
                              const channel = byChannel.get(name) ?? {
                                  id: 0,
                                  channel: name,
                                  status: "disabled" as const,
                                  credential_env_ref: null,
                                  configuration: {},
                                  credential_configured: false,
                                  last_error: null,
                                  last_verified_at: null,
                                  created_at: "",
                                  updated_at: "",
                              };
                              return (
                                  <ChannelCard
                                      key={name}
                                      channel={channel}
                                      selected={selectedChannel === name}
                                      locale={locale}
                                      onSelect={() => setSelectedChannel(name)}
                                      onToggle={(enabled) => void toggle(channel, enabled)}
                                      busy={update.isPending}
                                  />
                              );
                          })}
                </div>

                <div className="space-y-4">
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">
                                {selected
                                    ? supportChannelLabel(selected.channel, locale)
                                    : supportChannelLabel(selectedChannel, locale)}
                            </CardTitle>
                            <p className="text-muted-foreground text-xs">
                                {locale === "en"
                                    ? "Credential references point to runtime environment variables. Secret values never appear in this UI or database row."
                                    : "ارجاع اعتبارنامه فقط نام متغیر محیطی runtime است؛ مقدار رمز در این صفحه یا ردیف دیتابیس نمایش و ذخیره نمی‌شود."}
                            </p>
                        </CardHeader>
                        <CardContent>
                            {selected ? (
                                <form key={`${selected.channel}-${selected.updated_at}`} onSubmit={save} className="space-y-4">
                                    <label className="block space-y-1.5 text-xs">
                                        <span className="font-medium">
                                            {locale === "en" ? "Credential env reference" : "نام متغیر محیطی اعتبارنامه"}
                                        </span>
                                        <Input
                                            name="credential_env_ref"
                                            defaultValue={selected.credential_env_ref ?? ""}
                                            placeholder="CALIBRA_SUPPORT_WHATSAPP_TOKEN"
                                            dir="ltr"
                                            pattern="CALIBRA_SUPPORT_[A-Z0-9_]+"
                                        />
                                    </label>
                                    <label className="block space-y-1.5 text-xs">
                                        <span className="font-medium">
                                            {locale === "en"
                                                ? "Provider configuration metadata (JSON)"
                                                : "متادیتای پیکربندی ارائه‌دهنده (JSON)"}
                                        </span>
                                        <Textarea
                                            name="configuration"
                                            defaultValue={JSON.stringify(selected.configuration ?? {}, null, 2)}
                                            dir="ltr"
                                            className="min-h-44 font-mono text-xs"
                                        />
                                    </label>
                                    <div className="rounded-xl border bg-muted/25 p-3 text-xs">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-muted-foreground">
                                                {locale === "en" ? "Stored state" : "وضعیت ثبت‌شده"}
                                            </span>
                                            <Badge variant="outline" className={channelStatusTone(selected.status)}>
                                                {statusLabel(selected.status, locale)}
                                            </Badge>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-3">
                                            <span className="text-muted-foreground">
                                                {locale === "en" ? "Runtime credential" : "اعتبارنامه runtime"}
                                            </span>
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
                                        <div className="mt-2 flex items-center justify-between gap-3">
                                            <span className="text-muted-foreground">
                                                {locale === "en" ? "Last verified" : "آخرین تأیید اتصال"}
                                            </span>
                                            <span>{selected.last_verified_at ?? "—"}</span>
                                        </div>
                                    </div>
                                    <Button type="submit" className="w-full" disabled={update.isPending}>
                                        <Save className="size-4" aria-hidden="true" />
                                        {update.isPending
                                            ? locale === "en"
                                                ? "Saving…"
                                                : "در حال ذخیره…"
                                            : locale === "en"
                                              ? "Save configuration"
                                              : "ذخیره پیکربندی"}
                                    </Button>
                                    {update.isSuccess ? (
                                        <p className="text-success text-xs">
                                            {locale === "en"
                                                ? "Configuration saved. Connectivity status remains evidence-driven."
                                                : "پیکربندی ذخیره شد؛ وضعیت اتصال همچنان فقط بر اساس شواهد واقعی تغییر می‌کند."}
                                        </p>
                                    ) : null}
                                    {update.isError ? (
                                        <p className="text-danger text-xs">
                                            {locale === "en" ? "Configuration could not be saved." : "ذخیره پیکربندی ناموفق بود."}
                                        </p>
                                    ) : null}
                                </form>
                            ) : (
                                <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground text-xs">
                                    {locale === "en"
                                        ? "Enable this channel once to create its configuration row."
                                        : "برای ایجاد ردیف پیکربندی، ابتدا کانال را فعال کنید."}
                                </div>
                            )}
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
                                        ? "Disabled = off. Configured = settings saved, not yet provider-verified. Connected = backend verification evidence exists. Error = an integration failure is recorded."
                                        : "غیرفعال یعنی خاموش؛ پیکربندی‌شده یعنی تنظیمات ثبت شده ولی اتصال ارائه‌دهنده تأیید نشده؛ متصل یعنی بک‌اند شواهد تأیید دارد؛ خطا یعنی شکست یکپارچه‌سازی ثبت شده است."}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
