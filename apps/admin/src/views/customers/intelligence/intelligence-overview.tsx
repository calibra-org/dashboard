"use client";

import { HelperTooltip } from "@calibra/panel-kit/helper-tooltip";
import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { BarChart3, BrainCircuit, RefreshCw, ShieldCheck, Sparkles, TrendingUp, Users } from "#/icons";
import { formatDateTime, formatMoney, formatNumber } from "#/lib/format";
import { useCustomerIntelligenceSummary, useRefreshAllCustomerIntelligence } from "#/lib/queries/customer-intelligence";

import { CustomerWorkspaceNav } from "../customer-workspace-nav";

const INTELLIGENCE_SKELETON_KEYS = [
    "intelligence-skeleton-a",
    "intelligence-skeleton-b",
    "intelligence-skeleton-c",
    "intelligence-skeleton-d",
    "intelligence-skeleton-e",
    "intelligence-skeleton-f",
] as const;

interface MetricCardProps {
    icon: typeof Users;
    label: string;
    help: string;
    value: string;
    detail?: string;
}

function MetricCard({ icon: Icon, label, help, value, detail }: MetricCardProps) {
    return (
        <Card className="group overflow-hidden transition-shadow hover:shadow-sm">
            <CardContent className="flex min-h-36 flex-col justify-between gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
                        <Icon className="size-4" aria-hidden="true" />
                    </div>
                    <HelperTooltip side="bottom">{help}</HelperTooltip>
                </div>
                <div>
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <p className="mt-1 font-semibold text-2xl tabular-nums tracking-tight">{value}</p>
                    {detail ? <p className="mt-1 text-muted-foreground text-xs">{detail}</p> : null}
                </div>
            </CardContent>
        </Card>
    );
}

export function IntelligenceOverview() {
    const t = useTranslations("CustomerIntelligence");
    const locale = useLocale() as Locale;
    const summary = useCustomerIntelligenceSummary();
    const refresh = useRefreshAllCustomerIntelligence();

    if (summary.isPending) {
        return (
            <div className="flex flex-col gap-5">
                <CustomerWorkspaceNav />
                <Skeleton className="h-28 w-full" />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                    {INTELLIGENCE_SKELETON_KEYS.map((key) => (
                        <Skeleton key={key} className="h-36" />
                    ))}
                </div>
                <Skeleton className="h-80" />
            </div>
        );
    }

    if (summary.isError || !summary.data) {
        return (
            <div className="flex flex-col gap-5">
                <CustomerWorkspaceNav />
                <Card>
                    <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
                        <ShieldCheck className="size-8 text-muted-foreground" aria-hidden="true" />
                        <p className="text-muted-foreground text-sm">{summary.error?.message ?? t("common.noData")}</p>
                        <Button variant="outline" onClick={() => summary.refetch()}>
                            {t("common.retry")}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const data = summary.data as typeof summary.data & {
        historical_contribution_ltv_minor?: number;
        contribution_customer_count?: number;
        contribution_coverage_ratio?: number;
        contribution_status?: "available" | "partial" | "unavailable";
    };
    const lifecycleRows = [
        { key: "active_repeat", value: data.active_repeat, label: t("lifecycleStates.active_repeat") },
        { key: "at_risk", value: data.at_risk, label: t("lifecycleStates.at_risk") },
        { key: "lapsed", value: data.lapsed, label: t("lifecycleStates.lapsed") },
    ];
    const contributionCoverage = Math.max(0, Math.min(1, data.contribution_coverage_ratio ?? 0));
    const contributionDetail =
        data.contribution_status === "unavailable"
            ? t("common.unavailable")
            : `${formatNumber(Math.round(contributionCoverage * 100), locale)}% ${t("common.customers")}`;

    return (
        <div className="flex flex-col gap-5">
            <CustomerWorkspaceNav />

            <header className="relative overflow-hidden rounded-2xl border bg-card p-5 lg:p-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="flex items-center gap-3">
                            <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                                <Sparkles className="size-5" aria-hidden="true" />
                            </div>
                            <div>
                                <h1 className="font-semibold text-2xl tracking-tight">{t("overview.title")}</h1>
                                <p className="mt-1 text-muted-foreground text-xs">
                                    {t("common.engineVersion")}:{" "}
                                    <span className="font-mono text-foreground">{data.engine_version}</span>
                                </p>
                            </div>
                        </div>
                        <p className="mt-3 text-muted-foreground text-sm leading-6">{t("overview.subtitle")}</p>
                    </div>
                    <div className="flex items-center gap-2 self-start lg:self-auto">
                        <HelperTooltip side="bottom">{t("overview.refreshHelp")}</HelperTooltip>
                        <Button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
                            <RefreshCw className={refresh.isPending ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
                            {t("common.refreshAll")}
                        </Button>
                    </div>
                </div>
            </header>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                <MetricCard
                    icon={Users}
                    label={t("overview.total")}
                    help={t("overview.totalHelp")}
                    value={formatNumber(data.total, locale)}
                />
                <MetricCard
                    icon={TrendingUp}
                    label={t("overview.activeRepeat")}
                    help={t("overview.activeRepeatHelp")}
                    value={formatNumber(data.active_repeat, locale)}
                />
                <MetricCard
                    icon={ShieldCheck}
                    label={t("overview.atRisk")}
                    help={t("overview.atRiskHelp")}
                    value={formatNumber(data.at_risk, locale)}
                    detail={`${formatNumber(data.high_risk, locale)} ${t("riskBands.high")}`}
                />
                <MetricCard
                    icon={Sparkles}
                    label={t("overview.highValue")}
                    help={t("overview.highValueHelp")}
                    value={formatNumber(data.high_value, locale)}
                />
                <MetricCard
                    icon={BarChart3}
                    label={t("overview.revenueLtv")}
                    help={t("overview.revenueLtvHelp")}
                    value={formatMoney(data.historical_revenue_ltv_minor, locale)}
                />
                <MetricCard
                    icon={BrainCircuit}
                    label={t("overview.contribution")}
                    help={t("overview.qualityHelp")}
                    value={
                        data.contribution_status === "unavailable"
                            ? t("common.unavailable")
                            : formatMoney(data.historical_contribution_ltv_minor ?? 0, locale)
                    }
                    detail={contributionDetail}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
                <Card className="overflow-hidden">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            {t("overview.lifecycle")}
                            <HelperTooltip>{t("overview.lifecycleHelp")}</HelperTooltip>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-72 w-full" dir="ltr">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={lifecycleRows}
                                    layout="vertical"
                                    margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                                >
                                    <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" horizontal={false} />
                                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                                    <YAxis
                                        type="category"
                                        dataKey="label"
                                        width={118}
                                        tickLine={false}
                                        axisLine={false}
                                        fontSize={11}
                                    />
                                    <Tooltip
                                        cursor={{ fill: "var(--muted)" }}
                                        formatter={(value) => formatNumber(Number(value ?? 0), locale)}
                                        contentStyle={{
                                            background: "var(--popover)",
                                            border: "1px solid var(--border)",
                                            borderRadius: "0.75rem",
                                            color: "var(--popover-foreground)",
                                        }}
                                    />
                                    <Bar dataKey="value" fill="var(--primary)" radius={[0, 8, 8, 0]} maxBarSize={34} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="border-t pt-3 text-muted-foreground text-xs">
                            {data.generated_at
                                ? `${t("common.updatedAt")}: ${formatDateTime(data.generated_at, locale)}`
                                : t("common.noData")}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            {t("overview.quality")}
                            <HelperTooltip>{t("overview.qualityHelp")}</HelperTooltip>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <div className="rounded-xl border bg-muted/30 p-3.5">
                            <div className="flex items-center gap-2 font-medium text-sm">
                                <BrainCircuit className="size-4 text-warning" aria-hidden="true" />
                                {t("overview.prediction")}
                            </div>
                            <p className="mt-1 text-muted-foreground text-xs">{t("overview.ruleBased")}</p>
                        </div>
                        <div className="rounded-xl border bg-muted/30 p-3.5">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 font-medium text-sm">
                                    <BarChart3 className="size-4 text-info" aria-hidden="true" />
                                    {t("overview.contribution")}
                                </div>
                                <span className="font-medium text-xs tabular-nums">
                                    {formatNumber(Math.round(contributionCoverage * 100), locale)}%
                                </span>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-primary transition-[width]"
                                    style={{ width: `${contributionCoverage * 100}%` }}
                                />
                            </div>
                            <p className="mt-2 text-muted-foreground text-xs">{contributionDetail}</p>
                        </div>
                        <div className="rounded-xl border bg-primary/5 p-3.5">
                            <div className="flex items-center gap-2 font-medium text-sm">
                                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                                {t("overview.nextAction")}
                                <HelperTooltip>{t("overview.nextActionHelp")}</HelperTooltip>
                            </div>
                            <p className="mt-1 text-muted-foreground text-xs">{t("detail.candidateOnly")}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {refresh.isError ? <p className="text-danger text-sm">{refresh.error.message}</p> : null}
            {refresh.isSuccess ? (
                <p className="text-sm text-success">
                    {formatNumber(refresh.data.data.refreshed, locale)} {t("common.customers")}
                </p>
            ) : null}
        </div>
    );
}
