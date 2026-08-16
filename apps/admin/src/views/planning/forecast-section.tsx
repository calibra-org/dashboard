"use client";
import type { Locale } from "@calibra/shared/i18n";
import { useState } from "react";
import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Sparkles } from "#/icons";
import { formatDate, formatNumber } from "#/lib/format";
import { usePlanningForecast, useRunPlanningForecast } from "#/lib/queries/planning";
import { AsyncState, InfoLabel, statusFa, statusTone } from "./planning-shared";

export function ForecastSection({ locale }: { locale: Locale }) {
    const query = usePlanningForecast();
    const run = useRunPlanningForecast();
    const [historyDays, setHistoryDays] = useState("56");
    const [horizonDays, setHorizonDays] = useState("14");
    if (query.isPending || query.isError) return <AsyncState pending={query.isPending} error={query.isError} onRetry={() => void query.refetch()} />;
    const data = query.data.data;
    const maxPoint = Math.max(1, ...data.series.flatMap((series) => series.points.map((point) => point.upper)));
    return (
        <div className="flex flex-col gap-5">
            <Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle className="text-base"><InfoLabel help="Run جدید، فروش واقعی بازه تاریخی را snapshot می‌کند و با مدل baseline فصلی هفتگی point و interval می‌سازد. اجرای Run هیچ داده عملیاتی را mutate نمی‌کند.">اجرای Forecast</InfoLabel></CardTitle><p className="mt-1 text-muted-foreground text-xs">مدل production baseline: Seasonal Naive v1 · deterministic و versioned</p></div>{data.run ? <StatusBadge tone="success">Run #{formatNumber(data.run.id, locale)}</StatusBadge> : <StatusBadge tone="neutral">اجرا نشده</StatusBadge>}</CardHeader><CardContent className="flex flex-col gap-3 md:flex-row md:items-end"><label className="grid gap-1 text-xs"><span><InfoLabel help="تعداد روزهای گذشته که برای ساخت الگوی تقاضا خوانده می‌شود. مقدار بیشتر لزوماً بهتر نیست؛ تغییر ساختاری می‌تواند history قدیمی را کم‌ارزش کند.">تاریخچه (روز)</InfoLabel></span><Input inputMode="numeric" value={historyDays} onChange={(event) => setHistoryDays(event.target.value)} className="w-32" /></label><label className="grid gap-1 text-xs"><span><InfoLabel help="تعداد روزهای آینده که Forecast برای آن point ذخیره می‌کند. Inventory Risk همین افق را مبنا قرار می‌دهد.">افق Forecast (روز)</InfoLabel></span><Input inputMode="numeric" value={horizonDays} onChange={(event) => setHorizonDays(event.target.value)} className="w-32" /></label><Button type="button" isLoading={run.isPending} onClick={() => run.mutate({ history_days: Number(historyDays), horizon_days: Number(horizonDays) })}><Sparkles className="size-4" aria-hidden="true" />اجرای Run جدید</Button></CardContent></Card>
            {data.status !== "ready" || data.series.length === 0 ? <AsyncState pending={false} error={false} empty /> : <div className="grid gap-4 xl:grid-cols-2">{data.series.slice(0, 12).map((series) => <Card key={`${series.product_id}:${series.variation_id}:${series.sku ?? ""}`}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-sm"><InfoLabel help="هر سری یک Product/Variant مستقل است. Quantity از order_line_items واقعی می‌آید و historical sales با demand قطعی برابر فرض نمی‌شود.">{series.name}</InfoLabel></CardTitle><div className="mt-1 text-muted-foreground text-xs">SKU: {series.sku ?? "—"}</div></div><StatusBadge tone={statusTone(series.quality)}>{statusFa(series.quality)}</StatusBadge></div></CardHeader><CardContent className="space-y-2.5">{series.points.slice(0, 7).map((point) => <div key={point.id} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3 text-xs"><span className="text-muted-foreground">{formatDate(point.date, locale)}</span><div className="relative h-2 overflow-hidden rounded-full bg-muted" aria-label={`بازه ${point.lower} تا ${point.upper}`}><div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.min(100, (point.point / maxPoint) * 100)}%` }} /></div><span className="text-end font-medium tabular-nums">{formatNumber(Math.round(point.point), locale)}</span></div>)}<div className="border-border border-t pt-2 text-muted-foreground text-[11px]"><InfoLabel help="بازه uncertainty از خطای تاریخی baseline ساخته می‌شود و به معنی تضمین آماری یا probability کالیبره‌شده نیست.">بازه پایین/بالا و MAE در هر point در API ذخیره شده است.</InfoLabel></div></CardContent></Card>)}</div>}
        </div>
    );
}
