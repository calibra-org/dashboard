"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";

import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { useOrderOperationsSummary } from "#/features/operations/queries";
import { formatNumber } from "#/lib/format";
import type { OrderCountsMap } from "#/lib/queries/orders";
import type { OrderStatus } from "#/lib/types";

export type StatusTabKey = OrderStatus | "any" | "trashed";

const TAB_ORDER: StatusTabKey[] = [
    "any",
    "pending",
    "processing",
    "on_hold",
    "completed",
    "cancelled",
    "refunded",
    "failed",
    "draft",
    "trashed",
];

interface StatusTabsProps {
    value: StatusTabKey;
    onChange: (next: StatusTabKey) => void;
    counts?: OrderCountsMap;
    locale: Locale;
}

/**
 * Order status navigation plus the compact post-payment exception strip. Both surfaces remain in
 * the existing Orders workbench; the exception counts come from canonical backend aggregates.
 */
export function StatusTabs({ value, onChange, counts, locale }: StatusTabsProps) {
    const t = useTranslations("Orders.list");
    const statusT = useTranslations("OrderStatus");
    const operationsT = useTranslations("OrderOperations.summary");
    const operations = useOrderOperationsSummary();

    return (
        <div className="grid gap-3">
            <Tabs value={value} onValueChange={(next) => onChange(next as StatusTabKey)} variant="line" aria-label={t("title")}>
                <TabsList className="h-10 flex-wrap gap-6 px-0">
                    {TAB_ORDER.map((key) => {
                        const count = countFor(counts, key);
                        const label = labelFor(key, t, statusT);
                        return (
                            <TabsTrigger key={key} value={key} className="px-0">
                                <span>{label}</span>
                                {count !== undefined && (
                                    <span className="ms-1 text-muted-foreground/80 tabular-nums">({formatNumber(count, locale)})</span>
                                )}
                            </TabsTrigger>
                        );
                    })}
                </TabsList>
            </Tabs>
            {operations.data ? (
                <section aria-label={operationsT("title")} className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 xl:grid-cols-4">
                    <ExceptionMetric label={operationsT("unfulfilled")} value={operations.data.paid_unfulfilled_over_24h} locale={locale} />
                    <ExceptionMetric label={operationsT("shipmentExceptions")} value={operations.data.shipment_exceptions} locale={locale} />
                    <ExceptionMetric label={operationsT("returnsApproval")} value={operations.data.returns_awaiting_approval} locale={locale} />
                    <ExceptionMetric label={operationsT("returnsRefund")} value={operations.data.returns_awaiting_refund} locale={locale} />
                </section>
            ) : null}
        </div>
    );
}

function ExceptionMetric({ label, value, locale }: { label: string; value: number; locale: Locale }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className={value > 0 ? "font-semibold text-warning tabular-nums" : "font-semibold tabular-nums"}>{formatNumber(value, locale)}</span>
        </div>
    );
}

function countFor(counts: OrderCountsMap | undefined, key: StatusTabKey): number | undefined {
    if (counts === undefined) return undefined;
    if (key === "any") return counts.all;
    return counts[key];
}

function labelFor(key: StatusTabKey, t: ReturnType<typeof useTranslations>, statusT: ReturnType<typeof useTranslations>): string {
    if (key === "any") return t("tabs.all");
    if (key === "trashed") return t("tabs.trashed");
    return statusT(key);
}
