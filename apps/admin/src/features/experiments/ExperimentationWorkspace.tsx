"use client";

import { useLocale } from "next-intl";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { CardContent, CardHeader, CardRoot, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Activity, BarChart3, CircleGauge, RefreshCw, ShieldAlert, Sparkles } from "#/icons";
import {
    type Experiment,
    type ExperimentAnalysis,
    useAnalyzeExperiment,
    useCausalKnowledge,
    useCreateExperiment,
    useCreateHoldout,
    useExperiment,
    useExperimentCollisions,
    useExperimentHoldouts,
    useExperimentOverview,
    useExperiments,
    useTransitionExperiment,
} from "#/lib/queries/experiments";
import { cn } from "#/lib/utils";

const STATUS_COPY: Record<string, string> = {
    draft: "پیش‌نویس",
    review: "بازبینی",
    scheduled: "زمان‌بندی‌شده",
    running: "در حال اجرا",
    paused: "مکث",
    stopped: "متوقف",
    completed: "تکمیل‌شده",
    archived: "آرشیو",
};

const SURFACE_COPY: Record<string, string> = {
    price: "قیمت",
    discount: "تخفیف",
    image_gallery: "تصویر و گالری",
    title_copy: "عنوان و کپی",
    product_layout: "چیدمان محصول",
    search_ranking: "رتبه‌بندی جست‌وجو",
    recommendation_rank: "رتبه‌بندی پیشنهاد",
    cta: "CTA",
    landing_page: "لندینگ",
    checkout: "تسویه‌حساب",
    shipping_message: "پیام ارسال",
    email_push: "ایمیل/Push",
    content_seo: "محتوا/SEO",
    story_video: "استوری/ویدئو",
};

function statusTone(status: string): StatusTone {
    if (status === "running") return "success";
    if (["review", "scheduled", "paused"].includes(status)) return "warning";
    if (status === "stopped") return "danger";
    if (status === "completed") return "info";
    return "neutral";
}

function formatDate(value: string | null | undefined, locale: string) {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
        ? value
        : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function percent(value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("fa-IR", {
        style: "percent",
        maximumFractionDigits: 1,
        signDisplay: "exceptZero",
    }).format(value);
}

function MetricCard({
    label,
    value,
    hint,
    tone,
    icon: Icon,
}: {
    label: string;
    value: string;
    hint: string;
    tone: "primary" | "danger" | "warning" | "success";
    icon: typeof CircleGauge;
}) {
    const style = {
        primary: "from-primary/10 to-primary/[0.02] ring-primary/20",
        danger: "from-danger/10 to-danger/[0.02] ring-danger/20",
        warning: "from-warning/10 to-warning/[0.02] ring-warning/20",
        success: "from-success/10 to-success/[0.02] ring-success/20",
    }[tone];
    return (
        <CardRoot className={cn("overflow-hidden border-0 bg-gradient-to-br ring-1", style)}>
            <CardContent className="flex min-h-32 items-start justify-between gap-4 p-5">
                <div>
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <p className="mt-3 font-black text-3xl tabular-nums tracking-tight">{value}</p>
                    <p className="mt-2 max-w-52 text-muted-foreground text-xs leading-5">{hint}</p>
                </div>
                <div className="rounded-2xl bg-background/80 p-3 shadow-sm ring-1 ring-border/60">
                    <Icon className="size-5" />
                </div>
            </CardContent>
        </CardRoot>
    );
}

function EvidenceBanner() {
    const cards = [
        {
            icon: BarChart3,
            title: "Assignment ≠ Exposure",
            text: "اختصاص و مشاهده جدا ثبت می‌شوند؛ metric بدون exposure قبلی وارد تحلیل نمی‌شود.",
            style: "border-primary/20 bg-primary/[0.04]",
        },
        {
            icon: ShieldAlert,
            title: "Guardrail قبل از Winner",
            text: "برد روی conversion با آسیب به مرجوعی، سود یا SLA به‌عنوان موفقیت اعلام نمی‌شود.",
            style: "border-warning/20 bg-warning/[0.05]",
        },
        {
            icon: CircleGauge,
            title: "حافظهٔ علّی درجه‌بندی‌شده",
            text: "نتیجه فقط با strength واقعی ذخیره می‌شود؛ correlation خودکار به causation ارتقا نمی‌یابد.",
            style: "border-success/20 bg-success/[0.04]",
        },
    ];
    return (
        <div className="grid gap-3 xl:grid-cols-3">
            {cards.map(({ icon: Icon, title, text, style }) => (
                <div key={title} className={cn("rounded-2xl border p-4", style)}>
                    <div className="flex items-center gap-2 font-semibold text-sm">
                        <Icon className="size-4" />
                        {title}
                    </div>
                    <p className="mt-2 text-muted-foreground text-xs leading-5">{text}</p>
                </div>
            ))}
        </div>
    );
}

function ExperimentList({
    rows,
    selectedId,
    onSelect,
}: {
    rows: Experiment[];
    selectedId: number | null;
    onSelect: (id: number) => void;
}) {
    if (!rows.length)
        return (
            <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed text-center text-muted-foreground text-sm">
                هنوز آزمایشی ثبت نشده است؛ Lab دادهٔ نمایشی تولید نمی‌کند.
            </div>
        );
    return (
        <div className="space-y-2">
            {rows.map((row) => (
                <button
                    key={row.id}
                    type="button"
                    onClick={() => onSelect(row.id)}
                    className={cn(
                        "w-full rounded-2xl border bg-card p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md",
                        selectedId === row.id && "border-primary/50 bg-primary/[0.03] ring-1 ring-primary/15",
                    )}
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <StatusBadge tone={statusTone(row.status)}>{STATUS_COPY[row.status] ?? row.status}</StatusBadge>
                            <span className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                                {SURFACE_COPY[row.surface] ?? row.surface}
                            </span>
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground">{row.experiment_key}</span>
                    </div>
                    <h3 className="mt-3 font-semibold leading-7">{row.name}</h3>
                    <p className="mt-1 line-clamp-2 text-muted-foreground text-xs leading-5">{row.hypothesis}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-[11px] text-muted-foreground">
                        <span>{row.variants.length.toLocaleString("fa-IR")} variant</span>
                        <span>{row.randomization_unit}</span>
                        <span>{row.layer_key}</span>
                    </div>
                </button>
            ))}
        </div>
    );
}

function normalizedVariantMetrics(analysis: ExperimentAnalysis | null | undefined) {
    if (!analysis) return [];
    const value = analysis.variant_metrics as unknown;
    if (Array.isArray(value)) return value as ExperimentAnalysis["variant_metrics"];
    if (value && typeof value === "object" && Array.isArray((value as { variants?: unknown }).variants))
        return (value as { variants: ExperimentAnalysis["variant_metrics"] }).variants;
    return [];
}

function AnalysisPanel({ analysis }: { analysis: ExperimentAnalysis | null | undefined }) {
    if (!analysis)
        return (
            <div className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground text-sm">
                Analysis Run ثبت نشده است. تا آن زمان نتیجهٔ علّی نمایش داده نمی‌شود.
            </div>
        );
    const metrics = normalizedVariantMetrics(analysis);
    const chart = metrics.map((row) => ({ name: row.variantKey, lift: (row.effect.relativeLift ?? 0) * 100 }));
    const banner =
        analysis.status === "healthy"
            ? "شواهد تصادفی قابل تفسیر"
            : analysis.status === "srm_detected"
              ? "SRM — تفسیر علّی مسدود"
              : analysis.status === "guardrail_breached"
                ? "Guardrail breach — Winner مسدود"
                : "داده ناکافی";
    return (
        <div className="space-y-4">
            <div
                className={cn(
                    "rounded-2xl border p-4",
                    analysis.status === "healthy"
                        ? "border-success/25 bg-success/[0.04]"
                        : analysis.status === "insufficient_data"
                          ? "border-border bg-muted/30"
                          : "border-danger/25 bg-danger/[0.04]",
                )}
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{banner}</strong>
                    <code className="text-[10px]">{analysis.causal_strength}</code>
                </div>
                <p className="mt-2 text-muted-foreground text-xs leading-6">{analysis.conclusion}</p>
                {analysis.automatic_action ? (
                    <p className="mt-2 text-danger text-xs">اقدام خودکار: {analysis.automatic_action}</p>
                ) : null}
            </div>
            {chart.length ? (
                <div className="h-64 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chart}>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Bar dataKey="lift" name="Lift %" fill="hsl(var(--chart-1))" radius={[7, 7, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
                {metrics.map((row) => (
                    <div key={row.variantId} className="rounded-xl border bg-card p-3 text-xs">
                        <div className="flex justify-between">
                            <strong>{row.variantKey}</strong>
                            <span>{row.isControl ? "Control" : percent(row.effect.relativeLift)}</span>
                        </div>
                        <div className="mt-2 flex justify-between text-muted-foreground">
                            <span>Exposure: {row.exposedSubjects.toLocaleString("fa-IR")}</span>
                            <span>Mean: {row.effect.mean?.toLocaleString("fa-IR", { maximumFractionDigits: 3 }) ?? "—"}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ExperimentDetail({ id }: { id: number | null }) {
    const locale = useLocale();
    const query = useExperiment(id);
    const transition = useTransitionExperiment();
    const analyze = useAnalyzeExperiment();
    const item = query.data?.data;
    const [approval, setApproval] = useState("");
    const [reason, setReason] = useState("");
    if (!id)
        return (
            <div className="grid min-h-[520px] place-items-center rounded-2xl border border-dashed text-muted-foreground text-sm">
                یک آزمایش را انتخاب کنید.
            </div>
        );
    if (!item)
        return (
            <div className="grid min-h-[520px] place-items-center rounded-2xl border text-muted-foreground text-sm">
                در حال دریافت قرارداد آزمایش…
            </div>
        );
    const latest = item.analysis?.[0] ?? item.latest_analysis ?? null;
    const next =
        item.status === "draft"
            ? "review"
            : item.status === "review"
              ? "running"
              : item.status === "running"
                ? "completed"
                : item.status === "paused"
                  ? "running"
                  : null;
    return (
        <div className="space-y-4">
            <CardRoot className="overflow-hidden">
                <CardHeader className="border-b bg-gradient-to-l from-primary/[0.07] to-transparent">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <StatusBadge tone={statusTone(item.status)}>
                                    {STATUS_COPY[item.status] ?? item.status}
                                </StatusBadge>
                                <span className="font-mono text-[10px] text-muted-foreground">v{item.version}</span>
                            </div>
                            <CardTitle className="mt-3 text-xl">{item.name}</CardTitle>
                            <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">{item.hypothesis}</p>
                        </div>
                        <Button variant="outline" onClick={() => analyze.mutate(item.id)} disabled={analyze.isPending}>
                            <Activity className={cn("size-4", analyze.isPending && "animate-pulse")} /> اجرای Analysis
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-5 p-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {[
                            ["Surface", SURFACE_COPY[item.surface] ?? item.surface],
                            ["Randomization", item.randomization_unit],
                            ["Primary metric", item.primary_metric_key],
                            ["Layer", `${item.layer_key} · ${item.layer_start_bps}-${item.layer_end_bps}`],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-xl bg-muted/40 p-3">
                                <p className="text-[10px] text-muted-foreground">{label}</p>
                                <p className="mt-1 font-medium text-xs">{value}</p>
                            </div>
                        ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {item.variants.map((variant) => (
                            <div
                                key={variant.id}
                                className={cn(
                                    "rounded-xl border p-3",
                                    variant.is_control && "border-primary/25 bg-primary/[0.03]",
                                )}
                            >
                                <div className="flex justify-between gap-2">
                                    <strong className="text-sm">{variant.name}</strong>
                                    <span className="text-xs tabular-nums">
                                        {(variant.weight_bps / 100).toLocaleString("fa-IR")}%
                                    </span>
                                </div>
                                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                                    {variant.key} {variant.is_control ? "· control" : ""}
                                </p>
                            </div>
                        ))}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border p-3">
                            <p className="text-[10px] text-muted-foreground">Governance approval</p>
                            <Input
                                className="mt-2"
                                value={approval}
                                onChange={(event) => setApproval(event.target.value)}
                                placeholder={item.approval_reference ?? "برای high/critical قبل از launch الزامی"}
                            />
                        </div>
                        <div className="rounded-xl border p-3">
                            <p className="text-[10px] text-muted-foreground">Reason / stop note</p>
                            <Input
                                className="mt-2"
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                placeholder="دلیل تصمیم اپراتور"
                            />
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                        <span className="text-muted-foreground text-xs">آخرین تغییر: {formatDate(item.updated_at, locale)}</span>
                        <div className="flex gap-2">
                            {item.status === "running" ? (
                                <Button
                                    variant="outline"
                                    onClick={() =>
                                        transition.mutate({
                                            id: item.id,
                                            status: "paused",
                                            expected_version: item.version,
                                            reason,
                                        })
                                    }
                                >
                                    مکث
                                </Button>
                            ) : null}
                            {next ? (
                                <Button
                                    onClick={() =>
                                        transition.mutate({
                                            id: item.id,
                                            status: next,
                                            expected_version: item.version,
                                            reason,
                                            approval_reference: approval || item.approval_reference,
                                        })
                                    }
                                >
                                    {next === "review"
                                        ? "ارسال به بازبینی"
                                        : next === "running"
                                          ? "شروع کنترل‌شده"
                                          : "تکمیل آزمایش"}
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </CardContent>
            </CardRoot>
            <CardRoot>
                <CardHeader>
                    <CardTitle className="text-base">تحلیل ثبت‌شده</CardTitle>
                </CardHeader>
                <CardContent>
                    <AnalysisPanel analysis={latest} />
                </CardContent>
            </CardRoot>
        </div>
    );
}

function NewExperimentComposer() {
    const mutation = useCreateExperiment();
    const [key, setKey] = useState("");
    const [name, setName] = useState("");
    const [hypothesis, setHypothesis] = useState("");
    const [metric, setMetric] = useState("conversion");
    const [surface, setSurface] = useState("cta");
    const submit = () => {
        if (key.length < 3 || name.length < 3 || hypothesis.length < 10) return;
        mutation.mutate(
            {
                experiment_key: key,
                name,
                hypothesis,
                surface,
                risk_level: ["price", "checkout"].includes(surface) ? "high" : "medium",
                randomization_unit: "visitor",
                layer_key: surface,
                layer_start_bps: 0,
                layer_end_bps: 10000,
                primary_metric_key: metric,
                primary_metric_kind: "binary",
                sample_plan: { minimum_exposed_subjects: 100 },
                guardrails: [],
                variants: [
                    { key: "control", name: "Control", weight_bps: 5000, is_control: true, payload: {} },
                    { key: "treatment", name: "Treatment", weight_bps: 5000, is_control: false, payload: {} },
                ],
            },
            {
                onSuccess: () => {
                    setKey("");
                    setName("");
                    setHypothesis("");
                },
            },
        );
    };
    return (
        <CardRoot className="overflow-hidden border-primary/20">
            <CardHeader className="border-b bg-primary/[0.03]">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="size-4" /> قرارداد آزمایش جدید
                </CardTitle>
                <p className="text-muted-foreground text-xs">
                    نسخهٔ سریع 50/50؛ allocation پس از launch با state machine محافظت می‌شود.
                </p>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                    <Input value={key} onChange={(event) => setKey(event.target.value)} placeholder="experiment.key" dir="ltr" />
                    <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="نام آزمایش" />
                    <select
                        className="h-9 rounded-md border bg-background px-3 text-sm"
                        value={surface}
                        onChange={(event) => setSurface(event.target.value)}
                    >
                        {Object.entries(SURFACE_COPY).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                    <Input
                        value={metric}
                        onChange={(event) => setMetric(event.target.value)}
                        placeholder="primary metric"
                        dir="ltr"
                    />
                </div>
                <textarea
                    className="min-h-24 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={hypothesis}
                    onChange={(event) => setHypothesis(event.target.value)}
                    placeholder="فرضیهٔ روشن و قابل رد شدن"
                />
                <Button className="w-full" onClick={submit} disabled={mutation.isPending}>
                    {mutation.isPending ? "در حال ثبت…" : "ثبت در Experiment Registry"}
                </Button>
                {mutation.isError ? (
                    <p className="text-danger text-xs">ثبت آزمایش ناموفق بود؛ validation یا collision را بررسی کنید.</p>
                ) : null}
            </CardContent>
        </CardRoot>
    );
}

function HoldoutsPanel() {
    const query = useExperimentHoldouts();
    const create = useCreateHoldout();
    const [key, setKey] = useState("");
    const [name, setName] = useState("");
    const [scope, setScope] = useState("recommendation");
    const rows = query.data?.data ?? [];
    return (
        <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
            <CardRoot>
                <CardHeader>
                    <CardTitle className="text-base">Persistent Holdout</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Input value={key} onChange={(event) => setKey(event.target.value)} placeholder="holdout.key" dir="ltr" />
                    <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="نام Holdout" />
                    <select
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                        value={scope}
                        onChange={(event) => setScope(event.target.value)}
                    >
                        <option value="recommendation">Recommendation</option>
                        <option value="automation">Automation</option>
                        <option value="ai_intervention">AI intervention</option>
                        <option value="marketing">Marketing</option>
                    </select>
                    <Button
                        className="w-full"
                        onClick={() =>
                            create.mutate({
                                holdout_key: key,
                                name,
                                scope,
                                allocation_bps: 500,
                                purpose: "Persistent incrementality baseline for Phase 17 causal measurement",
                            })
                        }
                    >
                        ساخت Holdout پنج‌درصدی
                    </Button>
                </CardContent>
            </CardRoot>
            <div className="grid gap-3 sm:grid-cols-2">
                {rows.length ? (
                    rows.map((row) => (
                        <CardRoot key={row.id}>
                            <CardContent className="p-4">
                                <div className="flex justify-between">
                                    <StatusBadge tone={row.status === "active" ? "success" : "neutral"}>{row.status}</StatusBadge>
                                    <span className="font-mono text-[10px]">{row.holdout_key}</span>
                                </div>
                                <h3 className="mt-3 font-semibold">{row.name}</h3>
                                <p className="mt-2 text-muted-foreground text-xs leading-5">{row.purpose}</p>
                                <div className="mt-3 flex justify-between border-t pt-3 text-xs">
                                    <span>{row.scope}</span>
                                    <strong>{(row.allocation_bps / 100).toLocaleString("fa-IR")}%</strong>
                                </div>
                            </CardContent>
                        </CardRoot>
                    ))
                ) : (
                    <div className="col-span-full grid min-h-48 place-items-center rounded-2xl border border-dashed text-muted-foreground text-sm">
                        Holdout فعالی ثبت نشده است.
                    </div>
                )}
            </div>
        </div>
    );
}

function MemoryPanel() {
    const knowledge = useCausalKnowledge();
    const collisions = useExperimentCollisions();
    const rows = knowledge.data?.data ?? [];
    return (
        <div className="space-y-4">
            {(collisions.data?.data.length ?? 0) > 0 ? (
                <div className="rounded-2xl border border-danger/25 bg-danger/[0.04] p-4">
                    <strong className="flex items-center gap-2 text-sm">
                        <ShieldAlert className="size-4" /> Collision در لایه‌های فعال
                    </strong>
                    <p className="mt-2 text-muted-foreground text-xs">
                        {collisions.data?.data.length.toLocaleString("fa-IR")} هم‌پوشانی باید قبل از assignment برطرف شود.
                    </p>
                </div>
            ) : (
                <div className="rounded-2xl border border-success/20 bg-success/[0.03] p-4 text-sm">
                    Collision فعالی در namespace/layer ثبت‌شده دیده نشد.
                </div>
            )}
            <div className="grid gap-3 lg:grid-cols-2">
                {rows.length ? (
                    rows.map((row) => (
                        <CardRoot key={row.id}>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <StatusBadge
                                        tone={
                                            row.evidence_strength.includes("randomized") ||
                                            row.evidence_strength === "repeated_replicated"
                                                ? "success"
                                                : "warning"
                                        }
                                    >
                                        {row.evidence_strength}
                                    </StatusBadge>
                                    <span className="text-muted-foreground text-xs">
                                        ×{row.replication_count.toLocaleString("fa-IR")}
                                    </span>
                                </div>
                                <h3 className="mt-3 font-semibold text-sm">
                                    {SURFACE_COPY[row.surface] ?? row.surface} · {row.metric_key}
                                </h3>
                                <p className="mt-2 text-muted-foreground text-xs leading-6">{row.conclusion}</p>
                                {row.limitations?.length ? (
                                    <div className="mt-3 flex flex-wrap gap-1">
                                        {row.limitations.map((item) => (
                                            <span key={item} className="rounded-full bg-muted px-2 py-1 text-[10px]">
                                                {item}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </CardContent>
                        </CardRoot>
                    ))
                ) : (
                    <div className="col-span-full grid min-h-56 place-items-center rounded-2xl border border-dashed text-center text-muted-foreground text-sm">
                        حافظهٔ علّی خالی است. نتیجهٔ معتبر پس از analysis اینجا ثبت می‌شود.
                    </div>
                )}
            </div>
        </div>
    );
}

export function ExperimentationWorkspace() {
    const overview = useExperimentOverview();
    const experiments = useExperiments();
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const rows = experiments.data?.data ?? [];
    const effectiveId = selectedId ?? rows[0]?.id ?? null;
    const exposureChart = useMemo(() => overview.data?.data.exposures_14d ?? [], [overview.data?.data.exposures_14d]);
    const counts = overview.data?.data.counts;
    const refresh = () => {
        void overview.refetch();
        void experiments.refetch();
    };
    return (
        <div className="space-y-6 pb-12" dir="rtl">
            <section className="relative overflow-hidden rounded-[2rem] border bg-gradient-to-bl from-card via-card to-primary/[0.07] p-6 shadow-sm lg:p-8">
                <div className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
                    <div className="max-w-3xl">
                        <div className="mb-3 flex items-center gap-2 text-primary text-sm">
                            <Sparkles className="size-4" />
                            <span>Experimentation & Causal Intelligence Lab · Phase 17</span>
                        </div>
                        <h1 className="font-black text-2xl tracking-tight lg:text-4xl">آزمایشگاه مداخلهٔ مبتنی بر شواهد</h1>
                        <p className="mt-3 max-w-2xl text-muted-foreground leading-7">
                            از فرضیه تا assignment، exposure، SRM، guardrail و حافظهٔ علّی؛ بدون تبدیل همبستگی به ادعای causal و
                            بدون KPI ساختگی.
                        </p>
                    </div>
                    <Button variant="outline" onClick={refresh}>
                        <RefreshCw className={cn("size-4", (overview.isFetching || experiments.isFetching) && "animate-spin")} />{" "}
                        تازه‌سازی Lab
                    </Button>
                </div>
            </section>
            <EvidenceBanner />
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    label="آزمایش فعال"
                    value={(counts?.running ?? 0).toLocaleString("fa-IR")}
                    hint="Experimentهای واقعاً در وضعیت running."
                    tone="primary"
                    icon={Activity}
                />
                <MetricCard
                    label="هشدار SRM"
                    value={(counts?.srm_alerts ?? 0).toLocaleString("fa-IR")}
                    hint="Mismatch در نسبت assignment؛ causal claim را مسدود می‌کند."
                    tone="danger"
                    icon={ShieldAlert}
                />
                <MetricCard
                    label="Guardrail breach"
                    value={(counts?.guardrail_alerts ?? 0).toLocaleString("fa-IR")}
                    hint="برد primary metric در حضور آسیب ثبت‌شده پذیرفته نمی‌شود."
                    tone="warning"
                    icon={Activity}
                />
                <MetricCard
                    label="حافظهٔ علّی"
                    value={(counts?.causal_memory ?? 0).toLocaleString("fa-IR")}
                    hint="نتیجه‌های evidence-graded قابل استفاده برای تصمیم‌های آینده."
                    tone="success"
                    icon={CircleGauge}
                />
            </section>
            <CardRoot>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base">Exposure واقعی · ۱۴ روز اخیر</CardTitle>
                            <p className="mt-1 text-muted-foreground text-xs">Assignmentها شمرده نمی‌شوند؛ فقط exposure ثبت‌شده.</p>
                        </div>
                        <Sparkles className="size-5 text-primary" />
                    </div>
                </CardHeader>
                <CardContent>
                    {exposureChart.length ? (
                        <div className="h-64" dir="ltr">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={exposureChart}>
                                    <defs>
                                        <linearGradient id="phase17-exposure" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.28} />
                                            <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.01} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip />
                                    <Area
                                        type="monotone"
                                        dataKey="count"
                                        stroke="hsl(var(--chart-1))"
                                        fill="url(#phase17-exposure)"
                                        strokeWidth={2.5}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="grid h-48 place-items-center rounded-xl border border-dashed text-muted-foreground text-sm">
                            Exposure ثبت‌شده‌ای در ۱۴ روز اخیر وجود ندارد.
                        </div>
                    )}
                </CardContent>
            </CardRoot>
            <Tabs defaultValue="lab" className="space-y-4">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 lg:grid-cols-4">
                    <TabsTrigger value="lab">Portfolio & Lab</TabsTrigger>
                    <TabsTrigger value="new">طراحی آزمایش</TabsTrigger>
                    <TabsTrigger value="holdouts">Persistent Holdouts</TabsTrigger>
                    <TabsTrigger value="memory">Causal Memory</TabsTrigger>
                </TabsList>
                <TabsContent value="lab">
                    <div className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
                        <CardRoot>
                            <CardHeader>
                                <CardTitle className="text-base">Experiment Registry</CardTitle>
                                <p className="text-muted-foreground text-xs">
                                    {rows.length.toLocaleString("fa-IR")} قرارداد ثبت‌شده
                                </p>
                            </CardHeader>
                            <CardContent>
                                <ExperimentList rows={rows} selectedId={effectiveId} onSelect={setSelectedId} />
                            </CardContent>
                        </CardRoot>
                        <ExperimentDetail id={effectiveId} />
                    </div>
                </TabsContent>
                <TabsContent value="new">
                    <NewExperimentComposer />
                </TabsContent>
                <TabsContent value="holdouts">
                    <HoldoutsPanel />
                </TabsContent>
                <TabsContent value="memory">
                    <MemoryPanel />
                </TabsContent>
            </Tabs>
        </div>
    );
}
