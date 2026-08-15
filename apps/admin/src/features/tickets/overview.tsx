"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import {
    Activity,
    ChartNoAxesCombined,
    CheckCircle2,
    Clock3,
    ContactRound,
    Megaphone,
    MessageSquare,
    PenLine,
    Plus,
    Radio,
    ShieldAlert,
    Users,
} from "#/icons";
import { formatDate } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";

import { ticketCopy } from "./copy";
import {
    useAgentPresence,
    useSupportCampaigns,
    useSupportChannels,
    useSupportReports,
    useTicketSummary,
    useTickets,
    useTicketTrends,
} from "./queries";
import {
    campaignStatusLabel,
    channelStatusTone,
    durationLabel,
    EmptySupportState,
    LoadingGrid,
    presenceStateLabel,
    SupportMetric,
    SupportPageHeader,
    supportChannelLabel,
    supportChannelStatusLabel,
    TicketPriorityBadge,
    TicketStatusBadge,
    TicketTrendChart,
} from "./ui";

export function TicketsOverviewPage() {
    const locale = useLocale() as Locale;
    const { text: t, statuses, priorities } = ticketCopy(locale);
    const numberLocale = locale === "fa" ? "fa-IR" : "en-US";
    const summary = useTicketSummary();
    const trends = useTicketTrends();
    const reports = useSupportReports();
    const tickets = useTickets({ limit: 8 });
    const presence = useAgentPresence();
    const channels = useSupportChannels();
    const campaigns = useSupportCampaigns();
    const activeAgents = (presence.data ?? []).filter((agent) => agent.effective_state !== "offline");
    const connectedChannels = (channels.data ?? []).filter((channel) => channel.status === "connected");
    const runningCampaigns = (campaigns.data ?? []).filter((campaign) => ["running", "scheduled"].includes(campaign.status));
    const recent = tickets.data?.data.slice(0, 6) ?? [];

    return (
        <div className="flex flex-col gap-5">
            <SupportPageHeader
                eyebrow={locale === "en" ? "Support command center" : "مرکز فرمان پشتیبانی"}
                title={locale === "en" ? "Support overview" : "داشبورد پشتیبانی"}
                subtitle={
                    locale === "en"
                        ? "Live operational signals from the ticket queue, SLA policy, verified channels, campaigns, and agent presence."
                        : "نمای عملیاتی واقعی از صف تیکت، SLA، کانال‌های تأییدشده، کمپین‌ها و وضعیت حضور کارشناسان."
                }
                icon={Activity}
                actions={
                    <>
                        <Button variant="outline" asChild>
                            <Link href={"/tickets/inbox" as never}>
                                <MessageSquare className="size-4" aria-hidden="true" />
                                {locale === "en" ? "Open inbox" : "مشاهده صندوق"}
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href={"/tickets/create" as never}>
                                <Plus className="size-4" aria-hidden="true" />
                                {locale === "en" ? "Create ticket" : "ثبت تیکت"}
                            </Link>
                        </Button>
                    </>
                }
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {summary.isLoading || reports.isLoading ? (
                    Array.from({ length: 5 }, (_, index) => `overview-metric-${index + 1}`).map((key) => (
                        <Skeleton key={key} className="h-28 rounded-xl" />
                    ))
                ) : (
                    <>
                        <SupportMetric
                            label={t.activeTickets}
                            value={(summary.data?.active ?? 0).toLocaleString(numberLocale)}
                            hint={locale === "en" ? "Open + in progress" : "باز و در حال پیگیری"}
                            icon={MessageSquare}
                            tone="primary"
                        />
                        <SupportMetric
                            label={locale === "en" ? "Waiting for customer" : "در انتظار پاسخ مشتری"}
                            value={(summary.data?.waiting_customer ?? 0).toLocaleString(numberLocale)}
                            hint={locale === "en" ? "Customer action required" : "نیازمند اقدام مشتری"}
                            icon={Users}
                            tone="warning"
                        />
                        <SupportMetric
                            label={locale === "en" ? "Resolved in 30 days" : "حل‌شده در ۳۰ روز"}
                            value={(summary.data?.resolved_30d ?? 0).toLocaleString(numberLocale)}
                            hint={locale === "en" ? "Persisted ticket outcomes" : "بر اساس وضعیت واقعی تیکت"}
                            icon={CheckCircle2}
                            tone="success"
                        />
                        <SupportMetric
                            label={locale === "en" ? "Average first response" : "میانگین زمان پاسخ اول"}
                            value={durationLabel(summary.data?.avg_first_response_minutes ?? 0, locale)}
                            hint={locale === "en" ? "From ticket timestamps" : "از زمان‌های ثبت‌شده تیکت"}
                            icon={Clock3}
                            tone="info"
                        />
                        <SupportMetric
                            label={locale === "en" ? "Customer satisfaction" : "رضایت کاربران"}
                            value={
                                (reports.data?.csat.responses ?? 0) > 0
                                    ? `${(reports.data?.csat.average ?? 0).toFixed(1)} / 5`
                                    : "—"
                            }
                            hint={
                                (reports.data?.csat.responses ?? 0) > 0
                                    ? `${reports.data?.csat.responses.toLocaleString(numberLocale)} ${locale === "en" ? "responses" : "پاسخ"}`
                                    : locale === "en"
                                      ? "No persisted survey responses yet"
                                      : "هنوز پاسخ نظرسنجی ثبت نشده"
                            }
                            icon={ContactRound}
                            tone="neutral"
                        />
                    </>
                )}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.7fr)]">
                <Card className="shadow-sm">
                    <CardHeader className="flex-row items-start justify-between space-y-0">
                        <div>
                            <CardTitle className="text-base">
                                {locale === "en" ? "Ticket trend — 30 days" : "روند تیکت‌ها در ۳۰ روز گذشته"}
                            </CardTitle>
                            <p className="mt-1 text-muted-foreground text-xs">
                                {locale === "en"
                                    ? "Opened versus resolved from persisted daily aggregates."
                                    : "مقایسه ایجاد و حل تیکت بر اساس داده ثبت‌شده."}
                            </p>
                        </div>
                        <ChartNoAxesCombined className="size-4 text-muted-foreground" aria-hidden="true" />
                    </CardHeader>
                    <CardContent>
                        {trends.isLoading ? (
                            <Skeleton className="h-52 rounded-xl" />
                        ) : (
                            <TicketTrendChart points={trends.data ?? []} locale={locale} />
                        )}
                        <div className="mt-3 flex items-center gap-4 text-muted-foreground text-xs">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="size-2 rounded-full bg-primary" />
                                {locale === "en" ? "Opened" : "ایجادشده"}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="size-2 rounded-full bg-success" />
                                {locale === "en" ? "Resolved" : "حل‌شده"}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">{locale === "en" ? "Quick actions" : "اقدامات سریع"}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        {[
                            [
                                "/tickets/create",
                                Plus,
                                locale === "en" ? "New customer/internal ticket" : "تیکت مشتری یا داخلی جدید",
                            ],
                            [
                                "/tickets/inbox",
                                MessageSquare,
                                locale === "en" ? "Work the unified inbox" : "رسیدگی به صندوق یکپارچه",
                            ],
                            ["/tickets/internal", PenLine, locale === "en" ? "Internal coordination" : "هماهنگی و گفت‌وگوی داخلی"],
                            ["/tickets/channels", Radio, locale === "en" ? "Channel health" : "وضعیت کانال‌های ارتباطی"],
                            ["/tickets/campaigns", Megaphone, locale === "en" ? "Campaign operations" : "عملیات کمپین پیام"],
                        ].map(([href, Icon, label]) => (
                            <Button key={String(href)} variant="outline" className="h-auto justify-start gap-3 px-3 py-3" asChild>
                                <Link href={href as never}>
                                    <span className="grid size-8 place-items-center rounded-lg bg-muted">
                                        <Icon className="size-4" aria-hidden="true" />
                                    </span>
                                    <span className="text-start text-xs">{String(label)}</span>
                                </Link>
                            </Button>
                        ))}
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-sm">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                    <div>
                        <CardTitle className="text-base">{locale === "en" ? "Recent tickets" : "آخرین تیکت‌ها"}</CardTitle>
                        <p className="mt-1 text-muted-foreground text-xs">
                            {locale === "en"
                                ? "Newest queue activity, not sample data."
                                : "آخرین فعالیت واقعی صف، بدون داده نمایشی."}
                        </p>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                        <Link href={"/tickets/inbox" as never}>{locale === "en" ? "View all" : "مشاهده همه"}</Link>
                    </Button>
                </CardHeader>
                <CardContent>
                    {tickets.isLoading ? (
                        <LoadingGrid rows={5} />
                    ) : recent.length === 0 ? (
                        <EmptySupportState title={t.emptyQueue} />
                    ) : (
                        <div className="grid gap-2 lg:grid-cols-2">
                            {recent.map((ticket) => (
                                <Link
                                    key={ticket.id}
                                    href={`/tickets/inbox/${ticket.id}` as never}
                                    className="group rounded-xl border p-3 transition-colors hover:border-primary/20 hover:bg-muted/35"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate font-medium text-sm group-hover:text-primary">
                                                {ticket.subject}
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                                                <span dir="ltr">{ticket.reference}</span>
                                                <span>·</span>
                                                <span className="truncate">{ticket.requester_name}</span>
                                                <span>·</span>
                                                <span>{formatDate(ticket.last_message_at, locale)}</span>
                                            </div>
                                        </div>
                                        <TicketPriorityBadge priority={ticket.priority} label={priorities[ticket.priority]} />
                                    </div>
                                    <div className="mt-3 flex items-center justify-between gap-2">
                                        <TicketStatusBadge status={ticket.status} label={statuses[ticket.status]} />
                                        <span className="truncate text-[0.7rem] text-muted-foreground">
                                            {ticket.assignee_email ?? t.unassigned}
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                <Card className="shadow-sm">
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-base">{locale === "en" ? "Online support" : "پشتیبان‌های آنلاین"}</CardTitle>
                        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {presence.isLoading ? (
                            <LoadingGrid rows={3} />
                        ) : activeAgents.length === 0 ? (
                            <EmptySupportState title={locale === "en" ? "No fresh heartbeat" : "حضور آنلاین تازه‌ای ثبت نشده"} />
                        ) : (
                            activeAgents.slice(0, 5).map((agent) => (
                                <div
                                    key={agent.user_id}
                                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                                >
                                    <div className="min-w-0">
                                        <div className="truncate font-medium text-xs">{agent.email ?? `#${agent.user_id}`}</div>
                                        <div className="mt-1 text-[0.68rem] text-muted-foreground">
                                            {agent.active_count.toLocaleString(numberLocale)} /{" "}
                                            {agent.capacity.toLocaleString(numberLocale)} {locale === "en" ? "active" : "فعال"}
                                        </div>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className={
                                            agent.effective_state === "available"
                                                ? "border-success/20 bg-success/10 text-success"
                                                : ""
                                        }
                                    >
                                        {presenceStateLabel(agent.effective_state, locale)}
                                    </Badge>
                                </div>
                            ))
                        )}
                        <Button variant="ghost" size="sm" className="w-full" asChild>
                            <Link href={"/tickets/internal" as never}>
                                {locale === "en" ? "Open team workspace" : "ورود به فضای تیم"}
                            </Link>
                        </Button>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-base">
                            {locale === "en" ? "Messaging channels" : "کانال‌های پیام‌رسان"}
                        </CardTitle>
                        <Radio className="size-4 text-muted-foreground" aria-hidden="true" />
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {channels.isLoading ? (
                            <LoadingGrid rows={4} />
                        ) : (channels.data ?? []).length === 0 ? (
                            <EmptySupportState title={locale === "en" ? "No channel configuration" : "کانالی پیکربندی نشده"} />
                        ) : (
                            (channels.data ?? []).slice(0, 6).map((channel) => (
                                <div
                                    key={channel.channel}
                                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                                >
                                    <span className="font-medium text-xs">{supportChannelLabel(channel.channel, locale)}</span>
                                    <Badge variant="outline" className={channelStatusTone(channel.status)}>
                                        {supportChannelStatusLabel(channel.status, locale)}
                                    </Badge>
                                </div>
                            ))
                        )}
                        <div className="pt-1 text-[0.68rem] text-muted-foreground">
                            {connectedChannels.length.toLocaleString(numberLocale)}{" "}
                            {locale === "en" ? "verified connected" : "کانال با اتصال تأییدشده"}
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm md:col-span-2 2xl:col-span-1">
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-base">
                            {locale === "en" ? "Campaign operations" : "خلاصه کمپین‌های پیام"}
                        </CardTitle>
                        <Megaphone className="size-4 text-muted-foreground" aria-hidden="true" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-xl border bg-muted/30 p-3">
                                <div className="text-[0.68rem] text-muted-foreground">
                                    {locale === "en" ? "Active / scheduled" : "فعال / زمان‌بندی‌شده"}
                                </div>
                                <div className="mt-1 font-semibold text-xl tabular-nums">
                                    {runningCampaigns.length.toLocaleString(numberLocale)}
                                </div>
                            </div>
                            <div className="rounded-xl border bg-muted/30 p-3">
                                <div className="text-[0.68rem] text-muted-foreground">
                                    {locale === "en" ? "All campaigns" : "کل کمپین‌ها"}
                                </div>
                                <div className="mt-1 font-semibold text-xl tabular-nums">
                                    {(campaigns.data?.length ?? 0).toLocaleString(numberLocale)}
                                </div>
                            </div>
                        </div>
                        {(campaigns.data ?? []).slice(0, 3).map((campaign) => (
                            <div
                                key={campaign.id}
                                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                            >
                                <div className="min-w-0">
                                    <div className="truncate font-medium text-xs">{campaign.name}</div>
                                    <div className="mt-1 text-[0.68rem] text-muted-foreground">
                                        {supportChannelLabel(campaign.channel, locale)}
                                    </div>
                                </div>
                                <Badge variant="outline">{campaignStatusLabel(campaign.status, locale)}</Badge>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" className="w-full" asChild>
                            <Link href={"/tickets/campaigns" as never}>
                                {locale === "en" ? "Campaign center" : "مرکز کمپین‌ها"}
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {(summary.data?.sla_breached ?? 0) > 0 ? (
                <div className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                    <div>
                        <div className="font-medium">{locale === "en" ? "SLA attention required" : "نیاز به رسیدگی SLA"}</div>
                        <p className="mt-1 text-muted-foreground text-xs">
                            {locale === "en"
                                ? `${summary.data?.sla_breached.toLocaleString(numberLocale)} active tickets are currently outside their SLA target.`
                                : `${summary.data?.sla_breached.toLocaleString(numberLocale)} تیکت فعال در حال حاضر از هدف SLA خارج شده‌اند.`}
                        </p>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
