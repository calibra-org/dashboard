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
import { CheckCircle2, ContactRound, FileText, MessageSquare, Paperclip, Search, ShieldCheck, UserRound, Users } from "#/icons";
import { Link } from "#/lib/i18n/navigation";
import type { AdminMedia } from "#/lib/types";

import { ticketCopy } from "./copy";
import { useAttachMediaToTicket, useCreateTicket, useTicketResources } from "./queries";
import { SupportPageHeader, supportChannelLabel } from "./ui";
import type { SupportChannel, TicketChannel, TicketPriority, TicketResource } from "./types";

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

function channelLabel(channel: TicketChannel, locale: Locale): string {
    if (channel === "admin") return locale === "en" ? "Admin / internal" : "مدیریت / داخلی";
    return supportChannelLabel(channel as SupportChannel, locale);
}

function CustomerSuggestion({ customer, onSelect }: { customer: TicketResource; onSelect: (customer: TicketResource) => void }) {
    return (
        <button
            type="button"
            onClick={() => onSelect(customer)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors hover:bg-muted/40"
        >
            <div className="min-w-0">
                <div className="truncate font-medium text-xs">{customer.label}</div>
                <div className="mt-1 truncate text-[0.68rem] text-muted-foreground">
                    {customer.phone ?? customer.email ?? `#${customer.id}`}
                </div>
            </div>
            <Badge variant="outline">#{customer.id}</Badge>
        </button>
    );
}

export function TicketCreatePage() {
    const locale = useLocale() as Locale;
    const { priorities } = ticketCopy(locale);
    const [mode, setMode] = useState<"customer" | "internal">("customer");
    const [customerQuery, setCustomerQuery] = useState("");
    const [selectedCustomer, setSelectedCustomer] = useState<TicketResource | null>(null);
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
            requester_name: String(form.get("requester_name") ?? "").trim(),
            requester_email: mode === "customer" ? String(form.get("requester_email") ?? "").trim() || null : null,
            requester_phone: mode === "customer" ? String(form.get("requester_phone") ?? "").trim() || null : null,
            subject: String(form.get("subject") ?? "").trim(),
            message: String(form.get("message") ?? "").trim(),
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

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.65fr)]">
                <div className="space-y-4">
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">{locale === "en" ? "Ticket type" : "نوع تیکت"}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => setMode("customer")}
                                className={`relative rounded-2xl border p-4 text-start transition-all ${
                                    mode === "customer" ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-muted/35"
                                }`}
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
                                }}
                                className={`relative rounded-2xl border p-4 text-start transition-all ${
                                    mode === "internal" ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-muted/35"
                                }`}
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
                                        ? "For back-office coordination. It is stored as an admin-channel ticket and tagged internal."
                                        : "برای هماهنگی پشت‌صحنه؛ به‌صورت تیکت کانال مدیریت و برچسب داخلی ذخیره می‌شود."}
                                </p>
                            </button>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">{locale === "en" ? "Ticket details" : "جزئیات تیکت"}</CardTitle>
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
                                            <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                                                <div>
                                                    <div className="font-medium text-xs">{selectedCustomer.label}</div>
                                                    <div className="mt-1 text-[0.68rem] text-muted-foreground">
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
                                                    {locale === "en" ? "Clear" : "حذف انتخاب"}
                                                </Button>
                                            </div>
                                        ) : deferredCustomerQuery.length > 0 && customerSuggestions.length > 0 ? (
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                {customerSuggestions.map((customer) => (
                                                    <CustomerSuggestion
                                                        key={customer.id}
                                                        customer={customer}
                                                        onSelect={setSelectedCustomer}
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
                                    <Input name="requester_name" required maxLength={180} />
                                </label>
                                {mode === "customer" ? (
                                    <>
                                        <label className="space-y-1.5 text-xs">
                                            <span className="font-medium">{locale === "en" ? "Mobile" : "شماره موبایل"}</span>
                                            <Input name="requester_phone" maxLength={32} dir="ltr" />
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
                                <label className="space-y-1.5 text-xs">
                                    <span className="font-medium">{locale === "en" ? "Priority" : "اولویت"}</span>
                                    <Select value={priority} onValueChange={(value) => setPriority(value as TicketPriority)}>
                                        <SelectTrigger>
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
                                </label>
                                <label className="space-y-1.5 text-xs">
                                    <span className="font-medium">
                                        {locale === "en" ? "Source / reply channel" : "کانال ثبت / پاسخ"}
                                    </span>
                                    <Select value={channel} onValueChange={(value) => setChannel(value as TicketChannel)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {CHANNELS.map((value) => (
                                                <SelectItem key={value} value={value}>
                                                    {channelLabel(value, locale)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </label>
                                <label className="space-y-1.5 text-xs">
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
                                <label className="space-y-1.5 text-xs sm:col-span-2">
                                    <span className="font-medium">{locale === "en" ? "Subject" : "موضوع تیکت"}</span>
                                    <Input name="subject" required minLength={2} maxLength={255} />
                                </label>
                                <label className="space-y-1.5 text-xs sm:col-span-2">
                                    <span className="font-medium">{locale === "en" ? "Message" : "متن پیام / شرح درخواست"}</span>
                                    <Textarea name="message" required minLength={1} maxLength={20_000} className="min-h-36" />
                                </label>
                                <label className="space-y-1.5 text-xs sm:col-span-2">
                                    <span className="font-medium">{locale === "en" ? "Tags" : "برچسب‌ها"}</span>
                                    <Input
                                        name="tags"
                                        maxLength={820}
                                        placeholder={locale === "en" ? "vip, payment, follow-up" : "vip, پرداخت, پیگیری"}
                                    />
                                </label>

                                <div className="space-y-2 sm:col-span-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="font-medium text-xs">
                                                {locale === "en" ? "Attachments" : "پیوست‌ها"}
                                            </div>
                                            <div className="mt-1 text-[0.68rem] text-muted-foreground">
                                                {locale === "en"
                                                    ? "Choose or upload files through the existing Media library; attachment metadata is persisted after ticket creation."
                                                    : "از کتابخانه رسانه انتخاب یا فایل جدید بارگذاری کنید؛ متادیتای پیوست پس از ساخت تیکت ذخیره می‌شود."}
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
                                                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                                                >
                                                    <span className="min-w-0 truncate">{item.filename}</span>
                                                    <button
                                                        type="button"
                                                        className="text-muted-foreground hover:text-danger"
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
                                        <div className="rounded-xl border border-dashed p-5 text-center text-muted-foreground text-xs">
                                            {locale === "en" ? "No attachment selected" : "پیوستی انتخاب نشده است"}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4 sm:col-span-2">
                                    <Button type="submit" disabled={createTicket.isPending || attach.isPending}>
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
                                                : "ثبت و ارسال به مشتری"}
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
                                        <div className="flex items-start justify-between gap-3">
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

                <div className="space-y-4">
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">
                                {locale === "en" ? "Submission summary" : "خلاصه ثبت تیکت"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-xs">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">{locale === "en" ? "Type" : "نوع"}</span>
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
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">{locale === "en" ? "Priority" : "اولویت"}</span>
                                <span>{priorities[priority]}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">{locale === "en" ? "Channel" : "کانال"}</span>
                                <span>{channelLabel(channel, locale)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">{locale === "en" ? "Attachments" : "پیوست"}</span>
                                <span>{media.length.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}</span>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-primary/15 bg-primary/[0.02] shadow-sm">
                        <CardContent className="flex gap-3 p-4">
                            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                            <div>
                                <div className="font-medium text-sm">
                                    {locale === "en" ? "Operational guardrails" : "راهنمای ثبت حرفه‌ای"}
                                </div>
                                <p className="mt-1 text-muted-foreground text-xs leading-5">
                                    {locale === "en"
                                        ? "Use the real source channel, link a customer when possible, keep one issue per ticket, and attach supporting evidence through Media so scan metadata can be enforced."
                                        : "کانال واقعی را انتخاب کنید، در صورت امکان مشتری را متصل کنید، هر تیکت را روی یک مسئله نگه دارید و مدارک را از مسیر Media پیوست کنید تا وضعیت اسکن و متادیتا قابل کنترل باشد."}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <ContactRound className="size-4" aria-hidden="true" />
                                {locale === "en" ? "Recent customer matches" : "مشتریان پیشنهادی"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {customerSuggestions.length === 0 ? (
                                <p className="py-5 text-center text-muted-foreground text-xs">
                                    {locale === "en" ? "Search to find a customer." : "برای یافتن مشتری جستجو کنید."}
                                </p>
                            ) : (
                                customerSuggestions.map((customer) => (
                                    <CustomerSuggestion
                                        key={customer.id}
                                        customer={customer}
                                        onSelect={(item) => {
                                            setMode("customer");
                                            setSelectedCustomer(item);
                                        }}
                                    />
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>
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
