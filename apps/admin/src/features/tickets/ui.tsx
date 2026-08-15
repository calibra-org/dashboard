"use client";

import type { Locale } from "@calibra/shared/i18n";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { AlertCircle, ArrowStart, Clock3, MessageSquare, RefreshCw } from "#/icons";
import { Link } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

import type { SupportChannel, SupportChannelStatus, TicketPriority, TicketStatus } from "./types";

export type IconType = ComponentType<SVGProps<SVGSVGElement>>;

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

export function durationLabel(minutes: number, locale: Locale): string {
    const numberLocale = locale === "fa" ? "fa-IR" : "en-US";
    if (minutes < 60) return `${Math.round(minutes).toLocaleString(numberLocale)} ${locale === "en" ? "min" : "دقیقه"}`;
    const hours = minutes / 60;
    if (hours < 24) return `${hours.toFixed(hours >= 10 ? 0 : 1)} ${locale === "en" ? "hr" : "ساعت"}`;
    const days = hours / 24;
    return `${days.toFixed(days >= 10 ? 0 : 1)} ${locale === "en" ? "day" : "روز"}`;
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
    return (
        <div className="relative overflow-hidden rounded-2xl border bg-card px-5 py-5 shadow-sm sm:px-6">
            <div className="pointer-events-none absolute -start-14 -top-20 size-52 rounded-full bg-primary/5 blur-2xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-3xl">
                    <div className="mb-2 flex items-center gap-2 font-medium text-primary text-xs">
                        <span className="grid size-7 place-items-center rounded-lg border border-primary/15 bg-primary/8">
                            <Icon className="size-3.5" aria-hidden="true" />
                        </span>
                        {eyebrow}
                    </div>
                    <h1 className="font-semibold text-2xl tracking-tight sm:text-[1.7rem]">{title}</h1>
                    <p className="mt-1.5 max-w-2xl text-muted-foreground text-sm leading-6">{subtitle}</p>
                </div>
                {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
        </div>
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
        primary: "border-primary/15 bg-primary/8 text-primary",
        success: "border-success/15 bg-success/8 text-success",
        warning: "border-warning/15 bg-warning/8 text-warning",
        danger: "border-danger/15 bg-danger/8 text-danger",
        info: "border-info/15 bg-info/8 text-info",
        neutral: "border-border bg-muted text-muted-foreground",
    }[tone];
    return (
        <Card className="overflow-hidden shadow-sm">
            <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                    <p className="truncate text-muted-foreground text-xs">{label}</p>
                    <div className="mt-2 font-semibold text-2xl tracking-tight">{value}</div>
                    {hint ? <p className="mt-1 truncate text-[0.7rem] text-muted-foreground">{hint}</p> : null}
                </div>
                <div className={cn("grid size-9 shrink-0 place-items-center rounded-xl border", toneClass)}>
                    <Icon className="size-4" aria-hidden="true" />
                </div>
            </CardContent>
        </Card>
    );
}

export function TicketStatusBadge({ status, label }: { status: TicketStatus; label: string }) {
    return (
        <Badge variant="outline" className={statusTone(status)}>
            {label}
        </Badge>
    );
}

export function TicketPriorityBadge({ priority, label }: { priority: TicketPriority; label: string }) {
    return (
        <Badge variant="outline" className={priorityTone(priority)}>
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
        <div className="grid min-h-40 place-items-center rounded-xl border border-dashed p-6 text-center">
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
    const x = (index: number) => (points.length <= 1 ? 0 : (index / (points.length - 1)) * width);
    const y = (value: number) => height - (value / max) * (height - 24) - 12;
    const opened = points.map((point, index) => `${x(index)},${y(point.opened)}`).join(" ");
    const resolved = points.map((point, index) => `${x(index)},${y(point.resolved)}`).join(" ");
    return (
        <div className="h-52 w-full overflow-hidden" aria-label={locale === "en" ? "Ticket trend" : "روند تیکت‌ها"} role="img">
            <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="ticket-open-fill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                </defs>
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
    if (completedAt) {
        return (
            <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
                {locale === "en" ? "Completed" : "انجام‌شده"}
            </Badge>
        );
    }
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
