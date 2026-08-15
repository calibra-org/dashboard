"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useDeferredValue, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import {
    CheckCircle2,
    Clock3,
    Download,
    Filter,
    Inbox,
    ListFilter,
    MessageSquare,
    Plus,
    Save,
    Search,
    ShieldAlert,
    Tags,
    Trash2,
} from "#/icons";
import { formatDate } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";

import { ticketCopy } from "./copy";
import {
    useCreateTicketSavedView,
    useDeleteTicketSavedView,
    useTicketBulkOperation,
    useTicketSavedViews,
    useTicketSummary,
    useTickets,
} from "./queries";
import {
    EmptySupportState,
    SupportMetric,
    SupportPageHeader,
    TicketPriorityBadge,
    TicketStatusBadge,
    ticketChannelLabel,
} from "./ui";
import type { Ticket, TicketChannel, TicketPriority, TicketSavedViewQuery, TicketStatus } from "./types";

const CHANNELS: TicketChannel[] = [
    "admin",
    "web",
    "email",
    "phone",
    "api",
    "whatsapp",
    "telegram",
    "instagram",
    "rubika",
    "bale",
    "eitaa",
    "sms",
];

function slaBreached(ticket: Ticket): boolean {
    const now = Date.now();
    if (!ticket.first_response_at && ticket.first_response_due_at && new Date(ticket.first_response_due_at).getTime() < now)
        return true;
    return (
        !["resolved", "closed"].includes(ticket.status) &&
        Boolean(ticket.resolution_due_at && new Date(ticket.resolution_due_at).getTime() < now)
    );
}

function csvCell(value: unknown): string {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
}

export function TicketInboxPage() {
    const locale = useLocale() as Locale;
    const { text: t, statuses, priorities } = ticketCopy(locale);
    const numberLocale = locale === "fa" ? "fa-IR" : "en-US";
    const [q, setQ] = useState("");
    const [status, setStatus] = useState<TicketStatus | "all">("all");
    const [priority, setPriority] = useState<TicketPriority | "all">("all");
    const [channel, setChannel] = useState<TicketChannel | "all">("all");
    const [sla, setSla] = useState<"all" | "healthy" | "breached">("all");
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<Record<number, number>>({});
    const [bulkAction, setBulkAction] = useState<"status" | "priority">("status");
    const [bulkStatus, setBulkStatus] = useState<TicketStatus>("pending");
    const [bulkPriority, setBulkPriority] = useState<TicketPriority>("high");
    const [viewName, setViewName] = useState("");
    const deferredQ = useDeferredValue(q.trim());

    const tickets = useTickets({ page, limit: 25, q: deferredQ, status, priority, channel, sla });
    const summary = useTicketSummary();
    const savedViews = useTicketSavedViews();
    const createView = useCreateTicketSavedView();
    const deleteView = useDeleteTicketSavedView();
    const bulk = useTicketBulkOperation();
    const rows = tickets.data?.data ?? [];
    const total = tickets.data?.meta.total ?? 0;
    const lastPage = tickets.data?.meta.lastPage ?? 1;
    const selectedRows = rows.filter((row) => selected[row.id] === row.version);
    const allCurrentSelected = rows.length > 0 && rows.every((row) => selected[row.id] === row.version);
    const hasFilters = Boolean(deferredQ || status !== "all" || priority !== "all" || channel !== "all" || sla !== "all");

    const pageTags = useMemo(() => {
        const counts = new Map<string, number>();
        for (const ticket of rows) {
            for (const tag of ticket.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
    }, [rows]);

    const currentViewQuery = useMemo<TicketSavedViewQuery>(() => {
        const query: TicketSavedViewQuery = {};
        if (deferredQ) query.q = deferredQ;
        if (status !== "all") query.status = status;
        if (priority !== "all") query.priority = priority;
        if (channel !== "all") query.channel = channel;
        if (sla !== "all") query.sla = sla;
        return query;
    }, [channel, deferredQ, priority, sla, status]);

    function clearFilters() {
        setQ("");
        setStatus("all");
        setPriority("all");
        setChannel("all");
        setSla("all");
        setPage(1);
        setSelected({});
    }

    function applyView(query: TicketSavedViewQuery) {
        setQ(query.q ?? "");
        setStatus(query.status ?? "all");
        setPriority(query.priority ?? "all");
        setChannel(query.channel ?? "all");
        setSla(query.sla ?? "all");
        setPage(1);
        setSelected({});
    }

    async function saveView() {
        const name = viewName.trim();
        if (!name) return;
        await createView.mutateAsync({ name, query: currentViewQuery });
        setViewName("");
    }

    async function runBulk() {
        if (selectedRows.length === 0) return;
        const base = { tickets: selectedRows.map((row) => ({ id: row.id, expected_version: row.version })) };
        if (bulkAction === "status") {
            await bulk.mutateAsync({ ...base, operation: "transition", status: bulkStatus });
        } else {
            await bulk.mutateAsync({ ...base, operation: "priority", priority: bulkPriority });
        }
        setSelected({});
    }

    function exportCurrentPage() {
        if (rows.length === 0) return;
        const header = ["reference", "subject", "requester", "status", "priority", "channel", "assignee", "last_activity"];
        const body = rows.map((row) => [
            row.reference,
            row.subject,
            row.requester_name,
            row.status,
            row.priority,
            row.channel,
            row.assignee_email ?? "",
            row.last_message_at,
        ]);
        const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
        const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `tickets-page-${page}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="flex flex-col gap-5">
            <SupportPageHeader
                eyebrow={locale === "en" ? "Unified support inbox" : "صندوق یکپارچه پشتیبانی"}
                title={locale === "en" ? "Ticket inbox" : "صندوق تیکت‌ها"}
                subtitle={
                    locale === "en"
                        ? "Filter and prioritize the live queue, save operational views, apply guarded bulk changes, and open the full ticket timeline."
                        : "صف واقعی را فیلتر و اولویت‌بندی کنید، نماهای عملیاتی ذخیره کنید، عملیات گروهی کنترل‌شده اجرا کنید و وارد جزئیات کامل هر تیکت شوید."
                }
                icon={Inbox}
                actions={
                    <>
                        <Button variant="outline" onClick={exportCurrentPage} disabled={rows.length === 0}>
                            <Download className="size-4" aria-hidden="true" />
                            {locale === "en" ? "Export page" : "خروجی CSV"}
                        </Button>
                        <Button asChild>
                            <Link href={"/tickets/create" as never}>
                                <Plus className="size-4" aria-hidden="true" />
                                {locale === "en" ? "New ticket" : "تیکت جدید"}
                            </Link>
                        </Button>
                    </>
                }
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {summary.isLoading ? (
                    Array.from({ length: 5 }, (_, index) => `inbox-metric-${index + 1}`).map((key) => (
                        <Skeleton key={key} className="h-28 rounded-xl" />
                    ))
                ) : (
                    <>
                        <SupportMetric
                            label={locale === "en" ? "All tickets" : "همه تیکت‌ها"}
                            value={(summary.data?.total ?? 0).toLocaleString(numberLocale)}
                            icon={Inbox}
                        />
                        <SupportMetric
                            label={locale === "en" ? "Active" : "تیکت‌های فعال"}
                            value={(summary.data?.active ?? 0).toLocaleString(numberLocale)}
                            hint={locale === "en" ? "Open and in progress" : "باز و در حال پیگیری"}
                            icon={MessageSquare}
                            tone="info"
                        />
                        <SupportMetric
                            label={locale === "en" ? "Waiting customer" : "در انتظار مشتری"}
                            value={(summary.data?.waiting_customer ?? 0).toLocaleString(numberLocale)}
                            icon={Clock3}
                            tone="warning"
                        />
                        <SupportMetric
                            label={locale === "en" ? "SLA breached" : "SLA نقض‌شده"}
                            value={(summary.data?.sla_breached ?? 0).toLocaleString(numberLocale)}
                            icon={ShieldAlert}
                            tone="danger"
                        />
                        <SupportMetric
                            label={locale === "en" ? "Resolved 30d" : "حل‌شده در ۳۰ روز"}
                            value={(summary.data?.resolved_30d ?? 0).toLocaleString(numberLocale)}
                            icon={CheckCircle2}
                            tone="success"
                        />
                    </>
                )}
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
                <Card className="min-w-0 shadow-sm">
                    <CardContent className="space-y-4 p-3 sm:p-4">
                        <div className="grid gap-2 lg:grid-cols-[minmax(14rem,1fr)_repeat(4,minmax(8rem,0.34fr))]">
                            <div className="relative">
                                <Search
                                    className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                    aria-hidden="true"
                                />
                                <Input
                                    value={q}
                                    onChange={(event) => {
                                        setQ(event.target.value);
                                        setPage(1);
                                    }}
                                    className="ps-9"
                                    placeholder={t.search}
                                />
                            </div>
                            <Select
                                value={status}
                                onValueChange={(value) => {
                                    setStatus(value as TicketStatus | "all");
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t.allStatuses}</SelectItem>
                                    {Object.entries(statuses).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={priority}
                                onValueChange={(value) => {
                                    setPriority(value as TicketPriority | "all");
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t.allPriorities}</SelectItem>
                                    {Object.entries(priorities).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={channel}
                                onValueChange={(value) => {
                                    setChannel(value as TicketChannel | "all");
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={locale === "en" ? "Channel" : "کانال"} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{locale === "en" ? "All channels" : "همه کانال‌ها"}</SelectItem>
                                    {CHANNELS.map((value) => (
                                        <SelectItem key={value} value={value}>
                                            {ticketChannelLabel(value, locale)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={sla}
                                onValueChange={(value) => {
                                    setSla(value as typeof sla);
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="SLA" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t.allSla}</SelectItem>
                                    <SelectItem value="healthy">{t.healthySla}</SelectItem>
                                    <SelectItem value="breached">{t.breachedSla}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {hasFilters ? (
                            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/15 p-2.5">
                                <span className="me-1 text-[0.68rem] text-muted-foreground">
                                    {locale === "en" ? "Active filters" : "فیلترهای فعال"}:
                                </span>
                                {deferredQ ? (
                                    <Badge variant="outline">
                                        {locale === "en" ? "Search" : "جستجو"}: {deferredQ}
                                    </Badge>
                                ) : null}
                                {status !== "all" ? <Badge variant="outline">{statuses[status]}</Badge> : null}
                                {priority !== "all" ? <Badge variant="outline">{priorities[priority]}</Badge> : null}
                                {channel !== "all" ? (
                                    <Badge variant="outline">{ticketChannelLabel(channel, locale)}</Badge>
                                ) : null}
                                {sla !== "all" ? (
                                    <Badge variant="outline">SLA: {sla === "healthy" ? t.healthySla : t.breachedSla}</Badge>
                                ) : null}
                                <Button variant="ghost" size="sm" className="ms-auto h-7" onClick={clearFilters}>
                                    {locale === "en" ? "Clear filters" : "پاک‌کردن"}
                                </Button>
                            </div>
                        ) : null}

                        {selectedRows.length > 0 ? (
                            <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="font-medium text-xs">
                                    {selectedRows.length.toLocaleString(numberLocale)}{" "}
                                    {locale === "en" ? "tickets selected" : "تیکت انتخاب شده"}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Select
                                        value={bulkAction}
                                        onValueChange={(value) => setBulkAction(value as typeof bulkAction)}
                                    >
                                        <SelectTrigger className="w-36">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="status">
                                                {locale === "en" ? "Change status" : "تغییر وضعیت"}
                                            </SelectItem>
                                            <SelectItem value="priority">
                                                {locale === "en" ? "Change priority" : "تغییر اولویت"}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {bulkAction === "status" ? (
                                        <Select
                                            value={bulkStatus}
                                            onValueChange={(value) => setBulkStatus(value as TicketStatus)}
                                        >
                                            <SelectTrigger className="w-40">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(statuses).map(([value, label]) => (
                                                    <SelectItem key={value} value={value}>
                                                        {label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Select
                                            value={bulkPriority}
                                            onValueChange={(value) => setBulkPriority(value as TicketPriority)}
                                        >
                                            <SelectTrigger className="w-36">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(priorities).map(([value, label]) => (
                                                    <SelectItem key={value} value={value}>
                                                        {label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                    <Button size="sm" onClick={() => void runBulk()} disabled={bulk.isPending}>
                                        {bulk.isPending
                                            ? locale === "en"
                                                ? "Applying…"
                                                : "در حال اعمال…"
                                            : locale === "en"
                                              ? "Apply"
                                              : "اعمال"}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setSelected({})}>
                                        {locale === "en" ? "Clear" : "لغو انتخاب"}
                                    </Button>
                                </div>
                                {bulk.isSuccess ? (
                                    <div className="text-[0.68rem] text-success">
                                        {bulk.data.meta.succeeded.toLocaleString(numberLocale)}{" "}
                                        {locale === "en" ? "updated" : "موفق"}
                                        {bulk.data.meta.failed > 0
                                            ? ` · ${bulk.data.meta.failed.toLocaleString(numberLocale)} ${locale === "en" ? "failed" : "ناموفق"}`
                                            : ""}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {tickets.isLoading ? (
                            <div className="space-y-2">
                                {Array.from({ length: 8 }, (_, index) => `queue-row-${index + 1}`).map((key) => (
                                    <Skeleton key={key} className="h-20 rounded-xl md:h-14" />
                                ))}
                            </div>
                        ) : rows.length === 0 ? (
                            <EmptySupportState title={t.noResults} />
                        ) : (
                            <>
                                <div className="space-y-2 md:hidden">
                                    {rows.map((ticket) => (
                                        <div
                                            key={ticket.id}
                                            className="rounded-xl border bg-card p-3 shadow-sm"
                                            data-state={selected[ticket.id] === ticket.version ? "selected" : undefined}
                                        >
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    className="mt-1"
                                                    checked={selected[ticket.id] === ticket.version}
                                                    onCheckedChange={(checked) =>
                                                        setSelected((current) => {
                                                            const next = { ...current };
                                                            if (checked) next[ticket.id] = ticket.version;
                                                            else delete next[ticket.id];
                                                            return next;
                                                        })
                                                    }
                                                    aria-label={`${locale === "en" ? "Select" : "انتخاب"} ${ticket.reference}`}
                                                />
                                                <Link href={`/tickets/inbox/${ticket.id}` as never} className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="line-clamp-2 font-medium text-sm leading-6">
                                                                {ticket.subject}
                                                            </div>
                                                            <div className="mt-1 text-[0.68rem] text-muted-foreground" dir="ltr">
                                                                {ticket.reference}
                                                            </div>
                                                        </div>
                                                        <TicketPriorityBadge
                                                            priority={ticket.priority}
                                                            label={priorities[ticket.priority]}
                                                        />
                                                    </div>
                                                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                                        <TicketStatusBadge
                                                            status={ticket.status}
                                                            label={statuses[ticket.status]}
                                                        />
                                                        <Badge variant="outline">
                                                            {ticketChannelLabel(ticket.channel, locale)}
                                                        </Badge>
                                                        <Badge
                                                            variant="outline"
                                                            className={
                                                                slaBreached(ticket)
                                                                    ? "border-danger/20 bg-danger/10 text-danger"
                                                                    : "border-success/20 bg-success/10 text-success"
                                                            }
                                                        >
                                                            {slaBreached(ticket)
                                                                ? locale === "en"
                                                                    ? "SLA breached"
                                                                    : "SLA نقض‌شده"
                                                                : locale === "en"
                                                                  ? "SLA on track"
                                                                  : "SLA مجاز"}
                                                        </Badge>
                                                    </div>
                                                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-muted/25 p-2 text-[0.68rem]">
                                                        <div className="min-w-0">
                                                            <div className="text-muted-foreground">{t.requester}</div>
                                                            <div className="mt-1 truncate">{ticket.requester_name}</div>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-muted-foreground">{t.assignee}</div>
                                                            <div className="mt-1 truncate">
                                                                {ticket.assignee_email ?? t.unassigned}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 text-[0.65rem] text-muted-foreground">
                                                        {t.lastActivity}: {formatDate(ticket.last_message_at, locale)}
                                                    </div>
                                                </Link>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="hidden overflow-x-auto rounded-xl border md:block">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-10">
                                                    <Checkbox
                                                        checked={allCurrentSelected}
                                                        onCheckedChange={(checked) => {
                                                            if (checked)
                                                                setSelected((current) => ({
                                                                    ...current,
                                                                    ...Object.fromEntries(
                                                                        rows.map((row) => [row.id, row.version]),
                                                                    ),
                                                                }));
                                                            else
                                                                setSelected((current) => {
                                                                    const next = { ...current };
                                                                    for (const row of rows) delete next[row.id];
                                                                    return next;
                                                                });
                                                        }}
                                                        aria-label={locale === "en" ? "Select page" : "انتخاب صفحه"}
                                                    />
                                                </TableHead>
                                                <TableHead>{locale === "en" ? "Ticket" : "تیکت"}</TableHead>
                                                <TableHead>{t.requester}</TableHead>
                                                <TableHead>{locale === "en" ? "Channel" : "کانال"}</TableHead>
                                                <TableHead>{t.status}</TableHead>
                                                <TableHead>{t.priority}</TableHead>
                                                <TableHead>{t.assignee}</TableHead>
                                                <TableHead>SLA</TableHead>
                                                <TableHead>{t.lastActivity}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {rows.map((ticket) => (
                                                <TableRow
                                                    key={ticket.id}
                                                    data-state={selected[ticket.id] === ticket.version ? "selected" : undefined}
                                                >
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={selected[ticket.id] === ticket.version}
                                                            onCheckedChange={(checked) =>
                                                                setSelected((current) => {
                                                                    const next = { ...current };
                                                                    if (checked) next[ticket.id] = ticket.version;
                                                                    else delete next[ticket.id];
                                                                    return next;
                                                                })
                                                            }
                                                            aria-label={`${locale === "en" ? "Select" : "انتخاب"} ${ticket.reference}`}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Link
                                                            href={`/tickets/inbox/${ticket.id}` as never}
                                                            className="block min-w-60"
                                                        >
                                                            <div className="font-medium text-sm hover:text-primary">
                                                                {ticket.subject}
                                                            </div>
                                                            <div className="mt-1 text-[0.7rem] text-muted-foreground" dir="ltr">
                                                                {ticket.reference}
                                                            </div>
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="min-w-36">
                                                            <div className="font-medium text-xs">{ticket.requester_name}</div>
                                                            <div className="mt-1 text-[0.68rem] text-muted-foreground" dir="auto">
                                                                {ticket.requester_phone ?? ticket.requester_email ?? "—"}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">
                                                            {ticketChannelLabel(ticket.channel, locale)}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <TicketStatusBadge
                                                            status={ticket.status}
                                                            label={statuses[ticket.status]}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <TicketPriorityBadge
                                                            priority={ticket.priority}
                                                            label={priorities[ticket.priority]}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-xs">
                                                        {ticket.assignee_email ?? t.unassigned}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant="outline"
                                                            className={
                                                                slaBreached(ticket)
                                                                    ? "border-danger/20 bg-danger/10 text-danger"
                                                                    : "border-success/20 bg-success/10 text-success"
                                                            }
                                                        >
                                                            {slaBreached(ticket)
                                                                ? locale === "en"
                                                                    ? "Breached"
                                                                    : "نقض‌شده"
                                                                : locale === "en"
                                                                  ? "On track"
                                                                  : "در محدوده"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap text-[0.68rem] text-muted-foreground">
                                                        {formatDate(ticket.last_message_at, locale)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </>
                        )}

                        <div className="flex flex-col gap-3 text-muted-foreground text-xs sm:flex-row sm:items-center sm:justify-between">
                            <span>
                                {total.toLocaleString(numberLocale)} {locale === "en" ? "tickets" : "تیکت"}
                            </span>
                            <div className="flex items-center justify-between gap-2 sm:justify-end">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={page <= 1}
                                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                                >
                                    {t.previous}
                                </Button>
                                <span className="min-w-14 text-center tabular-nums">
                                    {page.toLocaleString(numberLocale)} / {lastPage.toLocaleString(numberLocale)}
                                </span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={page >= lastPage}
                                    onClick={() => setPage((value) => Math.min(lastPage, value + 1))}
                                >
                                    {t.next}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <aside className="space-y-4 xl:sticky xl:top-4">
                    <Card className="shadow-sm">
                        <CardHeader className="flex-row items-center justify-between space-y-0">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <ListFilter className="size-4" aria-hidden="true" />
                                {locale === "en" ? "Saved views" : "نماهای ذخیره‌شده"}
                            </CardTitle>
                            <Badge variant="outline">{(savedViews.data?.length ?? 0).toLocaleString(numberLocale)}</Badge>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {(savedViews.data ?? []).map((view) => (
                                <div key={view.id} className="group flex items-center gap-1 rounded-lg border p-1.5">
                                    <button
                                        type="button"
                                        onClick={() => applyView(view.query)}
                                        className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-start hover:bg-muted/50"
                                    >
                                        <div className="truncate font-medium text-xs">{view.name}</div>
                                        <div className="mt-1 text-[0.65rem] text-muted-foreground">
                                            {Object.keys(view.query).length.toLocaleString(numberLocale)}{" "}
                                            {locale === "en" ? "filters" : "فیلتر"}
                                            {view.is_shared ? ` · ${locale === "en" ? "shared" : "اشتراکی"}` : ""}
                                        </div>
                                    </button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 opacity-70"
                                        onClick={() => void deleteView.mutateAsync(view.id)}
                                        aria-label={locale === "en" ? "Delete view" : "حذف نما"}
                                    >
                                        <Trash2 className="size-3.5" aria-hidden="true" />
                                    </Button>
                                </div>
                            ))}
                            {(savedViews.data ?? []).length === 0 ? (
                                <p className="py-4 text-center text-muted-foreground text-xs">
                                    {locale === "en" ? "No saved view yet." : "هنوز نمای ذخیره‌شده‌ای ندارید."}
                                </p>
                            ) : null}
                            <div className="border-t pt-3">
                                <div className="flex gap-2">
                                    <Input
                                        value={viewName}
                                        onChange={(event) => setViewName(event.target.value)}
                                        maxLength={120}
                                        placeholder={locale === "en" ? "View name" : "نام نما"}
                                    />
                                    <Button
                                        size="icon"
                                        onClick={() => void saveView()}
                                        disabled={!viewName.trim() || createView.isPending}
                                        aria-label={locale === "en" ? "Save current filters" : "ذخیره فیلتر فعلی"}
                                    >
                                        <Save className="size-4" aria-hidden="true" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Filter className="size-4" aria-hidden="true" />
                                {locale === "en" ? "Quick filters" : "فیلترهای سریع"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-2">
                            <Button
                                variant="outline"
                                className="justify-between"
                                onClick={() => {
                                    setStatus("open");
                                    setSla("all");
                                    setPage(1);
                                }}
                            >
                                <span>{statuses.open}</span>
                                <Badge variant="secondary">{locale === "en" ? "Open" : "باز"}</Badge>
                            </Button>
                            <Button
                                variant="outline"
                                className="justify-between"
                                onClick={() => {
                                    setStatus("waiting_customer");
                                    setSla("all");
                                    setPage(1);
                                }}
                            >
                                <span>{statuses.waiting_customer}</span>
                                <Badge variant="secondary">
                                    {(summary.data?.waiting_customer ?? 0).toLocaleString(numberLocale)}
                                </Badge>
                            </Button>
                            <Button
                                variant="outline"
                                className="justify-between"
                                onClick={() => {
                                    setStatus("all");
                                    setSla("breached");
                                    setPage(1);
                                }}
                            >
                                <span>{locale === "en" ? "SLA breached" : "SLA نقض‌شده"}</span>
                                <Badge variant="outline" className="border-danger/20 text-danger">
                                    {(summary.data?.sla_breached ?? 0).toLocaleString(numberLocale)}
                                </Badge>
                            </Button>
                            <Button
                                variant="outline"
                                className="justify-between"
                                onClick={() => {
                                    setPriority("urgent");
                                    setStatus("all");
                                    setPage(1);
                                }}
                            >
                                <span>{locale === "en" ? "Urgent priority" : "اولویت فوری"}</span>
                                <Badge variant="outline" className="border-danger/20 text-danger">
                                    !
                                </Badge>
                            </Button>
                            <Button variant="ghost" className="justify-start" onClick={clearFilters}>
                                <Filter className="size-4" aria-hidden="true" />
                                {locale === "en" ? "Clear all filters" : "پاک‌کردن همه فیلترها"}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader className="flex-row items-center justify-between space-y-0">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Tags className="size-4" aria-hidden="true" />
                                {locale === "en" ? "Tags on this page" : "برچسب‌های این صفحه"}
                            </CardTitle>
                            <Badge variant="outline">{pageTags.length.toLocaleString(numberLocale)}</Badge>
                        </CardHeader>
                        <CardContent>
                            {pageTags.length === 0 ? (
                                <p className="py-4 text-center text-muted-foreground text-xs">
                                    {locale === "en"
                                        ? "No tags in the current result page."
                                        : "در نتایج این صفحه برچسبی وجود ندارد."}
                                </p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {pageTags.map(([tag, count]) => (
                                        <Badge key={tag} variant="outline" className="gap-1.5">
                                            <span className="max-w-32 truncate">{tag}</span>
                                            <span className="text-muted-foreground">{count.toLocaleString(numberLocale)}</span>
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </div>
    );
}
