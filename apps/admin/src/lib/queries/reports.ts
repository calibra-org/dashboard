"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet } from "#/lib/queries/api-client";
import type { MoneyMinor, SalesReport } from "#/lib/types";

interface SalesStatsTotals {
    gross_sales: number;
    net_sales: number;
    total_sales: number;
    returns: number;
    orders: number;
    avg_order_value: number;
}

interface SalesStatsInterval {
    date: string;
    orders: number;
    gross_sales: number;
    returns: number;
}

interface SalesStatsResponse {
    totals: SalesStatsTotals;
    intervals: SalesStatsInterval[];
    comparison: unknown | null;
    generated_at: string;
}

function trailingThirtyDayRange(): { date_from: string; date_to: string } {
    const today = new Date();
    const from = new Date(today);
    from.setUTCDate(today.getUTCDate() - 29);
    return {
        date_from: from.toISOString().slice(0, 10),
        date_to: today.toISOString().slice(0, 10),
    };
}

/**
 * Canonical 30-day sales report. The API's analytics service is the single source of truth for
 * counted order statuses, refunds, gross/net sales and interval bucketing; the browser only adapts
 * that response into the legacy `SalesReport` view shape.
 */
export function useSalesReport() {
    const locale = useLocale() as Locale;
    const range = trailingThirtyDayRange();
    return useQuery<SalesStatsResponse, Error, SalesReport>({
        queryKey: ["admin", "reports", "sales", { locale, ...range }],
        queryFn: ({ signal }) =>
            apiGet<SalesStatsResponse>("reports/sales-stats", {
                locale,
                query: { ...range, interval: "day" },
                signal,
            }),
        select: (payload): SalesReport => ({
            totalRevenue: Number(payload.totals.gross_sales) as MoneyMinor,
            netRevenue: Number(payload.totals.net_sales) as MoneyMinor,
            refundedAmount: Number(payload.totals.returns) as MoneyMinor,
            averageOrderValue: Number(payload.totals.avg_order_value) as MoneyMinor,
            orderCount: Number(payload.totals.orders),
            series: payload.intervals.map((point) => ({
                date: point.date,
                revenue: Number(point.gross_sales) as MoneyMinor,
                orders: Number(point.orders),
                refunded: Number(point.returns) as MoneyMinor,
            })),
        }),
        staleTime: 5 * 60 * 1000,
    });
}
