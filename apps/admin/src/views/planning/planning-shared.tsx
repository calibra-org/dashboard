"use client";

import type { ReactNode } from "react";
import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Skeleton } from "#/components/ui/skeleton";
import { Bug, Sparkles } from "#/icons";
import { cn } from "#/lib/utils";

export function InfoLabel({ children, help }: { children: ReactNode; help: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span>{children}</span>
            <HelperTooltip>{help}</HelperTooltip>
        </span>
    );
}

export function AsyncState({ pending, error, empty, onRetry }: { pending: boolean; error: boolean; empty?: boolean; onRetry?: () => void }) {
    if (pending) {
        return (
            <div className="grid gap-3 md:grid-cols-3">
                <Skeleton className="h-28 rounded-xl" />
                <Skeleton className="h-28 rounded-xl" />
                <Skeleton className="h-28 rounded-xl" />
            </div>
        );
    }
    if (error) {
        return (
            <div className="rounded-xl border border-danger/25 bg-danger/5 p-5">
                <div className="flex items-start gap-3">
                    <Bug className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
                    <div className="flex-1">
                        <div className="font-medium">خواندن داده‌های برنامه‌ریزی ناموفق بود</div>
                        <p className="mt-1 text-muted-foreground text-sm">دادهٔ جایگزین نمایش داده نمی‌شود؛ اتصال API یا مجوز اپراتور را بررسی کنید.</p>
                    </div>
                    {onRetry ? (
                        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                            <Sparkles className="size-3.5" aria-hidden="true" />
                            تلاش دوباره
                        </Button>
                    ) : null}
                </div>
            </div>
        );
    }
    if (empty) {
        return (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <div className="font-medium">هنوز داده‌ای برای این بخش وجود ندارد</div>
                <p className="mt-1 text-muted-foreground text-sm">تا وقتی دادهٔ واقعی یا Run معتبر وجود نداشته باشد، مقدار نمونه نمایش داده نمی‌شود.</p>
            </div>
        );
    }
    return null;
}

export function MetricCard({ title, help, value, note, tone = "neutral" }: { title: string; help: string; value: string; note: string; tone?: "neutral" | "danger" | "warning" | "success" | "info" }) {
    const toneClass = {
        neutral: "border-border",
        danger: "border-danger/30 bg-danger/5",
        warning: "border-warning/30 bg-warning/5",
        success: "border-success/30 bg-success/5",
        info: "border-info/30 bg-info/5",
    }[tone];
    return (
        <Card className={cn("overflow-hidden", toneClass)}>
            <CardHeader className="pb-2">
                <CardTitle className="font-medium text-muted-foreground text-xs">
                    <InfoLabel help={help}>{title}</InfoLabel>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="font-semibold text-2xl tracking-tight tabular-nums">{value}</div>
                <div className="mt-1 text-muted-foreground text-xs">{note}</div>
            </CardContent>
        </Card>
    );
}

export function statusTone(status: string): StatusTone {
    if (["approved", "published", "completed", "ready", "low"].includes(status)) return "success";
    if (["under_review", "medium", "limited_history", "pending", "data_ready", "forecasted"].includes(status)) return "warning";
    if (["failed", "cancelled", "high", "rejected", "degraded"].includes(status)) return "danger";
    return "neutral";
}

export function statusFa(status: string): string {
    const labels: Record<string, string> = {
        draft: "پیش‌نویس", data_ready: "داده آماده", forecasted: "Forecast شده", under_review: "در حال بررسی",
        approved: "تأیید شده", published: "منتشر شده", superseded: "منسوخ", cancelled: "لغوشده",
        completed: "تکمیل‌شده", ready: "آماده", running: "در حال اجرا", failed: "ناموفق", pending: "منتظر بررسی",
        rejected: "رد شده", high: "بالا", medium: "متوسط", low: "پایین", unavailable: "ناموجود",
        observed_sales: "تاریخچه کافی", limited_history: "تاریخچه محدود", insufficient_data: "داده ناکافی",
    };
    return labels[status] ?? status;
}
