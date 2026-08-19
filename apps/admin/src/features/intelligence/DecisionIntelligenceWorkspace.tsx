"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Activity, CircleGauge, RefreshCw, ShieldAlert, Sparkles } from "#/icons";
import { Link } from "#/lib/i18n/navigation";
import {
    type IntelligenceCase,
    type IntelligenceDecision,
    type IntelligenceDomain,
    type IntelligenceSeverity,
    useIntelligenceDecision,
    useIntelligenceDetail,
    useIntelligenceInbox,
    useIntelligenceOutcome,
    useIntelligenceSummary,
} from "#/lib/queries/intelligence";
import { cn } from "#/lib/utils";

const DOMAIN_COPY: Record<IntelligenceDomain, { fa: string; hint: string }> = {
    payments: { fa: "پرداخت", hint: "تطبیق تراکنش و شواهد درگاه" },
    fulfillment: { fa: "ارسال", hint: "استثنا و بازگشت مرسوله" },
    support: { fa: "پشتیبانی", hint: "SLA پاسخ و حل تیکت" },
    inventory: { fa: "موجودی", hint: "کمبود و ناموجودی ثبت‌شده" },
    seo: { fa: "سئو", hint: "سلامت آخرین اجرای خزش" },
};

const SEVERITY_COPY: Record<IntelligenceSeverity, string> = {
    low: "کم",
    medium: "متوسط",
    high: "زیاد",
    critical: "بحرانی",
};

const FACTOR_COPY: Record<string, string> = {
    expectedValue: "ارزش مورد انتظار",
    confidence: "اطمینان",
    urgency: "فوریت",
    reversibility: "برگشت‌پذیری",
    strategicAlignment: "هم‌راستایی راهبردی",
    capitalEfficiency: "بهره‌وری سرمایه",
    timeToValue: "زمان تا ارزش",
    customerHarmPenalty: "ریسک آسیب به مشتری",
};

function toneForSeverity(severity: IntelligenceSeverity): StatusTone {
    if (severity === "critical" || severity === "high") return "danger";
    if (severity === "medium") return "warning";
    return "info";
}

function formatDate(value: unknown) {
    if (!value) return "—";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function recordText(row: Record<string, unknown>, key: string) {
    const value = row[key];
    return value === null || value === undefined ? "—" : String(value);
}

function MetricCard({
    label,
    value,
    hint,
    emphasis,
}: {
    label: string;
    value: number;
    hint: string;
    emphasis?: "danger" | "accent";
}) {
    return (
        <Card
            className={cn(
                "relative min-h-32 overflow-hidden border-border/70 bg-card/95 shadow-sm",
                emphasis === "danger" && "border-destructive/30 bg-destructive/[0.035]",
                emphasis === "accent" && "border-primary/25 bg-primary/[0.035]",
            )}
        >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-primary/50 to-transparent" />
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                        <span>{label}</span>
                        <HelperTooltip>{hint}</HelperTooltip>
                    </div>
                    <strong className="mt-4 block font-semibold text-3xl tabular-nums tracking-tight">
                        {value.toLocaleString("fa-IR")}
                    </strong>
                </div>
                <div className="rounded-xl border bg-background/70 p-2.5 shadow-sm">
                    {emphasis === "danger" ? (
                        <ShieldAlert className="size-5" />
                    ) : emphasis === "accent" ? (
                        <Sparkles className="size-5" />
                    ) : (
                        <CircleGauge className="size-5" />
                    )}
                </div>
            </div>
        </Card>
    );
}

function CaseCard({ item, selected, onSelect }: { item: IntelligenceCase; selected: boolean; onSelect: () => void }) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                "w-full rounded-2xl border bg-card p-4 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md",
                selected && "border-primary/50 bg-primary/[0.035] ring-1 ring-primary/15",
            )}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <StatusBadge tone={toneForSeverity(item.severity)}>{SEVERITY_COPY[item.severity]}</StatusBadge>
                    <span className="rounded-full border bg-muted/45 px-2 py-0.5 text-muted-foreground text-xs">
                        {DOMAIN_COPY[item.domain].fa}
                    </span>
                </div>
                <div className="flex items-baseline gap-1 text-muted-foreground text-xs">
                    <strong className="text-foreground text-lg tabular-nums">
                        {Math.round(item.priorityScore).toLocaleString("fa-IR")}
                    </strong>
                    <span>/ ۱۰۰</span>
                </div>
            </div>
            <h3 className="mt-3 font-semibold text-base leading-7">{item.titleFa}</h3>
            <p className="mt-1 line-clamp-2 text-muted-foreground text-sm leading-6">{item.summaryFa}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
                <span className="text-muted-foreground">آخرین مشاهده: {formatDate(item.lastSeenAt)}</span>
                <span className={cn("font-medium", "text-muted-foreground")}>
                    {item.scoreMode === "provisional" ? "امتیاز موقت" : "امتیاز کالیبره"}
                </span>
            </div>
        </button>
    );
}

function ScoreBreakdown({ item }: { item: IntelligenceCase }) {
    const rows = Object.entries(item.scoreComponents)
        .filter(([, component]) => component.available)
        .map(([key, component]) => ({
            name: FACTOR_COPY[key] ?? key,
            value: Number((Math.abs(component.contribution) * 100).toFixed(2)),
            contribution: component.contribution,
        }));
    return (
        <Card title="تشریح امتیاز" className="overflow-hidden">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">Policy: {item.rankingPolicyVersion}</span>
                <StatusBadge tone={item.scoreMode === "calibrated" ? "success" : "warning"}>
                    {item.scoreMode === "calibrated" ? "کالیبره" : "موقت"}
                </StatusBadge>
            </div>
            {rows.length ? (
                <div className="h-48 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 14, bottom: 4, left: 14 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(value) => [`${Number(value).toLocaleString("fa-IR")} امتیاز`, "سهم"]} />
                            <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <p className="rounded-xl border border-dashed p-5 text-center text-muted-foreground text-sm">
                    عامل قابل‌اندازه‌گیری برای نمودار وجود ندارد.
                </p>
            )}
            {item.missingComponents.length ? (
                <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-sm">
                    <strong>داده ناکافی:</strong>{" "}
                    <span className="text-muted-foreground">
                        {item.missingComponents.map((key) => FACTOR_COPY[key] ?? key).join("، ")}
                    </span>
                </div>
            ) : null}
        </Card>
    );
}

export function DecisionIntelligenceWorkspace() {
    const [domain, setDomain] = useState<IntelligenceDomain | undefined>();
    const [severity, setSeverity] = useState<IntelligenceSeverity | undefined>();
    const [q, setQ] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    const [metricName, setMetricName] = useState("");
    const [baselineValue, setBaselineValue] = useState("");
    const [observedValue, setObservedValue] = useState("");

    const summary = useIntelligenceSummary();
    const inbox = useIntelligenceInbox({ domain, severity, q });
    const cases = inbox.data?.data ?? [];
    const effectiveSelectedId = selectedId ?? cases[0]?.id ?? null;
    const detail = useIntelligenceDetail(effectiveSelectedId);
    const decision = useIntelligenceDecision();
    const outcome = useIntelligenceOutcome();

    const domainChart = useMemo(
        () =>
            (summary.data?.byDomain ?? []).map((row) => ({
                name: DOMAIN_COPY[row.domain]?.fa ?? row.domain,
                count: row.count,
            })),
        [summary.data?.byDomain],
    );

    const refresh = () => {
        void summary.refetch();
        void inbox.refetch();
        void detail.refetch();
    };

    const submitDecision = (value: IntelligenceDecision) => {
        const item = detail.data?.case;
        if (!item || reason.trim().length < 3) return;
        decision.mutate(
            { id: item.id, decision: value, reason: reason.trim(), version: item.version },
            { onSuccess: () => setReason("") },
        );
    };

    const submitOutcome = () => {
        const item = detail.data?.case;
        if (!item || metricName.trim().length < 2) return;
        outcome.mutate(
            {
                id: item.id,
                metricName: metricName.trim(),
                baselineValue: baselineValue === "" ? undefined : Number(baselineValue),
                observedValue: observedValue === "" ? undefined : Number(observedValue),
                observedAt: new Date().toISOString(),
            },
            {
                onSuccess: () => {
                    setMetricName("");
                    setBaselineValue("");
                    setObservedValue("");
                },
            },
        );
    };

    const hasError = summary.isError || inbox.isError;
    return (
        <div className="space-y-6 pb-10" dir="rtl">
            <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-bl from-card via-card to-primary/[0.06] p-6 shadow-sm lg:p-8">
                <div className="pointer-events-none absolute -top-28 -left-24 size-72 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
                    <div className="max-w-3xl">
                        <div className="mb-3 flex items-center gap-2 text-primary text-sm">
                            <Sparkles className="size-4" />
                            <span>Commerce Decision Intelligence · Phase 10</span>
                        </div>
                        <h1 className="font-semibold text-2xl tracking-tight lg:text-3xl">مرکز تصمیم‌گیری مبتنی بر شواهد</h1>
                        <p className="mt-3 max-w-2xl text-muted-foreground leading-7">
                            سیگنال‌های واقعی پرداخت، ارسال، پشتیبانی، موجودی و سئو به یک Inbox اولویت‌بندی‌شده تبدیل می‌شوند. هر
                            تصمیم، شواهد، نسخه و نتیجهٔ قابل‌اندازه‌گیری خود را حفظ می‌کند.
                        </p>
                    </div>
                    <Button type="button" variant="outline" onClick={refresh} disabled={summary.isFetching || inbox.isFetching}>
                        <RefreshCw className={cn("size-4", (summary.isFetching || inbox.isFetching) && "animate-spin")} />
                        تازه‌سازی سیگنال‌ها
                    </Button>
                </div>
            </section>

            {hasError ? (
                <Card tone="danger" title="خطا در دریافت Intelligence">
                    <p className="text-sm">داده‌های Decision Intelligence دریافت نشد. خطا را در API/شبکه بررسی کنید.</p>
                </Card>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    label="سیگنال باز"
                    value={summary.data?.openCount ?? 0}
                    hint="تعداد intelligence caseهای باز پس از آخرین refresh."
                    emphasis="accent"
                />
                <MetricCard
                    label="ریسک بالا"
                    value={summary.data?.highCriticalCount ?? 0}
                    hint="Caseهای باز با severity زیاد یا بحرانی."
                    emphasis="danger"
                />
                <MetricCard
                    label="امتیاز موقت"
                    value={summary.data?.provisionalCount ?? 0}
                    hint="Caseهایی که Expected Value یا Confidence واقعی ندارند و سیستم آن‌ها را جعل نکرده است."
                />
                <MetricCard
                    label="نتیجه ثبت‌شده"
                    value={summary.data?.measuredCount ?? 0}
                    hint="Caseهایی که Outcome واقعی برای آن‌ها ثبت شده است."
                />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <Card title="پوشش سیگنال‌های زنده">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {(summary.data?.sourceCoverage ?? []).map((source) => (
                            <div
                                key={source.source}
                                className="flex items-center justify-between rounded-xl border bg-background/65 p-3"
                            >
                                <span className="text-sm">
                                    {DOMAIN_COPY[source.source as IntelligenceDomain]?.fa ?? source.source}
                                </span>
                                <StatusBadge tone={source.status === "active" ? "success" : "warning"}>
                                    {source.status === "active" ? "فعال" : "وابستگی وارد main نشده"}
                                </StatusBadge>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card title="توزیع Inbox بر اساس دامنه">
                    {domainChart.length ? (
                        <div className="h-44" dir="ltr">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={domainChart} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                                    <Tooltip formatter={(value) => [Number(value).toLocaleString("fa-IR"), "Case"]} />
                                    <Bar dataKey="count" fill="var(--chart-2)" radius={[7, 7, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p className="p-8 text-center text-muted-foreground text-sm">سیگنال بازی برای نمودار وجود ندارد.</p>
                    )}
                </Card>
            </section>

            <section className="grid min-h-[720px] gap-4 xl:grid-cols-[0.92fr_1.35fr]">
                <div className="space-y-3">
                    <Card title="Action Inbox" className="sticky top-4 z-10">
                        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                            <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="جست‌وجو در سیگنال‌ها…" />
                            <select
                                className="h-10 rounded-md border bg-background px-3 text-sm"
                                value={domain ?? ""}
                                onChange={(event) =>
                                    setDomain((event.target.value || undefined) as IntelligenceDomain | undefined)
                                }
                            >
                                <option value="">همه دامنه‌ها</option>
                                {Object.entries(DOMAIN_COPY).map(([key, copy]) => (
                                    <option key={key} value={key}>
                                        {copy.fa}
                                    </option>
                                ))}
                            </select>
                            <select
                                className="h-10 rounded-md border bg-background px-3 text-sm"
                                value={severity ?? ""}
                                onChange={(event) =>
                                    setSeverity((event.target.value || undefined) as IntelligenceSeverity | undefined)
                                }
                            >
                                <option value="">همه شدت‌ها</option>
                                {Object.entries(SEVERITY_COPY).map(([key, label]) => (
                                    <option key={key} value={key}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </Card>
                    {inbox.isLoading ? (
                        <Card>
                            <p className="animate-pulse p-8 text-center text-muted-foreground text-sm">
                                در حال ساخت Inbox از سیگنال‌های زنده…
                            </p>
                        </Card>
                    ) : null}
                    {!inbox.isLoading && cases.length === 0 ? (
                        <Card>
                            <p className="p-8 text-center text-muted-foreground text-sm">در فیلتر فعلی Case بازی وجود ندارد.</p>
                        </Card>
                    ) : null}
                    {cases.map((item) => (
                        <CaseCard
                            key={item.id}
                            item={item}
                            selected={effectiveSelectedId === item.id}
                            onSelect={() => setSelectedId(item.id)}
                        />
                    ))}
                </div>

                <div className="space-y-4">
                    {!detail.data ? (
                        <Card className="min-h-72">
                            <p className="p-12 text-center text-muted-foreground text-sm">
                                برای مشاهدهٔ شواهد و ثبت تصمیم، یک Case را انتخاب کنید.
                            </p>
                        </Card>
                    ) : (
                        <>
                            <Card className="overflow-hidden border-primary/20">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="max-w-3xl">
                                        <div className="mb-2 flex flex-wrap items-center gap-2">
                                            <StatusBadge tone={toneForSeverity(detail.data.case.severity)}>
                                                {SEVERITY_COPY[detail.data.case.severity]}
                                            </StatusBadge>
                                            <span className="rounded-full border px-2 py-0.5 text-xs">
                                                {DOMAIN_COPY[detail.data.case.domain].fa}
                                            </span>
                                            <span className="rounded-full border px-2 py-0.5 text-muted-foreground text-xs">
                                                {detail.data.case.lifecycleStage}
                                            </span>
                                        </div>
                                        <h2 className="font-semibold text-xl leading-8">{detail.data.case.titleFa}</h2>
                                        <p className="mt-2 text-muted-foreground text-sm leading-7">
                                            {detail.data.case.summaryFa}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border bg-muted/30 px-5 py-3 text-center">
                                        <div className="font-semibold text-3xl tabular-nums">
                                            {Math.round(detail.data.case.priorityScore).toLocaleString("fa-IR")}
                                        </div>
                                        <div className="mt-1 text-muted-foreground text-xs">اولویت از ۱۰۰</div>
                                    </div>
                                </div>
                                <div className="mt-5 rounded-2xl border border-primary/15 bg-primary/[0.035] p-4">
                                    <div className="mb-1 flex items-center gap-2 font-medium">
                                        <Activity className="size-4" />
                                        اقدام پیشنهادی
                                    </div>
                                    <p className="text-sm leading-7">{detail.data.case.recommendedActionFa}</p>
                                    {detail.data.case.actionRoute ? (
                                        <Link
                                            href={detail.data.case.actionRoute}
                                            className="mt-3 inline-flex text-primary text-sm hover:underline"
                                        >
                                            باز کردن محل اقدام ←
                                        </Link>
                                    ) : null}
                                </div>
                            </Card>

                            <ScoreBreakdown item={detail.data.case} />

                            <Card title="Evidence lineage">
                                <div className="space-y-2">
                                    {detail.data.evidence.length === 0 ? (
                                        <p className="text-muted-foreground text-sm">شاهدی ثبت نشده است.</p>
                                    ) : null}
                                    {detail.data.evidence.map((row) => (
                                        <div key={recordText(row, "id")} className="rounded-xl border bg-background/65 p-3">
                                            <div className="flex flex-wrap justify-between gap-2">
                                                <strong className="text-sm">{recordText(row, "label_fa")}</strong>
                                                <span className="text-muted-foreground text-xs">
                                                    {formatDate(row.freshness_at)}
                                                </span>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                                <span className="rounded bg-muted px-2 py-1">
                                                    {recordText(row, "source_domain")}
                                                </span>
                                                <span className="rounded bg-muted px-2 py-1">
                                                    {recordText(row, "source_kind")}
                                                </span>
                                                <span className="rounded bg-muted px-2 py-1">
                                                    {recordText(row, "metric_name")}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card title="Decision Memory">
                                <p className="mb-3 text-muted-foreground text-sm leading-6">
                                    تصمیم باید دلیل داشته باشد و روی version فعلی Case ثبت می‌شود. Accept فقط action plan و
                                    deep-link می‌سازد؛ اجرای policy در Phase 11 است.
                                </p>
                                <Input
                                    value={reason}
                                    onChange={(event) => setReason(event.target.value)}
                                    placeholder="دلیل تصمیم را بنویسید…"
                                />
                                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                                    {(["accept", "reject", "defer", "watch"] as const).map((value) => (
                                        <Button
                                            key={value}
                                            type="button"
                                            variant={value === "accept" ? "default" : "outline"}
                                            disabled={reason.trim().length < 3 || decision.isPending}
                                            onClick={() => submitDecision(value)}
                                        >
                                            {{ accept: "تأیید", reject: "رد", defer: "تعویق", watch: "پایش" }[value]}
                                        </Button>
                                    ))}
                                </div>
                                <div className="mt-4 space-y-2">
                                    {detail.data.decisions.slice(0, 5).map((row) => (
                                        <div key={recordText(row, "id")} className="rounded-xl border p-3 text-sm">
                                            <div className="flex justify-between gap-2">
                                                <strong>{recordText(row, "decision")}</strong>
                                                <span className="text-muted-foreground text-xs">
                                                    {formatDate(row.created_at)}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-muted-foreground">{recordText(row, "reason")}</p>
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card title="Outcome Ledger">
                                <div className="grid gap-2 md:grid-cols-3">
                                    <Input
                                        value={metricName}
                                        onChange={(event) => setMetricName(event.target.value)}
                                        placeholder="نام متریک"
                                    />
                                    <Input
                                        type="number"
                                        value={baselineValue}
                                        onChange={(event) => setBaselineValue(event.target.value)}
                                        placeholder="Baseline (اختیاری)"
                                    />
                                    <Input
                                        type="number"
                                        value={observedValue}
                                        onChange={(event) => setObservedValue(event.target.value)}
                                        placeholder="Observed (اختیاری)"
                                    />
                                </div>
                                <Button
                                    type="button"
                                    className="mt-3"
                                    variant="outline"
                                    disabled={metricName.trim().length < 2 || outcome.isPending}
                                    onClick={submitOutcome}
                                >
                                    ثبت نتیجه واقعی
                                </Button>
                                <div className="mt-4 space-y-2">
                                    {detail.data.outcomes.length === 0 ? (
                                        <p className="text-muted-foreground text-sm">هنوز outcome ثبت نشده است.</p>
                                    ) : null}
                                    {detail.data.outcomes.slice(0, 8).map((row) => (
                                        <div
                                            key={recordText(row, "id")}
                                            className="grid gap-2 rounded-xl border p-3 text-sm sm:grid-cols-[1fr_auto_auto]"
                                        >
                                            <strong>{recordText(row, "metric_name")}</strong>
                                            <span className="text-muted-foreground">Δ {recordText(row, "delta")}</span>
                                            <span className="text-muted-foreground text-xs">{formatDate(row.observed_at)}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </>
                    )}
                </div>
            </section>
        </div>
    );
}
