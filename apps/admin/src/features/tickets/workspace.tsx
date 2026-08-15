"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { type FormEvent, useDeferredValue, useMemo, useState } from "react";

import { StatCard } from "#/components/StatCard";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Textarea } from "#/components/ui/textarea";
import { AlertCircle, CheckCircle2, Clock3, MessageSquare, Plus, Search, ShieldAlert, Users } from "#/icons";
import { formatDate } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

import { ticketCopy } from "./copy";
import { useCreateTicket, useTicketResources, useTicketSummary, useTickets, useTicketTrends } from "./queries";
import type { TicketPriority, TicketStatus } from "./types";

function statusTone(status: TicketStatus): string {
    if (status === "resolved" || status === "closed") return "border-success/20 bg-success/10 text-success";
    if (status === "waiting_customer") return "border-warning/20 bg-warning/10 text-warning";
    if (status === "pending") return "border-primary/20 bg-primary/10 text-primary";
    return "border-border bg-muted text-foreground";
}

function priorityTone(priority: TicketPriority): string {
    if (priority === "urgent") return "border-danger/20 bg-danger/10 text-danger";
    if (priority === "high") return "border-warning/20 bg-warning/10 text-warning";
    return "border-border bg-muted text-muted-foreground";
}

function TrendChart({ points, locale }: { points: Array<{ day: string; opened: number; resolved: number }>; locale: Locale }) {
    const max = Math.max(1, ...points.flatMap((point) => [point.opened, point.resolved]));
    const width = 600;
    const height = 150;
    const x = (index: number) => (points.length <= 1 ? 0 : (index / (points.length - 1)) * width);
    const y = (value: number) => height - (value / max) * (height - 12) - 6;
    const opened = points.map((point, index) => `${x(index)},${y(point.opened)}`).join(" ");
    const resolved = points.map((point, index) => `${x(index)},${y(point.resolved)}`).join(" ");
    const label = locale === "en" ? "30-day ticket trend" : "روند ۳۰ روزه تیکت‌ها";

    return (
        <div className="h-44 w-full overflow-hidden" aria-label={label} role="img">
            <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none">
                <polyline
                    points={opened}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-primary"
                    vectorEffect="non-scaling-stroke"
                />
                <polyline
                    points={resolved}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="text-success"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
        </div>
    );
}

export function TicketsWorkspace() {
    const locale = useLocale() as Locale;
    const { text: t, statuses, priorities } = ticketCopy(locale);
    const [q, setQ] = useState("");
    const [status, setStatus] = useState<TicketStatus | "all">("all");
    const [priority, setPriority] = useState<TicketPriority | "all">("all");
    const [sla, setSla] = useState<"all" | "healthy" | "breached">("all");
    const [page, setPage] = useState(1);
    const [createOpen, setCreateOpen] = useState(false);
    const [customerId, setCustomerId] = useState<number | null>(null);
    const [assigneeChoice, setAssigneeChoice] = useState("default");
    const [createPriority, setCreatePriority] = useState<"default" | TicketPriority>("default");
    const deferredQ = useDeferredValue(q.trim());

    const tickets = useTickets({ q: deferredQ, status, priority, sla, page, limit: 25 });
    const summary = useTicketSummary();
    const trends = useTicketTrends();
    const customers = useTicketResources("customers");
    const assignees = useTicketResources("assignees");
    const createTicket = useCreateTicket();
    const rows = tickets.data?.data ?? [];
    const total = tickets.data?.meta.total ?? 0;
    const pageCount = tickets.data?.meta.lastPage ?? 1;
    const recentQueue = useMemo(() => rows.slice(0, 5), [rows]);
    const numberLocale = locale === "fa" ? "fa-IR" : "en-US";

    async function handleCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const tags = String(form.get("tags") ?? "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 20);
        const assignedUserId =
            assigneeChoice === "default" ? undefined : assigneeChoice === "unassigned" ? null : Number(assigneeChoice);

        await createTicket.mutateAsync({
            customer_id: customerId,
            requester_name: String(form.get("requester_name") ?? "").trim(),
            requester_email: String(form.get("requester_email") ?? "").trim() || null,
            requester_phone: String(form.get("requester_phone") ?? "").trim() || null,
            subject: String(form.get("subject") ?? "").trim(),
            message: String(form.get("message") ?? "").trim(),
            priority: createPriority === "default" ? undefined : createPriority,
            channel: "admin",
            category: String(form.get("category") ?? "").trim() || null,
            tags,
            assigned_user_id: assignedUserId,
        });
        event.currentTarget.reset();
        setCustomerId(null);
        setAssigneeChoice("default");
        setCreatePriority("default");
        setCreateOpen(false);
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <div className="mb-1 flex items-center gap-2 text-muted-foreground text-xs">
                        <MessageSquare className="size-3.5" aria-hidden="true" />
                        {t.operations}
                    </div>
                    <h1 className="font-semibold text-2xl tracking-tight">{t.center}</h1>
                    <p className="mt-1 max-w-2xl text-muted-foreground text-sm">{t.centerSubtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <Link href={"/tickets/settings" as never}>{t.settings}</Link>
                    </Button>
                    <Button onClick={() => setCreateOpen((value) => !value)}>
                        <Plus className="size-4" aria-hidden="true" />
                        {t.newTicket}
                    </Button>
                </div>
            </div>

            {createOpen ? (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">{t.createTicket}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form className="grid gap-3 lg:grid-cols-2" onSubmit={handleCreate}>
                            <div className="space-y-1.5">
                                <label htmlFor="new-ticket-customer" className="font-medium text-xs">
                                    {t.linkedCustomer}
                                </label>
                                <Select
                                    value={customerId === null ? "none" : String(customerId)}
                                    onValueChange={(value) => setCustomerId(value === "none" ? null : Number(value))}
                                >
                                    <SelectTrigger id="new-ticket-customer">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{t.noCustomer}</SelectItem>
                                        {(customers.data ?? []).map((customer) => (
                                            <SelectItem key={customer.id} value={String(customer.id)}>
                                                {customer.label}
                                                {customer.phone ? ` · ${customer.phone}` : ""}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <label htmlFor="new-ticket-assignee" className="font-medium text-xs">
                                    {t.assignee}
                                </label>
                                <Select
                                    value={assigneeChoice}
                                    onValueChange={(value) => setAssigneeChoice(typeof value === "string" ? value : "default")}
                                >
                                    <SelectTrigger id="new-ticket-assignee">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="default">{t.defaultAssignment}</SelectItem>
                                        <SelectItem value="unassigned">{t.unassigned}</SelectItem>
                                        {(assignees.data ?? []).map((assignee) => (
                                            <SelectItem key={assignee.id} value={String(assignee.id)}>
                                                {assignee.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Input name="requester_name" required placeholder={t.requesterName} maxLength={180} />
                            <Input name="requester_email" type="email" placeholder={t.email} maxLength={254} />
                            <Input name="requester_phone" placeholder={t.phone} maxLength={32} />
                            <Select
                                value={createPriority}
                                onValueChange={(value) => setCreatePriority(value as "default" | TicketPriority)}
                            >
                                <SelectTrigger aria-label={t.priority}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">{t.defaultPriority}</SelectItem>
                                    {Object.entries(priorities).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input name="category" placeholder={t.categoryPlaceholder} maxLength={80} />
                            <Input
                                name="tags"
                                placeholder={locale === "en" ? "Tags, comma separated" : "برچسب‌ها، با ویرگول جدا کنید"}
                                maxLength={820}
                            />
                            <Input name="subject" required placeholder={t.subject} maxLength={255} className="lg:col-span-2" />
                            <Textarea
                                className="min-h-28 lg:col-span-2"
                                name="message"
                                required
                                placeholder={t.initialMessage}
                                maxLength={20_000}
                            />
                            <div className="flex items-center justify-end gap-2 lg:col-span-2">
                                <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                                    {t.cancel}
                                </Button>
                                <Button type="submit" disabled={createTicket.isPending}>
                                    {createTicket.isPending ? t.creating : t.create}
                                </Button>
                            </div>
                            {customers.isError || assignees.isError ? (
                                <p className="text-warning text-xs lg:col-span-2">{t.resourceWarning}</p>
                            ) : null}
                            {createTicket.isError ? <p className="text-danger text-xs lg:col-span-2">{t.createFailed}</p> : null}
                        </form>
                    </CardContent>
                </Card>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {summary.isLoading ? (
                    [1, 2, 3, 4, 5].map((key) => <Skeleton key={key} className="h-24" />)
                ) : (
                    <>
                        <StatCard
                            label={t.activeTickets}
                            value={String(summary.data?.active ?? 0)}
                            icon={MessageSquare}
                            tone="info"
                        />
                        <StatCard
                            label={t.waitingCustomer}
                            value={String(summary.data?.waiting_customer ?? 0)}
                            icon={Users}
                            tone="warning"
                        />
                        <StatCard
                            label={t.slaBreached}
                            value={String(summary.data?.sla_breached ?? 0)}
                            icon={ShieldAlert}
                            tone="danger"
                        />
                        <StatCard
                            label={t.resolved30d}
                            value={String(summary.data?.resolved_30d ?? 0)}
                            icon={CheckCircle2}
                            tone="success"
                        />
                        <StatCard
                            label={t.avgFirstResponse}
                            value={`${summary.data?.avg_first_response_minutes ?? 0} ${t.minute}`}
                            icon={Clock3}
                            tone="neutral"
                        />
                    </>
                )}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.8fr)]">
                <Card>
                    <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                        <div>
                            <CardTitle className="text-base">{t.trendTitle}</CardTitle>
                            <p className="mt-1 text-muted-foreground text-xs">{t.trendSubtitle}</p>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {trends.isLoading ? (
                            <Skeleton className="h-44" />
                        ) : (
                            <TrendChart points={trends.data ?? []} locale={locale} />
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">{t.recentQueue}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {recentQueue.length === 0 ? (
                            <p className="py-8 text-center text-muted-foreground text-sm">{t.emptyQueue}</p>
                        ) : (
                            recentQueue.map((ticket) => (
                                <Link
                                    key={ticket.id}
                                    href={`/tickets/${ticket.id}` as never}
                                    className="block rounded-lg border p-3 transition-colors hover:bg-muted/50"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate font-medium text-sm">{ticket.subject}</div>
                                            <div className="mt-1 truncate text-muted-foreground text-xs">
                                                {ticket.reference} · {ticket.requester_name}
                                            </div>
                                        </div>
                                        <Badge variant="outline" className={cn("shrink-0", priorityTone(ticket.priority))}>
                                            {priorities[ticket.priority]}
                                        </Badge>
                                    </div>
                                </Link>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardContent className="flex flex-col gap-4 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="relative min-w-0 flex-1">
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
                                aria-label={t.search}
                            />
                        </div>
                        <Select
                            value={status}
                            onValueChange={(value) => {
                                setStatus(value as TicketStatus | "all");
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="w-full lg:w-44">
                                <SelectValue placeholder={t.status} />
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
                            <SelectTrigger className="w-full lg:w-40">
                                <SelectValue placeholder={t.priority} />
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
                            value={sla}
                            onValueChange={(value) => {
                                setSla(value as typeof sla);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="w-full lg:w-40">
                                <SelectValue placeholder="SLA" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t.allSla}</SelectItem>
                                <SelectItem value="healthy">{t.healthySla}</SelectItem>
                                <SelectItem value="breached">{t.breachedSla}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={() => void tickets.refetch()} disabled={tickets.isFetching}>
                            {t.refresh}
                        </Button>
                    </div>

                    {tickets.isError ? (
                        <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
                            <AlertCircle className="size-7 text-danger" aria-hidden="true" />
                            <p className="text-sm">
                                {locale === "en" ? "Could not load the ticket queue." : "دریافت صف تیکت‌ها ناموفق بود."}
                            </p>
                            <Button variant="outline" onClick={() => void tickets.refetch()}>
                                {t.retry}
                            </Button>
                        </div>
                    ) : tickets.isLoading ? (
                        <div className="space-y-2">
                            {[1, 2, 3, 4, 5, 6].map((key) => (
                                <Skeleton key={key} className="h-12" />
                            ))}
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="grid min-h-48 place-items-center text-center">
                            <div>
                                <MessageSquare className="mx-auto mb-3 size-7 text-muted-foreground" aria-hidden="true" />
                                <p className="font-medium text-sm">{t.noResults}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{locale === "en" ? "Ticket" : "تیکت"}</TableHead>
                                        <TableHead>{t.requester}</TableHead>
                                        <TableHead>{t.status}</TableHead>
                                        <TableHead>{t.priority}</TableHead>
                                        <TableHead>{t.assignee}</TableHead>
                                        <TableHead>{t.lastActivity}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((ticket) => (
                                        <TableRow key={ticket.id}>
                                            <TableCell>
                                                <Link href={`/tickets/${ticket.id}` as never} className="block min-w-56">
                                                    <div className="font-medium text-sm">{ticket.subject}</div>
                                                    <div className="mt-1 text-muted-foreground text-xs">
                                                        {ticket.reference}
                                                        {ticket.category ? ` · ${ticket.category}` : ""}
                                                    </div>
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                <div className="min-w-36">
                                                    <div className="font-medium text-sm">{ticket.requester_name}</div>
                                                    <div className="text-muted-foreground text-xs">
                                                        {ticket.requester_phone ?? ticket.requester_email ?? "—"}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={statusTone(ticket.status)}>
                                                    {statuses[ticket.status]}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={priorityTone(ticket.priority)}>
                                                    {priorities[ticket.priority]}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {ticket.assignee_email ?? t.unassigned}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                                                {formatDate(ticket.last_message_at, locale)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-xs">
                        <span>
                            {total.toLocaleString(numberLocale)} {locale === "en" ? "tickets" : "تیکت"}
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((value) => Math.max(1, value - 1))}
                                disabled={page <= 1}
                            >
                                {t.previous}
                            </Button>
                            <span>
                                {locale === "en"
                                    ? `Page ${page.toLocaleString(numberLocale)} of ${pageCount.toLocaleString(numberLocale)}`
                                    : `صفحه ${page.toLocaleString(numberLocale)} از ${pageCount.toLocaleString(numberLocale)}`}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                                disabled={page >= pageCount}
                            >
                                {t.next}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
