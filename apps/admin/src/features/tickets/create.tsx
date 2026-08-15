"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { type FormEvent, useDeferredValue, useMemo, useState } from "react";

import { MediaPicker } from "#/components/media-picker";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import {
    CheckCircle2,
    ContactRound,
    FileText,
    MessageSquare,
    Paperclip,
    RefreshCw,
    Search,
    ShieldCheck,
    UserRound,
    Users,
} from "#/icons";
import { Link } from "#/lib/i18n/navigation";
import type { AdminMedia } from "#/lib/types";
import { cn } from "#/lib/utils";

import { ticketCopy } from "./copy";
import { useAttachMediaToTicket, useCreateTicket, useTicketResources } from "./queries";
import { SupportPageHeader, TicketPriorityBadge, ticketChannelLabel } from "./ui";
import type { TicketChannel, TicketPriority, TicketResource } from "./types";

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

function CustomerSuggestion({ customer, onSelect }: { customer: TicketResource; onSelect: (customer: TicketResource) => void }) {
    return (
        <button
            type="button"
            onClick={() => onSelect(customer)}
            className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors hover:border-primary/20 hover:bg-muted/40"
        >
            <div className="min-w-0">
                <div className="truncate font-medium text-xs">{customer.label}</div>
                <div className="mt-1 truncate text-[0.68rem] text-muted-foreground" dir="auto">
                    {customer.phone ?? customer.email ?? `#${customer.id}`}
                </div>
            </div>
            <Badge variant="outline" className="shrink-0">
                #{customer.id}
            </Badge>
        </button>
    );
}

export function TicketCreatePage() {
    const locale = useLocale() as Locale;
    const { priorities } = ticketCopy(locale);
    const [mode, setMode] = useState<"customer" | "internal">("customer");
    const [customerQuery, setCustomerQuery] = useState("");
    const [selectedCustomer, setSelectedCustomer] = useState<TicketResource | null>(null);
    const [requesterName, setRequesterName] = useState("");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [priority, setPriority] = useState<TicketPriority>("normal");
    const [channel, setChannel] = useState<TicketChannel>("admin");
    const [assignee, setAssignee] = useState("default");
    const [mediaOpen, setMediaOpen] = useState(false);
    const [media, setMedia] = useState<AdminMedia[]>([]);
    const [createdTicket, setCreatedTicket] = useState<{ id: number; reference: string } | null>(null);
    const [attachmentWarning, setAttachmentWarning] = useState(false);
    const deferredCustomerQuery = useDeferredValue(customerQuery.trim());
    const customers = useTicketResources("customers", deferredCustomerQuery);
    const assignees = useTicketResources("assignees");
    const createTicket = useCreateTicket();
    const attach = useAttachMediaToTicket();
    const customerSuggestions = useMemo(() => (customers.data ?? []).slice(0, 5), [customers.data]);
    const numberLocale = locale === "fa" ? "fa-IR" : "en-US";

    function selectCustomer(customer: TicketResource) {
        setSelectedCustomer(customer);
        setRequesterName(customer.label);
        setCustomerQuery("");
    }

    function resetDraft() {
        setMode("customer");
        setCustomerQuery("");
        setSelectedCustomer(null);
        setRequesterName("");
        setSubject("");
        setMessage("");
        setPriority("normal");
        setChannel("admin");
        setAssignee("default");
        setMedia([]);
        setCreatedTicket(null);
        setAttachmentWarning(false);
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setCreatedTicket(null);
        setAttachmentWarning(false);
        const form = new FormData(event.currentTarget);
        const tags = String(form.get("tags") ?? "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 19);
        if (mode === "internal" && !tags.includes("internal")) tags.unshift("internal");
        const assignedUserId = assignee === "default" ? undefined : assignee === "unassigned" ? null : Number(assignee);
        const result = await createTicket.mutateAsync({
            customer_id: mode === "customer" ? (selectedCustomer?.id ?? null) : null,
            requester_name: requesterName.trim(),
            requester_email: mode === "customer" ? String(form.get("requester_email") ?? "").trim() || null : null,
            requester_phone: mode === "customer" ? String(form.get("requester_phone") ?? "").trim() || null : null,
            subject: subject.trim(),
            message: message.trim(),
            priority,
            channel,
            category: String(form.get("category") ?? "").trim() || null,
            tags,
            assigned_user_id: assignedUserId,
        });
        const ticket = result.data;
        if (media.length > 0) {
            const attachments = await Promise.allSettled(
                media.map((item) => attach.mutateAsync({ ticket_id: ticket.id, media_id: item.id })),
            );
            setAttachmentWarning(attachments.some((item) => item.status === "rejected"));
        }
        setCreatedTicket({ id: ticket.id, reference: ticket.reference });
    }

    return (
        <div className="flex flex-col gap-5">
            <SupportPageHeader
                eyebrow={locale === "en" ? "Ticket intake" : "ورودی پشتیبانی"}
                title={locale === "en" ? "Create support ticket" : "ثبت تیکت پشتیبانی"}
                subtitle={
                    locale === "en"
                        ? "Create a customer-facing or internal operational ticket, assign ownership, choose the real source channel, and attach media through the existing media library."
                        : "تیکت مشتری یا تیکت داخلی عملیاتی را با مسئول، اولویت، کانال واقعی و پیوست از کتابخانه رسانه ثبت کنید."
                }
                icon={FileText}
                actions={
                    <Button variant="outline" asChild>
                        <Link href={"/tickets/inbox" as never}>{locale === "en" ? "Open inbox" : "رفتن به صندوق"}</Link>
                    </Button>
                }
            />

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(19rem,0.65fr)]">
                <div className="min-w-0 space-y-4">
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">{locale === "en" ? "Ticket type" : "نوع تیکت"}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => setMode("customer")}
                                className={cn(
                                    "relative rounded-xl border p-4 text-start transition-all",
                                    mode === "customer"
                                        ? "border-primary/40 bg-primary/5 shadow-sm"
                                        : "hover:border-primary/20 hover:bg-muted/35",
                                )}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                                        <UserRound className="size-5" aria-hidden="true" />
                                    </span>
                                    {mode === "customer" ? (
                                        <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                                    ) : null}
                                </div>
                                <div className="mt-4 font-medium text-sm">
                                    {locale === "en" ? "Customer ticket" : "تیکت مشتری"}
                                </div>
                                <p className="mt-1 text-muted-foreground text-xs leading-5">
                                    {locale === "en"
                                        ? "For a request that should stay linked to a customer and contact channel."
                                        : "برای درخواست مشتری با امکان اتصال به پروفایل و اطلاعات تماس."}
                                </p>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setMode("internal");
                                    setSelectedCustomer(null);
                                    setChannel("admin");
                                }}
                                className={cn(
                                    "relative rounded-xl border p-4 text-start transition-all",
                                    mode === "internal"
                                        ? "border-primary/40 bg-primary/5 shadow-sm"
                                        : "hover:border-primary/20 hover:bg-muted/35",
                                )}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <span className="grid size-10 place-items-center rounded-xl bg-muted text-foreground">
                                        <Users className="size-5" aria-hidden="true" />
                                    </span>
                                    {mode === "internal" ? (
                                        <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                                    ) : null}
                                </div>
                                <div className="mt-4 font-medium text-sm">
                                    {locale === "en" ? "Internal ticket" : "تیکت داخلی"}
                                </div>
                                <p className="mt-1 text-muted-foreground text-xs leading-5">
                                    {locale === "en"
                                        ? "For back-office coordination. It stays private and is tagged internal."
                                        : "برای هماهنگی پشت‌صحنه؛ خصوصی می‌ماند و با برچسب داخلی ثبت می‌شود."}
                                </p>
                            </button>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">{locale === "en" ? "Ticket details" : "اطلاعات تیکت"}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                                {mode === "customer" ? (
                                    <div className="space-y-3 sm:col-span-2">
                                        <label className="space-y-1.5 text-xs">
                                            <span className="font-medium">
                                                {locale === "en" ? "Find customer" : "جستجوی مشتری"}
                                            </span>
                                            <div className="relative">
                                                <Search
                                                    className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                                    aria-hidden="true"
                                                />
                                                <Input
                                                    value={customerQuery}
                                                    onChange={(event) => setCustomerQuery(event.target.value)}
                                                    className="ps-9"
                                                    placeholder={
                                                        locale === "en"
                                                            ? "Search name, phone, or email"
                                                            : "نام، موبایل یا ایمیل را جستجو کنید"
                                                    }
                                                />
                                            </div>
                                        </label>
                                        {selectedCustomer ? (
                                            <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="min-w-0">
                                                    <div className="truncate font-medium text-xs">{selectedCustomer.label}</div>
                                                    <div
                                                        className="mt-1 truncate text-[0.68rem] text-muted-foreground"
                                                        dir="auto"
                                                    >
                                                        {selectedCustomer.phone ??
                                                            selectedCustomer.email ??
                                                            `#${selectedCustomer.id}`}
                                                    </div>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setSelectedCustomer(null)}
                                                >
                                                    {locale === "en" ? "Clear selection" : "حذف انتخاب"}
                                                </Button>
                                            </div>
                                        ) : deferredCustomerQuery.length > 0 && customerSuggestions.length > 0 ? (
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                {customerSuggestions.map((customer) => (
                                                    <CustomerSuggestion
                                                        key={customer.id}
                                                        customer={customer}
                                                        onSelect={selectCustomer}
                                                    />
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}

                                <label className="space-y-1.5 text-xs">
                                    <span className="font-medium">
                                        {mode === "internal"
                                            ? locale === "en"
                                                ? "Internal requester / team"
                                                : "درخواست‌کننده / تیم داخلی"
                                            : locale === "en"
                                              ? "Requester name"
                                              : "نام مشتری"}
                                    </span>
                                    <Input
                                        name="requester_name"
                                        required
                                        maxLength={180}
                                        value={requesterName}
                                        onChange={(event) => setRequesterName(event.target.value)}
                                        placeholder={
                                            mode === "internal"
                                                ? locale === "en"
                                                    ? "Support operations"
                                                    : "مثلاً تیم عملیات"
                                                : undefined
                                        }
                                    />
                                </label>
                                {mode === "customer" ? (
                                    <>
                                        <label className="space-y-1.5 text-xs">
                                            <span className="font-medium">{locale === "en" ? "Mobile" : "شماره موبایل"}</span>
                                            <Input name="requester_phone" maxLength={32} dir="ltr" inputMode="tel" />
                                        </label>
                                        <label className="space-y-1.5 text-xs">
                                            <span className="font-medium">{locale === "en" ? "Email" : "ایمیل"}</span>
                                            <Input name="requester_email" type="email" maxLength={254} dir="ltr" />
                                        </label>
                                    </>
                                ) : null}
                                <label className="space-y-1.5 text-xs">
                                    <span className="font-medium">
                                        {locale === "en" ? "Category / department" : "دسته / دپارتمان"}
                                    </span>
                                    <Input
                                        name="category"
                                        maxLength={80}
                                        placeholder={locale === "en" ? "Payments, shipping, warehouse…" : "پرداخت، ارسال، انبار…"}
                                    />
                                </label>

                                <div className="space-y-2 sm:col-span-2">
                                    <div>
                                        <div className="font-medium text-xs">{locale === "en" ? "Priority" : "اولویت"}</div>
                                        <p className="mt-1 text-[0.68rem] text-muted-foreground">
                                            {locale === "en"
                                                ? "Choose the operational urgency explicitly."
                                                : "سطح فوریت عملیاتی را مشخص کنید."}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                        {(Object.entries(priorities) as Array<[TicketPriority, string]>).map(([value, label]) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => setPriority(value)}
                                                className={cn(
                                                    "flex min-h-14 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-start transition-colors",
                                                    priority === value ? "border-primary/35 bg-primary/5" : "hover:bg-muted/35",
                                                )}
                                            >
                                                <span className="text-xs">{label}</span>
                                                <TicketPriorityBadge priority={value} label={priority === value ? "✓" : "·"} />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2 sm:col-span-2">
                                    <div>
                                        <div className="font-medium text-xs">
                                            {locale === "en" ? "Source / reply channel" : "کانال ثبت / پاسخ"}
                                        </div>
                                        <p className="mt-1 text-[0.68rem] text-muted-foreground">
                                            {locale === "en"
                                                ? "Record the channel the request actually came from."
                                                : "کانالی را انتخاب کنید که درخواست واقعاً از آن وارد شده است."}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                                        {CHANNELS.map((value) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => setChannel(value)}
                                                className={cn(
                                                    "min-h-10 rounded-lg border px-3 py-2 text-xs transition-colors",
                                                    channel === value
                                                        ? "border-primary/35 bg-primary text-primary-foreground shadow-sm"
                                                        : "bg-card hover:border-primary/20 hover:bg-muted/40",
                                                )}
                                            >
                                                {ticketChannelLabel(value, locale)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <label className="space-y-1.5 text-xs sm:col-span-2 lg:col-span-1">
                                    <span className="font-medium">{locale === "en" ? "Assignee" : "پشتیبان مسئول"}</span>
                                    <Select
                                        value={assignee}
                                        onValueChange={(value) => setAssignee(typeof value === "string" ? value : "default")}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="default">
                                                {locale === "en" ? "Default routing" : "ارجاع پیش‌فرض"}
                                            </SelectItem>
                                            <SelectItem value="unassigned">
                                                {locale === "en" ? "Unassigned" : "بدون مسئول"}
                                            </SelectItem>
                                            {(assignees.data ?? []).map((item) => (
                                                <SelectItem key={item.id} value={String(item.id)}>
                                                    {item.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </label>
                                <label className="space-y-1.5 text-xs sm:col-span-2 lg:col-span-1">
                                    <span className="font-medium">{locale === "en" ? "Tags" : "برچسب‌ها"}</span>
                                    <Input
                                        name="tags"
                                        maxLength={820}
                                        placeholder={locale === "en" ? "vip, payment, follow-up" : "VIP، پرداخت، پیگیری"}
                                    />
                                </label>
                                <label className="space-y-1.5 text-xs sm:col-span-2">
                                    <span className="font-medium">{locale === "en" ? "Subject" : "موضوع تیکت"}</span>
                                    <Input
                                        name="subject"
                                        required
                                        minLength={2}
                                        maxLength={255}
                                        value={subject}
                                        onChange={(event) => setSubject(event.target.value)}
                                        placeholder={locale === "en" ? "A clear one-line summary" : "خلاصه روشن و کوتاه از مسئله"}
                                    />
                                </label>
                                <label className="space-y-1.5 text-xs sm:col-span-2">
                                    <span className="font-medium">{locale === "en" ? "Message" : "متن پیام / شرح درخواست"}</span>
                                    <Textarea
                                        name="message"
                                        required
                                        minLength={1}
                                        maxLength={20_000}
                                        className="min-h-40 resize-y leading-7"
                                        value={message}
                                        onChange={(event) => setMessage(event.target.value)}
                                        placeholder={
                                            locale === "en"
                                                ? "Describe the issue, expected outcome, and any relevant evidence…"
                                                : "مسئله، نتیجه مورد انتظار و هر مدرک یا جزئیات مرتبط را بنویسید…"
                                        }
                                    />
                                </label>

                                <div className="space-y-2 sm:col-span-2">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <div className="font-medium text-xs">
                                                {locale === "en" ? "Attachments" : "پیوست‌ها"}
                                            </div>
                                            <div className="mt-1 text-[0.68rem] text-muted-foreground leading-5">
                                                {locale === "en"
                                                    ? "Choose or upload files through Media; scan metadata remains enforceable after linking."
                                                    : "فایل را از کتابخانه رسانه انتخاب یا بارگذاری کنید؛ متادیتای اسکن امنیتی بعد از اتصال قابل کنترل می‌ماند."}
                                            </div>
                                        </div>
                                        <Button type="button" variant="outline" size="sm" onClick={() => setMediaOpen(true)}>
                                            <Paperclip className="size-3.5" aria-hidden="true" />
                                            {locale === "en" ? "Add file" : "افزودن فایل"}
                                        </Button>
                                    </div>
                                    {media.length > 0 ? (
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {media.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                                                >
                                                    <span className="min-w-0 truncate" dir="auto">
                                                        {item.filename}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="shrink-0 text-muted-foreground hover:text-danger"
                                                        onClick={() =>
                                                            setMedia((current) => current.filter((row) => row.id !== item.id))
                                                        }
                                                    >
                                                        {locale === "en" ? "Remove" : "حذف"}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-dashed bg-muted/10 p-5 text-center text-muted-foreground text-xs">
                                            {locale === "en" ? "No attachment selected" : "پیوستی انتخاب نشده است"}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:col-span-2 sm:flex-row sm:items-center sm:justify-end">
                                    <Button type="button" variant="outline" onClick={resetDraft}>
                                        <RefreshCw className="size-4" aria-hidden="true" />
                                        {locale === "en" ? "Clear form" : "پاک‌کردن فرم"}
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={
                                            createTicket.isPending ||
                                            attach.isPending ||
                                            !requesterName.trim() ||
                                            !subject.trim() ||
                                            !message.trim()
                                        }
                                    >
                                        <MessageSquare className="size-4" aria-hidden="true" />
                                        {createTicket.isPending
                                            ? locale === "en"
                                                ? "Creating…"
                                                : "در حال ثبت…"
                                            : mode === "internal"
                                              ? locale === "en"
                                                  ? "Create internal ticket"
                                                  : "ثبت تیکت داخلی"
                                              : locale === "en"
                                                ? "Create and send"
                                                : "ثبت و ارسال"}
                                    </Button>
                                </div>
                                {createTicket.isError ? (
                                    <p className="text-danger text-xs sm:col-span-2">
                                        {locale === "en"
                                            ? "Ticket creation failed. Validate the fields and retry."
                                            : "ثبت تیکت ناموفق بود؛ ورودی‌ها را بررسی و دوباره تلاش کنید."}
                                    </p>
                                ) : null}
                                {createdTicket ? (
                                    <div className="rounded-xl border border-success/20 bg-success/5 p-4 sm:col-span-2">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 font-medium text-sm text-success">
                                                    <CheckCircle2 className="size-4" aria-hidden="true" />
                                                    {locale === "en" ? "Ticket created" : "تیکت با موفقیت ثبت شد"}
                                                </div>
                                                <div className="mt-1 text-muted-foreground text-xs" dir="ltr">
                                                    {createdTicket.reference}
                                                </div>
                                                {attachmentWarning ? (
                                                    <p className="mt-2 text-warning text-xs">
                                                        {locale === "en"
                                                            ? "The ticket was created, but one or more attachments could not be linked."
                                                            : "تیکت ثبت شد، اما اتصال یک یا چند پیوست کامل نشد."}
                                                    </p>
                                                ) : null}
                                            </div>
                                            <Button variant="outline" size="sm" asChild>
                                                <Link href={`/tickets/inbox/${createdTicket.id}` as never}>
                                                    {locale === "en" ? "Open ticket" : "باز کردن تیکت"}
                                                </Link>
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
                            </form>
                        </CardContent>
                    </Card>
                </div>

                <aside className="min-w-0 space-y-4 xl:sticky xl:top-4">
                    <Card className="overflow-hidden shadow-sm">
                        <CardHeader className="border-b bg-muted/15">
                            <CardTitle className="text-base">{locale === "en" ? "Live preview" : "پیش‌نمایش تیکت"}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 p-4">
                            <div>
                                <div className="text-[0.68rem] text-muted-foreground">
                                    {locale === "en" ? "Subject" : "موضوع"}
                                </div>
                                <div className="mt-1 font-medium text-sm leading-6">
                                    {subject.trim() ||
                                        (locale === "en"
                                            ? "Ticket subject will appear here"
                                            : "موضوع تیکت اینجا نمایش داده می‌شود")}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <TicketPriorityBadge priority={priority} label={priorities[priority]} />
                                <Badge variant="outline">{ticketChannelLabel(channel, locale)}</Badge>
                                <Badge variant="outline">
                                    {mode === "customer"
                                        ? locale === "en"
                                            ? "Customer"
                                            : "مشتری"
                                        : locale === "en"
                                          ? "Internal"
                                          : "داخلی"}
                                </Badge>
                            </div>
                            <div className="rounded-xl border bg-muted/20 p-3">
                                <div className="text-[0.68rem] text-muted-foreground">
                                    {locale === "en" ? "Requester" : "درخواست‌کننده"}
                                </div>
                                <div className="mt-1 truncate text-xs">{requesterName.trim() || "—"}</div>
                            </div>
                            <div className="rounded-xl border bg-muted/20 p-3">
                                <div className="text-[0.68rem] text-muted-foreground">
                                    {locale === "en" ? "Message preview" : "پیش‌نمایش پیام"}
                                </div>
                                <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-foreground text-xs leading-6">
                                    {message.trim() ||
                                        (locale === "en"
                                            ? "Start typing the ticket message…"
                                            : "با نوشتن متن تیکت، پیش‌نمایش اینجا به‌روز می‌شود…")}
                                </p>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-muted-foreground">{locale === "en" ? "Attachments" : "پیوست"}</span>
                                <span className="font-medium">{media.length.toLocaleString(numberLocale)}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">{locale === "en" ? "Submission summary" : "خلاصه ثبت"}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-xs">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">{locale === "en" ? "Type" : "نوع"}</span>
                                <span>
                                    {mode === "customer"
                                        ? locale === "en"
                                            ? "Customer ticket"
                                            : "تیکت مشتری"
                                        : locale === "en"
                                          ? "Internal ticket"
                                          : "تیکت داخلی"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">{locale === "en" ? "Priority" : "اولویت"}</span>
                                <span>{priorities[priority]}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">{locale === "en" ? "Channel" : "کانال"}</span>
                                <span>{ticketChannelLabel(channel, locale)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">{locale === "en" ? "Attachments" : "پیوست"}</span>
                                <span>{media.length.toLocaleString(numberLocale)}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-primary/15 bg-primary/[0.02] shadow-sm">
                        <CardContent className="flex gap-3 p-4">
                            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                            <div>
                                <div className="font-medium text-sm">
                                    {locale === "en" ? "Professional intake checklist" : "راهنمای ثبت حرفه‌ای"}
                                </div>
                                <ul className="mt-2 space-y-1.5 text-muted-foreground text-xs leading-5">
                                    <li>
                                        •{" "}
                                        {locale === "en"
                                            ? "Use the actual source channel."
                                            : "کانال واقعی ورود درخواست را انتخاب کنید."}
                                    </li>
                                    <li>
                                        •{" "}
                                        {locale === "en"
                                            ? "Keep one clear issue per ticket."
                                            : "هر تیکت را روی یک مسئله روشن نگه دارید."}
                                    </li>
                                    <li>
                                        •{" "}
                                        {locale === "en"
                                            ? "Link the customer whenever possible."
                                            : "در صورت امکان مشتری را به تیکت متصل کنید."}
                                    </li>
                                    <li>
                                        •{" "}
                                        {locale === "en"
                                            ? "Attach evidence through Media."
                                            : "مدارک را از مسیر کتابخانه رسانه پیوست کنید."}
                                    </li>
                                </ul>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <ContactRound className="size-4" aria-hidden="true" />
                                {locale === "en" ? "Customer matches" : "مشتریان پیشنهادی"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {customerSuggestions.length === 0 ? (
                                <p className="py-5 text-center text-muted-foreground text-xs">
                                    {locale === "en" ? "Search by name, phone, or email." : "با نام، موبایل یا ایمیل جستجو کنید."}
                                </p>
                            ) : (
                                customerSuggestions.map((customer) => (
                                    <CustomerSuggestion
                                        key={customer.id}
                                        customer={customer}
                                        onSelect={(item) => {
                                            setMode("customer");
                                            selectCustomer(item);
                                        }}
                                    />
                                ))
                            )}
                        </CardContent>
                    </Card>
                </aside>
            </div>

            <MediaPicker
                open={mediaOpen}
                mode="multiple"
                value={media.map((item) => item.id)}
                onOpenChange={setMediaOpen}
                onSelect={(selection) => setMedia(Array.isArray(selection) ? selection : [selection])}
            />
        </div>
    );
}
