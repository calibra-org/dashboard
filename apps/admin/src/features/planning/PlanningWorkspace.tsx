"use client";

import type { ComponentType, SVGProps } from "react";
import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

import { BarChart3, Boxes, CalendarClock, Package, Settings2, ShieldCheck, Sparkles, TrendingUp } from "#/icons";
import { Button } from "#/components/ui/button";
import { CardContent, CardHeader, CardRoot, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import {
    type ForecastSeries,
    useCreatePlanningCycle,
    useCreatePlanningScenario,
    usePlanningCategoryForecast,
    usePlanningCycles,
    usePlanningForecast,
    usePlanningHealth,
    usePlanningOverview,
    usePlanningRecommendations,
    usePlanningRisks,
    usePlanningScenarios,
    useRefreshPlanningAccuracy,
    useRunPlanningForecast,
} from "#/lib/queries/planning";
import { cn } from "#/lib/utils";

function number(value: number | null | undefined, digits = 0) {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: digits }).format(value);
}

function percent(value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("fa-IR", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function date(value: string | null | undefined, locale: string) {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function metricTone(tone: "violet" | "sky" | "amber" | "emerald") {
    return {
        violet: "from-violet-500/15 to-fuchsia-500/5 ring-violet-500/20",
        sky: "from-sky-500/15 to-cyan-500/5 ring-sky-500/20",
        amber: "from-amber-500/15 to-orange-500/5 ring-amber-500/20",
        emerald: "from-emerald-500/15 to-teal-500/5 ring-emerald-500/20",
    }[tone];
}

function MetricCard({
    title,
    value,
    detail,
    tone,
    icon: Icon,
}: {
    title: string;
    value: string;
    detail: string;
    tone: "violet" | "sky" | "amber" | "emerald";
    icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
    return (
        <CardRoot className={cn("overflow-hidden border-0 bg-gradient-to-br ring-1", metricTone(tone))}>
            <CardContent className="flex items-start justify-between gap-4 p-5">
                <div>
                    <p className="text-muted-foreground text-xs">{title}</p>
                    <p className="mt-2 font-black text-3xl tracking-tight tabular-nums">{value}</p>
                    <p className="mt-2 text-muted-foreground text-xs leading-5">{detail}</p>
                </div>
                <div className="rounded-2xl bg-background/75 p-3 shadow-sm ring-1 ring-border/60 backdrop-blur">
                    <Icon className="size-5" aria-hidden="true" />
                </div>
            </CardContent>
        </CardRoot>
    );
}

function DependencyBanner({ economics, procurement, location }: { economics?: string; procurement?: string; location?: string }) {
    return (
        <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4">
                <div className="flex items-center gap-2 font-semibold text-sm">
                    <ShieldCheck className="size-4" /> اقتصاد و حاشیه سود
                </div>
                <p className="mt-2 text-muted-foreground text-xs leading-5">
                    Phase 12 هنوز روی main فرود نیامده است. Cost/Margin بهینه‌سازی نمی‌شود و صفر به‌عنوان هزینه واقعی تفسیر نمی‌شود.
                </p>
                <code className="mt-2 block text-[11px] text-amber-700 dark:text-amber-300">
                    {economics ?? "dependency_not_landed"}
                </code>
            </div>
            <div className="rounded-2xl border border-sky-500/25 bg-sky-500/8 p-4">
                <div className="flex items-center gap-2 font-semibold text-sm">
                    <Package className="size-4" /> مرز اجرای تأمین
                </div>
                <p className="mt-2 text-muted-foreground text-xs leading-5">
                    این فاز فقط پیشنهاد قابل‌ممیزی می‌سازد. سفارش خرید، انتقال موجودی یا اجرای تأمین عمداً در Phase 14 انجام می‌شود.
                </p>
                <code className="mt-2 block text-[11px] text-sky-700 dark:text-sky-300">
                    {procurement ?? "phase14_procurement_only"}
                </code>
            </div>
            <div className="rounded-2xl border border-violet-500/25 bg-violet-500/8 p-4">
                <div className="flex items-center gap-2 font-semibold text-sm">
                    <Boxes className="size-4" /> ابعاد مکانی
                </div>
                <p className="mt-2 text-muted-foreground text-xs leading-5">
                    location_id فعلی حفظ شده ولی Warehouse Master رسمی نداریم. سری‌های چندمکانه بدون attribution واقعی به‌صورت
                    needs_input متوقف می‌شوند.
                </p>
                <code className="mt-2 block text-[11px] text-violet-700 dark:text-violet-300">
                    {location ?? "location_id_advisory"}
                </code>
            </div>
        </div>
    );
}

function aggregateSeries(series: ForecastSeries[]) {
    const byDate = new Map<
        string,
        { date: string; p10: number; p50: number; p90: number; actual: number; actualCount: number }
    >();
    for (const item of series) {
        for (const point of item.points) {
            const row = byDate.get(point.date) ?? { date: point.date, p10: 0, p50: 0, p90: 0, actual: 0, actualCount: 0 };
            row.p10 += point.p10;
            row.p50 += point.effective_p50;
            row.p90 += point.p90;
            if (point.actual !== null) {
                row.actual += point.actual;
                row.actualCount += 1;
            }
            byDate.set(point.date, row);
        }
    }
    return [...byDate.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((row) => ({ ...row, actual: row.actualCount ? row.actual : undefined }));
}

function ForecastChart({ series }: { series: ForecastSeries[] }) {
    const data = useMemo(() => aggregateSeries(series), [series]);
    if (data.length === 0) {
        return (
            <div className="grid h-[330px] place-items-center rounded-xl border border-dashed text-muted-foreground text-sm">
                برای نمایش نمودار ابتدا Forecast Run بسازید.
            </div>
        );
    }
    return (
        <ResponsiveContainer width="100%" height={330}>
            <AreaChart data={data} margin={{ top: 12, right: 10, left: 4, bottom: 0 }}>
                <defs>
                    <linearGradient id="planning-band" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.01} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area
                    type="monotone"
                    dataKey="p90"
                    name="P90"
                    stroke="hsl(var(--chart-2))"
                    fill="url(#planning-band)"
                    strokeWidth={1.5}
                    dot={false}
                />
                <Line
                    type="monotone"
                    dataKey="p50"
                    name="P50 / برنامه"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2.8}
                    dot={false}
                />
                <Line
                    type="monotone"
                    dataKey="p10"
                    name="P10"
                    stroke="hsl(var(--chart-4))"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    dot={false}
                />
                <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual"
                    stroke="hsl(var(--foreground))"
                    strokeWidth={1.8}
                    dot={false}
                    connectNulls={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}

function RunComposer() {
    const mutation = useRunPlanningForecast();
    const [history, setHistory] = useState(84);
    const [horizon, setHorizon] = useState(28);
    const [review, setReview] = useState(7);
    const [leadTime, setLeadTime] = useState("");
    return (
        <CardRoot className="overflow-hidden border-primary/15">
            <CardHeader className="border-b bg-primary/[0.025]">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Settings2 className="size-4" /> ساخت Forecast Run جدید
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1.5 text-xs">
                        تاریخچه (روز)
                        <Input
                            type="number"
                            min={28}
                            max={365}
                            value={history}
                            onChange={(e) => setHistory(Number(e.target.value))}
                        />
                    </label>
                    <label className="space-y-1.5 text-xs">
                        افق پیش‌بینی (روز)
                        <Input
                            type="number"
                            min={1}
                            max={90}
                            value={horizon}
                            onChange={(e) => setHorizon(Number(e.target.value))}
                        />
                    </label>
                    <label className="space-y-1.5 text-xs">
                        دوره بازبینی (روز)
                        <Input
                            type="number"
                            min={1}
                            max={60}
                            value={review}
                            onChange={(e) => setReview(Number(e.target.value))}
                        />
                    </label>
                    <label className="space-y-1.5 text-xs">
                        Lead time پیش‌فرض
                        <Input
                            type="number"
                            min={0}
                            max={365}
                            placeholder="بدون حدس"
                            value={leadTime}
                            onChange={(e) => setLeadTime(e.target.value)}
                        />
                    </label>
                </div>
                <div className="rounded-xl bg-muted/55 p-3 text-muted-foreground text-xs leading-5">
                    Service target = <b className="text-foreground">P90 / 90%</b>. اگر Lead Time را خالی بگذارید، سیستم مقدار خرید
                    جعل نمی‌کند و توصیه را <code>needs_input</code> می‌گذارد.
                </div>
                {mutation.error ? (
                    <p className="text-destructive text-xs">اجرای forecast ناموفق بود. جزئیات در پاسخ API/لاگ ثبت شده است.</p>
                ) : null}
                <Button
                    className="w-full"
                    disabled={mutation.isPending}
                    onClick={() =>
                        mutation.mutate({
                            history_days: history,
                            horizon_days: horizon,
                            review_period_days: review,
                            default_lead_time_days: leadTime === "" ? null : Number(leadTime),
                            service_level_target: 0.9,
                        })
                    }
                >
                    {mutation.isPending ? "در حال محاسبه…" : "اجرای Forecast Versioned"}
                </Button>
            </CardContent>
        </CardRoot>
    );
}

function ReplenishmentTable() {
    const query = usePlanningRecommendations();
    const rows = query.data?.data.items ?? [];
    return (
        <CardRoot className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between border-b">
                <div>
                    <CardTitle className="text-base">پیشنهادهای Replenishment</CardTitle>
                    <p className="mt-1 text-muted-foreground text-xs">
                        Safety stock، reorder point و qty فقط وقتی lead time قابل اتکا باشد.
                    </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs">{number(rows.length)} SKU</span>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
                <table className="w-full min-w-[900px] text-sm">
                    <thead className="bg-muted/35 text-muted-foreground text-xs">
                        <tr>
                            <th className="p-3 text-start">محصول</th>
                            <th>وضعیت</th>
                            <th>موجودی</th>
                            <th>P50 روزانه</th>
                            <th>Safety stock</th>
                            <th>Reorder</th>
                            <th>Target</th>
                            <th>پیشنهاد</th>
                            <th className="p-3 text-start">علت</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.id} className="border-t hover:bg-muted/20">
                                <td className="p-3">
                                    <div className="font-medium">{row.name}</div>
                                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                                        {row.sku ?? "بدون SKU"} · {row.location_key}
                                    </div>
                                </td>
                                <td className="text-center">
                                    <span
                                        className={cn(
                                            "rounded-full px-2 py-1 text-[11px]",
                                            row.status === "ready"
                                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                                : row.status === "needs_input"
                                                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                                  : "bg-muted text-muted-foreground",
                                        )}
                                    >
                                        {row.status}
                                    </span>
                                </td>
                                <td className="text-center tabular-nums">{number(row.on_hand, 1)}</td>
                                <td className="text-center tabular-nums">{number(row.daily_p50, 2)}</td>
                                <td className="text-center tabular-nums">{number(row.safety_stock, 1)}</td>
                                <td className="text-center tabular-nums">{number(row.reorder_point, 1)}</td>
                                <td className="text-center tabular-nums">{number(row.target_stock, 1)}</td>
                                <td className="text-center font-bold tabular-nums">{number(row.suggested_quantity, 1)}</td>
                                <td className="p-3 text-muted-foreground text-xs">{row.reason_codes[0] ?? "—"}</td>
                            </tr>
                        ))}
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="p-10 text-center text-muted-foreground">
                                    هنوز توصیه‌ای ساخته نشده است.
                                </td>
                            </tr>
                        ) : null}
                    </tbody>
                </table>
            </CardContent>
        </CardRoot>
    );
}

function RiskTable() {
    const query = usePlanningRisks();
    const rows = [...(query.data?.data.items ?? [])].sort(
        (a, b) =>
            ({ high: 0, medium: 1, low: 2, unavailable: 3 })[a.risk] - { high: 0, medium: 1, low: 2, unavailable: 3 }[b.risk],
    );
    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.slice(0, 12).map((row) => (
                <div key={row.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="font-semibold text-sm">{row.name}</div>
                            <div className="mt-1 font-mono text-[10px] text-muted-foreground">{row.sku ?? "بدون SKU"}</div>
                        </div>
                        <span
                            className={cn(
                                "rounded-full px-2.5 py-1 font-bold text-[10px] uppercase",
                                row.risk === "high"
                                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                                    : row.risk === "medium"
                                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                      : row.risk === "low"
                                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                        : "bg-muted text-muted-foreground",
                            )}
                        >
                            {row.risk}
                        </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-muted/45 p-2">
                            <div className="text-[10px] text-muted-foreground">On hand</div>
                            <div className="mt-1 font-bold tabular-nums">{number(row.on_hand, 1)}</div>
                        </div>
                        <div className="rounded-xl bg-muted/45 p-2">
                            <div className="text-[10px] text-muted-foreground">Reorder</div>
                            <div className="mt-1 font-bold tabular-nums">{number(row.reorder_point, 1)}</div>
                        </div>
                        <div className="rounded-xl bg-muted/45 p-2">
                            <div className="text-[10px] text-muted-foreground">Target</div>
                            <div className="mt-1 font-bold tabular-nums">{number(row.target_stock, 1)}</div>
                        </div>
                    </div>
                    <p className="mt-3 text-muted-foreground text-xs">{row.reason_code}</p>
                </div>
            ))}
            {rows.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed p-10 text-center text-muted-foreground text-sm">
                    داده ریسک هنوز آماده نیست.
                </div>
            ) : null}
        </div>
    );
}

function CategoryPanel() {
    const query = usePlanningCategoryForecast();
    const categories = query.data?.data.categories ?? [];
    const bars = categories
        .map((category) => ({
            name: category.name,
            p50: category.points.reduce((sum, point) => sum + point.effective_p50, 0),
            p90: category.points.reduce((sum, point) => sum + point.p90, 0),
        }))
        .sort((a, b) => b.p50 - a.p50)
        .slice(0, 10);
    return (
        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <CardRoot>
                <CardHeader>
                    <CardTitle className="text-base">تقاضای دسته‌ها از همان Forecast Truth</CardTitle>
                    <p className="text-muted-foreground text-xs">
                        جمع quantileهای SKU برای برنامه‌ریزی دسته‌ای؛ joint distribution ادعا نمی‌شود.
                    </p>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={340}>
                        <BarChart data={bars} layout="vertical" margin={{ left: 20, right: 16 }}>
                            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis type="number" tickLine={false} axisLine={false} />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={110}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 11 }}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: "hsl(var(--popover))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: 12,
                                }}
                            />
                            <Bar dataKey="p50" name="P50" fill="hsl(var(--chart-1))" radius={[0, 6, 6, 0]} />
                            <Bar dataKey="p90" name="P90" fill="hsl(var(--chart-2))" radius={[0, 6, 6, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </CardRoot>
            <CardRoot>
                <CardHeader>
                    <CardTitle className="text-base">Contract تجمیع</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                    <div className="rounded-xl bg-muted/45 p-3">
                        <span className="text-muted-foreground">Basis</span>
                        <code className="mt-1 block break-all">{query.data?.data.basis ?? "same_versioned_forecast_points"}</code>
                    </div>
                    <div className="rounded-xl bg-muted/45 p-3">
                        <span className="text-muted-foreground">Aggregation</span>
                        <code className="mt-1 block break-all">{query.data?.data.aggregation ?? "—"}</code>
                    </div>
                    <div className="rounded-xl bg-muted/45 p-3">
                        <span className="text-muted-foreground">Taxonomy</span>
                        <code className="mt-1 block break-all">{query.data?.data.classification_mode ?? "—"}</code>
                    </div>
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 leading-5 text-muted-foreground">
                        محصول چنددسته‌ای در هر دسته خودش دیده می‌شود؛ این نمودار برای مقایسه دسته‌هاست، نه جمع کل بدون double-count.
                    </div>
                </CardContent>
            </CardRoot>
        </div>
    );
}

function GovernancePanel() {
    const health = usePlanningHealth();
    const cycles = usePlanningCycles();
    const scenarios = usePlanningScenarios();
    const createCycle = useCreatePlanningCycle();
    const createScenario = useCreatePlanningScenario();
    const refresh = useRefreshPlanningAccuracy();
    const [cycleTitle, setCycleTitle] = useState("");
    const [scenarioTitle, setScenarioTitle] = useState("");
    const [multiplier, setMultiplier] = useState(1);
    return (
        <div className="grid gap-4 xl:grid-cols-3">
            <CardRoot>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <CalendarClock className="size-4" /> Planning Cycle
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex gap-2">
                        <Input
                            value={cycleTitle}
                            onChange={(e) => setCycleTitle(e.target.value)}
                            placeholder="مثلاً برنامه تأمین شهریور"
                        />
                        <Button
                            size="sm"
                            disabled={!cycleTitle.trim() || createCycle.isPending}
                            onClick={() =>
                                createCycle.mutate({ title: cycleTitle.trim() }, { onSuccess: () => setCycleTitle("") })
                            }
                        >
                            ایجاد
                        </Button>
                    </div>
                    <div className="space-y-2">
                        {(cycles.data?.data ?? []).slice(0, 6).map((cycle) => (
                            <div
                                key={cycle.id}
                                className="flex items-center justify-between rounded-xl bg-muted/45 px-3 py-2 text-xs"
                            >
                                <span>{cycle.title}</span>
                                <code>
                                    {cycle.status} · v{cycle.version}
                                </code>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </CardRoot>
            <CardRoot>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <TrendingUp className="size-4" /> Scenario Lab
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Input
                        value={scenarioTitle}
                        onChange={(e) => setScenarioTitle(e.target.value)}
                        placeholder="سناریوی رشد تقاضا"
                    />
                    <label className="block text-xs">
                        ضریب تقاضا
                        <Input
                            className="mt-1"
                            type="number"
                            min={0.1}
                            max={5}
                            step={0.05}
                            value={multiplier}
                            onChange={(e) => setMultiplier(Number(e.target.value))}
                        />
                    </label>
                    <Button
                        className="w-full"
                        variant="outline"
                        disabled={!scenarioTitle.trim() || createScenario.isPending}
                        onClick={() =>
                            createScenario.mutate(
                                {
                                    title: scenarioTitle.trim(),
                                    demand_multiplier: multiplier,
                                    lead_time_days: null,
                                    review_period_days: 7,
                                },
                                { onSuccess: () => setScenarioTitle("") },
                            )
                        }
                    >
                        ثبت سناریوی What-if
                    </Button>
                    <div className="space-y-2">
                        {(scenarios.data?.data ?? []).slice(0, 5).map((scenario) => (
                            <div
                                key={scenario.id}
                                className="flex items-center justify-between rounded-xl bg-muted/45 px-3 py-2 text-xs"
                            >
                                <span>{scenario.title}</span>
                                <code>× {number(scenario.demand_multiplier, 2)}</code>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </CardRoot>
            <CardRoot>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ShieldCheck className="size-4" /> Data & Model Health
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-muted/45 p-3">
                            <span className="text-muted-foreground">Sales rows</span>
                            <div className="mt-1 font-bold text-lg">{number(health.data?.data.observed_rows)}</div>
                        </div>
                        <div className="rounded-xl bg-muted/45 p-3">
                            <span className="text-muted-foreground">Series</span>
                            <div className="mt-1 font-bold text-lg">{number(health.data?.data.observed_series)}</div>
                        </div>
                        <div className="rounded-xl bg-muted/45 p-3">
                            <span className="text-muted-foreground">Movements 84d</span>
                            <div className="mt-1 font-bold text-lg">{number(health.data?.data.inventory_movements_84d)}</div>
                        </div>
                        <div className="rounded-xl bg-muted/45 p-3">
                            <span className="text-muted-foreground">Located items</span>
                            <div className="mt-1 font-bold text-lg">
                                {number(health.data?.data.inventory_items_with_location_id)}
                            </div>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        className="w-full"
                        disabled={refresh.isPending}
                        onClick={() => refresh.mutate(health.data?.data.latest_run?.id)}
                    >
                        {refresh.isPending ? "در حال اتصال Actual…" : "Refresh Actuals & Accuracy"}
                    </Button>
                    <div className="rounded-xl border p-3">
                        <div className="font-medium">Stockout censoring</div>
                        <code className="mt-1 block break-all text-muted-foreground">
                            {health.data?.data.stockout_censoring ?? "—"}
                        </code>
                    </div>
                </CardContent>
            </CardRoot>
        </div>
    );
}

export function PlanningWorkspace() {
    const locale = useLocale();
    const overview = usePlanningOverview();
    const forecast = usePlanningForecast();
    const health = usePlanningHealth();
    const run = forecast.data?.data.run ?? overview.data?.data.latest_run ?? null;
    const series = forecast.data?.data.series ?? [];
    const dependencies = overview.data?.data.dependencies;
    const risk = overview.data?.data.risk_counts;
    const recommendations = overview.data?.data.recommendation_counts;

    return (
        <div dir="rtl" className="space-y-5 pb-12">
            <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-violet-500/10 via-background to-sky-500/10 p-6 shadow-sm md:p-8">
                <div className="pointer-events-none absolute -top-28 -left-24 size-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
                <div className="pointer-events-none absolute -right-16 -bottom-32 size-80 rounded-full bg-cyan-500/10 blur-3xl" />
                <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-3xl">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-primary px-2.5 py-1 font-bold text-[10px] text-primary-foreground tracking-wide">
                                PHASE 13
                            </span>
                            <span className="rounded-full bg-background/75 px-2.5 py-1 text-[10px] ring-1 ring-border backdrop-blur">
                                Demand & Supply Planning OS
                            </span>
                            {run ? (
                                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-700 dark:text-emerald-300">
                                    {run.model_code} · v{run.model_version}
                                </span>
                            ) : null}
                        </div>
                        <h1 className="font-black text-3xl tracking-tight md:text-4xl">برج کنترل برنامه‌ریزی تقاضا و تأمین</h1>
                        <p className="mt-3 max-w-2xl text-muted-foreground text-sm leading-7">
                            Forecast احتمالی P10/P50/P90، تصحیح تقاضای سرکوب‌شده در stockout، سیاست replenishment توضیح‌پذیر و چرخه
                            تصمیم‌گیری قابل‌ممیزی—بدون جعل Economics یا اجرای خرید.
                        </p>
                    </div>
                    <div className="grid min-w-[300px] grid-cols-2 gap-2 text-xs">
                        <div className="rounded-2xl bg-background/70 p-3 ring-1 ring-border backdrop-blur">
                            <span className="text-muted-foreground">آخرین freshness</span>
                            <div className="mt-1 font-medium">{date(run?.source_freshness_at, locale)}</div>
                        </div>
                        <div className="rounded-2xl bg-background/70 p-3 ring-1 ring-border backdrop-blur">
                            <span className="text-muted-foreground">Source hash</span>
                            <div dir="ltr" className="mt-1 truncate font-mono">
                                {run?.source_hash?.slice(0, 16) ?? "—"}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <DependencyBanner
                economics={dependencies?.economics ?? health.data?.data.economics}
                procurement={dependencies?.procurement_execution ?? health.data?.data.procurement}
                location={dependencies?.multi_location_master ?? health.data?.data.location_dimension}
            />

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    title="ریسک کمبود بحرانی"
                    value={number(risk?.high ?? 0)}
                    detail="SKUهایی که زیر reorder point قرار دارند"
                    tone="amber"
                    icon={Boxes}
                />
                <MetricCard
                    title="توصیه آماده بررسی"
                    value={number(recommendations?.ready ?? 0)}
                    detail="Recommendation محاسبه‌شده؛ نه سفارش خرید"
                    tone="emerald"
                    icon={Package}
                />
                <MetricCard
                    title="WAPE"
                    value={percent(run?.wape)}
                    detail={`${number(run?.accuracy_evaluated_days ?? 0)} evaluated · ${number(run?.accuracy_censored_points ?? 0)} censored`}
                    tone="violet"
                    icon={BarChart3}
                />
                <MetricCard
                    title="Interval coverage"
                    value={percent(run?.interval_coverage)}
                    detail={`Bias: ${percent(run?.bias)} · censored: ${number(run?.stockout_censored_days ?? 0)}`}
                    tone="sky"
                    icon={TrendingUp}
                />
            </section>

            <Tabs defaultValue="forecast" className="space-y-4">
                <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-2xl bg-muted/55 p-1.5">
                    <TabsTrigger value="forecast" className="rounded-xl px-4">
                        Forecast
                    </TabsTrigger>
                    <TabsTrigger value="replenishment" className="rounded-xl px-4">
                        Replenishment
                    </TabsTrigger>
                    <TabsTrigger value="risk" className="rounded-xl px-4">
                        Inventory Risk
                    </TabsTrigger>
                    <TabsTrigger value="categories" className="rounded-xl px-4">
                        Categories
                    </TabsTrigger>
                    <TabsTrigger value="governance" className="rounded-xl px-4">
                        Governance & What-if
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="forecast" className="space-y-4">
                    <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
                        <CardRoot className="overflow-hidden">
                            <CardHeader className="border-b">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Sparkles className="size-4" /> Demand uncertainty envelope
                                </CardTitle>
                                <p className="text-muted-foreground text-xs">
                                    P10 / P50 / P90 به همراه Actualهای متصل‌شده. جمع سری‌ها برای دید Control Tower است.
                                </p>
                            </CardHeader>
                            <CardContent className="p-4">
                                <ForecastChart series={series} />
                            </CardContent>
                        </CardRoot>
                        <RunComposer />
                    </div>
                    <CardRoot>
                        <CardHeader>
                            <CardTitle className="text-base">کیفیت سری‌های Forecast</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {series.slice(0, 12).map((item) => (
                                <div
                                    key={`${item.product_id}:${item.variation_id}:${item.location_key}`}
                                    className="rounded-2xl border p-3"
                                >
                                    <div className="truncate font-medium text-sm">{item.name}</div>
                                    <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                                        {item.sku ?? "بدون SKU"} · {item.location_key}
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-xs">
                                        <span
                                            className={cn(
                                                "rounded-full px-2 py-1",
                                                item.quality === "ready"
                                                    ? "bg-emerald-500/10 text-emerald-700"
                                                    : item.quality === "limited_history"
                                                      ? "bg-amber-500/10 text-amber-700"
                                                      : "bg-rose-500/10 text-rose-700",
                                            )}
                                        >
                                            {item.quality}
                                        </span>
                                        <b>{percent(item.confidence)}</b>
                                    </div>
                                </div>
                            ))}
                            {series.length === 0 ? (
                                <div className="col-span-full py-8 text-center text-muted-foreground text-sm">
                                    هیچ سری forecast نشده است.
                                </div>
                            ) : null}
                        </CardContent>
                    </CardRoot>
                </TabsContent>
                <TabsContent value="replenishment">
                    <ReplenishmentTable />
                </TabsContent>
                <TabsContent value="risk">
                    <RiskTable />
                </TabsContent>
                <TabsContent value="categories">
                    <CategoryPanel />
                </TabsContent>
                <TabsContent value="governance">
                    <GovernancePanel />
                </TabsContent>
            </Tabs>
        </div>
    );
}
