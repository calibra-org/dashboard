"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Progress } from "#/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Textarea } from "#/components/ui/textarea";
import { CalendarClock, CheckCircle2, CircleDollarSign, Megaphone, Pause, Send, ShieldCheck, Users, XCircle } from "#/icons";
import { formatDate } from "#/lib/format";

import {
    useAddCampaignRecipients,
    useCreateSupportCampaign,
    useReviewCampaignTemplate,
    useSupportCampaigns,
    useSupportChannels,
    useTransitionCampaign,
} from "./queries";
import { SupportMetric, SupportPageHeader, supportChannelLabel } from "./ui";
import type { SupportCampaign } from "./types";

const CAMPAIGN_CHANNELS: SupportCampaign["channel"][] = [
    "email",
    "whatsapp",
    "telegram",
    "instagram",
    "rubika",
    "bale",
    "eitaa",
    "sms",
];

function statusClass(status: SupportCampaign["status"]): string {
    if (status === "completed") return "border-success/20 bg-success/10 text-success";
    if (status === "running") return "border-primary/20 bg-primary/10 text-primary";
    if (status === "scheduled") return "border-info/20 bg-info/10 text-info";
    if (status === "cancelled") return "border-danger/20 bg-danger/10 text-danger";
    if (status === "paused") return "border-warning/20 bg-warning/10 text-warning";
    return "";
}

function templateClass(status: SupportCampaign["template_status"]): string {
    if (status === "approved") return "border-success/20 bg-success/10 text-success";
    if (status === "rejected") return "border-danger/20 bg-danger/10 text-danger";
    if (status === "pending") return "border-warning/20 bg-warning/10 text-warning";
    return "";
}

function CampaignDetail({ campaign, locale }: { campaign: SupportCampaign; locale: Locale }) {
    const addRecipients = useAddCampaignRecipients(campaign.id);
    const transition = useTransitionCampaign(campaign.id);
    const review = useReviewCampaignTemplate(campaign.id);
    const numberLocale = locale === "fa" ? "fa-IR" : "en-US";
    const summary = campaign.recipient_summary ?? {
        total: 0,
        pending: 0,
        queued: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        skipped: 0,
        opted_out: 0,
    };
    const deliveredPct = summary.total > 0 ? Math.round((summary.delivered / summary.total) * 100) : 0;

    async function add(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const recipients = String(form.get("recipients") ?? "")
            .split(/[\n,;]+/)
            .map((item) => item.trim())
            .filter(Boolean);
        if (recipients.length === 0) return;
        await addRecipients.mutateAsync({ expected_version: campaign.version, recipients });
        event.currentTarget.reset();
    }

    return (
        <div className="space-y-4">
            <Card className="shadow-sm">
                <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <CardTitle className="text-base">{campaign.name}</CardTitle>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <Badge variant="outline" className={statusClass(campaign.status)}>
                                    {campaign.status}
                                </Badge>
                                <Badge variant="outline" className={templateClass(campaign.template_status)}>
                                    {locale === "en" ? "Template" : "قالب"}: {campaign.template_status}
                                </Badge>
                                <Badge variant="outline">{supportChannelLabel(campaign.channel, locale)}</Badge>
                            </div>
                        </div>
                        <span className="text-muted-foreground text-xs">v{campaign.version.toLocaleString(numberLocale)}</span>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-xl border bg-muted/25 p-3">
                        <p className="whitespace-pre-wrap text-sm leading-6">{campaign.template_body}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4">
                        <div className="rounded-xl border p-3">
                            <div className="text-[0.65rem] text-muted-foreground">
                                {locale === "en" ? "Recipients" : "مخاطبان"}
                            </div>
                            <div className="mt-1 font-semibold text-lg">{summary.total.toLocaleString(numberLocale)}</div>
                        </div>
                        <div className="rounded-xl border p-3">
                            <div className="text-[0.65rem] text-muted-foreground">
                                {locale === "en" ? "Delivered" : "تحویل‌شده"}
                            </div>
                            <div className="mt-1 font-semibold text-lg text-success">
                                {summary.delivered.toLocaleString(numberLocale)}
                            </div>
                        </div>
                        <div className="rounded-xl border p-3">
                            <div className="text-[0.65rem] text-muted-foreground">{locale === "en" ? "Failed" : "ناموفق"}</div>
                            <div className="mt-1 font-semibold text-danger text-lg">
                                {summary.failed.toLocaleString(numberLocale)}
                            </div>
                        </div>
                        <div className="rounded-xl border p-3">
                            <div className="text-[0.65rem] text-muted-foreground">
                                {locale === "en" ? "Opted out" : "لغو دریافت"}
                            </div>
                            <div className="mt-1 font-semibold text-lg">{summary.opted_out.toLocaleString(numberLocale)}</div>
                        </div>
                    </div>
                    <div>
                        <div className="mb-2 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                                {locale === "en" ? "Delivery progress" : "پیشرفت تحویل"}
                            </span>
                            <span>{deliveredPct.toLocaleString(numberLocale)}٪</span>
                        </div>
                        <Progress value={deliveredPct} />
                    </div>
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                            <span className="text-muted-foreground">{locale === "en" ? "Scheduled" : "زمان‌بندی"}</span>
                            <span>{campaign.scheduled_at ? formatDate(campaign.scheduled_at, locale) : "—"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                            <span className="text-muted-foreground">{locale === "en" ? "Estimated cost" : "هزینه تخمینی"}</span>
                            <span>{campaign.estimated_cost_minor.toLocaleString(numberLocale)}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">{locale === "en" ? "Template approval" : "بازبینی قالب پیام"}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="outline"
                            onClick={() => void review.mutateAsync({ expected_version: campaign.version, decision: "approved" })}
                            disabled={review.isPending || campaign.template_status === "approved"}
                        >
                            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                            {locale === "en" ? "Approve template" : "تأیید قالب"}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => void review.mutateAsync({ expected_version: campaign.version, decision: "rejected" })}
                            disabled={review.isPending || campaign.template_status === "rejected"}
                        >
                            <XCircle className="size-4 text-danger" aria-hidden="true" />
                            {locale === "en" ? "Reject template" : "رد قالب"}
                        </Button>
                    </div>
                    <p className="mt-3 text-muted-foreground text-xs leading-5">
                        {locale === "en"
                            ? "Scheduling is fail-closed: the template must be approved and the selected channel must already be verified connected by the backend."
                            : "زمان‌بندی Fail-Closed است: قالب باید تأیید شده باشد و کانال انتخابی قبلاً توسط بک‌اند با وضعیت متصل تأیید شده باشد."}
                    </p>
                    {review.isError ? (
                        <p className="mt-2 text-danger text-xs">
                            {locale === "en"
                                ? "Template review failed, possibly due to a version conflict."
                                : "بازبینی قالب ناموفق بود؛ احتمالاً نسخه کمپین هم‌زمان تغییر کرده است."}
                        </p>
                    ) : null}
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">{locale === "en" ? "Recipients" : "مخاطبان کمپین"}</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={add} className="space-y-3">
                        <Textarea
                            name="recipients"
                            className="min-h-28"
                            placeholder={
                                locale === "en"
                                    ? "One email/phone/recipient key per line"
                                    : "هر ایمیل، شماره یا کلید مخاطب در یک خط"
                            }
                        />
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground text-xs">
                                {locale === "en"
                                    ? "Duplicates are deduplicated server-side."
                                    : "مقادیر تکراری در سمت سرور حذف می‌شوند."}
                            </span>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={addRecipients.isPending || !["draft", "scheduled", "paused"].includes(campaign.status)}
                            >
                                <Users className="size-3.5" aria-hidden="true" />
                                {locale === "en" ? "Add recipients" : "افزودن مخاطبان"}
                            </Button>
                        </div>
                    </form>
                    {addRecipients.isError ? (
                        <p className="mt-2 text-danger text-xs">
                            {locale === "en" ? "Recipients could not be added." : "افزودن مخاطبان ناموفق بود."}
                        </p>
                    ) : null}
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">{locale === "en" ? "Campaign lifecycle" : "چرخه اجرای کمپین"}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                    <Button
                        onClick={() => void transition.mutateAsync({ expected_version: campaign.version, status: "scheduled" })}
                        disabled={transition.isPending || campaign.status === "scheduled" || !campaign.scheduled_at}
                    >
                        <CalendarClock className="size-4" aria-hidden="true" />
                        {locale === "en" ? "Schedule" : "زمان‌بندی"}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => void transition.mutateAsync({ expected_version: campaign.version, status: "paused" })}
                        disabled={transition.isPending || !["scheduled", "running"].includes(campaign.status)}
                    >
                        <Pause className="size-4" aria-hidden="true" />
                        {locale === "en" ? "Pause" : "توقف موقت"}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => void transition.mutateAsync({ expected_version: campaign.version, status: "cancelled" })}
                        disabled={transition.isPending || ["completed", "cancelled"].includes(campaign.status)}
                    >
                        <XCircle className="size-4" aria-hidden="true" />
                        {locale === "en" ? "Cancel" : "لغو"}
                    </Button>
                    {transition.isError ? (
                        <p className="w-full text-danger text-xs">
                            {locale === "en"
                                ? "Transition rejected. Check schedule, template approval, verified channel, and campaign version."
                                : "تغییر وضعیت رد شد؛ زمان‌بندی، تأیید قالب، اتصال تأییدشده کانال و نسخه کمپین را بررسی کنید."}
                        </p>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}

export function TicketCampaignsPage() {
    const locale = useLocale() as Locale;
    const campaigns = useSupportCampaigns();
    const channels = useSupportChannels();
    const create = useCreateSupportCampaign();
    const [selectedId, setSelectedId] = useState(0);
    const [channel, setChannel] = useState<SupportCampaign["channel"]>("sms");
    const rows = campaigns.data ?? [];
    useEffect(() => {
        if (selectedId > 0 && rows.some((campaign) => campaign.id === selectedId)) return;
        setSelectedId(rows[0]?.id ?? 0);
    }, [rows, selectedId]);
    const selected = rows.find((campaign) => campaign.id === selectedId) ?? null;
    const numberLocale = locale === "fa" ? "fa-IR" : "en-US";
    const totals = useMemo(() => {
        const recipientTotal = rows.reduce((sum, campaign) => sum + (campaign.recipient_summary?.total ?? 0), 0);
        const delivered = rows.reduce((sum, campaign) => sum + (campaign.recipient_summary?.delivered ?? 0), 0);
        const failed = rows.reduce((sum, campaign) => sum + (campaign.recipient_summary?.failed ?? 0), 0);
        return {
            active: rows.filter((campaign) => campaign.status === "running").length,
            scheduled: rows.filter((campaign) => campaign.status === "scheduled").length,
            recipients: recipientTotal,
            delivered,
            failed,
            estimated: rows.reduce((sum, campaign) => sum + campaign.estimated_cost_minor, 0),
        };
    }, [rows]);
    const connectedNames = new Set(
        (channels.data ?? []).filter((item) => item.status === "connected").map((item) => item.channel),
    );

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const localDate = String(form.get("scheduled_at") ?? "").trim();
        const result = await create.mutateAsync({
            name: String(form.get("name") ?? "").trim(),
            channel,
            template_body: String(form.get("template_body") ?? "").trim(),
            estimated_cost_minor: Number(form.get("estimated_cost_minor") || 0),
            scheduled_at: localDate ? new Date(localDate).toISOString() : null,
            quiet_hours: {},
        });
        setSelectedId(result.data.id);
        event.currentTarget.reset();
    }

    return (
        <div className="flex flex-col gap-5">
            <SupportPageHeader
                eyebrow={locale === "en" ? "Governed outbound messaging" : "ارسال گروهی کنترل‌شده"}
                title={locale === "en" ? "Messaging campaigns" : "کمپین پیام"}
                subtitle={
                    locale === "en"
                        ? "Compose campaigns, deduplicate recipients, review templates, enforce verified-channel scheduling, and inspect real delivery ledger counts."
                        : "کمپین بسازید، مخاطبان را Deduplicate کنید، قالب را بازبینی کنید، زمان‌بندی را فقط روی کانال تأییدشده انجام دهید و شمارش واقعی دفتر تحویل را ببینید."
                }
                icon={Megaphone}
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                {campaigns.isLoading ? (
                    Array.from({ length: 6 }, (_, index) => `campaign-kpi-${index + 1}`).map((key) => (
                        <Skeleton key={key} className="h-24" />
                    ))
                ) : (
                    <>
                        <SupportMetric
                            label={locale === "en" ? "Running" : "کمپین فعال"}
                            value={totals.active.toLocaleString(numberLocale)}
                            icon={Megaphone}
                        />
                        <SupportMetric
                            label={locale === "en" ? "Scheduled" : "زمان‌بندی‌شده"}
                            value={totals.scheduled.toLocaleString(numberLocale)}
                            icon={CalendarClock}
                            tone="info"
                        />
                        <SupportMetric
                            label={locale === "en" ? "Recipients" : "مخاطبان"}
                            value={totals.recipients.toLocaleString(numberLocale)}
                            icon={Users}
                            tone="neutral"
                        />
                        <SupportMetric
                            label={locale === "en" ? "Delivered" : "تحویل‌شده"}
                            value={totals.delivered.toLocaleString(numberLocale)}
                            icon={CheckCircle2}
                            tone="success"
                        />
                        <SupportMetric
                            label={locale === "en" ? "Failed" : "ناموفق"}
                            value={totals.failed.toLocaleString(numberLocale)}
                            icon={XCircle}
                            tone="danger"
                        />
                        <SupportMetric
                            label={locale === "en" ? "Estimated cost" : "هزینه تخمینی"}
                            value={totals.estimated.toLocaleString(numberLocale)}
                            icon={CircleDollarSign}
                            tone="warning"
                        />
                    </>
                )}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
                <div className="space-y-4">
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">{locale === "en" ? "Campaigns" : "کمپین‌های اخیر"}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {campaigns.isLoading ? (
                                [1, 2, 3, 4].map((key) => <Skeleton key={key} className="h-16" />)
                            ) : rows.length === 0 ? (
                                <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-xs">
                                    {locale === "en" ? "No campaign yet." : "هنوز کمپینی ساخته نشده است."}
                                </div>
                            ) : (
                                rows.map((campaign) => {
                                    const summary = campaign.recipient_summary;
                                    return (
                                        <button
                                            key={campaign.id}
                                            type="button"
                                            onClick={() => setSelectedId(campaign.id)}
                                            className={`w-full rounded-xl border p-3 text-start transition-colors ${selectedId === campaign.id ? "border-primary/30 bg-primary/5" : "hover:bg-muted/35"}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="truncate font-medium text-sm">{campaign.name}</div>
                                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.66rem] text-muted-foreground">
                                                        <span>{supportChannelLabel(campaign.channel, locale)}</span>
                                                        <span>·</span>
                                                        <span>
                                                            {(summary?.total ?? 0).toLocaleString(numberLocale)}{" "}
                                                            {locale === "en" ? "recipients" : "مخاطب"}
                                                        </span>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className={statusClass(campaign.status)}>
                                                    {campaign.status}
                                                </Badge>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>
                    {selected ? (
                        <CampaignDetail key={`${selected.id}-${selected.version}`} campaign={selected} locale={locale} />
                    ) : null}
                </div>

                <div className="space-y-4">
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">{locale === "en" ? "Create campaign" : "ساخت کمپین جدید"}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={submit} className="space-y-4">
                                <label className="block space-y-1.5 text-xs">
                                    <span className="font-medium">{locale === "en" ? "Campaign name" : "نام کمپین"}</span>
                                    <Input name="name" required maxLength={180} />
                                </label>
                                <label className="block space-y-1.5 text-xs">
                                    <span className="font-medium">{locale === "en" ? "Delivery channel" : "کانال ارسال"}</span>
                                    <Select
                                        value={channel}
                                        onValueChange={(value) => setChannel(value as SupportCampaign["channel"])}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {CAMPAIGN_CHANNELS.map((item) => (
                                                <SelectItem key={item} value={item}>
                                                    {supportChannelLabel(item, locale)}
                                                    {connectedNames.has(item)
                                                        ? ` · ${locale === "en" ? "connected" : "متصل"}`
                                                        : ""}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </label>
                                <label className="block space-y-1.5 text-xs">
                                    <span className="font-medium">{locale === "en" ? "Message template" : "متن پیام"}</span>
                                    <Textarea
                                        name="template_body"
                                        required
                                        maxLength={20_000}
                                        className="min-h-40"
                                        placeholder={
                                            locale === "en"
                                                ? "Write the approved outbound message…"
                                                : "متن پیام گروهی را بنویسید…"
                                        }
                                    />
                                </label>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="space-y-1.5 text-xs">
                                        <span className="font-medium">{locale === "en" ? "Schedule" : "زمان‌بندی"}</span>
                                        <Input type="datetime-local" name="scheduled_at" />
                                    </label>
                                    <label className="space-y-1.5 text-xs">
                                        <span className="font-medium">
                                            {locale === "en" ? "Estimated cost (minor units)" : "هزینه تخمینی (واحد خرد)"}
                                        </span>
                                        <Input type="number" min={0} name="estimated_cost_minor" defaultValue={0} />
                                    </label>
                                </div>
                                <Button type="submit" className="w-full" disabled={create.isPending}>
                                    <Send className="size-4" aria-hidden="true" />
                                    {create.isPending
                                        ? locale === "en"
                                            ? "Creating…"
                                            : "در حال ساخت…"
                                        : locale === "en"
                                          ? "Create draft campaign"
                                          : "ساخت کمپین پیش‌نویس"}
                                </Button>
                                {create.isError ? (
                                    <p className="text-danger text-xs">
                                        {locale === "en" ? "Campaign could not be created." : "ساخت کمپین ناموفق بود."}
                                    </p>
                                ) : null}
                            </form>
                        </CardContent>
                    </Card>
                    <Card className="border-primary/15 bg-primary/[0.02] shadow-sm">
                        <CardContent className="flex gap-3 p-4">
                            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                            <div>
                                <div className="font-medium text-sm">
                                    {locale === "en" ? "No fake send states" : "بدون وضعیت ارسال جعلی"}
                                </div>
                                <p className="mt-1 text-muted-foreground text-xs leading-5">
                                    {locale === "en"
                                        ? "A draft can store a future schedule, but it does not become scheduled until the explicit transition passes template approval and verified-channel checks."
                                        : "پیش‌نویس می‌تواند زمان آینده داشته باشد، اما تا زمانی که گذار صریح، تأیید قالب و اتصال معتبر کانال را پاس نکند، «زمان‌بندی‌شده» محسوب نمی‌شود."}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
