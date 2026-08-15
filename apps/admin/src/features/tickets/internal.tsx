"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Skeleton } from "#/components/ui/skeleton";
import { Textarea } from "#/components/ui/textarea";
import {
    Activity,
    BarChart3,
    CheckCircle2,
    Clock3,
    Megaphone,
    MessageSquare,
    Plus,
    Radio,
    Search,
    Send,
    Users,
} from "#/icons";
import { formatDate } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

import { ticketCopy } from "./copy";
import { useAddTicketMessage, useAgentPresence, useTicket, useTickets } from "./queries";
import {
    EmptySupportState,
    presenceStateLabel,
    SupportPageHeader,
    TicketPriorityBadge,
    TicketStatusBadge,
} from "./ui";

export function TicketInternalPage() {
    const locale = useLocale() as Locale;
    const { statuses, priorities } = ticketCopy(locale);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("all");
    const tickets = useTickets({ limit: 100, q: search || undefined });
    const presence = useAgentPresence();
    const allInternalTickets = useMemo(
        () => (tickets.data?.data ?? []).filter((ticket) => ticket.tags.includes("internal")),
        [tickets.data],
    );
    const categories = useMemo(
        () =>
            [...new Set(allInternalTickets.map((ticket) => ticket.category).filter((value): value is string => Boolean(value)))].sort(
                (left, right) => left.localeCompare(right),
            ),
        [allInternalTickets],
    );
    const internalTickets = useMemo(
        () =>
            category === "all"
                ? allInternalTickets
                : allInternalTickets.filter((ticket) => ticket.category === category),
        [allInternalTickets, category],
    );
    const [selectedId, setSelectedId] = useState(0);

    useEffect(() => {
        if (selectedId > 0 && internalTickets.some((ticket) => ticket.id === selectedId)) return;
        setSelectedId(internalTickets[0]?.id ?? 0);
    }, [internalTickets, selectedId]);

    const selected = useTicket(selectedId);
    const addNote = useAddTicketMessage(selectedId);
    const internalNotes = (selected.data?.messages ?? []).filter((message) => message.kind === "internal_note");
    const latestNote = internalNotes.at(-1) ?? null;
    const numberLocale = locale === "fa" ? "fa-IR" : "en-US";
    const online = (presence.data ?? []).filter((agent) => agent.effective_state !== "offline");
    const relatedTickets = useMemo(() => {
        if (!selected.data) return [];
        return allInternalTickets
            .filter(
                (ticket) =>
                    ticket.id !== selected.data?.id &&
                    ((selected.data.customer_id !== null && ticket.customer_id === selected.data.customer_id) ||
                        (selected.data.category !== null && ticket.category === selected.data.category)),
            )
            .slice(0, 5);
    }, [allInternalTickets, selected.data]);
    const contextChecks = selected.data
        ? [
              {
                  label: locale === "en" ? "Owner assigned" : "مسئول مشخص شده",
                  complete: Boolean(selected.data.assigned_user_id),
              },
              {
                  label: locale === "en" ? "Department set" : "دپارتمان مشخص شده",
                  complete: Boolean(selected.data.category),
              },
              {
                  label: locale === "en" ? "Operational tags present" : "برچسب عملیاتی ثبت شده",
                  complete: selected.data.tags.filter((tag) => tag !== "internal").length > 0,
              },
              {
                  label: locale === "en" ? "Private note recorded" : "یادداشت داخلی ثبت شده",
                  complete: internalNotes.length > 0,
              },
          ]
        : [];

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selected.data) return;
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const body = String(form.get("body") ?? "").trim();
        if (!body) return;
        await addNote.mutateAsync({ kind: "internal_note", body, expected_version: selected.data.version });
        formElement.reset();
    }

    return (
        <div className="flex flex-col gap-5">
            <SupportPageHeader
                eyebrow={locale === "en" ? "Back-office coordination" : "هماهنگی پشت‌صحنه"}
                title={locale === "en" ? "Internal conversations" : "گفت‌وگوهای داخلی"}
                subtitle={
                    locale === "en"
                        ? "A real operational workspace backed by internal-ticket records and private ticket notes. Nothing here is exposed through the public support portal."
                        : "فضای عملیاتی واقعی مبتنی بر تیکت‌های داخلی و یادداشت‌های خصوصی؛ این محتوا در پرتال عمومی پشتیبانی نمایش داده نمی‌شود."
                }
                icon={Users}
                actions={
                    <Button asChild>
                        <Link href={"/tickets/create" as never}>
                            <Plus className="size-4" aria-hidden="true" />
                            {locale === "en" ? "New internal ticket" : "گفت‌وگوی داخلی جدید"}
                        </Link>
                    </Button>
                }
            />

            <div className="grid min-h-[650px] gap-4 xl:grid-cols-[19rem_minmax(0,1fr)_19rem]">
                <Card className="overflow-hidden shadow-sm">
                    <CardHeader className="border-b pb-3">
                        <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-base">{locale === "en" ? "Conversations" : "گفت‌وگوها"}</CardTitle>
                            <Badge variant="secondary">{internalTickets.length.toLocaleString(numberLocale)}</Badge>
                        </div>
                        <div className="relative mt-3">
                            <Search
                                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <Input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                className="ps-9"
                                placeholder={locale === "en" ? "Search internal tickets" : "جستجو در گفت‌وگوهای داخلی"}
                            />
                        </div>
                        <div className="mt-2 overflow-x-auto pb-1">
                            <div className="flex min-w-max gap-1">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={category === "all" ? "default" : "ghost"}
                                    className="h-7 px-2 text-[0.68rem]"
                                    onClick={() => setCategory("all")}
                                >
                                    {locale === "en" ? "All" : "همه"}
                                </Button>
                                {categories.slice(0, 6).map((item) => (
                                    <Button
                                        key={item}
                                        type="button"
                                        size="sm"
                                        variant={category === item ? "default" : "ghost"}
                                        className="h-7 max-w-28 px-2 text-[0.68rem]"
                                        onClick={() => setCategory(item)}
                                    >
                                        <span className="truncate">{item}</span>
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-2">
                        {tickets.isLoading ? (
                            <div className="space-y-2 p-2">
                                {[1, 2, 3, 4, 5].map((key) => (
                                    <Skeleton key={key} className="h-16 rounded-xl" />
                                ))}
                            </div>
                        ) : internalTickets.length === 0 ? (
                            <div className="p-2">
                                <EmptySupportState
                                    title={locale === "en" ? "No internal conversation found" : "گفت‌وگوی داخلی پیدا نشد"}
                                    description={
                                        locale === "en"
                                            ? "Change the filter or create an internal ticket to start a private operational thread."
                                            : "فیلتر را تغییر دهید یا برای شروع رشته خصوصی عملیاتی، تیکت داخلی بسازید."
                                    }
                                />
                            </div>
                        ) : (
                            <ScrollArea className="h-[560px]">
                                <div className="space-y-1.5 p-1">
                                    {internalTickets.map((ticket) => (
                                        <button
                                            key={ticket.id}
                                            type="button"
                                            onClick={() => setSelectedId(ticket.id)}
                                            className={cn(
                                                "w-full rounded-xl border p-3 text-start transition-colors",
                                                selectedId === ticket.id
                                                    ? "border-primary/30 bg-primary/5 shadow-sm"
                                                    : "hover:border-primary/15 hover:bg-muted/40",
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="truncate font-medium text-xs">{ticket.subject}</div>
                                                    <div className="mt-1 truncate text-[0.66rem] text-muted-foreground">
                                                        {ticket.assignee_email ?? (locale === "en" ? "Unassigned" : "بدون مسئول")}
                                                    </div>
                                                </div>
                                                <TicketPriorityBadge
                                                    priority={ticket.priority}
                                                    label={priorities[ticket.priority]}
                                                />
                                            </div>
                                            <div className="mt-2 flex items-center justify-between gap-2 text-[0.64rem] text-muted-foreground">
                                                <span dir="ltr">{ticket.reference}</span>
                                                <span>{formatDate(ticket.last_message_at, locale)}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}
                    </CardContent>
                </Card>

                <Card className="flex min-w-0 flex-col overflow-hidden shadow-sm">
                    {selected.isLoading ? (
                        <CardContent className="space-y-3 p-5">
                            <Skeleton className="h-16" />
                            <Skeleton className="h-80" />
                        </CardContent>
                    ) : !selected.data ? (
                        <CardContent className="grid flex-1 place-items-center">
                            <EmptySupportState
                                title={locale === "en" ? "Select an internal conversation" : "یک گفت‌وگوی داخلی را انتخاب کنید"}
                            />
                        </CardContent>
                    ) : (
                        <>
                            <CardHeader className="border-b">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <CardTitle className="truncate text-base">{selected.data.subject}</CardTitle>
                                            <TicketStatusBadge
                                                status={selected.data.status}
                                                label={statuses[selected.data.status]}
                                            />
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.68rem] text-muted-foreground">
                                            <span dir="ltr">{selected.data.reference}</span>
                                            <span>·</span>
                                            <span>
                                                {selected.data.category ?? (locale === "en" ? "No department" : "بدون دپارتمان")}
                                            </span>
                                        </div>
                                    </div>
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href={`/tickets/inbox/${selected.data.id}` as never}>
                                            {locale === "en" ? "Full ticket" : "نمای کامل تیکت"}
                                        </Link>
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                                {latestNote ? (
                                    <div className="border-b bg-primary/[0.025] p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 text-primary text-xs font-medium">
                                                <MessageSquare className="size-3.5" aria-hidden="true" />
                                                {locale === "en" ? "Latest private note" : "آخرین یادداشت داخلی"}
                                            </div>
                                            <span className="text-[0.64rem] text-muted-foreground">
                                                {formatDate(latestNote.created_at, locale)}
                                            </span>
                                        </div>
                                        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-6">{latestNote.body}</p>
                                    </div>
                                ) : null}
                                <ScrollArea className="h-[420px] flex-1 p-5">
                                    <div className="space-y-4">
                                        {internalNotes.length === 0 ? (
                                            <EmptySupportState
                                                title={locale === "en" ? "No private note yet" : "هنوز یادداشت داخلی ثبت نشده"}
                                            />
                                        ) : (
                                            internalNotes.map((message) => (
                                                <div key={message.id} className="flex gap-3">
                                                    <Avatar className="size-8 shrink-0">
                                                        <AvatarFallback>
                                                            {(message.author_email ?? "OP").slice(0, 2).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0 flex-1 rounded-2xl rounded-ss-sm border bg-muted/25 p-3">
                                                        <div className="flex items-center justify-between gap-3 text-[0.66rem]">
                                                            <span className="font-medium">
                                                                {message.author_email ??
                                                                    (locale === "en" ? "Operator" : "اپراتور")}
                                                            </span>
                                                            <span className="text-muted-foreground">
                                                                {formatDate(message.created_at, locale)}
                                                            </span>
                                                        </div>
                                                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </ScrollArea>
                                <form onSubmit={submit} className="border-t p-4">
                                    <Textarea
                                        name="body"
                                        required
                                        maxLength={20_000}
                                        className="min-h-24 resize-y leading-6"
                                        placeholder={
                                            locale === "en"
                                                ? "Write a private operational note…"
                                                : "یادداشت خصوصی برای تیم بنویسید…"
                                        }
                                    />
                                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <span className="text-[0.68rem] text-muted-foreground">
                                            {locale === "en"
                                                ? `Ticket version ${selected.data.version}`
                                                : `نسخه تیکت ${selected.data.version.toLocaleString(numberLocale)}`}
                                        </span>
                                        <Button type="submit" size="sm" disabled={addNote.isPending}>
                                            <Send className="size-3.5" aria-hidden="true" />
                                            {addNote.isPending
                                                ? locale === "en"
                                                    ? "Sending…"
                                                    : "در حال ثبت…"
                                                : locale === "en"
                                                  ? "Add private note"
                                                  : "ثبت یادداشت داخلی"}
                                        </Button>
                                    </div>
                                    {addNote.isError ? (
                                        <p className="mt-2 text-danger text-xs">
                                            {locale === "en"
                                                ? "The note was not saved; refresh to resolve a possible version conflict."
                                                : "یادداشت ذخیره نشد؛ برای رفع احتمال تداخل نسخه، تیکت را تازه‌سازی کنید."}
                                        </p>
                                    ) : null}
                                </form>
                            </CardContent>
                        </>
                    )}
                </Card>

                <div className="space-y-4">
                    <Card className="shadow-sm">
                        <CardHeader className="flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-base">{locale === "en" ? "Online members" : "اعضای آنلاین"}</CardTitle>
                            <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {presence.isLoading ? (
                                [1, 2, 3].map((key) => <Skeleton key={key} className="h-12" />)
                            ) : online.length === 0 ? (
                                <p className="py-5 text-center text-muted-foreground text-xs">
                                    {locale === "en" ? "No fresh presence heartbeat." : "حضور آنلاین تازه‌ای ثبت نشده."}
                                </p>
                            ) : (
                                online.slice(0, 8).map((agent) => (
                                    <div key={agent.user_id} className="flex items-center gap-3 rounded-lg border p-2.5">
                                        <span
                                            className={cn(
                                                "size-2.5 rounded-full",
                                                agent.effective_state === "available"
                                                    ? "bg-success"
                                                    : agent.effective_state === "busy"
                                                      ? "bg-warning"
                                                      : "bg-muted-foreground",
                                            )}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium text-xs">
                                                {agent.email ?? `#${agent.user_id}`}
                                            </div>
                                            <div className="mt-1 flex items-center justify-between gap-2 text-[0.65rem] text-muted-foreground">
                                                <span>{presenceStateLabel(agent.effective_state, locale)}</span>
                                                <span>
                                                    {agent.active_count.toLocaleString(numberLocale)} /{" "}
                                                    {agent.capacity.toLocaleString(numberLocale)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">
                                {locale === "en" ? "Conversation details" : "جزئیات گفت‌وگو"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-xs">
                            {selected.data ? (
                                <>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-muted-foreground">{locale === "en" ? "Owner" : "مسئول"}</span>
                                        <span className="truncate">{selected.data.assignee_email ?? "—"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-muted-foreground">
                                            {locale === "en" ? "Department" : "دپارتمان"}
                                        </span>
                                        <span>{selected.data.category ?? "—"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-muted-foreground">
                                            {locale === "en" ? "Private notes" : "یادداشت داخلی"}
                                        </span>
                                        <span>{internalNotes.length.toLocaleString(numberLocale)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-muted-foreground">
                                            {locale === "en" ? "Last activity" : "آخرین فعالیت"}
                                        </span>
                                        <span>{formatDate(selected.data.last_message_at, locale)}</span>
                                    </div>
                                </>
                            ) : (
                                <p className="text-muted-foreground">—</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <CheckCircle2 className="size-4" aria-hidden="true" />
                                {locale === "en" ? "Context checklist" : "چک‌لیست زمینه گفت‌وگو"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {contextChecks.length === 0 ? (
                                <p className="text-muted-foreground text-xs">—</p>
                            ) : (
                                contextChecks.map((item) => (
                                    <div key={item.label} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
                                        <span
                                            className={cn(
                                                "grid size-5 shrink-0 place-items-center rounded-full border",
                                                item.complete
                                                    ? "border-success/20 bg-success/10 text-success"
                                                    : "border-border bg-muted text-muted-foreground",
                                            )}
                                        >
                                            {item.complete ? "✓" : "·"}
                                        </span>
                                        <span>{item.label}</span>
                                    </div>
                                ))
                            )}
                            <p className="pt-1 text-[0.64rem] text-muted-foreground leading-5">
                                {locale === "en"
                                    ? "This checklist reflects existing ticket context; it is not a separate task system."
                                    : "این چک‌لیست از اطلاعات واقعی خود تیکت ساخته می‌شود و سیستم وظایف جداگانه نیست."}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <MessageSquare className="size-4" aria-hidden="true" />
                                {locale === "en" ? "Related conversations" : "گفت‌وگوهای مرتبط"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {relatedTickets.length === 0 ? (
                                <p className="py-3 text-center text-muted-foreground text-xs">
                                    {locale === "en" ? "No related internal thread in the current queue." : "گفت‌وگوی داخلی مرتبطی در صف فعلی نیست."}
                                </p>
                            ) : (
                                relatedTickets.map((ticket) => (
                                    <button
                                        key={ticket.id}
                                        type="button"
                                        onClick={() => setSelectedId(ticket.id)}
                                        className="w-full rounded-lg border px-3 py-2 text-start transition-colors hover:bg-muted/35"
                                    >
                                        <div className="truncate font-medium text-xs">{ticket.subject}</div>
                                        <div className="mt-1 flex items-center justify-between gap-2 text-[0.63rem] text-muted-foreground">
                                            <span dir="ltr">{ticket.reference}</span>
                                            <span>{ticket.category ?? "—"}</span>
                                        </div>
                                    </button>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Activity className="size-4" aria-hidden="true" />
                                {locale === "en" ? "Recent activity" : "فعالیت اخیر"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {(selected.data?.events ?? []).slice(0, 6).map((event) => (
                                <div key={event.id} className="border-s ps-3">
                                    <div className="font-medium text-[0.68rem]" dir="ltr">
                                        {event.event_type}
                                    </div>
                                    <div className="mt-1 text-[0.62rem] text-muted-foreground">
                                        {formatDate(event.created_at, locale)}
                                    </div>
                                </div>
                            ))}
                            {(selected.data?.events ?? []).length === 0 ? (
                                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                    <Clock3 className="size-3.5" aria-hidden="true" />
                                    {locale === "en" ? "No event recorded." : "رویدادی ثبت نشده است."}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">{locale === "en" ? "Quick channels" : "کانال‌های سریع"}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-2">
                            <Button variant="outline" size="sm" asChild>
                                <Link href={"/tickets/inbox" as never}>
                                    <MessageSquare className="size-3.5" aria-hidden="true" />
                                    {locale === "en" ? "Inbox" : "صندوق"}
                                </Link>
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                                <Link href={"/tickets/channels" as never}>
                                    <Radio className="size-3.5" aria-hidden="true" />
                                    {locale === "en" ? "Channels" : "پیام‌رسان‌ها"}
                                </Link>
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                                <Link href={"/tickets/campaigns" as never}>
                                    <Megaphone className="size-3.5" aria-hidden="true" />
                                    {locale === "en" ? "Campaigns" : "کمپین"}
                                </Link>
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                                <Link href={"/tickets/reports" as never}>
                                    <BarChart3 className="size-3.5" aria-hidden="true" />
                                    {locale === "en" ? "Reports" : "گزارش"}
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
