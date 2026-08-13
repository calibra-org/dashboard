"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { RevenueBarChart } from "#/components/charts/RevenueBarChart";
import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { SubTabs } from "#/components/SubTabs";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { formatDate, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useTopSellersReport } from "#/lib/queries/reports";
import type { TopSellersReport } from "#/lib/types";

type TopRow = TopSellersReport["rows"][number];

/** Top-sellers report backed by the canonical Admin reports endpoint. */
export function TopSellersView() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Reports");
    const topT = useTranslations("Reports.topSellers");
    const commonT = useTranslations("Common");
    const cols = topT.raw("table") as Record<string, string>;
    const reportQuery = useTopSellersReport();
    const report = reportQuery.data;

    const chartData =
        report?.rows.map((row) => ({
            label: row.name[locale].length > 16 ? `${row.name[locale].slice(0, 14)}…` : row.name[locale],
            value: row.revenue,
        })) ?? [];

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                subtitle={
                    report
                        ? topT("subtitle", {
                              start: formatDate(report.range.startDate, locale),
                              end: formatDate(report.range.endDate, locale),
                          })
                        : topT("title")
                }
            />
            <SubTabs
                namespace="Reports.tabs"
                tabs={[
                    { href: "/reports", labelKey: "sales" },
                    { href: "/reports/top-sellers", labelKey: "topSellers" },
                ]}
            />

            {reportQuery.isLoading ? (
                <div className="space-y-4">
                    <Skeleton className="h-80 w-full rounded-xl" />
                    <Skeleton className="h-64 w-full rounded-xl" />
                </div>
            ) : reportQuery.isError || report === undefined ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground text-sm">
                        <span>{commonT("errorLoading")}</span>
                        <Button variant="outline" size="sm" onClick={() => void reportQuery.refetch()}>
                            {commonT("retry")}
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">{topT("chartTitle")}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <RevenueBarChart data={chartData} />
                        </CardContent>
                    </Card>

                    <DataTable<TopRow>
                        columns={[
                            {
                                id: "product",
                                header: cols.product,
                                cell: (row) => (
                                    <Link href={`/products/${row.productId}` as never} className="font-medium hover:underline">
                                        {row.name[locale]}
                                    </Link>
                                ),
                            },
                            {
                                id: "sku",
                                header: cols.sku,
                                cell: (row) => <span className="font-mono text-muted-foreground text-xs">{row.sku}</span>,
                            },
                            {
                                id: "units",
                                header: cols.units,
                                cell: (row) => formatNumber(row.units, locale),
                                className: "text-end",
                            },
                            {
                                id: "revenue",
                                header: cols.revenue,
                                cell: (row) => <span className="font-medium">{formatMoney(row.revenue, locale)}</span>,
                                className: "text-end",
                            },
                        ]}
                        rows={report.rows}
                        getRowKey={(row) => row.productId}
                        emptyState={commonT("noResults")}
                    />
                </>
            )}
        </section>
    );
}
