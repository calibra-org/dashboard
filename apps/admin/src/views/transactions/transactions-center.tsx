"use client";

import type { Locale } from "@calibra/shared/i18n";
import { AlertCircle, ArrowDownUp, CheckCircle2, Clock3, Copy, ExternalLink, RefreshCw, Search, ShieldCheck, WalletCards, XCircle } from "lucide-react";
import { useLocale } from "next-intl";
import { useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Sheet, SheetContent } from "#/components/ui/sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { toast } from "#/components/ui/toast";
import { formatDateTime, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { type AdminTransaction, type PaymentAttemptStatus, useTransaction, useTransactions, useTransactionSummary } from "#/lib/queries/transactions";
import type { TableViewFilter, TableViewQuery } from "#/lib/table-view";
import { cn } from "#/lib/utils";

const STATUSES: PaymentAttemptStatus[] = ["initiated", "awaiting_callback", "verified", "failed", "cancelled", "refunded"];
const GATEWAYS = ["zarinpal", "mellat", "sadad", "parsian", "idpay", "nextpay", "payir", "zibal", "digipay", "snapppay", "azkivam", "bitpay", "card_to_card", "cod", "bank_transfer"];

const COPY = {
    fa: {
        title: "تراکنش‌ها", subtitle: "مرکز کنترل پرداخت‌ها، خطاها و بازپرداخت‌های فروشگاه",
        search: "جستجو با شناسه تراکنش، سفارش، Authority یا Ref ID…", all: "همه وضعیت‌ها", allGateways: "همه درگاه‌ها",
        newest: "جدیدترین", oldest: "قدیمی‌ترین", highest: "بیشترین مبلغ", lowest: "کمترین مبلغ", refresh: "بروزرسانی",
        total: "کل تراکنش‌ها", verified: "پرداخت موفق", pending: "در انتظار نتیجه", failed: "نیازمند بررسی",
        amount: "مبلغ", transaction: "تراکنش", order: "سفارش", gateway: "درگاه", status: "وضعیت", time: "زمان", reference: "شناسه مرجع",
        empty: "تراکنشی با این فیلترها پیدا نشد", emptyHint: "فیلترها را تغییر دهید یا شناسه دیگری جستجو کنید.",
        loadError: "دریافت تراکنش‌ها با خطا مواجه شد.", retry: "تلاش مجدد", previous: "قبلی", next: "بعدی",
        details: "جزئیات تراکنش", paymentFlow: "چرخه پرداخت", initiated: "ایجاد درخواست", verifiedAt: "تأیید نهایی", identifiers: "شناسه‌ها",
        attemptId: "Attempt ID", authority: "Authority", refId: "Transaction / Ref ID", error: "خطای درگاه", payload: "پاسخ ثبت‌شده درگاه",
        copy: "کپی", openOrder: "مشاهده سفارش", count: "تعداد", gross: "مجموع مبلغ ثبت‌شده", live: "داده زنده از بک‌اند",
    },
    en: {
        title: "Transactions", subtitle: "Payment operations, failures and refund control center",
        search: "Search transaction, order, authority or reference ID…", all: "All statuses", allGateways: "All gateways",
        newest: "Newest", oldest: "Oldest", highest: "Highest amount", lowest: "Lowest amount", refresh: "Refresh",
        total: "All transactions", verified: "Verified payments", pending: "Awaiting result", failed: "Needs attention",
        amount: "Amount", transaction: "Transaction", order: "Order", gateway: "Gateway", status: "Status", time: "Time", reference: "Reference",
        empty: "No transactions match these filters", emptyHint: "Change filters or search for another identifier.",
        loadError: "Transactions could not be loaded.", retry: "Retry", previous: "Previous", next: "Next",
        details: "Transaction details", paymentFlow: "Payment lifecycle", initiated: "Request initiated", verifiedAt: "Final verification", identifiers: "Identifiers",
        attemptId: "Attempt ID", authority: "Authority", refId: "Transaction / Ref ID", error: "Gateway error", payload: "Recorded gateway response",
        copy: "Copy", openOrder: "Open order", count: "Count", gross: "Recorded gross amount", live: "Live backend data",
    },
} as const;

const STATUS_LABEL: Record<PaymentAttemptStatus, { fa: string; en: string }> = {
    initiated: { fa: "شروع‌شده", en: "Initiated" }, awaiting_callback: { fa: "در انتظار درگاه", en: "Awaiting gateway" },
    verified: { fa: "موفق", en: "Verified" }, failed: { fa: "ناموفق", en: "Failed" }, cancelled: { fa: "لغوشده", en: "Cancelled" }, refunded: { fa: "بازپرداخت", en: "Refunded" },
};

function statusTone(status: PaymentAttemptStatus) {
    if (status === "verified") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";
    if (status === "failed" || status === "cancelled") return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300";
    if (status === "refunded") return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300";
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
}

function StatusPill({ status, locale }: { status: PaymentAttemptStatus; locale: Locale }) {
    return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 font-medium text-xs", statusTone(status))}>{STATUS_LABEL[status][locale === "fa" ? "fa" : "en"]}</span>;
}

function copyValue(value: string | number | null) {
    if (value === null || value === "") return;
    void navigator.clipboard.writeText(String(value));
    toast.success("Copied");
}

export function TransactionsCenter() {
    const locale = useLocale() as Locale;
    const l = locale === "fa" ? "fa" : "en";
    const t = COPY[l];
    const [page, setPage] = useState(1);
    const [q, setQ] = useState("");
    const [status, setStatus] = useState<string>("all");
    const [gateway, setGateway] = useState<string>("all");
    const [sort, setSort] = useState("newest");
    const [selectedId, setSelectedId] = useState<number | null>(null);

    const query = useMemo<TableViewQuery>(() => {
        const filter: TableViewFilter[] = [];
        if (status !== "all") filter.push({ field: "status", op: "eq", value: status });
        if (gateway !== "all") filter.push({ field: "gateway_code_snapshot", op: "eq", value: gateway });
        const sortMap: Record<string, TableViewQuery["sort"]> = {
            newest: [{ field: "created_at", direction: "desc" }], oldest: [{ field: "created_at", direction: "asc" }],
            highest: [{ field: "amount_minor", direction: "desc" }], lowest: [{ field: "amount_minor", direction: "asc" }],
        };
        return { page, limit: 25, filter, filterOr: [], sort: sortMap[sort] ?? sortMap.newest };
    }, [page, status, gateway, sort]);

    const list = useTransactions(query, q);
    const summary = useTransactionSummary();
    const detail = useTransaction(selectedId);
    const rows = list.data?.data ?? [];
    const meta = list.data?.meta ?? { page, limit: 25, total: 0, lastPage: 1 };
    const stats = summary.data;
    const pendingCount = (stats?.by_status.initiated?.count ?? 0) + (stats?.by_status.awaiting_callback?.count ?? 0);
    const attentionCount = (stats?.by_status.failed?.count ?? 0) + (stats?.by_status.cancelled?.count ?? 0);

    const resetPage = () => setPage(1);

    return <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <div className="mb-1 flex items-center gap-2 text-muted-foreground text-xs"><ShieldCheck className="size-3.5" />{t.live}</div>
                <h1 className="font-bold text-2xl tracking-tight sm:text-3xl">{t.title}</h1>
                <p className="mt-1 text-muted-foreground text-sm">{t.subtitle}</p>
            </div>
            <Button variant="outline" onClick={() => { void list.refetch(); void summary.refetch(); }} disabled={list.isFetching}>
                <RefreshCw className={cn("me-2 size-4", list.isFetching && "animate-spin")} />{t.refresh}
            </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={WalletCards} label={t.total} value={stats ? formatNumber(stats.total_count, locale) : "—"} hint={stats ? formatMoney(stats.total_amount_minor, locale) : "—"} />
            <Metric icon={CheckCircle2} label={t.verified} value={stats ? formatNumber(stats.by_status.verified?.count ?? 0, locale) : "—"} hint={stats ? formatMoney(stats.by_status.verified?.amount_minor ?? 0, locale) : "—"} tone="good" />
            <Metric icon={Clock3} label={t.pending} value={stats ? formatNumber(pendingCount, locale) : "—"} hint={t.count} tone="warn" />
            <Metric icon={AlertCircle} label={t.failed} value={stats ? formatNumber(attentionCount, locale) : "—"} hint={t.count} tone={attentionCount > 0 ? "bad" : "good"} />
        </div>

        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                    <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={q} onChange={(e) => { setQ(e.target.value); resetPage(); }} placeholder={t.search} className="ps-9" aria-label={t.search} />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Select value={status} onValueChange={(v) => { setStatus(v); resetPage(); }}><SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t.all}</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s][l]}</SelectItem>)}</SelectContent></Select>
                    <Select value={gateway} onValueChange={(v) => { setGateway(v); resetPage(); }}><SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t.allGateways}</SelectItem>{GATEWAYS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select>
                    <Select value={sort} onValueChange={(v) => { setSort(v); resetPage(); }}><SelectTrigger className="col-span-2 w-full sm:w-[170px]"><ArrowDownUp className="me-2 size-3.5" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">{t.newest}</SelectItem><SelectItem value="oldest">{t.oldest}</SelectItem><SelectItem value="highest">{t.highest}</SelectItem><SelectItem value="lowest">{t.lowest}</SelectItem></SelectContent></Select>
                </div>
            </div>

            {list.isPending ? <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : list.isError ? <Empty icon={XCircle} title={t.loadError} subtitle="" action={<Button variant="outline" onClick={() => void list.refetch()}>{t.retry}</Button>} /> : rows.length === 0 ? <Empty icon={Search} title={t.empty} subtitle={t.emptyHint} /> : <>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-sm">
                        <thead className="bg-muted/45 text-muted-foreground"><tr className="border-b"><Th>{t.transaction}</Th><Th>{t.order}</Th><Th>{t.gateway}</Th><Th>{t.status}</Th><Th>{t.amount}</Th><Th>{t.reference}</Th><Th>{t.time}</Th></tr></thead>
                        <tbody>{rows.map((row) => <TransactionRow key={row.id} row={row} locale={locale} t={t} onOpen={() => setSelectedId(row.id)} />)}</tbody>
                    </table>
                </div>
                <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                    <span className="text-muted-foreground">{formatNumber(meta.total, locale)} {t.total}</span>
                    <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t.previous}</Button><span className="min-w-12 text-center text-muted-foreground">{formatNumber(page, locale)} / {formatNumber(meta.lastPage, locale)}</span><Button size="sm" variant="outline" disabled={page >= meta.lastPage} onClick={() => setPage((p) => p + 1)}>{t.next}</Button></div>
                </div>
            </>}
        </section>

        <TransactionDrawer id={selectedId} open={selectedId !== null} onOpenChange={(open) => { if (!open) setSelectedId(null); }} locale={locale} t={t} detail={detail} />
    </div>;
}

function Metric({ icon: Icon, label, value, hint, tone = "neutral" }: { icon: typeof WalletCards; label: string; value: string; hint: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
    const toneClass = tone === "good" ? "bg-emerald-500/10 text-emerald-600" : tone === "warn" ? "bg-amber-500/10 text-amber-600" : tone === "bad" ? "bg-red-500/10 text-red-600" : "bg-primary/10 text-primary";
    return <div className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-muted-foreground text-xs">{label}</p><p className="mt-2 font-bold text-2xl tabular-nums">{value}</p><p className="mt-1 text-muted-foreground text-xs">{hint}</p></div><div className={cn("grid size-9 place-items-center rounded-lg", toneClass)}><Icon className="size-4" /></div></div></div>;
}
function Th({ children }: { children: React.ReactNode }) { return <th className="whitespace-nowrap px-4 py-3 text-start font-medium text-xs">{children}</th>; }
function TransactionRow({ row, locale, t, onOpen }: { row: AdminTransaction; locale: Locale; t: typeof COPY.fa | typeof COPY.en; onOpen: () => void }) {
    return <tr className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/35 focus-within:bg-muted/35" onClick={onOpen}>
        <td className="px-4 py-3"><button type="button" className="font-semibold text-foreground hover:underline" onClick={onOpen}>#{formatNumber(row.id, locale)}</button></td>
        <td className="px-4 py-3"><Link href={`/orders/${row.order_id}` as never} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 font-medium hover:text-primary hover:underline">#{formatNumber(row.order_id, locale)}<ExternalLink className="size-3" /></Link></td>
        <td className="px-4 py-3"><span className="rounded-md bg-muted px-2 py-1 font-medium text-xs">{row.gateway_code}</span></td>
        <td className="px-4 py-3"><StatusPill status={row.status} locale={locale} /></td>
        <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">{formatMoney(row.amount_minor, locale)}</td>
        <td className="max-w-[180px] truncate px-4 py-3 font-mono text-muted-foreground text-xs" title={row.gateway_transaction_id ?? row.gateway_authority ?? ""}>{row.gateway_transaction_id ?? row.gateway_authority ?? "—"}</td>
        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-xs">{row.created_at ? formatDateTime(row.created_at, locale) : "—"}</td>
    </tr>;
}
function Empty({ icon: Icon, title, subtitle, action }: { icon: typeof Search; title: string; subtitle: string; action?: React.ReactNode }) { return <div className="grid min-h-72 place-items-center p-8 text-center"><div><div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-muted"><Icon className="size-5 text-muted-foreground" /></div><p className="font-medium">{title}</p>{subtitle ? <p className="mt-1 text-muted-foreground text-sm">{subtitle}</p> : null}{action ? <div className="mt-4">{action}</div> : null}</div></div>; }

function TransactionDrawer({ id, open, onOpenChange, locale, t, detail }: { id: number | null; open: boolean; onOpenChange: (open: boolean) => void; locale: Locale; t: typeof COPY.fa | typeof COPY.en; detail: ReturnType<typeof useTransaction> }) {
    const row = detail.data;
    return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
        <div className="border-b p-5"><p className="text-muted-foreground text-xs">{t.details}</p><div className="mt-1 flex items-center justify-between gap-3"><h2 className="font-bold text-xl">#{id ? formatNumber(id, locale) : "—"}</h2>{row ? <StatusPill status={row.status} locale={locale} /> : null}</div></div>
        {detail.isPending ? <div className="space-y-3 p-5"><Skeleton className="h-24"/><Skeleton className="h-40"/><Skeleton className="h-32"/></div> : row ? <div className="space-y-5 p-5">
            <div className="rounded-xl border bg-muted/20 p-4"><p className="text-muted-foreground text-xs">{t.amount}</p><p className="mt-1 font-bold text-2xl tabular-nums">{formatMoney(row.amount_minor, locale)}</p><div className="mt-3 flex items-center justify-between text-sm"><span className="text-muted-foreground">{t.gateway}</span><span className="font-medium">{row.gateway_code}</span></div></div>
            <section><h3 className="mb-3 font-semibold text-sm">{t.paymentFlow}</h3><div className="relative ms-2 space-y-5 border-s ps-5"><Timeline icon={Clock3} label={t.initiated} value={row.initiated_at ?? row.created_at} locale={locale}/><Timeline icon={row.status === "verified" ? CheckCircle2 : AlertCircle} label={t.verifiedAt} value={row.verified_at} locale={locale} muted={!row.verified_at}/></div></section>
            <section><h3 className="mb-2 font-semibold text-sm">{t.identifiers}</h3><div className="divide-y rounded-xl border"><Identifier label={t.attemptId} value={row.id} onCopy={() => copyValue(row.id)}/><Identifier label={t.authority} value={row.gateway_authority} onCopy={() => copyValue(row.gateway_authority)}/><Identifier label={t.refId} value={row.gateway_transaction_id} onCopy={() => copyValue(row.gateway_transaction_id)}/></div></section>
            {row.error_code || row.error_message ? <section className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30"><div className="flex gap-2"><AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600"/><div><p className="font-semibold text-red-700 text-sm dark:text-red-300">{t.error}{row.error_code ? ` · ${row.error_code}` : ""}</p><p className="mt-1 text-red-700/80 text-xs dark:text-red-300/80">{row.error_message ?? "—"}</p></div></div></section> : null}
            <section><h3 className="mb-2 font-semibold text-sm">{t.payload}</h3><pre className="max-h-64 overflow-auto rounded-xl border bg-muted/35 p-3 text-start text-[11px] leading-5" dir="ltr">{JSON.stringify(row.gateway_payload ?? {}, null, 2)}</pre></section>
            <Button asChild className="w-full"><Link href={`/orders/${row.order_id}` as never}>{t.openOrder}<ExternalLink className="ms-2 size-4"/></Link></Button>
        </div> : <Empty icon={XCircle} title={t.loadError} subtitle="" />}
    </SheetContent></Sheet>;
}
function Timeline({ icon: Icon, label, value, locale, muted = false }: { icon: typeof Clock3; label: string; value: string | null; locale: Locale; muted?: boolean }) { return <div className={cn("relative", muted && "opacity-45")}><div className="absolute -start-[2.05rem] grid size-6 place-items-center rounded-full border bg-background"><Icon className="size-3"/></div><p className="font-medium text-sm">{label}</p><p className="mt-0.5 text-muted-foreground text-xs">{value ? formatDateTime(value, locale) : "—"}</p></div>; }
function Identifier({ label, value, onCopy }: { label: string; value: string | number | null; onCopy: () => void }) { return <div className="flex items-center justify-between gap-3 px-3 py-2.5"><div className="min-w-0"><p className="text-muted-foreground text-[11px]">{label}</p><p className="truncate font-mono text-xs" dir="ltr">{value ?? "—"}</p></div>{value !== null ? <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onCopy} aria-label={`Copy ${label}`}><Copy className="size-3.5"/></Button> : null}</div>; }
