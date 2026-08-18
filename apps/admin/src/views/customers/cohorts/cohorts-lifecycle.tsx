"use client";

import { HelperTooltip } from "@calibra/panel-kit/helper-tooltip";
import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { BarChart3, CalendarDays } from "#/icons";
import { formatMoney, formatNumber } from "#/lib/format";
import { useLifecycleCohorts } from "#/lib/queries/customer-intelligence";

import { CustomerWorkspaceNav } from "../customer-workspace-nav";

export function CohortsLifecycle() {
    const t = useTranslations("CustomerIntelligence");
    const locale = useLocale() as Locale;
    const cohorts = useLifecycleCohorts();

    return (
        <div className="flex flex-col gap-5">
            <CustomerWorkspaceNav />
            <header className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-2">
                    <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                        <CalendarDays className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                        <h1 className="font-semibold text-2xl tracking-tight">{t("cohorts.title")}</h1>
                        <p className="mt-1 text-muted-foreground text-sm">{t("cohorts.subtitle")}</p>
                    </div>
                </div>
            </header>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <BarChart3 className="size-4 text-primary" aria-hidden="true" />
                        {t("cohorts.title")}
                        <HelperTooltip>{t("cohorts.cohortHelp")}</HelperTooltip>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {cohorts.isPending ? (
                        <div className="space-y-2 p-4">
                            {Array.from({ length: 6 }, (_, index) => (
                                <Skeleton key={index} className="h-10" />
                            ))}
                        </div>
                    ) : null}
                    {cohorts.isError ? <div className="p-6 text-danger text-sm">{cohorts.error.message}</div> : null}
                    {cohorts.data && cohorts.data.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">{t("cohorts.empty")}</div>
                    ) : null}
                    {cohorts.data && cohorts.data.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>
                                            {t("cohorts.cohort")} <HelperTooltip>{t("cohorts.cohortHelp")}</HelperTooltip>
                                        </TableHead>
                                        <TableHead>{t("cohorts.lifecycle")}</TableHead>
                                        <TableHead className="text-end">{t("cohorts.customers")}</TableHead>
                                        <TableHead className="text-end">
                                            {t("cohorts.revenue")} <HelperTooltip>{t("cohorts.revenueHelp")}</HelperTooltip>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {cohorts.data.map((row) => (
                                        <TableRow key={`${row.cohort}-${row.lifecycle_state}`}>
                                            <TableCell className="font-medium tabular-nums">{row.cohort}</TableCell>
                                            <TableCell>{t(`lifecycleStates.${row.lifecycle_state}`)}</TableCell>
                                            <TableCell className="text-end tabular-nums">
                                                {formatNumber(row.customers, locale)}
                                            </TableCell>
                                            <TableCell className="text-end font-medium tabular-nums">
                                                {formatMoney(row.revenue_ltv_minor, locale)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
