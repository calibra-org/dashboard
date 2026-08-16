"use client";

import { HelperTooltip } from "@calibra/panel-kit/helper-tooltip";
import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { BrainCircuit, RefreshCw, ShieldCheck, Sparkles } from "#/icons";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "#/lib/format";
import { useCustomerIntelligence, useRefreshCustomerIntelligence } from "#/lib/queries/customer-intelligence";

interface IntelligenceCardProps {
    customerId: number;
    locale: Locale;
}

function Metric({ label, help, value, note }: { label: string; help: string; value: React.ReactNode; note?: string }) {
    return (
        <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <span>{label}</span>
                <HelperTooltip>{help}</HelperTooltip>
            </div>
            <div className="mt-1 font-semibold text-base">{value}</div>
            {note ? <p className="mt-1 text-muted-foreground text-xs leading-5">{note}</p> : null}
        </div>
    );
}

export function IntelligenceCard({ customerId, locale }: IntelligenceCardProps) {
    const t = useTranslations("CustomerIntelligence");
    const intelligence = useCustomerIntelligence(customerId);
    const refresh = useRefreshCustomerIntelligence(customerId);

    if (intelligence.isPending) return <div className="grid grid-cols-2 gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
    if (intelligence.isError || !intelligence.data) {
        return (
            <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-5 text-center">
                <ShieldCheck className="size-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-muted-foreground text-sm">{intelligence.error?.message ?? t("common.noData")}</p>
                <Button variant="outline" size="sm" onClick={() => intelligence.refetch()}>{t("common.retry")}</Button>
            </div>
        );
    }

    const data = intelligence.data;
    const support = data.signals.support ?? {};
    const refunds = data.signals.refunds ?? {};
    const consent = data.signals.consent ?? {};
    const nextPurchase = data.expected_next_purchase_from && data.expected_next_purchase_to
        ? `${formatDate(data.expected_next_purchase_from, locale)} — ${formatDate(data.expected_next_purchase_to, locale)}`
        : t("common.insufficientData");

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge>{t(`lifecycleStates.${data.lifecycle_state}`)}</Badge>
                    <Badge variant="outline">{t(`riskBands.${data.risk_band}`)}</Badge>
                    <Badge variant="secondary">{t(`valueBands.${data.value_band}`)}</Badge>
                    <HelperTooltip>{t("detail.sectionHelp")}</HelperTooltip>
                </div>
                <Button variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
                    <RefreshCw className={refresh.isPending ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden="true" />
                    {t("common.refresh")}
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Metric label={t("detail.lifecycle")} help={t("detail.lifecycleHelp")} value={t(`lifecycleStates.${data.lifecycle_state}`)} note={data.engine_version} />
                <Metric
                    label={t("detail.rfm")}
                    help={t("detail.rfmHelp")}
                    value={data.rfm_score === null ? "—" : `${formatNumber(data.rfm_score, locale)} / ۱۵`}
                    note={`R ${data.rfm_recency_score ?? "—"} · F ${data.rfm_frequency_score ?? "—"} · M ${data.rfm_monetary_score ?? "—"}`}
                />
                <Metric label={t("detail.risk")} help={t("detail.riskHelp")} value={t(`riskBands.${data.risk_band}`)} note={t("common.notCalibrated")} />
                <Metric label={t("detail.value")} help={t("detail.valueHelp")} value={t(`valueBands.${data.value_band}`)} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Metric label={t("detail.historicalRevenue")} help={t("detail.historicalRevenueHelp")} value={data.historical_revenue_ltv_minor === null ? t("common.unavailable") : formatMoney(data.historical_revenue_ltv_minor, locale)} />
                <Metric label={t("detail.historicalContribution")} help={t("detail.historicalContributionHelp")} value={t("common.unavailable")} note={t("overview.phase12Missing")} />
                <Metric label={t("detail.nextPurchase")} help={t("detail.nextPurchaseHelp")} value={nextPurchase} />
                <Metric
                    label={t("detail.refunds")}
                    help={t("detail.refundsHelp")}
                    value={formatMoney(Number(refunds.refunded_minor ?? 0), locale)}
                />
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.25fr]">
                <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <ShieldCheck className="size-4 text-info" aria-hidden="true" />
                        {t("detail.support")}
                        <HelperTooltip>{t("detail.supportHelp")}</HelperTooltip>
                    </div>
                    <div className="mt-3 flex items-end gap-5">
                        <div><div className="font-semibold text-xl tabular-nums">{formatNumber(Number(support.open_tickets ?? 0), locale)}</div><div className="text-muted-foreground text-xs">Open</div></div>
                        <div><div className="font-semibold text-xl tabular-nums">{formatNumber(Number(support.tickets_90d ?? 0), locale)}</div><div className="text-muted-foreground text-xs">۹۰ روز</div></div>
                    </div>
                </div>
                <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <ShieldCheck className="size-4 text-success" aria-hidden="true" />
                        {t("detail.consent")}
                        <HelperTooltip>{t("detail.consentHelp")}</HelperTooltip>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <Badge variant={consent.email_opt_in ? "secondary" : "outline"}>Email: {consent.email_opt_in ? "✓" : "—"}</Badge>
                        <Badge variant={consent.sms_opt_in ? "secondary" : "outline"}>SMS: {consent.sms_opt_in ? "✓" : "—"}</Badge>
                    </div>
                </div>
                <div className="rounded-lg border bg-primary/5 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="size-4 text-primary" aria-hidden="true" />
                        {t("detail.nba")}
                        <HelperTooltip>{t("detail.nbaHelp")}</HelperTooltip>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                        {data.nba_candidates.map((candidate, index) => (
                            <div key={`${candidate.action_type ?? "candidate"}-${index}`} className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm">
                                <span>{nbaLabel(candidate.action_type, t)}</span>
                                <Badge variant="outline">{candidate.eligibility === "blocked_by_consent" ? t("detail.blockedByConsent") : t("detail.candidateOnly")}</Badge>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-muted-foreground text-xs">
                <span>{t("common.updatedAt")}: {formatDateTime(data.calculated_at, locale)}</span>
                <span>{t("common.engineVersion")}: <span className="font-mono text-foreground">{data.engine_version}</span></span>
                <span>{t("detail.qualityStatus")}: {data.quality_status === "ready" ? "Ready" : t("common.insufficientData")}</span>
            </div>

            {refresh.isError ? <div className="flex items-center gap-2 text-danger text-xs"><BrainCircuit className="size-3.5" aria-hidden="true" />{refresh.error.message}</div> : null}
        </div>
    );
}

function nbaLabel(actionType: string | undefined, t: ReturnType<typeof useTranslations>) {
    if (actionType === "service_follow_up") return t("detail.serviceFollowUp");
    if (actionType === "win_back") return t("detail.winBack");
    if (actionType === "do_nothing") return t("detail.doNothing");
    if (actionType === "no_incentive_needed") return t("detail.noIncentive");
    return actionType ?? t("common.unavailable");
}
