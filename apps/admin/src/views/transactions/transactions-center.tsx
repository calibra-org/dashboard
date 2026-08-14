"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { type KeyboardEvent, type ReactNode, useDeferredValue, useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import { DateFilterChip, type DateFilterValue } from "#/components/ui/date-picker";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Sheet, SheetContent } from "#/components/ui/sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { toast } from "#/components/ui/toast";
import {
    AlertCircle,
    ArrowDownUp,
    CheckCircle2,
    Clock3,
    Copy,
    ExternalLink,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldCheck,
    WalletCards,
    XCircle,
} from "#/icons";
import { formatDateTime, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useCreateRefund, useOrder, useOrderRefunds } from "#/lib/queries/orders";
import { usePaymentGateways } from "#/lib/queries/payments";
import {
    type AdminTransaction,
    type AdminTransactionDetail,
    type PaymentAttemptStatus,
    type PaymentReconciliationStatus,
    useReconcileTransaction,
    useTransaction,
    useTransactionReconciliationHistory,
    useTransactions,
    useTransactionSummary,
} from "#/lib/queries/transactions";
import type { TableViewFilter, TableViewQuery } from "#/lib/table-view";
import { dateFilterValueToTableViewFilter } from "#/lib/table-view/date-adapter";
import { cn } from "#/lib/utils";

const STATUSES: PaymentAttemptStatus[] = ["initiated", "awaiting_callback", "verified", "failed", "cancelled", "refunded"];
const RECONCILIATION: PaymentReconciliationStatus[] = ["unchecked", "matched", "mismatch", "unsupported", "error"];

interface CopyShape {
    title: string;
    subtitle: string;
    live: string;
    search: string;
    allStatuses: string;
    allGateways: string;
    allReconciliation: string;
    newest: string;
    oldest: string;
    highest: string;
    lowest: string;
    refresh: string;
    clear: string;
    total: string;
    verified: string;
    pending: string;
    attention: string;
    amount: string;
    transaction: string;
    order: string;
    gateway: string;
    status: string;
    reconcile: string;
    time: string;
    reference: string;
    date: string;
    minAmount: string;
    maxAmount: string;
    empty: string;
    emptyHint: string;
    error: string;
    retry: string;
    previous: string;
    next: string;
    details: string;
    flow: string;
    initiated: string;
    verifiedAt: string;
    identifiers: string;
    attempt: string;
    authority: string;
    ref: string;
    gatewayError: string;
    payload: string;
    openOrder: string;
    copied: string;
    checkProvider: string;
    checking: string;
    reconciliationEvidence: string;
    reconciliationHistory: string;
    neverChecked: string;
    refund: string;
    refundAmount: string;
    refundReason: string;
    refundSubmit: string;
    refundRemaining: string;
    refundRouting: string;
    refundSuccess: string;
    refundGatewayCompleted: string;
    refundGatewayManual: string;
    refundGatewayUnknown: string;
    refundInvalid: string;
    refundUnavailable: string;
    previousRefunds: string;
}

function paymentTone(status: PaymentAttemptStatus) {
    if (status === "verified") return "border-success/30 bg-success/10 text-success";
    if (status === "failed" || status === "cancelled") {
        return "border-destructive/30 bg-destructive/10 text-destructive";
    }
    if (status === "refunded") return "border-info/30 bg-info/10 text-info";
    return "border-warning/30 bg-warning/10 text-warning";
}

function reconciliationTone(status: PaymentReconciliationStatus) {
    if (status === "matched") return "border-success/30 bg-success/10 text-success";
    if (status === "mismatch" || status === "error") {
        return "border-destructive/30 bg-destructive/10 text-destructive";
    }
    if (status === "unsupported") return "border-info/30 bg-info/10 text-info";
    return "border-border bg-muted text-muted-foreground";
}

export function TransactionsCenter() {
    const locale = useLocale() as Locale;
    const lang = locale === "fa" ? "fa" : "en";
    const translations = useTranslations("Transactions");
    const t = translations.raw("copy") as CopyShape;
    const calendar = lang === "fa" ? "jalali" : "gregorian";
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const deferredSearch = useDeferredValue(search);
    const [status, setStatus] = useState("all");
    const [gateway, setGateway] = useState("all");
    const [reconciliation, setReconciliation] = useState("all");
    const [sort, setSort] = useState("newest");
    const [dateFilter, setDateFilter] = useState<DateFilterValue | null>(null);
    const [minAmount, setMinAmount] = useState("");
    const [maxAmount, setMaxAmount] = useState("");
    const [selected, setSelected] = useState<number | null>(null);
    const gatewayList = usePaymentGateways();

    const query = useMemo<TableViewQuery>(() => {
        const filter: TableViewFilter[] = [];
        if (status !== "all") filter.push({ field: "status", op: "eq", value: status });
        if (gateway !== "all") filter.push({ field: "gateway_code_snapshot", op: "eq", value: gateway });
        if (reconciliation !== "all") {
            filter.push({ field: "reconciliation_status", op: "eq", value: reconciliation });
        }
        if (dateFilter) {
            const created = dateFilterValueToTableViewFilter("created_at", dateFilter);
            if (created) filter.push(created);
        }
        const min = Number(minAmount);
        const max = Number(maxAmount);
        if (minAmount.trim() && Number.isSafeInteger(min) && min >= 0) {
            filter.push({ field: "amount_minor", op: "gte", value: min });
        }
        if (maxAmount.trim() && Number.isSafeInteger(max) && max >= 0) {
            filter.push({ field: "amount_minor", op: "lte", value: max });
        }
        const sorts: Record<string, TableViewQuery["sort"]> = {
            newest: [{ field: "created_at", dir: "desc" }],
            oldest: [{ field: "created_at", dir: "asc" }],
            highest: [{ field: "amount_minor", dir: "desc" }],
            lowest: [{ field: "amount_minor", dir: "asc" }],
        };
        return { page, limit: 25, filter, filterOr: [], sort: sorts[sort] ?? sorts.newest };
    }, [page, status, gateway, reconciliation, sort, dateFilter, minAmount, maxAmount]);

    const list = useTransactions(query, deferredSearch);
    const summary = useTransactionSummary();
    const rows = list.data?.data ?? [];
    const meta = list.data?.meta ?? { page, limit: 25, total: 0, lastPage: 1 };
    const stats = summary.data;
    const pending = (stats?.by_status.initiated?.count ?? 0) + (stats?.by_status.awaiting_callback?.count ?? 0);
    const attention = stats?.needs_attention_count ?? 0;
    const hasFilters = Boolean(
        search || status !== "all" || gateway !== "all" || reconciliation !== "all" || dateFilter || minAmount || maxAmount,
    );

    const resetFilters = () => {
        setSearch("");
        setStatus("all");
        setGateway("all");
        setReconciliation("all");
        setDateFilter(null);
        setMinAmount("");
        setMaxAmount("");
        setPage(1);
    };

    return (
        <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <div className="mb-1 flex items-center gap-2 text-muted-foreground text-xs">
                        <ShieldCheck className="size-3.5" aria-hidden="true" />
                        {t.live}
                    </div>
                    <h1 className="font-bold text-2xl tracking-tight sm:text-3xl">{t.title}</h1>
                    <p className="mt-1 text-muted-foreground text-sm">{t.subtitle}</p>
                </div>
                <div className="flex gap-2">
                    {hasFilters ? (
                        <Button variant="ghost" onClick={resetFilters}>
                            <RotateCcw className="me-2 size-4" aria-hidden="true" />
                            {t.clear}
                        </Button>
                    ) : null}
                    <Button
                        variant="outline"
                        onClick={() => {
                            void list.refetch();
                            void summary.refetch();
                        }}
                        disabled={list.isFetching}
                    >
                        <RefreshCw className={cn("me-2 size-4", list.isFetching && "animate-spin")} aria-hidden="true" />
                        {t.refresh}
                    </Button>
                </div>
            </header>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                    icon={WalletCards}
                    label={t.total}
                    value={stats ? formatNumber(stats.total_count, locale) : "—"}
                    hint={stats ? formatMoney(stats.total_amount_minor, locale) : "—"}
                />
                <Metric
                    icon={CheckCircle2}
                    label={t.verified}
                    value={stats ? formatNumber(stats.by_status.verified?.count ?? 0, locale) : "—"}
                    hint={stats ? formatMoney(stats.by_status.verified?.amount_minor ?? 0, locale) : "—"}
                    tone="good"
                />
                <Metric icon={Clock3} label={t.pending} value={stats ? formatNumber(pending, locale) : "—"} hint="" tone="warn" />
                <Metric
                    icon={AlertCircle}
                    label={t.attention}
                    value={stats ? formatNumber(attention, locale) : "—"}
                    hint=""
                    tone={attention > 0 ? "bad" : "good"}
                />
            </div>

            <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="space-y-3 border-b p-3">
                    <div className="flex flex-col gap-2 lg:flex-row">
                        <div className="relative flex-1">
                            <Search
                                className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <Input
                                value={search}
                                onChange={(event) => {
                                    setSearch(event.target.value);
                                    setPage(1);
                                }}
                                placeholder={t.search}
                                className="ps-9"
                            />
                        </div>
                        <Select
                            value={status}
                            onValueChange={(value) => {
                                setStatus(value);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="lg:w-[180px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t.allStatuses}</SelectItem>
                                {STATUSES.map((item) => (
                                    <SelectItem key={item} value={item}>
                                        <PaymentStatusLabel status={item} />
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select
                            value={gateway}
                            onValueChange={(value) => {
                                setGateway(value);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="lg:w-[190px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t.allGateways}</SelectItem>
                                {(gatewayList.data ?? []).map((item) => (
                                    <SelectItem key={item.code} value={item.code}>
                                        {item.title[lang]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select
                            value={reconciliation}
                            onValueChange={(value) => {
                                setReconciliation(value);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="lg:w-[190px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t.allReconciliation}</SelectItem>
                                {RECONCILIATION.map((item) => (
                                    <SelectItem key={item} value={item}>
                                        <ReconciliationStatusLabel status={item} />
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select
                            value={sort}
                            onValueChange={(value) => {
                                setSort(value);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="lg:w-[170px]">
                                <ArrowDownUp className="me-2 size-3.5" aria-hidden="true" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="newest">{t.newest}</SelectItem>
                                <SelectItem value="oldest">{t.oldest}</SelectItem>
                                <SelectItem value="highest">{t.highest}</SelectItem>
                                <SelectItem value="lowest">{t.lowest}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <DateFilterChip
                            fieldLabel={t.date}
                            addLabel={t.date}
                            value={dateFilter}
                            onChange={(value) => {
                                setDateFilter(value);
                                setPage(1);
                            }}
                            locale={lang}
                            calendar={calendar}
                        />
                        <Input
                            inputMode="numeric"
                            value={minAmount}
                            onChange={(event) => {
                                setMinAmount(event.target.value.replace(/[^0-9]/g, ""));
                                setPage(1);
                            }}
                            placeholder={t.minAmount}
                            className="h-8 w-40"
                        />
                        <Input
                            inputMode="numeric"
                            value={maxAmount}
                            onChange={(event) => {
                                setMaxAmount(event.target.value.replace(/[^0-9]/g, ""));
                                setPage(1);
                            }}
                            placeholder={t.maxAmount}
                            className="h-8 w-40"
                        />
                    </div>
                </div>

                {list.isPending ? (
                    <div className="space-y-2 p-4">
                        {Array.from({ length: 8 }).map((_, index) => (
                            <Skeleton key={index} className="h-12 w-full" />
                        ))}
                    </div>
                ) : list.isError ? (
                    <Empty
                        icon={XCircle}
                        title={t.error}
                        subtitle=""
                        action={
                            <Button variant="outline" onClick={() => void list.refetch()}>
                                {t.retry}
                            </Button>
                        }
                    />
                ) : rows.length === 0 ? (
                    <Empty
                        icon={Search}
                        title={t.empty}
                        subtitle={t.emptyHint}
                        action={
                            hasFilters ? (
                                <Button variant="outline" onClick={resetFilters}>
                                    {t.clear}
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[1060px] text-sm">
                                <thead className="bg-muted/45 text-muted-foreground">
                                    <tr className="border-b">
                                        {[
                                            t.transaction,
                                            t.order,
                                            t.gateway,
                                            t.status,
                                            t.reconcile,
                                            t.amount,
                                            t.reference,
                                            t.time,
                                        ].map((label) => (
                                            <th key={label} className="px-4 py-3 text-start font-medium text-xs">
                                                {label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <TransactionRow
                                            key={row.id}
                                            row={row}
                                            locale={locale}
                                            detailsLabel={t.details}
                                            onOpen={() => setSelected(row.id)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="divide-y md:hidden">
                            {rows.map((row) => (
                                <TransactionCard key={row.id} row={row} locale={locale} onOpen={() => setSelected(row.id)} />
                            ))}
                        </div>
                        <footer className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                            <span className="text-muted-foreground">
                                {formatNumber(meta.total, locale)} {t.total}
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={page <= 1}
                                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                                >
                                    {t.previous}
                                </Button>
                                <span className="text-muted-foreground">
                                    {formatNumber(page, locale)} / {formatNumber(meta.lastPage, locale)}
                                </span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={page >= meta.lastPage}
                                    onClick={() => setPage((value) => value + 1)}
                                >
                                    {t.next}
                                </Button>
                            </div>
                        </footer>
                    </>
                )}
            </section>

            <TransactionDrawer
                id={selected}
                open={selected !== null}
                onOpenChange={(open) => {
                    if (!open) setSelected(null);
                }}
                locale={locale}
                t={t}
            />
        </div>
    );
}

function PaymentStatusLabel({ status }: { status: PaymentAttemptStatus }) {
    const labels = useTranslations("Transactions.statuses");
    return labels(status);
}

function ReconciliationStatusLabel({ status }: { status: PaymentReconciliationStatus }) {
    const labels = useTranslations("Transactions.reconciliation");
    return labels(status);
}

function PaymentPill({ status }: { status: PaymentAttemptStatus }) {
    return (
        <span className={cn("inline-flex rounded-full border px-2.5 py-1 font-medium text-xs", paymentTone(status))}>
            <PaymentStatusLabel status={status} />
        </span>
    );
}

function ReconciliationPill({ status }: { status: PaymentReconciliationStatus }) {
    return (
        <span className={cn("inline-flex rounded-full border px-2.5 py-1 font-medium text-xs", reconciliationTone(status))}>
            <ReconciliationStatusLabel status={status} />
        </span>
    );
}

function Metric({
    icon: Icon,
    label,
    value,
    hint,
    tone = "neutral",
}: {
    icon: typeof WalletCards;
    label: string;
    value: string;
    hint: string;
    tone?: "neutral" | "good" | "warn" | "bad";
}) {
    const iconTone =
        tone === "good"
            ? "bg-success/10 text-success"
            : tone === "warn"
              ? "bg-warning/10 text-warning"
              : tone === "bad"
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary";
    return (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex justify-between gap-3">
                <div>
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <p className="mt-2 font-bold text-2xl tabular-nums">{value}</p>
                    <p className="mt-1 text-muted-foreground text-xs">{hint}</p>
                </div>
                <div className={cn("grid size-9 place-items-center rounded-lg", iconTone)}>
                    <Icon className="size-4" aria-hidden="true" />
                </div>
            </div>
        </div>
    );
}

function TransactionRow({
    row,
    locale,
    detailsLabel,
    onOpen,
}: {
    row: AdminTransaction;
    locale: Locale;
    detailsLabel: string;
    onOpen: () => void;
}) {
    const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
        }
    };
    return (
        <tr
            tabIndex={0}
            role="button"
            aria-label={`${detailsLabel} #${row.id}`}
            className="cursor-pointer border-b outline-none transition-colors last:border-0 hover:bg-muted/35 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={onOpen}
            onKeyDown={onKeyDown}
        >
            <td className="px-4 py-3 font-semibold">#{formatNumber(row.id, locale)}</td>
            <td className="px-4 py-3">
                <Link
                    href={`/orders/${row.order_id}` as never}
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex items-center gap-1 font-medium hover:text-primary hover:underline"
                >
                    #{formatNumber(row.order_id, locale)}
                    <ExternalLink className="size-3" aria-hidden="true" />
                </Link>
            </td>
            <td className="px-4 py-3">
                <span className="rounded-md bg-muted px-2 py-1 font-medium text-xs">{row.gateway_code}</span>
            </td>
            <td className="px-4 py-3">
                <PaymentPill status={row.status} />
            </td>
            <td className="px-4 py-3">
                <ReconciliationPill status={row.reconciliation_status} />
            </td>
            <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">{formatMoney(row.amount_minor, locale)}</td>
            <td className="max-w-[180px] truncate px-4 py-3 font-mono text-muted-foreground text-xs">
                {row.gateway_transaction_id ?? row.gateway_authority ?? "—"}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-xs">
                {row.created_at ? formatDateTime(row.created_at, locale) : "—"}
            </td>
        </tr>
    );
}

function TransactionCard({ row, locale, onOpen }: { row: AdminTransaction; locale: Locale; onOpen: () => void }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className="w-full space-y-3 p-4 text-start outline-none hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-semibold">#{formatNumber(row.id, locale)}</p>
                    <p className="mt-1 text-muted-foreground text-xs">
                        {row.gateway_code} · #{formatNumber(row.order_id, locale)}
                    </p>
                </div>
                <p className="font-semibold">{formatMoney(row.amount_minor, locale)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <PaymentPill status={row.status} />
                <ReconciliationPill status={row.reconciliation_status} />
            </div>
            <p className="truncate font-mono text-muted-foreground text-xs" dir="ltr">
                {row.gateway_transaction_id ?? row.gateway_authority ?? "—"}
            </p>
        </button>
    );
}

function Empty({
    icon: Icon,
    title,
    subtitle,
    action,
}: {
    icon: typeof Search;
    title: string;
    subtitle: string;
    action?: ReactNode;
}) {
    return (
        <div className="grid min-h-72 place-items-center p-8 text-center">
            <div>
                <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-muted">
                    <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="font-medium">{title}</p>
                {subtitle ? <p className="mt-1 text-muted-foreground text-sm">{subtitle}</p> : null}
                {action ? <div className="mt-4">{action}</div> : null}
            </div>
        </div>
    );
}

function TransactionDrawer({
    id,
    open,
    onOpenChange,
    locale,
    t,
}: {
    id: number | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    locale: Locale;
    t: CopyShape;
}) {
    const detail = useTransaction(id);
    const history = useTransactionReconciliationHistory(id);
    const reconcile = useReconcileTransaction();
    const row = detail.data;

    const runReconciliation = async () => {
        if (!id) return;
        try {
            await reconcile.mutateAsync(id);
            toast.add({ description: t.checkProvider, data: { tone: "success" } });
        } catch (error) {
            toast.add({ description: (error as Error).message, data: { tone: "error" } });
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
                <div className="border-b p-5">
                    <p className="text-muted-foreground text-xs">{t.details}</p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                        <h2 className="font-bold text-xl">#{id ? formatNumber(id, locale) : "—"}</h2>
                        {row ? (
                            <div className="flex flex-wrap gap-2">
                                <PaymentPill status={row.status} />
                                <ReconciliationPill status={row.reconciliation_status} />
                            </div>
                        ) : null}
                    </div>
                </div>
                {detail.isPending ? (
                    <div className="space-y-3 p-5">
                        <Skeleton className="h-24" />
                        <Skeleton className="h-40" />
                    </div>
                ) : detail.isError || !row ? (
                    <Empty icon={XCircle} title={t.error} subtitle="" />
                ) : (
                    <div className="space-y-5 p-5">
                        <div className="rounded-xl border bg-muted/20 p-4">
                            <p className="text-muted-foreground text-xs">{t.amount}</p>
                            <p className="mt-1 font-bold text-2xl">{formatMoney(row.amount_minor, locale)}</p>
                            <div className="mt-3 flex justify-between text-sm">
                                <span className="text-muted-foreground">{t.gateway}</span>
                                <span>{row.gateway_code}</span>
                            </div>
                        </div>
                        <section>
                            <h3 className="mb-3 font-semibold text-sm">{t.flow}</h3>
                            <div className="ms-2 space-y-5 border-s ps-5">
                                <Timeline
                                    icon={Clock3}
                                    label={t.initiated}
                                    value={row.initiated_at ?? row.created_at}
                                    locale={locale}
                                />
                                <Timeline
                                    icon={row.status === "verified" ? CheckCircle2 : AlertCircle}
                                    label={t.verifiedAt}
                                    value={row.verified_at}
                                    locale={locale}
                                />
                            </div>
                        </section>
                        <section>
                            <h3 className="mb-2 font-semibold text-sm">{t.identifiers}</h3>
                            <div className="divide-y rounded-xl border">
                                <Identifier label={t.attempt} value={row.id} copied={t.copied} />
                                <Identifier label={t.authority} value={row.gateway_authority} copied={t.copied} />
                                <Identifier label={t.ref} value={row.gateway_transaction_id} copied={t.copied} />
                            </div>
                        </section>
                        <ReconciliationPanel
                            row={row}
                            locale={locale}
                            t={t}
                            history={history.data ?? []}
                            historyPending={history.isPending}
                            checking={reconcile.isPending}
                            onCheck={runReconciliation}
                        />
                        {row.error_code || row.error_message ? (
                            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
                                <p className="font-semibold text-sm">
                                    {t.gatewayError}
                                    {row.error_code ? ` · ${row.error_code}` : ""}
                                </p>
                                <p className="mt-1 text-xs">{row.error_message ?? "—"}</p>
                            </div>
                        ) : null}
                        <section>
                            <h3 className="mb-2 font-semibold text-sm">{t.payload}</h3>
                            <pre
                                className="max-h-64 overflow-auto rounded-xl border bg-muted/35 p-3 text-[11px] leading-5"
                                dir="ltr"
                            >
                                {JSON.stringify(row.gateway_payload ?? {}, null, 2)}
                            </pre>
                        </section>
                        <RefundPanel transaction={row} locale={locale} t={t} />
                        <Button asChild className="w-full">
                            <Link href={`/orders/${row.order_id}` as never}>
                                {t.openOrder}
                                <ExternalLink className="ms-2 size-4" aria-hidden="true" />
                            </Link>
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

function ReconciliationPanel({
    row,
    locale,
    t,
    history,
    historyPending,
    checking,
    onCheck,
}: {
    row: AdminTransactionDetail;
    locale: Locale;
    t: CopyShape;
    history: Array<{
        id: string;
        actor: { email: string } | null;
        occurred_at: string | null;
        payload: Record<string, unknown>;
    }>;
    historyPending: boolean;
    checking: boolean;
    onCheck: () => void;
}) {
    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="font-semibold text-sm">{t.reconcile}</h3>
                    <p className="mt-1 text-muted-foreground text-xs">
                        {row.reconciliation_checked_at ? formatDateTime(row.reconciliation_checked_at, locale) : t.neverChecked}
                    </p>
                </div>
                <Button size="sm" variant="outline" onClick={onCheck} disabled={checking}>
                    {checking ? t.checking : t.checkProvider}
                </Button>
            </div>
            <div className="rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <ReconciliationPill status={row.reconciliation_status} />
                    {row.reconciliation_provider_status ? (
                        <span className="text-muted-foreground text-xs">PSP: {row.reconciliation_provider_status}</span>
                    ) : null}
                </div>
                {row.reconciliation_error_code ? (
                    <p className="mt-2 text-destructive text-xs">{row.reconciliation_error_code}</p>
                ) : null}
                <p className="mt-3 font-medium text-xs">{t.reconciliationEvidence}</p>
                <pre className="mt-1 max-h-44 overflow-auto rounded-lg bg-muted/40 p-2 text-[11px]" dir="ltr">
                    {JSON.stringify(row.reconciliation_evidence ?? {}, null, 2)}
                </pre>
            </div>
            <div>
                <p className="mb-2 font-medium text-xs">{t.reconciliationHistory}</p>
                {historyPending ? (
                    <Skeleton className="h-16 w-full" />
                ) : history.length === 0 ? (
                    <p className="text-muted-foreground text-xs">{t.neverChecked}</p>
                ) : (
                    <div className="space-y-2">
                        {history.slice(0, 5).map((entry) => (
                            <div key={entry.id} className="rounded-lg border p-2 text-xs">
                                <div className="flex justify-between gap-3">
                                    <span>{entry.actor?.email ?? "system"}</span>
                                    <span className="text-muted-foreground">
                                        {entry.occurred_at ? formatDateTime(entry.occurred_at, locale) : "—"}
                                    </span>
                                </div>
                                <p className="mt-1 text-muted-foreground">
                                    {String(
                                        (entry.payload.current as Record<string, unknown> | undefined)?.reconciliation_status ??
                                            "—",
                                    )}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

function RefundPanel({ transaction, locale, t }: { transaction: AdminTransactionDetail; locale: Locale; t: CopyShape }) {
    const order = useOrder(transaction.order_id);
    const refunds = useOrderRefunds(transaction.order_id);
    const createRefund = useCreateRefund();
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const financialsReady = order.isSuccess && refunds.isSuccess;
    const refundedTotal = financialsReady ? (refunds.data?.data ?? []).reduce((sum, item) => sum + item.amount_minor, 0) : 0;
    const orderTotal = financialsReady ? Number(order.data.grandTotal) : 0;
    const remaining = financialsReady ? Math.max(0, orderTotal - refundedTotal) : 0;

    const submit = async () => {
        if (!financialsReady) {
            toast.add({ description: t.refundUnavailable, data: { tone: "error" } });
            return;
        }
        const amountMinor = Number(amount);
        if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > remaining) {
            toast.add({ description: t.refundInvalid, data: { tone: "error" } });
            return;
        }
        try {
            const created = await createRefund.mutateAsync({
                order_id: transaction.order_id,
                amount_minor: amountMinor,
                reason: reason.trim() || null,
            });
            setAmount("");
            setReason("");
            const gatewayStatus = (
                created.data as typeof created.data & {
                    gateway_refund_status?: "completed" | "manual_action_required" | "unknown";
                }
            ).gateway_refund_status;
            if (gatewayStatus === "completed") {
                toast.add({ description: t.refundGatewayCompleted, data: { tone: "success" } });
            } else if (gatewayStatus === "manual_action_required") {
                toast.add({ description: t.refundGatewayManual, data: { tone: "warning" } });
            } else if (gatewayStatus === "unknown") {
                toast.add({ description: t.refundGatewayUnknown, data: { tone: "warning" } });
            } else {
                toast.add({ description: t.refundSuccess, data: { tone: "success" } });
            }
        } catch (error) {
            toast.add({ description: (error as Error).message, data: { tone: "error" } });
        }
    };

    return (
        <section className="space-y-3">
            <h3 className="font-semibold text-sm">{t.refund}</h3>
            <div className="rounded-lg border border-info/30 bg-info/10 p-3 text-info text-xs">{t.refundRouting}</div>
            {order.isPending || refunds.isPending ? (
                <Skeleton className="h-20 w-full" />
            ) : order.isError || refunds.isError ? (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-warning text-xs">
                    {t.refundUnavailable}
                </div>
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                        <p className="mb-1 text-muted-foreground text-xs">{t.refundRemaining}</p>
                        <p className="font-semibold">{formatMoney(remaining, locale)}</p>
                    </div>
                    <Input
                        inputMode="numeric"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))}
                        placeholder={t.refundAmount}
                        disabled={!financialsReady || remaining <= 0}
                    />
                </div>
            )}
            <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t.refundReason}
                maxLength={500}
                disabled={!financialsReady || remaining <= 0}
            />
            <Button
                type="button"
                variant="outline"
                onClick={() => void submit()}
                disabled={createRefund.isPending || !financialsReady || remaining <= 0}
            >
                {t.refundSubmit}
            </Button>
            {(refunds.data?.data?.length ?? 0) > 0 ? (
                <div>
                    <p className="mb-2 text-muted-foreground text-xs">{t.previousRefunds}</p>
                    <div className="space-y-2">
                        {refunds.data!.data.slice(0, 5).map((refund) => (
                            <div key={refund.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
                                <span>#{formatNumber(refund.refund_number, locale)}</span>
                                <span className="font-medium">{formatMoney(refund.amount_minor, locale)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </section>
    );
}

function Timeline({
    icon: Icon,
    label,
    value,
    locale,
}: {
    icon: typeof Clock3;
    label: string;
    value: string | null;
    locale: Locale;
}) {
    return (
        <div className="relative">
            <div className="absolute -start-[2.05rem] grid size-6 place-items-center rounded-full border bg-background">
                <Icon className="size-3" aria-hidden="true" />
            </div>
            <p className="font-medium text-sm">{label}</p>
            <p className="text-muted-foreground text-xs">{value ? formatDateTime(value, locale) : "—"}</p>
        </div>
    );
}

function Identifier({ label, value, copied }: { label: string; value: string | number | null; copied: string }) {
    const copy = () => {
        if (value === null) return;
        void navigator.clipboard.writeText(String(value));
        toast.add({ description: copied, data: { tone: "success" } });
    };
    return (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
                <p className="text-muted-foreground text-[11px]">{label}</p>
                <p className="truncate font-mono text-xs" dir="ltr">
                    {value ?? "—"}
                </p>
            </div>
            {value !== null ? (
                <Button variant="ghost" size="icon" className="size-8" onClick={copy} aria-label={`${copied}: ${label}`}>
                    <Copy className="size-3.5" aria-hidden="true" />
                </Button>
            ) : null}
        </div>
    );
}
