"use client";

import { HelperTooltip } from "@calibra/panel-kit/helper-tooltip";
import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { BarChart3, BrainCircuit, RefreshCw, ShieldCheck, Sparkles, TrendingUp, Users } from "#/icons";
import { formatDateTime, formatMoney, formatNumber } from "#/lib/format";
import { useCustomerIntelligenceSummary, useRefreshAllCustomerIntelligence } from "#/lib/queries/customer-intelligence";

import { CustomerWorkspaceNav } from "../customer-workspace-nav";

interface MetricCardProps {
    icon: typeof Users;
    label: string;
    help: string;
    value: string;
    detail?: string;
}

function MetricCard({ icon: Icon, label, help, value, detail }: MetricCardProps) {
    return (
        <Card className="overflow-hidden">
            <CardContent className="flex min-h-32 flex-col justify-between gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
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
                <Skeleton className="h-24 w-full" />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-32" />)}
                </div>
                <Skeleton className="h-72" />
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
                        <Button variant="outline" onClick={() => summary.refetch()}>{t("common.retry")}</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const data = summary.data;
    const lifecycleRows = [
        { key: "active_repeat", value: data.active_repeat, label: t("lifecycleStates.active_repeat") },
        { key: "at_risk", value: data.at_risk, label: t("lifecycleStates.at_risk") },
        { key: "lapsed", value: data.lapsed, label: t("lifecycleStates.lapsed") },
    ];
    const maxLifecycle = Math.max(1, ...lifecycleRows.map((row) => row.value));

    return (
        <div className="flex flex-col gap-5">
            <CustomerWorkspaceNav />

            <header className="flex flex-col gap-4 rounded-xl border bg-card p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-3xl">
                    <div className="flex items-center gap-2">
                        <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                            <Sparkles className="size-5" aria-hidden="true" />
                        </div>
                        <h1 className="font-semibold text-2xl tracking-tight">{t("overview.title")}</h1>
                    </div>
                    <p className="mt-2 text-muted-foreground text-sm leading-6">{t("overview.subtitle")}</p>
                </div>
                <div className="flex items-center gap-2">
                    <HelperTooltip side="bottom">{t("overview.refreshHelp")}</HelperTooltip>
                    <Button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
                        <RefreshCw className={refresh.isPending ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
                        {t("common.refreshAll")}
                    </Button>
                </div>
            </header>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <MetricCard icon={Users} label={t("overview.total")} help={t("overview.totalHelp")} value={formatNumber(data.total, locale)} />
                <MetricCard icon={TrendingUp} label={t("overview.activeRepeat")} help={t("overview.activeRepeatHelp")} value={formatNumber(data.active_repeat, locale)} />
                <MetricCard icon={ShieldCheck} label={t("overview.atRisk")} help={t("overview.atRiskHelp")} value={formatNumber(data.at_risk, locale)} detail={`${formatNumber(data.high_risk, locale)} ${t("riskBands.high")}`} />
                <MetricCard icon={Sparkles} label={t("overview.highValue")} help={t("overview.highValueHelp")} value={formatNumber(data.high_value, locale)} />
                <MetricCard icon={BarChart3} label={t("overview.revenueLtv")} help={t("overview.revenueLtvHelp")} value={formatMoney(data.historical_revenue_ltv_minor, locale)} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            {t("overview.lifecycle")}
                            <HelperTooltip>{t("overview.lifecycleHelp")}</HelperTooltip>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-5">
                        {lifecycleRows.map((row) => (
                            <div key={row.key} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm">
                                <span>{row.label}</span>
                                <div className="h-2 overflow-hidden rounded-full bg-muted">
                                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (row.value / maxLifecycle) * 100)}%` }} />
                                </div>
                                <span className="min-w-10 text-end font-medium tabular-nums">{formatNumber(row.value, locale)}</span>
                            </div>
                        ))}
                        <div className="border-t pt-3 text-muted-foreground text-xs">
                            {data.generated_at ? `${t("common.updatedAt")}: ${formatDateTime(data.generated_at, locale)}` : t("common.noData")}
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
                        <div className="rounded-lg border bg-muted/30 p-3">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <BrainCircuit className="size-4 text-warning" aria-hidden="true" />
                                {t("overview.prediction")}
                            </div>
                            <p className="mt-1 text-muted-foreground text-xs">{t("overview.ruleBased")}</p>
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <BarChart3 className="size-4 text-info" aria-hidden="true" />
                                {t("overview.contribution")}
                            </div>
                            <p className="mt-1 text-muted-foreground text-xs">{t("overview.phase12Missing")}</p>
                        </div>
                        <div className="rounded-lg border bg-primary/5 p-3">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                                {t("overview.nextAction")}
                                <HelperTooltip>{t("overview.nextActionHelp")}</HelperTooltip>
                            </div>
                            <p className="mt-1 text-muted-foreground text-xs">{t("detail.candidateOnly")}</p>
                        </div>
                        <div className="pt-1 text-muted-foreground text-xs">
                            {t("common.engineVersion")}: <span className="font-mono text-foreground">{data.engine_version}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {refresh.isError ? <p className="text-danger text-sm">{refresh.error.message}</p> : null}
            {refresh.isSuccess ? <p className="text-success text-sm">{formatNumber(refresh.data.data.refreshed, locale)} {t("common.customers")}</p> : null}
        </div>
    );
}
