"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import {
    AlertCircle,
    ArrowStart,
    BarChart3,
    Clock3,
    Inbox,
    LayoutDashboard,
    Megaphone,
    MessageSquare,
    PenLine,
    Radio,
    RefreshCw,
    SlidersHorizontal,
    Users,
} from "#/icons";
import { Link, usePathname } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

import type {
    AgentPresenceState,
    CampaignStatus,
    CampaignTemplateStatus,
    SupportAutomationTrigger,
    SupportChannel,
    SupportChannelStatus,
    TicketChannel,
    TicketPriority,
    TicketStatus,
} from "./types";

export type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const SUPPORT_SECTIONS: Array<{
    href: string;
    icon: IconType;
    fa: string;
    en: string;
}> = [
    { href: "/tickets/overview", icon: LayoutDashboard, fa: "داشبورد", en: "Overview" },
    { href: "/tickets/create", icon: PenLine, fa: "ثبت تیکت", en: "Create" },
    { href: "/tickets/inbox", icon: Inbox, fa: "صندوق تیکت‌ها", en: "Inbox" },
    { href: "/tickets/internal", icon: Users, fa: "گفت‌وگوهای داخلی", en: "Internal" },
    { href: "/tickets/channels", icon: Radio, fa: "پیام‌رسان‌ها", en: "Channels" },
    { href: "/tickets/campaigns", icon: Megaphone, fa: "کمپین پیام", en: "Campaigns" },
    { href: "/tickets/reports", icon: BarChart3, fa: "گزارش‌ها", en: "Reports" },
    { href: "/tickets/settings", icon: SlidersHorizontal, fa: "تنظیمات", en: "Settings" },
];

function supportSectionActive(pathname: string, href: string): boolean {
    if (href === "/tickets/inbox") {
        return pathname === href || pathname.startsWith(`${href}/`) || /^\/tickets\/\d+/.test(pathname);
    }
    return pathname === href || pathname.startsWith(`${href}/`);
}

export function statusTone(status: TicketStatus): string {
    if (status === "resolved" || status === "closed") return "border-success/20 bg-success/10 text-success";
    if (status === "waiting_customer") return "border-warning/20 bg-warning/10 text-warning";
    if (status === "pending") return "border-primary/20 bg-primary/10 text-primary";
    return "border-border bg-muted text-foreground";
}

export function priorityTone(priority: TicketPriority): string {
    if (priority === "urgent") return "border-danger/20 bg-danger/10 text-danger";
    if (priority === "high") return "border-warning/20 bg-warning/10 text-warning";
    if (priority === "low") return "border-info/20 bg-info/10 text-info";
    return "border-border bg-muted text-muted-foreground";
}

export function channelStatusTone(status: SupportChannelStatus): string {
    if (status === "connected") return "border-success/20 bg-success/10 text-success";
    if (status === "error") return "border-danger/20 bg-danger/10 text-danger";
    if (status === "configured") return "border-warning/20 bg-warning/10 text-warning";
    return "border-border bg-muted text-muted-foreground";
}

export function supportChannelLabel(channel: SupportChannel, locale: Locale): string {
    const fa: Record<SupportChannel, string> = {
        web: "وب",
        email: "ایمیل",
        phone: "تلفن",
        api: "API",
        whatsapp: "واتساپ",
        telegram: "تلگرام",
        instagram: "دایرکت اینستاگرام",
        rubika: "روبیکا",
        bale: "بله",
        eitaa: "ایتا",
        sms: "پیامک",
    };
    const en: Record<SupportChannel, string> = {
        web: "Web",
        email: "Email",
        phone: "Phone",
        api: "API",
        whatsapp: "WhatsApp",
        telegram: "Telegram",
        instagram: "Instagram",
        rubika: "Rubika",
        bale: "Bale",
        eitaa: "Eitaa",
        sms: "SMS",
    };
    return locale === "en" ? en[channel] : fa[channel];
}

export function ticketChannelLabel(channel: TicketChannel, locale: Locale): string {
    if (channel === "admin") return locale === "en" ? "Admin / internal" : "پنل مدیریت / داخلی";
    return supportChannelLabel(channel, locale);
}

export function supportChannelStatusLabel(status: SupportChannelStatus, locale: Locale): string {
    const labels: Record<SupportChannelStatus, { fa: string; en: string }> = {
        disabled: { fa: "غیرفعال", en: "Disabled" },
        configured: { fa: "پیکربندی‌شده", en: "Configured" },
        connected: { fa: "متصلِ تأییدشده", en: "Verified connected" },
        error: { fa: "خطای اتصال", en: "Connection error" },
    };
    return labels[status][locale === "en" ? "en" : "fa"];
}

export function presenceStateLabel(state: AgentPresenceState, locale: Locale): string {
    const labels: Record<AgentPresenceState, { fa: string; en: string }> = {
        offline: { fa: "آفلاین", en: "Offline" },
        available: { fa: "آماده پاسخ‌گویی", en: "Available" },
        busy: { fa: "مشغول", en: "Busy" },
        away: { fa: "دور از میز", en: "Away" },
    };
    return labels[state][locale === "en" ? "en" : "fa"];
}

export function campaignStatusLabel(status: CampaignStatus, locale: Locale): string {
    const labels: Record<CampaignStatus, { fa: string; en: string }> = {
        draft: { fa: "پیش‌نویس", en: "Draft" },
        scheduled: { fa: "زمان‌بندی‌شده", en: "Scheduled" },
        running: { fa: "در حال ارسال", en: "Running" },
        paused: { fa: "متوقف", en: "Paused" },
        completed: { fa: "تکمیل‌شده", en: "Completed" },
        cancelled: { fa: "لغوشده", en: "Cancelled" },
    };
    return labels[status][locale === "en" ? "en" : "fa"];
}

export function campaignTemplateStatusLabel(status: CampaignTemplateStatus, locale: Locale): string {
    const labels: Record<CampaignTemplateStatus, { fa: string; en: string }> = {
        draft: { fa: "پیش‌نویس", en: "Draft" },
        pending: { fa: "در انتظار بازبینی", en: "Pending review" },
        approved: { fa: "تأییدشده", en: "Approved" },
        rejected: { fa: "ردشده", en: "Rejected" },
    };
    return labels[status][locale === "en" ? "en" : "fa"];
}

export function automationTriggerLabel(trigger: SupportAutomationTrigger, locale: Locale): string {
    const labels: Record<SupportAutomationTrigger, { fa: string; en: string }> = {
        ticket_created: { fa: "ایجاد تیکت", en: "Ticket created" },
        ticket_updated: { fa: "به‌روزرسانی تیکت", en: "Ticket updated" },
        status_changed: { fa: "تغییر وضعیت", en: "Status changed" },
        message_received: { fa: "دریافت پیام", en: "Message received" },
        sla_breached: { fa: "نقض SLA", en: "SLA breached" },
    };
    return labels[trigger][locale === "en" ? "en" : "fa"];
}

export function workflowSemanticLabel(group: "active" | "waiting" | "resolved" | "closed", locale: Locale): string {
    const labels = {
        active: locale === "en" ? "Active" : "فعال",
        waiting: locale === "en" ? "Waiting" : "در انتظار",
        resolved: locale === "en" ? "Resolved" : "حل‌شده",
        closed: locale === "en" ? "Closed" : "بسته",
    };
    return labels[group];
}

export function durationLabel(minutes: number, locale: Locale): string {
    const numberLocale = locale === "fa" ? "fa-IR" : "en-US";
    const format = (value: number, maximumFractionDigits = 0) =>
        new Intl.NumberFormat(numberLocale, { maximumFractionDigits }).format(value);
    if (minutes < 60) return `${format(Math.round(minutes))} ${locale === "en" ? "min" : "دقیقه"}`;
    const hours = minutes / 60;
    if (hours < 24) return `${format(hours, hours >= 10 ? 0 : 1)} ${locale === "en" ? "hr" : "ساعت"}`;
    const days = hours / 24;
    return `${format(days, days >= 10 ? 0 : 1)} ${locale === "en" ? "day" : "روز"}`;
}

export function SupportPageHeader({
    eyebrow,
    title,
    subtitle,
    icon: Icon = MessageSquare,
    actions,
}: {
    eyebrow: string;
    title: string;
    subtitle: string;
    icon?: IconType;
    actions?: ReactNode;
}) {
    const locale = useLocale() as Locale;
    const pathname = usePathname();

    return (
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="relative px-4 py-5 sm:px-6 sm:py-6">
                <div className="pointer-events-none absolute -start-16 -top-20 size-48 rounded-full bg-primary/5 blur-3xl" />
                <div className="relative flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-3xl">
                        <div className="mb-2 flex items-center gap-2 font-medium text-primary text-xs">
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary/15 bg-primary/10">
                                <Icon className="size-4" aria-hidden="true" />
                            </span>
                            <span className="truncate">{eyebrow}</span>
                        </div>
                        <h1 className="text-balance font-semibold text-xl tracking-tight sm:text-2xl">{title}</h1>
                        <p className="mt-1.5 max-w-2xl text-pretty text-muted-foreground text-sm leading-6">{subtitle}</p>
                    </div>
                    {actions ? (
                        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
                            {actions}
                        </div>
                    ) : null}
                </div>
            </div>

            <nav className="border-t bg-muted/15" aria-label={locale === "en" ? "Support sections" : "بخش‌های مرکز پشتیبانی"}>
                <div className="overflow-x-auto px-2 py-2 sm:px-4">
                    <div className="flex min-w-max items-center gap-1">
                        {SUPPORT_SECTIONS.map((item) => {
                            const SectionIcon = item.icon;
                            const active = supportSectionActive(pathname, item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href as never}
                                    aria-current={active ? "page" : undefined}
                                    className={cn(
                                        "inline-flex h-9 items-center gap-2 rounded-lg px-3 font-medium text-xs transition-colors",
                                        active
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                    )}
                                >
                                    <SectionIcon className="size-3.5" aria-hidden="true" />
                                    <span>{locale === "en" ? item.en : item.fa}</span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </nav>
        </section>
    );
}

export function SupportMetric({
    label,
    value,
    hint,
    icon: Icon,
    tone = "primary",
}: {
    label: string;
    value: string;
    hint?: string;
    icon: IconType;
    tone?: "primary" | "success" | "warning" | "danger" | "info" | "neutral";
}) {
    const toneClass = {
        primary: "border-primary/15 bg-primary/10 text-primary",
        success: "border-success/15 bg-success/10 text-success",
        warning: "border-warning/15 bg-warning/10 text-warning",
        danger: "border-danger/15 bg-danger/10 text-danger",
        info: "border-info/15 bg-info/10 text-info",
        neutral: "border-border bg-muted text-muted-foreground",
    }[tone];
    return (
        <Card className="group h-full min-h-28 overflow-hidden shadow-sm transition-[border-color,box-shadow] hover:border-primary/20 hover:shadow-md">
            <CardContent className="flex h-full items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                    <p className="text-muted-foreground text-xs leading-5">{label}</p>
                    <div className="mt-1.5 font-semibold text-2xl tabular-nums tracking-tight">{value}</div>
                    {hint ? <p className="mt-1 line-clamp-2 text-[0.7rem] text-muted-foreground leading-5">{hint}</p> : null}
                </div>
                <div className={cn("grid size-9 shrink-0 place-items-center rounded-lg border", toneClass)}>
                    <Icon className="size-4" aria-hidden="true" />
                </div>
            </CardContent>
        </Card>
    );
}

export function TicketStatusBadge({ status, label }: { status: TicketStatus; label: string }) {
    return (
        <Badge variant="outline" className={cn("whitespace-nowrap", statusTone(status))}>
            {label}
        </Badge>
    );
}

export function TicketPriorityBadge({ priority, label }: { priority: TicketPriority; label: string }) {
    return (
        <Badge variant="outline" className={cn("whitespace-nowrap", priorityTone(priority))}>
            {label}
        </Badge>
    );
}

export function LoadingGrid({ rows = 4 }: { rows?: number }) {
    return (
        <div className="space-y-2">
            {Array.from({ length: rows }, (_, index) => `ticket-loading-${index + 1}`).map((key) => (
                <Skeleton key={key} className="h-14 rounded-xl" />
            ))}
        </div>
    );
}

export function SupportError({ title, retryLabel, onRetry }: { title: string; retryLabel: string; onRetry: () => void }) {
    return (
        <div className="grid min-h-56 place-items-center rounded-xl border border-dashed p-6 text-center">
            <div>
                <AlertCircle className="mx-auto size-7 text-danger" aria-hidden="true" />
                <p className="mt-3 font-medium text-sm">{title}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    {retryLabel}
                </Button>
            </div>
        </div>
    );
}

export function EmptySupportState({ title, description }: { title: string; description?: string }) {
    return (
        <div className="grid min-h-40 place-items-center rounded-xl border border-dashed bg-muted/10 p-6 text-center">
            <div>
                <MessageSquare className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 font-medium text-sm">{title}</p>
                {description ? <p className="mt-1 max-w-sm text-muted-foreground text-xs leading-5">{description}</p> : null}
            </div>
        </div>
    );
}

export function TicketTrendChart({
    points,
    locale,
}: {
    points: Array<{ day: string; opened: number; resolved: number }>;
    locale: Locale;
}) {
    const max = Math.max(1, ...points.flatMap((point) => [point.opened, point.resolved]));
    const width = 760;
    const height = 190;
    const x = (index: number) => (points.length <= 1 ? width / 2 : (index / (points.length - 1)) * width);
    const y = (value: number) => height - (value / max) * (height - 24) - 12;
    const opened = points.map((point, index) => `${x(index)},${y(point.opened)}`).join(" ");
    const resolved = points.map((point, index) => `${x(index)},${y(point.resolved)}`).join(" ");
    return (
        <div className="h-52 w-full overflow-hidden" aria-label={locale === "en" ? "Ticket trend" : "روند تیکت‌ها"} role="img">
            <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none">
                {[0.25, 0.5, 0.75].map((position) => (
                    <line
                        key={position}
                        x1="0"
                        x2={width}
                        y1={height * position}
                        y2={height * position}
                        className="stroke-border"
                        strokeWidth="1"
                        strokeDasharray="4 7"
                    />
                ))}
                <polyline
                    points={opened}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-primary"
                    vectorEffect="non-scaling-stroke"
                />
                <polyline
                    points={resolved}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-success"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
        </div>
    );
}

export function BackToInbox({ label }: { label: string }) {
    return (
        <Link
            href={"/tickets/inbox" as never}
            className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
        >
            <ArrowStart className="size-3.5" aria-hidden="true" />
            {label}
        </Link>
    );
}

export function SlaPill({ dueAt, completedAt, locale }: { dueAt: string | null; completedAt: string | null; locale: Locale }) {
    if (completedAt)
        return (
            <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
                {locale === "en" ? "Completed" : "انجام‌شده"}
            </Badge>
        );
    if (!dueAt) return <Badge variant="outline">{locale === "en" ? "No SLA" : "بدون SLA"}</Badge>;
    const breached = new Date(dueAt).getTime() < Date.now();
    return (
        <Badge
            variant="outline"
            className={breached ? "border-danger/20 bg-danger/10 text-danger" : "border-success/20 bg-success/10 text-success"}
        >
            <Clock3 className="size-3" aria-hidden="true" />
            {breached ? (locale === "en" ? "Breached" : "نقض‌شده") : locale === "en" ? "On track" : "در محدوده"}
        </Badge>
    );
}
