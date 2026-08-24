"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { Link } from "#/lib/i18n/navigation";
import {
    type NetworkAccessRow,
    type NetworkBenchmark,
    type NetworkContribution,
    type NetworkMetricDefinition,
    type NetworkOverview,
    useNetworkIntelligenceMutation,
    useNetworkIntelligenceResource,
} from "#/lib/queries/network-intelligence";
import { cn } from "#/lib/utils";

type NetworkSection = "benchmarks" | "participation" | "privacy";

const paths: Record<NetworkSection, string> = {
    benchmarks: "/decision-intelligence/network-intelligence/benchmarks",
    participation: "/decision-intelligence/network-intelligence/participation",
    privacy: "/decision-intelligence/network-intelligence/privacy",
};

function asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    return {};
}

function formatNumber(value: unknown, digits = 2) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: digits }).format(Number(value));
}

function dateLabel(value: string | null | undefined) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function StatePanel({ title, text }: { title: string; text: string }) {
    return (
        <Card className="border-dashed p-6 text-center">
            <p className="font-semibold">{title}</p>
            <p className="mt-2 text-muted-foreground text-sm">{text}</p>
        </Card>
    );
}

export function NetworkTabs({ section }: { section: NetworkSection }) {
    const t = useTranslations("NetworkIntelligence");
    return (
        <nav className="grid gap-2 rounded-xl border bg-card p-2 sm:grid-cols-3" aria-label={t("tabsLabel")}>
            {(Object.keys(paths) as NetworkSection[]).map((key) => (
                <Link
                    key={key}
                    href={paths[key] as never}
                    className={cn(
                        "rounded-lg px-4 py-2.5 text-center text-sm transition-colors",
                        section === key
                            ? "bg-primary font-medium text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                >
                    {t(`tabs.${key}`)}
                </Link>
            ))}
        </nav>
    );
}

function Kpis({ overview }: { overview: NetworkOverview }) {
    const items = [
        ["مشارکت‌های خودمان", overview.kpis.contributions],
        ["بنچمارک‌های منتشرشده", overview.kpis.publications],
        ["تعریف متریک فعال", overview.kpis.active_metric_definitions],
        ["بازبینی امنیتی تأییدشده", overview.kpis.approved_security_reviews],
    ] as const;
    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {items.map(([label, value]) => (
                <Card key={label} className="p-4">
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <p className="mt-2 font-semibold text-3xl">{formatNumber(value, 0)}</p>
                </Card>
            ))}
        </div>
    );
}

function BenchmarksSection() {
    const overview = useNetworkIntelligenceResource<NetworkOverview>("overview");
    const benchmarks = useNetworkIntelligenceResource<NetworkBenchmark[]>("benchmarks");
    const metrics = useNetworkIntelligenceResource<NetworkMetricDefinition[]>("metrics");
    const contribution = useNetworkIntelligenceMutation<NetworkContribution>();
    const metricMutation = useNetworkIntelligenceMutation<NetworkMetricDefinition>();

    const [metricKey, setMetricKey] = useState("conversion.rate");
    const [unit, setUnit] = useState("percent");
    const [numeratorDefinition, setNumeratorDefinition] = useState("paid orders");
    const [denominatorDefinition, setDenominatorDefinition] = useState("sessions");
    const [valueMin, setValueMin] = useState("0");
    const [valueMax, setValueMax] = useState("100");
    const [metricReason, setMetricReason] = useState("");

    const firstMetric = metrics.data?.[0];
    const [contributionMetric, setContributionMetric] = useState("");
    const [periodKey, setPeriodKey] = useState(new Date().toISOString().slice(0, 7));
    const [aggregateValue, setAggregateValue] = useState("");
    const [recordCount, setRecordCount] = useState("");
    const selectedMetric = metrics.data?.find((item) => item.metric_key === contributionMetric) ?? firstMetric;

    async function createMetric() {
        await metricMutation.mutateAsync({
            path: "metrics",
            body: {
                metric_key: metricKey,
                unit,
                numerator_definition: numeratorDefinition,
                denominator_definition: denominatorDefinition || undefined,
                aggregation: denominatorDefinition ? "ratio" : "mean",
                period_grain: "month",
                minimum_records_per_contribution: 20,
                value_min: Number(valueMin),
                value_max: Number(valueMax),
                reason: metricReason,
            },
        });
        setMetricReason("");
    }

    async function submitContribution() {
        if (!selectedMetric) return;
        await contribution.mutateAsync({
            path: "contributions",
            body: {
                metric_key: selectedMetric.metric_key,
                metric_version: selectedMetric.version,
                period_key: periodKey,
                segment_key: "all",
                aggregate_value: Number(aggregateValue),
                record_count: Number(recordCount),
                source_aggregate_refs: [`metric:${selectedMetric.metric_key}:${periodKey}`],
            },
        });
        setAggregateValue("");
        setRecordCount("");
    }

    if (overview.isLoading || benchmarks.isLoading || metrics.isLoading) {
        return <StatePanel title="در حال آماده‌سازی هوش شبکه" text="بنچمارک‌ها و سیاست‌های حریم خصوصی در حال بارگذاری‌اند." />;
    }
    if (overview.isError || benchmarks.isError || metrics.isError) {
        return (
            <StatePanel
                title="دسترسی به هوش شبکه ممکن نشد"
                text="مجوز، اتصال API و وضعیت سرویس را بررسی کنید و دوباره تلاش کنید."
            />
        );
    }
    const currentOverview = overview.data;
    if (!currentOverview) return null;

    return (
        <div className="space-y-4">
            <Kpis overview={currentOverview} />
            {!currentOverview.participation?.opted_in ? (
                <Card className="border-dashed p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="font-semibold">مشارکت شبکه هنوز فعال نیست</p>
                            <p className="mt-1 text-muted-foreground text-sm">
                                قبل از ارسال aggregate، مبنای حقوقی، هدف و حداقل cohort را ثبت کنید.
                            </p>
                        </div>
                        <Link
                            href={paths.participation as never}
                            className="rounded-lg bg-primary px-4 py-2 text-primary-foreground text-sm"
                        >
                            تنظیم مشارکت
                        </Link>
                    </div>
                </Card>
            ) : null}

            <div className="grid gap-4 2xl:grid-cols-[1.35fr_0.65fr]">
                <Card className="overflow-hidden">
                    <div className="border-b p-5">
                        <div className="flex items-center gap-2">
                            <h2 className="font-semibold text-lg">بنچمارک‌های حریم‌خصوصی‌محور</h2>
                            <HelperTooltip
                                text="فقط publicationهایی نمایش داده می‌شوند که حداقل cohort را پاس کرده باشند؛ رکورد خام peer هرگز از این API خارج نمی‌شود."
                                label="راهنمای بنچمارک"
                            />
                        </div>
                        <p className="mt-1 text-muted-foreground text-sm">
                            خروجی مقایسه‌ای همراه با نسخه الگوریتم و metadata روش privacy.
                        </p>
                    </div>
                    <div className="divide-y">
                        {(benchmarks.data ?? []).length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground text-sm">
                                هنوز publication واجد حداقل cohort دریافت نشده است.
                            </div>
                        ) : (
                            (benchmarks.data ?? []).map((benchmark) => {
                                const privacy = asRecord(benchmark.privacy_parameters);
                                const epsilon = privacy.epsilon;
                                return (
                                    <div
                                        key={benchmark.public_id}
                                        className="grid gap-3 p-5 md:grid-cols-[1fr_auto] md:items-center"
                                    >
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <strong>{benchmark.metric_key}</strong>
                                                <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs">
                                                    v{benchmark.metric_version}
                                                </span>
                                                <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs">
                                                    {benchmark.privacy_method}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-muted-foreground text-xs">
                                                دوره {benchmark.period_key} · cohort {formatNumber(benchmark.cohort_size, 0)} ·
                                                حداقل {formatNumber(benchmark.minimum_cohort_size, 0)}
                                                {epsilon != null ? ` · ε=${String(epsilon)}` : ""}
                                            </p>
                                            <p className="mt-1 text-muted-foreground text-xs">
                                                {benchmark.algorithm_version} · {dateLabel(benchmark.published_at)}
                                            </p>
                                        </div>
                                        <p className="font-semibold text-3xl tabular-nums">
                                            {formatNumber(benchmark.benchmark_value)}
                                        </p>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </Card>

                <Card className="space-y-4 p-5">
                    <div>
                        <h2 className="font-semibold text-lg">ارسال aggregate خودمان</h2>
                        <p className="mt-1 text-muted-foreground text-sm">
                            فقط مقدار aggregate محدودشده به bounds؛ بدون customer/order/user identifier.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="network-contribution-metric">متریک</Label>
                        <Select
                            value={selectedMetric?.metric_key ?? ""}
                            onValueChange={(value) => {
                                if (typeof value === "string") setContributionMetric(value);
                            }}
                        >
                            <SelectTrigger id="network-contribution-metric">
                                <SelectValue placeholder="انتخاب متریک" />
                            </SelectTrigger>
                            <SelectContent>
                                {(metrics.data ?? []).map((metric) => (
                                    <SelectItem key={metric.public_id} value={metric.metric_key}>
                                        {metric.metric_key} · v{metric.version}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="network-period">دوره</Label>
                            <Input id="network-period" value={periodKey} onChange={(event) => setPeriodKey(event.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="network-record-count">تعداد رکورد محلی</Label>
                            <Input
                                id="network-record-count"
                                inputMode="numeric"
                                value={recordCount}
                                onChange={(event) => setRecordCount(event.target.value)}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="network-value">مقدار aggregate</Label>
                        <Input
                            id="network-value"
                            inputMode="decimal"
                            value={aggregateValue}
                            onChange={(event) => setAggregateValue(event.target.value)}
                        />
                    </div>
                    {selectedMetric ? (
                        <p className="text-muted-foreground text-xs">
                            Bounds: {formatNumber(selectedMetric.value_min)} تا {formatNumber(selectedMetric.value_max)} · حداقل
                            رکورد {selectedMetric.minimum_records_per_contribution}
                        </p>
                    ) : null}
                    <Button
                        onClick={submitContribution}
                        disabled={
                            !selectedMetric ||
                            contribution.isPending ||
                            !aggregateValue ||
                            !recordCount ||
                            !currentOverview.participation?.opted_in
                        }
                    >
                        ثبت aggregate امن
                    </Button>
                    {contribution.isError ? <p className="text-destructive text-sm">{contribution.error.message}</p> : null}
                </Card>
            </div>

            <Card className="space-y-4 p-5">
                <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-lg">تعریف معنایی متریک</h2>
                    <HelperTooltip
                        text="تعریف، bounds و نسخه به digest متریک متصل می‌شوند تا مقایسه بین تعریف‌های ناسازگار منتشر نشود."
                        label="راهنمای تعریف متریک"
                    />
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                        <Label htmlFor="metric-key">کلید متریک</Label>
                        <Input id="metric-key" value={metricKey} onChange={(event) => setMetricKey(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="metric-unit">واحد</Label>
                        <Input id="metric-unit" value={unit} onChange={(event) => setUnit(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="metric-min">حد پایین</Label>
                        <Input
                            id="metric-min"
                            inputMode="decimal"
                            value={valueMin}
                            onChange={(event) => setValueMin(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="metric-max">حد بالا</Label>
                        <Input
                            id="metric-max"
                            inputMode="decimal"
                            value={valueMax}
                            onChange={(event) => setValueMax(event.target.value)}
                        />
                    </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="metric-num">تعریف صورت</Label>
                        <Textarea
                            id="metric-num"
                            value={numeratorDefinition}
                            onChange={(event) => setNumeratorDefinition(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="metric-den">تعریف مخرج (اختیاری)</Label>
                        <Textarea
                            id="metric-den"
                            value={denominatorDefinition}
                            onChange={(event) => setDenominatorDefinition(event.target.value)}
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="metric-reason">دلیل تغییر</Label>
                    <Textarea
                        id="metric-reason"
                        value={metricReason}
                        onChange={(event) => setMetricReason(event.target.value)}
                        placeholder="چرا این تعریف برای مقایسه شبکه معتبر است؟"
                    />
                </div>
                <Button
                    onClick={createMetric}
                    disabled={
                        metricMutation.isPending || metricReason.trim().length < 3 || !(Number(valueMin) < Number(valueMax))
                    }
                >
                    ثبت نسخه جدید متریک
                </Button>
                {metricMutation.isError ? <p className="text-destructive text-sm">{metricMutation.error.message}</p> : null}
            </Card>
        </div>
    );
}

function ParticipationSection() {
    const overview = useNetworkIntelligenceResource<NetworkOverview>("overview");
    const mutation = useNetworkIntelligenceMutation();
    const current = overview.data?.participation;
    const [optedIn, setOptedIn] = useState(true);
    const [legalBasis, setLegalBasis] = useState("");
    const [termsVersion, setTermsVersion] = useState("phase27-v1");
    const [minimumCohort, setMinimumCohort] = useState("20");
    const [privacyMethod, setPrivacyMethod] = useState<"aggregate_threshold" | "laplace_dp" | "secure_aggregate">(
        "aggregate_threshold",
    );
    const [epsilon, setEpsilon] = useState("1");
    const [maxEpsilon, setMaxEpsilon] = useState("4");
    const [reason, setReason] = useState("");

    async function savePolicy() {
        await mutation.mutateAsync({
            path: "participation",
            body: {
                opted_in: optedIn,
                legal_basis: optedIn ? legalBasis : undefined,
                terms_version: optedIn ? termsVersion : undefined,
                purpose_scopes: optedIn ? ["benchmarking"] : [],
                minimum_cohort_size: Number(minimumCohort),
                privacy_method: privacyMethod,
                privacy_parameters:
                    privacyMethod === "laplace_dp"
                        ? { epsilon: Number(epsilon), max_cumulative_epsilon: Number(maxEpsilon) }
                        : {},
                reason,
            },
        });
        setReason("");
    }

    return (
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <Card className="p-5">
                <h2 className="font-semibold text-lg">سیاست فعال</h2>
                {overview.isLoading ? <p className="mt-4 text-muted-foreground text-sm">در حال بارگذاری…</p> : null}
                {overview.isError ? <p className="mt-4 text-destructive text-sm">سیاست فعلی قابل دریافت نیست.</p> : null}
                {!overview.isLoading && !current ? (
                    <p className="mt-4 text-muted-foreground text-sm">هنوز نسخه‌ای ثبت نشده است.</p>
                ) : null}
                {current ? (
                    <dl className="mt-4 grid gap-3 text-sm">
                        <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">وضعیت</dt>
                            <dd className="font-medium">{current.opted_in ? "فعال / Opt-in" : "غیرفعال"}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">نسخه</dt>
                            <dd>v{current.version}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">روش privacy</dt>
                            <dd>{current.privacy_method}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">حداقل cohort</dt>
                            <dd>{formatNumber(current.minimum_cohort_size, 0)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">مبنای حقوقی</dt>
                            <dd>{current.legal_basis ?? "—"}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">اعمال از</dt>
                            <dd>{dateLabel(current.effective_at)}</dd>
                        </div>
                    </dl>
                ) : null}
            </Card>

            <Card className="space-y-4 p-5">
                <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-lg">نسخه جدید سیاست مشارکت</h2>
                    <HelperTooltip
                        text="این تغییر حساس است و backend احراز هویت تکمیلی، audit سخت‌گیرانه و نسخه‌بندی immutable را اعمال می‌کند."
                        label="راهنمای مشارکت"
                    />
                </div>
                <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                    <input type="checkbox" checked={optedIn} onChange={(event) => setOptedIn(event.target.checked)} />
                    مشارکت در benchmarking شبکه فعال باشد
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="legal-basis">مبنای حقوقی</Label>
                        <Input
                            id="legal-basis"
                            value={legalBasis}
                            onChange={(event) => setLegalBasis(event.target.value)}
                            disabled={!optedIn}
                            placeholder="contract / consent / legitimate-interest-reviewed"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="terms-version">نسخه شرایط</Label>
                        <Input
                            id="terms-version"
                            value={termsVersion}
                            onChange={(event) => setTermsVersion(event.target.value)}
                            disabled={!optedIn}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="minimum-cohort">حداقل cohort</Label>
                        <Input
                            id="minimum-cohort"
                            inputMode="numeric"
                            value={minimumCohort}
                            onChange={(event) => setMinimumCohort(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="privacy-method">روش privacy</Label>
                        <Select
                            value={privacyMethod}
                            onValueChange={(value) => {
                                if (value === "aggregate_threshold" || value === "laplace_dp" || value === "secure_aggregate") {
                                    setPrivacyMethod(value);
                                }
                            }}
                        >
                            <SelectTrigger id="privacy-method">
                                <SelectValue placeholder="روش privacy" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="aggregate_threshold">aggregate threshold</SelectItem>
                                <SelectItem value="laplace_dp">Laplace DP</SelectItem>
                                <SelectItem value="secure_aggregate">secure aggregate (attested backend)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                {privacyMethod === "laplace_dp" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="epsilon">Epsilon هر انتشار</Label>
                            <Input
                                id="epsilon"
                                inputMode="decimal"
                                value={epsilon}
                                onChange={(event) => setEpsilon(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="max-epsilon">بودجه تجمعی Epsilon</Label>
                            <Input
                                id="max-epsilon"
                                inputMode="decimal"
                                value={maxEpsilon}
                                onChange={(event) => setMaxEpsilon(event.target.value)}
                            />
                        </div>
                    </div>
                ) : null}
                <div className="space-y-2">
                    <Label htmlFor="participation-reason">دلیل و مرجع تصویب</Label>
                    <Textarea id="participation-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
                </div>
                <Button
                    onClick={savePolicy}
                    disabled={
                        mutation.isPending ||
                        reason.trim().length < 3 ||
                        Number(minimumCohort) < 5 ||
                        (optedIn && (!legalBasis.trim() || !termsVersion.trim()))
                    }
                >
                    ثبت نسخه جدید سیاست
                </Button>
                {mutation.isError ? <p className="text-destructive text-sm">{mutation.error.message}</p> : null}
            </Card>
        </div>
    );
}

function PrivacySection() {
    const overview = useNetworkIntelligenceResource<NetworkOverview>("overview");
    const contributions = useNetworkIntelligenceResource<NetworkContribution[]>("contributions");
    const access = useNetworkIntelligenceResource<NetworkAccessRow[]>("access");
    const exportMutation = useNetworkIntelligenceMutation();
    const accessMutation = useNetworkIntelligenceMutation();
    const reviewMutation = useNetworkIntelligenceMutation();
    const [targetUser, setTargetUser] = useState("");
    const [preset, setPreset] = useState("viewer");
    const [accessReason, setAccessReason] = useState("");
    const [artifactRef, setArtifactRef] = useState("security-review:phase27/");
    const [decision, setDecision] = useState("");

    const policyPrivacy = useMemo(
        () => asRecord(overview.data?.participation?.privacy_parameters),
        [overview.data?.participation?.privacy_parameters],
    );

    async function exportOwnData() {
        await exportMutation.mutateAsync({ path: "exports", body: { scope: "all" } });
    }

    async function applyPreset() {
        await accessMutation.mutateAsync({
            path: "access/preset",
            body: { user_id: Number(targetUser), preset, reason: accessReason },
        });
        setAccessReason("");
    }

    async function recordReview() {
        await reviewMutation.mutateAsync({
            path: "security-reviews",
            body: { review_type: "phase27_privacy_gate", status: "approved", artifact_ref: artifactRef, findings: [], decision },
        });
        setDecision("");
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-4">
                    <p className="text-muted-foreground text-xs">Privacy unit</p>
                    <p className="mt-2 font-semibold">{String(policyPrivacy.privacy_unit ?? "tenant_aggregate_value")}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-muted-foreground text-xs">Membership protection</p>
                    <p className="mt-2 font-semibold">{policyPrivacy.membership_protected === true ? "فعال" : "اعلام‌شده: خیر"}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-muted-foreground text-xs">Algorithm</p>
                    <p className="mt-2 font-semibold">{String(policyPrivacy.algorithm_version ?? "phase27-network-v1")}</p>
                </Card>
            </div>

            <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-semibold text-lg">مرز داده و Export</h2>
                            <HelperTooltip
                                text="Export فقط policy و contributionهای خود tenant و publicationهای aggregate دریافت‌شده را برمی‌گرداند؛ peer raw/identifier/cross-tenant rows حذف‌اند."
                                label="راهنمای Export"
                            />
                        </div>
                        <p className="mt-1 text-muted-foreground text-sm">
                            هیچ endpoint عادی Phase 27 برای خواندن contribution tenant دیگر وجود ندارد.
                        </p>
                    </div>
                    <Button onClick={exportOwnData} disabled={exportMutation.isPending}>
                        ساخت Export داده خودمان
                    </Button>
                </div>
                {exportMutation.isSuccess ? <p className="mt-3 text-sm">Export امن ساخته شد و در audit ثبت شد.</p> : null}
                {exportMutation.isError ? <p className="mt-3 text-destructive text-sm">{exportMutation.error.message}</p> : null}
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="space-y-4 p-5">
                    <h2 className="font-semibold text-lg">کنترل دسترسی شبکه</h2>
                    <div className="space-y-2">
                        <Label htmlFor="access-user">ادمین هدف</Label>
                        <Select
                            value={targetUser}
                            onValueChange={(value) => {
                                if (typeof value === "string") setTargetUser(value);
                            }}
                        >
                            <SelectTrigger id="access-user">
                                <SelectValue placeholder="انتخاب کنید" />
                            </SelectTrigger>
                            <SelectContent>
                                {(access.data ?? []).map((row) => (
                                    <SelectItem key={row.id} value={String(row.id)}>
                                        {row.identity}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="access-preset">Preset</Label>
                        <Select
                            value={preset}
                            onValueChange={(value) => {
                                if (typeof value === "string") setPreset(value);
                            }}
                        >
                            <SelectTrigger id="access-preset">
                                <SelectValue placeholder="Preset" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="viewer">viewer</SelectItem>
                                <SelectItem value="contributor">contributor</SelectItem>
                                <SelectItem value="privacy_admin">privacy admin</SelectItem>
                                <SelectItem value="owner">owner</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="access-reason">دلیل تغییر</Label>
                        <Textarea
                            id="access-reason"
                            value={accessReason}
                            onChange={(event) => setAccessReason(event.target.value)}
                        />
                    </div>
                    <Button
                        onClick={applyPreset}
                        disabled={!targetUser || accessReason.trim().length < 3 || accessMutation.isPending}
                    >
                        اعمال دسترسی
                    </Button>
                    {accessMutation.isError ? <p className="text-destructive text-sm">{accessMutation.error.message}</p> : null}
                </Card>

                <Card className="space-y-4 p-5">
                    <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-lg">ثبت Security Review</h2>
                        <HelperTooltip
                            text="تصمیم امنیتی، artifact مرجع و findings aggregate-only ثبت و audit می‌شوند؛ PII در findings مجاز نیست."
                            label="راهنمای Security Review"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="artifact-ref">Artifact reference</Label>
                        <Input id="artifact-ref" value={artifactRef} onChange={(event) => setArtifactRef(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="review-decision">تصمیم</Label>
                        <Textarea
                            id="review-decision"
                            value={decision}
                            onChange={(event) => setDecision(event.target.value)}
                            placeholder="چه چیزی بازبینی شد و چرا انتشار امن است؟"
                        />
                    </div>
                    <Button
                        onClick={recordReview}
                        disabled={reviewMutation.isPending || decision.trim().length < 3 || artifactRef.trim().length < 3}
                    >
                        ثبت تأیید امنیتی
                    </Button>
                    {reviewMutation.isError ? <p className="text-destructive text-sm">{reviewMutation.error.message}</p> : null}
                </Card>
            </div>

            <Card className="overflow-hidden">
                <div className="border-b p-5">
                    <h2 className="font-semibold text-lg">دفتر مشارکت‌های خود tenant</h2>
                    <p className="mt-1 text-muted-foreground text-sm">این جدول فقط contributionهای tenant جاری را نشان می‌دهد.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                                <th className="p-3 text-start">متریک</th>
                                <th className="p-3 text-start">دوره</th>
                                <th className="p-3 text-start">مقدار</th>
                                <th className="p-3 text-start">رکورد محلی</th>
                                <th className="p-3 text-start">آخرین ثبت</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {(contributions.data ?? []).map((row) => (
                                <tr key={row.public_id}>
                                    <td className="p-3 font-medium">
                                        {row.metric_key} · v{row.metric_version}
                                    </td>
                                    <td className="p-3">{row.period_key}</td>
                                    <td className="p-3 tabular-nums">{formatNumber(row.aggregate_value)}</td>
                                    <td className="p-3 tabular-nums">{formatNumber(row.record_count, 0)}</td>
                                    <td className="p-3 text-muted-foreground">{dateLabel(row.updated_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {(contributions.data ?? []).length === 0 ? (
                    <p className="p-6 text-center text-muted-foreground text-sm">هنوز contribution محلی ثبت نشده است.</p>
                ) : null}
            </Card>
        </div>
    );
}

export function NetworkIntelligenceWorkspace({ section }: { section: NetworkSection }) {
    const t = useTranslations("NetworkIntelligence");
    return (
        <div dir="rtl" className="space-y-6 p-6">
            <Card className="overflow-hidden border-primary/20 bg-gradient-to-bl from-primary/10 via-card to-card p-6">
                <PageHeader title={t("title")} subtitle={t("subtitle")} />
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border bg-background/70 px-3 py-1.5">Aggregate only</span>
                    <span className="rounded-full border bg-background/70 px-3 py-1.5">Tenant RLS + FORCE RLS</span>
                    <span className="rounded-full border bg-background/70 px-3 py-1.5">Minimum cohort</span>
                    <span className="rounded-full border bg-background/70 px-3 py-1.5">Versioned privacy policy</span>
                </div>
            </Card>
            <NetworkTabs section={section} />
            {section === "benchmarks" ? <BenchmarksSection /> : null}
            {section === "participation" ? <ParticipationSection /> : null}
            {section === "privacy" ? <PrivacySection /> : null}
        </div>
    );
}
