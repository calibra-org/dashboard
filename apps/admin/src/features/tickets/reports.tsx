"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import { Skeleton } from "#/components/ui/skeleton";
import {
    AlertTriangle,
    BarChart3,
    CheckCircle2,
    Clock3,
    ContactRound,
    Gauge,
    MessageSquare,
    RefreshCw,
    ShieldCheck,
    Users,
} from "#/icons";

import { ticketCopy } from "./copy";
import { useSupportChannels, useSupportReports, useTicketSummary, useTicketTrends } from "./queries";
import {
    durationLabel,
    EmptySupportState,
    LoadingGrid,
    SupportError,
    SupportMetric,
    SupportPageHeader,
    supportChannelLabel,
    TicketTrendChart,
} from "./ui";
import type { TicketPriority, TicketStatus } from "./types";

const PRIORITY_ORDER: TicketPriority[] = ["urgent", "high", "normal", "low"];
const STATUS_ORDER: TicketStatus[] = ["open", "pending", "waiting_customer", "resolved", "closed"];

function percent(value: number, total: number): number {
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, (value / total) * 100));
}

export function TicketReportsPage() {
    const locale = useLocale() as Locale;
    const { priorities, statuses } = ticketCopy(locale);
    const reports = useSupportReports();
    const summary = useTicketSummary();
    const trends = useTicketTrends();
    const channels = useSupportChannels();
    const numberLocale = locale === "fa" ? "fa-IR" : "en-US";
    const data = reports.data;

    const backlogTotal = (data?.backlog ?? []).reduce((sum, row) => sum + row.total, 0);
    const assigneeTotal = (data?.assignees ?? []).reduce((sum, row) => sum + row.active, 0);
    const statusTotal = (data?.statuses ?? []).reduce((sum, row) => sum + row.total, 0);
    const channelTotal = (data?.channels ?? []).reduce((sum, row) => sum + row.total, 0);
    const connectedChannels = (channels.data ?? []).filter((channel) => channel.status === "connected").length;

    return (
        <div className="flex flex-col gap-5">
            <SupportPageHeader
                eyebrow={locale === "en" ? "Support intelligence" : "هوش عملیاتی پشتیبانی"}
                title={locale === "en" ? "Support reports" : "گزارش‌های مرکز پشتیبانی"}
                subtitle={
                    locale === "en"
                        ? "Persisted SLA, backlog, workload, channel and satisfaction evidence. No synthetic conversion or service-quality metrics are generated."
                        : "نمای واقعی SLA، صف، بار کارشناسان، کانال‌ها و رضایت ثبت‌شده؛ بدون ساخت نرخ تبدیل یا شاخص کیفیت نمایشی."
                }
                icon={BarChart3}
                actions={
                    <Button
                        variant="outline"
                        onClick={() =>
                            void Promise.all([reports.refetch(), summary.refetch(), trends.refetch(), channels.refetch()])
                        }
                        disabled={reports.isFetching || summary.isFetching}
                    >
                        <RefreshCw className={reports.isFetching ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
                        {locale === "en" ? "Refresh evidence" : "به‌روزرسانی شواهد"}
                    </Button>
                }
            />

            {reports.isError ? (
                <SupportError
                    title={locale === "en" ? "Support reports could not be loaded." : "دریافت گزارش‌های پشتیبانی ناموفق بود."}
                    retryLabel={locale === "en" ? "Retry" : "تلاش دوباره"}
                    onRetry={() => void reports.refetch()}
                />
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                {reports.isLoading || summary.isLoading ? (
                    Array.from({ length: 6 }, (_, index) => `report-kpi-${index + 1}`).map((key) => (
                        <Skeleton key={key} className="h-28 rounded-xl" />
                    ))
                ) : (
                    <>
                        <SupportMetric
                            label={locale === "en" ? "Open backlog" : "صف باز"}
                            value={backlogTotal.toLocaleString(numberLocale)}
                            hint={locale === "en" ? "Excludes resolved and closed" : "بدون تیکت‌های حل‌شده و بسته"}
                            icon={MessageSquare}
                            tone={backlogTotal > 0 ? "warning" : "neutral"}
                        />
                        <SupportMetric
                            label={locale === "en" ? "First-response breaches" : "نقض پاسخ اولیه"}
                            value={(data?.sla.first_response_breached ?? 0).toLocaleString(numberLocale)}
                            hint={locale === "en" ? "Currently overdue" : "در حال حاضر از موعد گذشته"}
                            icon={AlertTriangle}
                            tone={(data?.sla.first_response_breached ?? 0) > 0 ? "danger" : "success"}
                        />
                        <SupportMetric
                            label={locale === "en" ? "Avg. first response" : "میانگین پاسخ اولیه"}
                            value={durationLabel(data?.sla.avg_first_response_minutes ?? 0, locale)}
                            hint={locale === "en" ? "Completed first responses" : "بر اساس پاسخ‌های اولیه ثبت‌شده"}
                            icon={Clock3}
                            tone="info"
                        />
                        <SupportMetric
                            label={locale === "en" ? "Reopened tickets" : "تیکت‌های بازگشایی‌شده"}
                            value={(data?.reopened_tickets ?? 0).toLocaleString(numberLocale)}
                            hint={locale === "en" ? "Evidence from status events" : "بر اساس رویداد تغییر وضعیت"}
                            icon={RefreshCw}
                            tone={(data?.reopened_tickets ?? 0) > 0 ? "warning" : "neutral"}
                        />
                        <SupportMetric
                            label={locale === "en" ? "FCR proxy" : "شاخص تقریبی FCR"}
                            value={
                                (data?.fcr_proxy.completed_tickets ?? 0) > 0
                                    ? `${(data?.fcr_proxy.rate_percent ?? 0).toFixed(1)}%`
                                    : "—"
                            }
                            hint={locale === "en" ? "Resolved without later reopen" : "حل‌شده بدون بازگشایی بعدی"}
                            icon={CheckCircle2}
                            tone="success"
                        />
                        <SupportMetric
                            label={locale === "en" ? "Persisted CSAT" : "رضایت ثبت‌شده"}
                            value={(data?.csat.responses ?? 0) > 0 ? `${(data?.csat.average ?? 0).toFixed(1)} / 5` : "—"}
                            hint={`${(data?.csat.responses ?? 0).toLocaleString(numberLocale)} ${locale === "en" ? "responses" : "پاسخ"}`}
                            icon={ContactRound}
                            tone="neutral"
                        />
                    </>
                )}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.75fr)]">
                <Card className="shadow-sm">
                    <CardHeader className="flex-row items-start justify-between space-y-0">
                        <div>
                            <CardTitle className="text-base">
                                {locale === "en" ? "30-day ticket flow" : "جریان تیکت در ۳۰ روز"}
                            </CardTitle>
                            <p className="mt-1 text-muted-foreground text-xs">
                                {locale === "en"
                                    ? "Opened versus resolved tickets from the ticket store."
                                    : "تیکت‌های ایجادشده در برابر تیکت‌های حل‌شده از منبع واقعی."}
                            </p>
                        </div>
                        <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
                    </CardHeader>
                    <CardContent>
                        {trends.isLoading ? (
                            <Skeleton className="h-52 rounded-xl" />
                        ) : (
                            <TicketTrendChart points={trends.data ?? []} locale={locale} />
                        )}
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">{locale === "en" ? "SLA health" : "سلامت SLA"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {reports.isLoading ? (
                            <LoadingGrid rows={4} />
                        ) : (
                            <>
                                <div className="rounded-xl border p-3">
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                        <span className="text-muted-foreground">
                                            {locale === "en" ? "Resolution breaches" : "نقض زمان حل"}
                                        </span>
                                        <Badge
                                            variant="outline"
                                            className={
                                                (data?.sla.resolution_breached ?? 0) > 0
                                                    ? "border-danger/20 bg-danger/10 text-danger"
                                                    : "border-success/20 bg-success/10 text-success"
                                            }
                                        >
                                            {(data?.sla.resolution_breached ?? 0).toLocaleString(numberLocale)}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="rounded-xl border p-3">
                                    <div className="text-muted-foreground text-xs">
                                        {locale === "en" ? "Average resolution time" : "میانگین زمان حل"}
                                    </div>
                                    <div className="mt-2 font-semibold text-lg">
                                        {durationLabel(data?.sla.avg_resolution_minutes ?? 0, locale)}
                                    </div>
                                </div>
                                <div className="rounded-xl border p-3">
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                        <span className="text-muted-foreground">
                                            {locale === "en" ? "Verified connected channels" : "کانال‌های متصلِ تأییدشده"}
                                        </span>
                                        <span className="font-semibold">{connectedChannels.toLocaleString(numberLocale)}</span>
                                    </div>
                                    <p className="mt-2 text-[0.7rem] text-muted-foreground leading-5">
                                        {locale === "en"
                                            ? "Configured adapters are not counted as connected until provider evidence is recorded."
                                            : "کانال صرفاً پیکربندی‌شده تا ثبت شواهد ارائه‌دهنده، متصل شمرده نمی‌شود."}
                                    </p>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">
                            {locale === "en" ? "Backlog by priority" : "صف باز بر اساس اولویت"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {reports.isLoading ? (
                            <LoadingGrid rows={4} />
                        ) : backlogTotal === 0 ? (
                            <EmptySupportState title={locale === "en" ? "No active backlog" : "صف فعالی وجود ندارد"} />
                        ) : (
                            PRIORITY_ORDER.map((priority) => {
                                const total = data?.backlog.find((row) => row.priority === priority)?.total ?? 0;
                                return (
                                    <div key={priority} className="space-y-2">
                                        <div className="flex items-center justify-between gap-3 text-xs">
                                            <span>{priorities[priority]}</span>
                                            <span className="font-medium">{total.toLocaleString(numberLocale)}</span>
                                        </div>
                                        <Progress value={percent(total, backlogTotal)} className="h-1.5" />
                                    </div>
                                );
                            })
                        )}
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Users className="size-4" aria-hidden="true" />
                            {locale === "en" ? "Active workload by assignee" : "بار فعال کارشناسان"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {reports.isLoading ? (
                            <LoadingGrid rows={5} />
                        ) : assigneeTotal === 0 ? (
                            <EmptySupportState
                                title={locale === "en" ? "No assigned active tickets" : "تیکت فعال تخصیص‌یافته‌ای وجود ندارد"}
                            />
                        ) : (
                            (data?.assignees ?? []).slice(0, 8).map((row) => (
                                <div key={row.assigned_user_id ?? "unassigned"} className="rounded-xl border px-3 py-3">
                                    <div className="flex items-center justify-between gap-3 text-xs">
                                        <span className="min-w-0 truncate">
                                            {row.email ?? (locale === "en" ? "Unassigned" : "بدون مسئول")}
                                        </span>
                                        <span className="font-semibold">{row.active.toLocaleString(numberLocale)}</span>
                                    </div>
                                    <Progress value={percent(row.active, assigneeTotal)} className="mt-2 h-1.5" />
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">
                            {locale === "en" ? "Ticket status distribution" : "توزیع وضعیت تیکت‌ها"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {reports.isLoading ? (
                            <LoadingGrid rows={5} />
                        ) : statusTotal === 0 ? (
                            <EmptySupportState title={locale === "en" ? "No tickets yet" : "هنوز تیکتی ثبت نشده"} />
                        ) : (
                            STATUS_ORDER.map((status) => {
                                const total = data?.statuses.find((row) => row.status === status)?.total ?? 0;
                                return (
                                    <div key={status} className="flex items-center gap-3">
                                        <span className="w-28 shrink-0 truncate text-xs">{statuses[status]}</span>
                                        <Progress value={percent(total, statusTotal)} className="h-1.5 flex-1" />
                                        <span className="w-10 text-end font-medium text-xs">
                                            {total.toLocaleString(numberLocale)}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ShieldCheck className="size-4" aria-hidden="true" />
                            {locale === "en" ? "Channel intake distribution" : "توزیع ورودی کانال‌ها"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {reports.isLoading ? (
                            <LoadingGrid rows={5} />
                        ) : channelTotal === 0 ? (
                            <EmptySupportState
                                title={locale === "en" ? "No channel evidence yet" : "هنوز داده‌ای برای کانال‌ها ثبت نشده"}
                            />
                        ) : (
                            (data?.channels ?? []).map((row) => (
                                <div key={row.channel} className="flex items-center gap-3">
                                    <span className="w-28 shrink-0 truncate text-xs">
                                        {row.channel === "admin"
                                            ? locale === "en"
                                                ? "Admin"
                                                : "پنل مدیریت"
                                            : supportChannelLabel(row.channel, locale)}
                                    </span>
                                    <Progress value={percent(row.total, channelTotal)} className="h-1.5 flex-1" />
                                    <span className="w-10 text-end font-medium text-xs">
                                        {row.total.toLocaleString(numberLocale)}
                                    </span>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
