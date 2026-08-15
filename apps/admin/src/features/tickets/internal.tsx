"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Skeleton } from "#/components/ui/skeleton";
import { Textarea } from "#/components/ui/textarea";
import { Activity, Clock3, Plus, Search, Send, Users } from "#/icons";
import { formatDate } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";

import { ticketCopy } from "./copy";
import { useAddTicketMessage, useAgentPresence, useTicket, useTickets } from "./queries";
import { EmptySupportState, SupportPageHeader, TicketPriorityBadge, TicketStatusBadge } from "./ui";

export function TicketInternalPage() {
    const locale = useLocale() as Locale;
    const { statuses, priorities } = ticketCopy(locale);
    const [search, setSearch] = useState("");
    const tickets = useTickets({ limit: 100, q: search || undefined });
    const presence = useAgentPresence();
    const internalTickets = useMemo(
        () => (tickets.data?.data ?? []).filter((ticket) => ticket.tags.includes("internal")),
        [tickets.data],
    );
    const [selectedId, setSelectedId] = useState(0);

    useEffect(() => {
        if (selectedId > 0 && internalTickets.some((ticket) => ticket.id === selectedId)) return;
        setSelectedId(internalTickets[0]?.id ?? 0);
    }, [internalTickets, selectedId]);

    const selected = useTicket(selectedId);
    const addNote = useAddTicketMessage(selectedId);
    const internalNotes = (selected.data?.messages ?? []).filter((message) => message.kind === "internal_note");
    const numberLocale = locale === "fa" ? "fa-IR" : "en-US";
    const online = (presence.data ?? []).filter((agent) => agent.effective_state !== "offline");

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selected.data) return;
        const form = new FormData(event.currentTarget);
        const body = String(form.get("body") ?? "").trim();
        if (!body) return;
        await addNote.mutateAsync({ kind: "internal_note", body, expected_version: selected.data.version });
        event.currentTarget.reset();
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
                        <CardTitle className="text-base">{locale === "en" ? "Conversations" : "گفت‌وگوها"}</CardTitle>
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
                                    title={locale === "en" ? "No internal conversation yet" : "گفت‌وگوی داخلی هنوز ثبت نشده"}
                                    description={
                                        locale === "en"
                                            ? "Create an internal ticket to start a private operational thread."
                                            : "برای شروع یک رشته خصوصی عملیاتی، تیکت داخلی بسازید."
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
                                            className={`w-full rounded-xl border p-3 text-start transition-colors ${selectedId === ticket.id ? "border-primary/30 bg-primary/5" : "hover:bg-muted/40"}`}
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
                                                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                                                            {message.body}
                                                        </p>
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
                                        className="min-h-24"
                                        placeholder={
                                            locale === "en"
                                                ? "Write a private operational note…"
                                                : "یادداشت خصوصی برای تیم بنویسید…"
                                        }
                                    />
                                    <div className="mt-3 flex items-center justify-between gap-3">
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
                                            className={`size-2.5 rounded-full ${agent.effective_state === "available" ? "bg-success" : agent.effective_state === "busy" ? "bg-warning" : "bg-muted-foreground"}`}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium text-xs">
                                                {agent.email ?? `#${agent.user_id}`}
                                            </div>
                                            <div className="mt-1 text-[0.65rem] text-muted-foreground">
                                                {agent.active_count.toLocaleString(numberLocale)} /{" "}
                                                {agent.capacity.toLocaleString(numberLocale)}
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
                                <Activity className="size-4" aria-hidden="true" />
                                {locale === "en" ? "Recent activity" : "فعالیت اخیر"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {(selected.data?.events ?? []).slice(0, 6).map((event) => (
                                <div key={event.id} className="border-s ps-3">
                                    <div className="font-medium text-[0.68rem]">{event.event_type}</div>
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
                </div>
            </div>
        </div>
    );
}
