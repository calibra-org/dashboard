"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { type FormEvent, useMemo, useState } from "react";

import { MediaPicker } from "#/components/media-picker";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Textarea } from "#/components/ui/textarea";
import {
    ArrowRightLeft,
    ArrowStart,
    CheckCircle2,
    Clock3,
    MessageSquare,
    Paperclip,
    RefreshCw,
    Save,
    ShieldAlert,
    UserRound,
} from "#/icons";
import { formatDate } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useSettleMutation } from "#/lib/queries/use-settle-mutation";
import type { AdminMedia } from "#/lib/types";
import { cn } from "#/lib/utils";

import { ticketCopy } from "./copy";
import {
    useAddTicketAttachment,
    useAddTicketMessage,
    useMergeTicket,
    useTicket,
    useTicketAttachments,
    useTicketResources,
    useTransitionTicket,
    useUpdateTicket,
} from "./queries";
import type { Ticket, TicketPriority, TicketStatus } from "./types";

const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
    open: ["pending", "waiting_customer", "resolved", "closed"],
    pending: ["open", "waiting_customer", "resolved", "closed"],
    waiting_customer: ["open", "pending", "resolved", "closed"],
    resolved: ["open", "closed"],
    closed: ["open"],
};

function slaState(due: string | null, completed: string | null, locale: Locale) {
    const { text: t } = ticketCopy(locale);
    if (completed) return { label: t.completed, className: "text-success" };
    if (!due) return { label: t.noSla, className: "text-muted-foreground" };
    if (new Date(due).getTime() < Date.now()) return { label: t.slaBreached, className: "text-danger" };
    return { label: t.onTrack, className: "text-success" };
}

function TicketControls({ data, locale }: { data: Ticket; locale: Locale }) {
    const { text: t, statuses, priorities } = ticketCopy(locale);
    const transition = useTransitionTicket(data.id);
    const update = useUpdateTicket(data.id);
    const assignees = useTicketResources("assignees");

    const status = useSettleMutation<TicketStatus, unknown>({
        committedValue: data.status,
        mutate: (next) => transition.mutateAsync({ status: next, expected_version: data.version }),
    });
    const priority = useSettleMutation<TicketPriority, unknown>({
        committedValue: data.priority,
        mutate: (next) => update.mutateAsync({ priority: next, expected_version: data.version }),
    });
    const assignee = useSettleMutation<number | null, unknown>({
        committedValue: data.assigned_user_id,
        mutate: (next) => update.mutateAsync({ assigned_user_id: next, expected_version: data.version }),
    });

    const statusOptions = useMemo(() => [data.status, ...ALLOWED_TRANSITIONS[data.status]], [data.status]);
    const assigneeOptions = useMemo(() => {
        const options = [...(assignees.data ?? [])];
        if (data.assigned_user_id !== null && !options.some((item) => item.id === data.assigned_user_id) && data.assignee_email) {
            options.unshift({ id: data.assigned_user_id, label: data.assignee_email, email: data.assignee_email });
        }
        return options;
    }, [assignees.data, data.assigned_user_id, data.assignee_email]);

    const isSaving = status.isSaving || priority.isSaving || assignee.isSaving || update.isPending;
    const isDebouncing = status.isDebouncing || priority.isDebouncing || assignee.isDebouncing;
    const hasError = transition.isError || update.isError || assignees.isError;
    const metadataKey = `${data.category ?? ""}:${data.tags.join("\u0000")}`;

    async function saveMetadata(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const category = String(form.get("category") ?? "").trim() || null;
        const tags = String(form.get("tags") ?? "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 20);
        await update.mutateAsync({ category, tags, expected_version: data.version });
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base">{t.controls}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-1.5">
                    <label htmlFor="ticket-status" className="font-medium text-xs">
                        {t.status}
                    </label>
                    <Select
                        value={status.pending}
                        onValueChange={(value) => status.setPending(value as TicketStatus)}
                        disabled={isSaving || isDebouncing}
                    >
                        <SelectTrigger id="ticket-status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {statusOptions.map((value) => (
                                <SelectItem key={value} value={value}>
                                    {statuses[value]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="ticket-priority" className="font-medium text-xs">
                        {t.priority}
                    </label>
                    <Select
                        value={priority.pending}
                        onValueChange={(value) => priority.setPending(value as TicketPriority)}
                        disabled={isSaving || isDebouncing}
                    >
                        <SelectTrigger id="ticket-priority">
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
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="ticket-assignee" className="font-medium text-xs">
                        {t.assignee}
                    </label>
                    <Select
                        value={assignee.pending === null ? "unassigned" : String(assignee.pending)}
                        onValueChange={(value) => assignee.setPending(value === "unassigned" ? null : Number(value))}
                        disabled={isSaving || isDebouncing || assignees.isLoading}
                    >
                        <SelectTrigger id="ticket-assignee">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="unassigned">{t.unassigned}</SelectItem>
                            {assigneeOptions.map((item) => (
                                <SelectItem key={item.id} value={String(item.id)}>
                                    {item.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <form key={metadataKey} className="space-y-3 border-t pt-4" onSubmit={saveMetadata}>
                    <label className="block space-y-1.5">
                        <span className="font-medium text-xs">{t.category}</span>
                        <Input name="category" defaultValue={data.category ?? ""} maxLength={80} />
                    </label>
                    <label className="block space-y-1.5">
                        <span className="font-medium text-xs">Tags</span>
                        <Input name="tags" defaultValue={data.tags.join(", ")} maxLength={820} />
                    </label>
                    <Button type="submit" size="sm" variant="outline" disabled={isSaving || isDebouncing}>
                        <Save className="size-3.5" aria-hidden="true" />
                        {isSaving ? t.saving : locale === "en" ? "Save metadata" : "ذخیره جزئیات"}
                    </Button>
                </form>
                {isSaving || isDebouncing ? <p className="text-muted-foreground text-xs">{t.syncing}</p> : null}
                {hasError ? <p className="text-danger text-xs">{t.changeFailed}</p> : null}
            </CardContent>
        </Card>
    );
}

function TicketLoaded({
    data,
    locale,
    refetch,
    isFetching,
}: {
    data: Ticket;
    locale: Locale;
    refetch: () => void;
    isFetching: boolean;
}) {
    const { text: t } = ticketCopy(locale);
    const addMessage = useAddTicketMessage(data.id);
    const attachments = useTicketAttachments(data.id);
    const addAttachment = useAddTicketAttachment(data.id);
    const mergeTicket = useMergeTicket(data.id);
    const [messageKind, setMessageKind] = useState<"reply" | "internal_note">("reply");
    const [mediaOpen, setMediaOpen] = useState(false);
    const [selectedMedia, setSelectedMedia] = useState<AdminMedia[]>([]);
    const [mergeTargetId, setMergeTargetId] = useState(0);
    const mergeTarget = useTicket(mergeTargetId);
    const firstResponseSla = slaState(data.first_response_due_at, data.first_response_at, locale);
    const resolutionSla = slaState(data.resolution_due_at, data.resolved_at ?? data.closed_at, locale);

    async function handleMessage(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const body = String(form.get("body") ?? "").trim();
        if (!body) return;
        await addMessage.mutateAsync({ kind: messageKind, body, expected_version: data.version });
        event.currentTarget.reset();
    }

    async function attachSelectedMedia() {
        if (selectedMedia.length === 0) return;
        await Promise.all(selectedMedia.map((item) => addAttachment.mutateAsync({ media_id: item.id })));
        setSelectedMedia([]);
    }

    async function mergeDuplicate() {
        if (!mergeTarget.data || mergeTarget.data.id === data.id) return;
        await mergeTicket.mutateAsync({
            target_ticket_id: mergeTarget.data.id,
            expected_source_version: data.version,
            expected_target_version: mergeTarget.data.version,
            reason: locale === "en" ? "Merged by support operator" : "ادغام توسط کارشناس پشتیبانی",
        });
    }

    function messageLabel(kind: string) {
        if (kind === "requester_message") return t.requesterMessage;
        if (kind === "internal_note") return t.internalNote;
        if (kind === "reply") return t.operatorReply;
        return t.system;
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <Link
                        href={"/tickets/inbox" as never}
                        className="mb-2 inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
                    >
                        <ArrowStart className="size-3.5" aria-hidden="true" />
                        {t.back}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="font-semibold text-xl tracking-tight">{data.subject}</h1>
                        <Badge variant="outline">{data.reference}</Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground text-sm">
                        {data.requester_name} · {data.requester_phone ?? data.requester_email ?? t.noContact}
                    </p>
                </div>
                <Button variant="outline" onClick={refetch} disabled={isFetching}>
                    <RefreshCw className={cn("size-4", isFetching && "animate-spin")} aria-hidden="true" />
                    {t.refresh}
                </Button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.75fr)]">
                <div className="flex flex-col gap-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <MessageSquare className="size-4" aria-hidden="true" />
                                {t.conversation}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {(data.messages ?? []).map((message) => {
                                const requester = message.kind === "requester_message";
                                const internal = message.kind === "internal_note";
                                const author = requester ? data.requester_name : (message.author_email ?? t.system);
                                return (
                                    <div
                                        key={message.id}
                                        className={cn(
                                            "rounded-xl border p-4",
                                            internal && "border-warning/20 bg-warning/5",
                                            requester && "bg-muted/35",
                                        )}
                                    >
                                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        internal
                                                            ? "border-warning/20 bg-warning/10 text-warning"
                                                            : requester
                                                              ? "border-border bg-muted text-foreground"
                                                              : "border-primary/20 bg-primary/10 text-primary"
                                                    }
                                                >
                                                    {messageLabel(message.kind)}
                                                </Badge>
                                                <span className="text-muted-foreground text-xs">{author}</span>
                                            </div>
                                            <span className="text-muted-foreground text-xs">
                                                {formatDate(message.created_at, locale)}
                                            </span>
                                        </div>
                                        <p className="whitespace-pre-wrap text-sm leading-7">{message.body}</p>
                                    </div>
                                );
                            })}
                            {(data.messages ?? []).length === 0 ? (
                                <p className="py-8 text-center text-muted-foreground text-sm">{t.noMessages}</p>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Paperclip className="size-4" aria-hidden="true" />
                                    {locale === "en" ? "Evidence & attachments" : "مدارک و پیوست‌ها"}
                                </CardTitle>
                                <p className="mt-1 text-muted-foreground text-xs">
                                    {locale === "en"
                                        ? "Attachment metadata is linked to Media and scan state remains explicit."
                                        : "پیوست به Media متصل است و وضعیت اسکن امنیتی به‌صورت صریح نگه‌داری می‌شود."}
                                </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setMediaOpen(true)}>
                                <Paperclip className="size-3.5" aria-hidden="true" />
                                {locale === "en" ? "Add from Media" : "افزودن از رسانه"}
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {attachments.isLoading ? (
                                <Skeleton className="h-20 rounded-xl" />
                            ) : (attachments.data ?? []).length === 0 ? (
                                <div className="rounded-xl border border-dashed p-5 text-center text-muted-foreground text-xs">
                                    {locale === "en"
                                        ? "No attachment metadata is linked yet."
                                        : "هنوز پیوستی به این تیکت متصل نشده است."}
                                </div>
                            ) : (
                                (attachments.data ?? []).map((attachment) => (
                                    <div
                                        key={attachment.id}
                                        className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="min-w-0">
                                            <div className="truncate font-medium text-xs">{attachment.filename}</div>
                                            <div className="mt-1 text-[0.68rem] text-muted-foreground">
                                                {attachment.mime} · {(attachment.size_bytes / 1024).toFixed(1)} KB · Media #
                                                {attachment.media_id}
                                            </div>
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className={
                                                attachment.scan_status === "clean"
                                                    ? "border-success/20 bg-success/10 text-success"
                                                    : attachment.scan_status === "infected" || attachment.scan_status === "error"
                                                      ? "border-danger/20 bg-danger/10 text-danger"
                                                      : "border-warning/20 bg-warning/10 text-warning"
                                            }
                                        >
                                            {attachment.scan_status}
                                        </Badge>
                                    </div>
                                ))
                            )}
                            {selectedMedia.length > 0 ? (
                                <div className="rounded-xl border border-primary/15 bg-primary/[0.03] p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <span className="text-xs">
                                            {selectedMedia.length.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}{" "}
                                            {locale === "en" ? "media item(s) selected" : "رسانه انتخاب شده"}
                                        </span>
                                        <Button
                                            size="sm"
                                            onClick={() => void attachSelectedMedia()}
                                            disabled={addAttachment.isPending}
                                        >
                                            {locale === "en" ? "Link to ticket" : "اتصال به تیکت"}
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">{t.addResponse}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleMessage} className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={messageKind === "reply" ? "default" : "outline"}
                                        onClick={() => setMessageKind("reply")}
                                    >
                                        {t.publicReply}
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={messageKind === "internal_note" ? "default" : "outline"}
                                        onClick={() => setMessageKind("internal_note")}
                                    >
                                        {t.internalNote}
                                    </Button>
                                </div>
                                <Textarea
                                    name="body"
                                    required
                                    maxLength={20_000}
                                    className="min-h-32"
                                    placeholder={messageKind === "reply" ? t.replyPlaceholder : t.notePlaceholder}
                                />
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground text-xs">
                                        {t.ticketVersion}: {data.version.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}
                                    </span>
                                    <Button type="submit" disabled={addMessage.isPending}>
                                        {addMessage.isPending ? t.saving : t.addMessage}
                                    </Button>
                                </div>
                                {addMessage.isError ? <p className="text-danger text-xs">{t.messageFailed}</p> : null}
                            </form>
                        </CardContent>
                    </Card>
                </div>

                <div className="flex flex-col gap-4">
                    <TicketControls data={data} locale={locale} />
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Clock3 className="size-4" aria-hidden="true" />
                                SLA
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">{t.firstResponse}</span>
                                <span className={firstResponseSla.className}>{firstResponseSla.label}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">{t.resolution}</span>
                                <span className={resolutionSla.className}>{resolutionSla.label}</span>
                            </div>
                            {data.first_response_due_at ? (
                                <div className="text-muted-foreground text-xs">
                                    {t.responseDeadline}: {formatDate(data.first_response_due_at, locale)}
                                </div>
                            ) : null}
                            {data.resolution_due_at ? (
                                <div className="text-muted-foreground text-xs">
                                    {t.resolutionDeadline}: {formatDate(data.resolution_due_at, locale)}
                                </div>
                            ) : null}
                            <div className="border-t pt-3 text-muted-foreground text-xs">
                                {t.created}: {formatDate(data.created_at, locale)}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <UserRound className="size-4" aria-hidden="true" />
                                {t.context}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">{t.channel}</span>
                                <span>{data.channel}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">{t.category}</span>
                                <span>{data.category ?? "—"}</span>
                            </div>
                            {data.customer_id ? (
                                <Button variant="outline" size="sm" asChild>
                                    <Link href={`/customers/${data.customer_id}` as never}>{t.viewCustomer}</Link>
                                </Button>
                            ) : (
                                <p className="text-muted-foreground text-xs">{t.noLinkedCustomer}</p>
                            )}
                            {data.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {data.tags.map((tag) => (
                                        <Badge key={tag} variant="outline">
                                            {tag}
                                        </Badge>
                                    ))}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <ArrowRightLeft className="size-4" aria-hidden="true" />
                                {locale === "en" ? "Duplicate merge" : "ادغام تیکت تکراری"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-muted-foreground text-xs leading-5">
                                {locale === "en"
                                    ? "Enter the canonical target ticket ID. Both source and target versions are guarded before merge."
                                    : "شناسه تیکت مرجع را وارد کنید. نسخه مبدأ و مقصد قبل از ادغام کنترل می‌شود."}
                            </p>
                            <Input
                                type="number"
                                min={1}
                                value={mergeTargetId || ""}
                                onChange={(event) => setMergeTargetId(Number(event.target.value))}
                                placeholder={locale === "en" ? "Target ticket ID" : "شناسه تیکت مقصد"}
                                dir="ltr"
                            />
                            {mergeTargetId === data.id ? (
                                <p className="text-danger text-xs">
                                    {locale === "en"
                                        ? "A ticket cannot be merged into itself."
                                        : "تیکت را نمی‌توان در خودش ادغام کرد."}
                                </p>
                            ) : null}
                            {mergeTarget.data && mergeTarget.data.id !== data.id ? (
                                <div className="rounded-xl border p-3">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                                        <span className="font-medium text-xs">{mergeTarget.data.reference}</span>
                                    </div>
                                    <p className="mt-2 truncate text-muted-foreground text-xs">{mergeTarget.data.subject}</p>
                                </div>
                            ) : null}
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                disabled={!mergeTarget.data || mergeTarget.data.id === data.id || mergeTicket.isPending}
                                onClick={() => void mergeDuplicate()}
                            >
                                <ArrowRightLeft className="size-3.5" aria-hidden="true" />
                                {locale === "en" ? "Merge source into target" : "ادغام مبدأ در مقصد"}
                            </Button>
                            {mergeTicket.isError ? (
                                <p className="text-danger text-xs">
                                    {locale === "en"
                                        ? "Merge was rejected. Refresh both tickets and retry."
                                        : "ادغام رد شد؛ هر دو تیکت را تازه‌سازی و دوباره تلاش کنید."}
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">{t.history}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {(data.events ?? []).slice(0, 20).map((event) => (
                                <div key={event.id} className="border-s ps-3">
                                    <div className="font-medium text-xs">{event.event_type}</div>
                                    <div className="mt-1 text-[0.7rem] text-muted-foreground">
                                        {event.actor_email ?? t.system} · {formatDate(event.created_at, locale)}
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            </div>
            <MediaPicker
                open={mediaOpen}
                mode="multiple"
                value={selectedMedia.map((item) => item.id)}
                onOpenChange={setMediaOpen}
                onSelect={(selection) => setSelectedMedia(Array.isArray(selection) ? selection : [selection])}
            />
        </div>
    );
}

export function TicketDetail({ id }: { id: number }) {
    const locale = useLocale() as Locale;
    const { text: t } = ticketCopy(locale);
    const ticket = useTicket(id);

    if (ticket.isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-16" />
                <Skeleton className="h-72" />
                <Skeleton className="h-48" />
            </div>
        );
    }
    if (ticket.isError || !ticket.data) {
        return (
            <Card>
                <CardContent className="grid min-h-72 place-items-center text-center">
                    <div>
                        <ShieldAlert className="mx-auto mb-3 size-8 text-danger" aria-hidden="true" />
                        <p className="font-medium">{t.loadFailed}</p>
                        <Button className="mt-4" variant="outline" onClick={() => void ticket.refetch()}>
                            {t.retry}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }
    return (
        <TicketLoaded data={ticket.data} locale={locale} refetch={() => void ticket.refetch()} isFetching={ticket.isFetching} />
    );
}
