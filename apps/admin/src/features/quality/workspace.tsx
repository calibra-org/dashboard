"use client";
import { useLocale } from "next-intl";
import type { FormEvent, ReactNode } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Textarea } from "#/components/ui/textarea";
import { AlertTriangle, BadgeCheck, PackageSearch, ShieldCheck, Sparkles } from "#/icons";
import { Link } from "#/lib/i18n/navigation";

import { QualityNav } from "./quality-nav";
import {
    useActions,
    useAudit,
    useCases,
    useClassify,
    useCreateAction,
    useCreateCase,
    useCreateReason,
    useEvaluate,
    useInspect,
    useMetrics,
    useOverview,
    useReasons,
    useReturns,
    useSignals,
    useSignalTransition,
    useSupplier,
    useTraceability,
    useVoc,
} from "./queries";

const faNumber = (v: unknown) => new Intl.NumberFormat("fa-IR").format(Number(v ?? 0));
function InfoTitle({ children, help }: { children: ReactNode; help: string }) {
    return (
        <span className="inline-flex items-center gap-1">
            {children}
            <HelperTooltip>{help}</HelperTooltip>
        </span>
    );
}
function Empty({ fa }: { fa: boolean }) {
    return (
        <div className="py-12 text-center text-muted-foreground text-sm">
            {fa ? "داده‌ای برای نمایش وجود ندارد." : "No data to display."}
        </div>
    );
}
function Metric({
    title,
    value,
    help,
    tone = "normal",
}: {
    title: string;
    value: ReactNode;
    help: string;
    tone?: "normal" | "warn";
}) {
    return (
        <Card className={tone === "warn" ? "border-warning/30" : ""}>
            <CardContent className="p-4">
                <div className="text-muted-foreground text-xs">
                    <InfoTitle help={help}>{title}</InfoTitle>
                </div>
                <div className="mt-2 font-semibold text-2xl tabular-nums">{value}</div>
            </CardContent>
        </Card>
    );
}
function severity(v: string) {
    return v === "critical"
        ? "border-danger/30 bg-danger/10 text-danger"
        : v === "high"
          ? "border-warning/30 bg-warning/10 text-warning"
          : "";
}
function Layout({ children, fa }: { children: ReactNode; fa: boolean }) {
    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3">
                <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <ShieldCheck className="size-5" />
                </div>
                <div>
                    <div className="flex items-center gap-1">
                        <h1 className="font-semibold text-2xl">{fa ? "کیفیت و اعتماد" : "Quality & Trust"}</h1>
                        <HelperTooltip>
                            {fa
                                ? "فاز ۱۹ کالیبرا؛ مرجوعی، نقد و تیکت را بدون ساخت سیستم موازی به حسگر کیفیت و حلقه اصلاح تبدیل می‌کند."
                                : "Calibra Phase 19 turns returns, reviews and tickets into quality sensors without parallel systems."}
                        </HelperTooltip>
                    </div>
                    <p className="mt-1 text-muted-foreground text-sm">
                        {fa
                            ? "شواهد واقعی، ریشه‌یابی قابل ممیزی، اقدام اصلاحی و اندازه‌گیری نتیجه."
                            : "Evidence-first investigation, auditable root cause, corrective action and measured outcomes."}
                    </p>
                </div>
            </div>
            <QualityNav />
            {children}
        </div>
    );
}

function Overview({ fa }: { fa: boolean }) {
    const q = useOverview();
    const d = q.data?.data;
    return (
        <div className="space-y-4">
            {q.isLoading ? (
                <Empty fa={fa} />
            ) : q.isError ? (
                <Empty fa={fa} />
            ) : (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <Metric
                            title={fa ? "پرونده باز" : "Open cases"}
                            value={faNumber(d?.open_cases)}
                            help={fa ? "پرونده‌هایی که هنوز بسته نشده‌اند." : "Cases not yet closed."}
                        />
                        <Metric
                            title={fa ? "بحرانی" : "Critical"}
                            value={faNumber(d?.critical_cases)}
                            help={
                                fa
                                    ? "پرونده‌های بحرانی باز که نیازمند اولویت انسانی هستند."
                                    : "Open critical cases requiring human priority."
                            }
                            tone="warn"
                        />
                        <Metric
                            title={fa ? "سیگنال باز" : "Open signals"}
                            value={faNumber(d?.open_signals)}
                            help={fa ? "ناهنجاری‌های قطعی که هنوز رسیدگی نشده‌اند." : "Deterministic anomalies awaiting handling."}
                        />
                        <Metric
                            title={fa ? "اقدام عقب‌افتاده" : "Overdue actions"}
                            value={faNumber(d?.overdue_actions)}
                            help={fa ? "اقدام‌هایی که موعدشان گذشته و نهایی نشده‌اند." : "Actions past due and not finalized."}
                        />
                        <Metric
                            title={fa ? "پوشش بازرسی" : "Inspection coverage"}
                            value={
                                d?.inspection_coverage == null
                                    ? "—"
                                    : `${new Intl.NumberFormat(fa ? "fa-IR" : "en-US", { style: "percent", maximumFractionDigits: 1 }).format(d.inspection_coverage)}`
                            }
                            help={
                                fa
                                    ? "سهم آیتم‌های مرجوعی دارای حداقل یک بازرسی ثبت‌شده؛ نبود داده صفر فرض نمی‌شود."
                                    : "Share of return items with an inspection; missing data is not treated as zero."
                            }
                        />
                    </div>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                <InfoTitle
                                    help={
                                        fa
                                            ? "فاز ۱۹ داده عملیاتی را مالک نمی‌شود؛ فقط آن را به شواهد کیفیت تبدیل می‌کند."
                                            : "Phase 19 does not own operational data; it turns it into quality evidence."
                                    }
                                >
                                    {fa ? "مرز مالکیت داده" : "Data ownership boundary"}
                                </InfoTitle>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-lg border p-3">
                                <b className="text-sm">{fa ? "منبع" : "Source"}</b>
                                <p className="mt-1 text-muted-foreground text-xs">Return / Review / Ticket / Refund</p>
                            </div>
                            <div className="rounded-lg border p-3">
                                <b className="text-sm">{fa ? "تحلیل کیفیت" : "Quality layer"}</b>
                                <p className="mt-1 text-muted-foreground text-xs">Case / Evidence / Finding / Signal</p>
                            </div>
                            <div className="rounded-lg border p-3">
                                <b className="text-sm">{fa ? "بستن حلقه" : "Closure"}</b>
                                <p className="mt-1 text-muted-foreground text-xs">Action → Outcome → Verification</p>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}

function Cases({ fa }: { fa: boolean }) {
    const q = useCases();
    const create = useCreateCase();
    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await create.mutateAsync({
            case_type: String(f.get("case_type")),
            severity: String(f.get("severity")),
            title: String(f.get("title")),
            summary: String(f.get("summary") || "") || null,
        });
        e.currentTarget.reset();
    }
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        <InfoTitle
                            help={
                                fa
                                    ? "پرونده فقط برای بررسی کیفیت ساخته می‌شود؛ مرجوعی یا بازپرداخت جدید ایجاد نمی‌کند."
                                    : "Creates an investigation only; it never creates a return or refund."
                            }
                        >
                            {fa ? "پرونده جدید" : "New case"}
                        </InfoTitle>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
                        <Input name="title" required placeholder={fa ? "عنوان دقیق پرونده" : "Case title"} />
                        <Input name="case_type" required defaultValue="product_quality" dir="ltr" />
                        <Select name="severity" defaultValue="medium">
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="low">{fa ? "کم" : "Low"}</SelectItem>
                                <SelectItem value="medium">{fa ? "متوسط" : "Medium"}</SelectItem>
                                <SelectItem value="high">{fa ? "زیاد" : "High"}</SelectItem>
                                <SelectItem value="critical">{fa ? "بحرانی" : "Critical"}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button type="submit" disabled={create.isPending}>
                            {fa ? "ساخت پرونده" : "Create case"}
                        </Button>
                        <Textarea
                            className="md:col-span-4"
                            name="summary"
                            placeholder={fa ? "خلاصه مسئله و دلیل آغاز بررسی" : "Issue summary and investigation reason"}
                        />
                    </form>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-0">
                    {q.data?.data?.length ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{fa ? "پرونده" : "Case"}</TableHead>
                                    <TableHead>{fa ? "وضعیت" : "Status"}</TableHead>
                                    <TableHead>{fa ? "شدت" : "Severity"}</TableHead>
                                    <TableHead>{fa ? "نوع" : "Type"}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {q.data.data.map((r: any) => (
                                    <TableRow key={r.id}>
                                        <TableCell>
                                            <Link
                                                href={`/quality/cases/${r.id}` as never}
                                                className="font-medium text-primary hover:underline"
                                            >
                                                {r.title}
                                            </Link>
                                            <div className="text-muted-foreground text-xs" dir="ltr">
                                                {r.reference}
                                            </div>
                                        </TableCell>
                                        <TableCell>{r.status}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={severity(r.severity)}>
                                                {r.severity}
                                            </Badge>
                                        </TableCell>
                                        <TableCell dir="ltr">{r.case_type}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <Empty fa={fa} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Signals({ fa }: { fa: boolean }) {
    const q = useSignals();
    const evaluate = useEvaluate();
    const transition = useSignalTransition();
    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                        <div className="font-medium text-sm">
                            <InfoTitle
                                help={
                                    fa
                                        ? "نسخه نخست فقط نرخ مرجوعی بر واحد تحویل‌شده را با حداقل نمونه بررسی می‌کند؛ AI سازنده هشدار نیست."
                                        : "V1 only evaluates return rate per delivered unit with a minimum sample; AI does not create alerts."
                                }
                            >
                                {fa ? "موتور ناهنجاری قطعی" : "Deterministic anomaly engine"}
                            </InfoTitle>
                        </div>
                        <p className="mt-1 text-muted-foreground text-xs">
                            {fa
                                ? "پیش‌فرض: ۳۰ روز، حداقل ۲۰ واحد تحویل‌شده، آستانه ۸٪."
                                : "Default: 30 days, minimum 20 delivered units, 8% threshold."}
                        </p>
                    </div>
                    <Button disabled={evaluate.isPending} onClick={() => evaluate.mutate({})}>
                        {fa ? "ارزیابی اکنون" : "Evaluate now"}
                    </Button>
                </CardContent>
            </Card>
            {q.data?.data?.length ? (
                <div className="grid gap-3">
                    {q.data.data.map((s: any) => (
                        <Card key={s.id}>
                            <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="size-4 text-warning" />
                                        <b>{fa ? "ناهنجاری نرخ مرجوعی" : "Return-rate anomaly"}</b>
                                        <Badge variant="outline">{s.status}</Badge>
                                    </div>
                                    <p className="mt-2 text-muted-foreground text-xs" dir="ltr">
                                        {s.numerator}/{s.denominator} · {(Number(s.rate) * 100).toFixed(2)}% · threshold{" "}
                                        {(Number(s.threshold_rate) * 100).toFixed(2)}%
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    {s.status === "open" ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => transition.mutate({ id: s.id, action: "acknowledge" })}
                                        >
                                            {fa ? "در دست بررسی" : "Acknowledge"}
                                        </Button>
                                    ) : null}
                                    {s.status !== "resolved" ? (
                                        <Button size="sm" onClick={() => transition.mutate({ id: s.id, action: "resolve" })}>
                                            {fa ? "حل شد" : "Resolve"}
                                        </Button>
                                    ) : null}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <Empty fa={fa} />
            )}
        </div>
    );
}

function Returns({ fa }: { fa: boolean }) {
    const q = useReturns();
    const inspect = useInspect();
    return (
        <div className="space-y-3">
            {q.data?.data?.length ? (
                q.data.data.map((r: any) => (
                    <Card key={r.id}>
                        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                            <div>
                                <div className="flex items-center gap-2">
                                    <PackageSearch className="size-4" />
                                    <b>{fa ? `آیتم مرجوعی #${r.id}` : `Return item #${r.id}`}</b>
                                    <HelperTooltip>
                                        {fa
                                            ? "این کارت نمایی روی مرجوعی موجود است؛ دلیل خام مشتری دست‌نخورده باقی می‌ماند."
                                            : "Projection over the canonical return; the customer's raw reason remains unchanged."}
                                    </HelperTooltip>
                                </div>
                                <p className="mt-2 text-sm">{r.reason || "—"}</p>
                                <p className="mt-1 text-muted-foreground text-xs" dir="ltr">
                                    return #{r.return_id} · product #{r.product_id ?? "—"} · {r.status}
                                </p>
                            </div>
                            <form
                                className="grid gap-2 sm:grid-cols-4"
                                onSubmit={async (e) => {
                                    e.preventDefault();
                                    const f = new FormData(e.currentTarget);
                                    await inspect.mutateAsync({
                                        returnId: r.return_id,
                                        itemId: r.id,
                                        body: {
                                            condition: String(f.get("condition")),
                                            disposition: String(f.get("disposition")),
                                            inspected_quantity: Number(f.get("quantity")),
                                            defect_quantity: Number(f.get("defects")),
                                        },
                                    });
                                }}
                            >
                                <Select name="condition" defaultValue="unknown">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unknown">{fa ? "نامشخص" : "Unknown"}</SelectItem>
                                        <SelectItem value="defective">{fa ? "معیوب" : "Defective"}</SelectItem>
                                        <SelectItem value="damaged">{fa ? "آسیب‌دیده" : "Damaged"}</SelectItem>
                                        <SelectItem value="unused">{fa ? "استفاده‌نشده" : "Unused"}</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select name="disposition" defaultValue="hold_for_investigation">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="hold_for_investigation">
                                            {fa ? "نگهداری برای بررسی" : "Hold"}
                                        </SelectItem>
                                        <SelectItem value="restock">{fa ? "بازگشت به موجودی" : "Restock"}</SelectItem>
                                        <SelectItem value="quarantine">{fa ? "قرنطینه" : "Quarantine"}</SelectItem>
                                        <SelectItem value="scrap">{fa ? "اسقاط" : "Scrap"}</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input
                                    name="quantity"
                                    type="number"
                                    min="1"
                                    defaultValue={Math.max(1, Number(r.received_quantity || r.requested_quantity || 1))}
                                />
                                <div className="flex gap-2">
                                    <Input name="defects" type="number" min="0" defaultValue="0" />
                                    <Button type="submit" size="sm">
                                        {fa ? "ثبت بازرسی" : "Inspect"}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                ))
            ) : (
                <Empty fa={fa} />
            )}
        </div>
    );
}

function Voc({ fa }: { fa: boolean }) {
    const q = useVoc();
    const classify = useClassify();
    return (
        <div className="grid gap-3">
            {q.data?.data?.length ? (
                q.data.data.map((r: any) => (
                    <Card key={`${r.source_kind}-${r.source_id}`}>
                        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_420px]">
                            <div>
                                <div className="flex gap-2">
                                    <Sparkles className="size-4" />
                                    <b>{r.source_kind}</b>
                                    <HelperTooltip>
                                        {fa
                                            ? "طبقه‌بندی جدید متن اصلی را تغییر نمی‌دهد و فقط یک projection نسخه‌پذیر ثبت می‌کند."
                                            : "Classification never rewrites canonical text; it adds an inspectable projection."}
                                    </HelperTooltip>
                                </div>
                                <p className="mt-2 text-sm leading-7">{r.body || "—"}</p>
                                {r.latest_classification ? (
                                    <Badge variant="outline" className="mt-2" dir="ltr">
                                        {r.latest_classification.theme_code}
                                    </Badge>
                                ) : null}
                            </div>
                            <form
                                className="flex gap-2"
                                onSubmit={async (e) => {
                                    e.preventDefault();
                                    const f = new FormData(e.currentTarget);
                                    const key =
                                        r.source_kind === "return_item"
                                            ? "return_item_id"
                                            : r.source_kind === "product_review"
                                              ? "product_review_id"
                                              : "support_ticket_id";
                                    await classify.mutateAsync({
                                        [key]: r.source_id,
                                        theme_code: String(f.get("theme")),
                                        sentiment: String(f.get("sentiment")),
                                        provenance_type: "operator",
                                    });
                                }}
                            >
                                <Input name="theme" required placeholder={fa ? "کد موضوع" : "theme_code"} dir="ltr" />
                                <Select name="sentiment" defaultValue="neutral">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="negative">{fa ? "منفی" : "Negative"}</SelectItem>
                                        <SelectItem value="neutral">{fa ? "خنثی" : "Neutral"}</SelectItem>
                                        <SelectItem value="positive">{fa ? "مثبت" : "Positive"}</SelectItem>
                                        <SelectItem value="mixed">{fa ? "ترکیبی" : "Mixed"}</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button type="submit">{fa ? "طبقه‌بندی" : "Classify"}</Button>
                            </form>
                        </CardContent>
                    </Card>
                ))
            ) : (
                <Empty fa={fa} />
            )}
        </div>
    );
}
function Suppliers({ fa }: { fa: boolean }) {
    const q = useSupplier();
    const d = q.data as any;
    const rows = d?.data ?? [];
    const pct = (v: unknown) =>
        v == null
            ? "—"
            : new Intl.NumberFormat(fa ? "fa-IR" : "en-US", { style: "percent", maximumFractionDigits: 1 }).format(Number(v));
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        <InfoTitle
                            help={
                                fa
                                    ? "امتیازها فقط از دریافت واقعی PO و incident ثبت‌شده می‌آیند؛ مرجوعی مشتری بدون اتصال Lot به سفارش به تأمین‌کننده نسبت داده نمی‌شود."
                                    : "Metrics use direct PO receiving and supplier incidents only; customer returns are never attributed without lot-to-order allocation."
                            }
                        >
                            {fa ? "کیفیت تأمین‌کننده بر شواهد مستقیم" : "Supplier quality from direct evidence"}
                        </InfoTitle>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                            {fa ? "زنجیره دریافت فعال" : "Receiving chain live"}
                        </Badge>
                        <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
                            {fa ? "نسبت‌دادن مرجوعی: غیرفعال" : "Return attribution unavailable"}
                        </Badge>
                    </div>
                    <p className="mt-3 text-muted-foreground text-sm">
                        {fa
                            ? "تا زمانی که allocation قطعی Lot/Batch دریافتی به ردیف سفارش تحویل‌شده وجود نداشته باشد، خرابی مرجوعی به تأمین‌کننده منتسب نمی‌شود."
                            : d?.customer_return_supplier_attribution?.reason}
                    </p>
                </CardContent>
            </Card>
            {rows.length ? (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{fa ? "تأمین‌کننده" : "Supplier"}</TableHead>
                                    <TableHead>{fa ? "دریافت" : "Received"}</TableHead>
                                    <TableHead>{fa ? "رد/قرنطینه" : "Rejected / quarantine"}</TableHead>
                                    <TableHead>{fa ? "نرخ استثنا" : "Exception rate"}</TableHead>
                                    <TableHead>{fa ? "پوشش Lot/Batch" : "Lot/Batch coverage"}</TableHead>
                                    <TableHead>{fa ? "Incident باز" : "Open incidents"}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((r: any) => (
                                    <TableRow key={r.supplier_id}>
                                        <TableCell>
                                            <b>{r.supplier_name}</b>
                                            <div className="text-muted-foreground text-xs" dir="ltr">
                                                {r.supplier_code}
                                            </div>
                                        </TableCell>
                                        <TableCell>{faNumber(r.received)}</TableCell>
                                        <TableCell>{faNumber(Number(r.rejected || 0) + Number(r.quarantine || 0))}</TableCell>
                                        <TableCell>{pct(r.receiving_exception_rate)}</TableCell>
                                        <TableCell>{pct(r.lot_batch_coverage)}</TableCell>
                                        <TableCell>{faNumber(r.open_quality_incidents)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            ) : (
                <Empty fa={fa} />
            )}
        </div>
    );
}
function Actions({ fa }: { fa: boolean }) {
    const q = useActions();
    const create = useCreateAction();
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        <InfoTitle
                            help={
                                fa
                                    ? "اقدام اصلاحی فقط برنامه کار را ثبت می‌کند؛ تغییر واقعی در محصول، محتوا یا خرید باید توسط دامنه مالک اجرا شود."
                                    : "Corrective actions track work; real product/content/procurement mutations remain in their owning domains."
                            }
                        >
                            {fa ? "اقدام اصلاحی جدید" : "New corrective action"}
                        </InfoTitle>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form
                        className="grid gap-3 md:grid-cols-4"
                        onSubmit={async (e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            await create.mutateAsync({
                                quality_case_id: Number(f.get("case")),
                                action_type: String(f.get("type")),
                                title: String(f.get("title")),
                                verification_metric_key: String(f.get("metric") || "") || null,
                            });
                            e.currentTarget.reset();
                        }}
                    >
                        <Input name="case" type="number" min="1" required placeholder={fa ? "شناسه پرونده" : "Case id"} />
                        <Select name="type" defaultValue="product_qa">
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="product_qa">{fa ? "کنترل کیفیت محصول" : "Product QA"}</SelectItem>
                                <SelectItem value="content_correction">{fa ? "اصلاح محتوا" : "Content correction"}</SelectItem>
                                <SelectItem value="packaging_correction">
                                    {fa ? "اصلاح بسته‌بندی" : "Packaging correction"}
                                </SelectItem>
                                <SelectItem value="experiment">{fa ? "آزمایش" : "Experiment"}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input name="title" required placeholder={fa ? "عنوان اقدام" : "Action title"} />
                        <Input name="metric" dir="ltr" placeholder="return_rate_delivered_units" />
                        <div className="flex justify-end md:col-span-4">
                            <Button type="submit">{fa ? "ثبت اقدام" : "Create action"}</Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
            {q.data?.data?.length ? (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{fa ? "اقدام" : "Action"}</TableHead>
                                    <TableHead>{fa ? "پرونده" : "Case"}</TableHead>
                                    <TableHead>{fa ? "وضعیت" : "Status"}</TableHead>
                                    <TableHead>{fa ? "شاخص راستی‌آزمایی" : "Verification metric"}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {q.data.data.map((a: any) => (
                                    <TableRow key={a.id}>
                                        <TableCell>
                                            {a.title}
                                            <div className="text-muted-foreground text-xs" dir="ltr">
                                                {a.action_type}
                                            </div>
                                        </TableCell>
                                        <TableCell dir="ltr">#{a.quality_case_id}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{a.status}</Badge>
                                        </TableCell>
                                        <TableCell dir="ltr">{a.verification_metric_key || "—"}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            ) : (
                <Empty fa={fa} />
            )}
        </div>
    );
}
function Taxonomy({ fa }: { fa: boolean }) {
    const q = useReasons();
    const create = useCreateReason();
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        <InfoTitle
                            help={
                                fa
                                    ? "کد ثابت است؛ تغییر معنی با ساخت نسخه جدید انجام می‌شود تا تاریخچه قبلی دست‌نخورده بماند."
                                    : "Codes are stable; semantic changes create new versions so history remains intact."
                            }
                        >
                            {fa ? "دلیل استاندارد جدید" : "New normalized reason"}
                        </InfoTitle>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form
                        className="grid gap-3 md:grid-cols-5"
                        onSubmit={async (e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            await create.mutateAsync({
                                code: String(f.get("code")),
                                category: String(f.get("category")),
                                label_fa: String(f.get("label")),
                                default_severity: String(f.get("severity")),
                            });
                            e.currentTarget.reset();
                        }}
                    >
                        <Input name="code" required dir="ltr" placeholder="compatibility_mismatch" />
                        <Input name="category" required dir="ltr" placeholder="expectation" />
                        <Input name="label" required placeholder={fa ? "عنوان فارسی" : "Persian label"} />
                        <Select name="severity" defaultValue="medium">
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="low">{fa ? "کم" : "Low"}</SelectItem>
                                <SelectItem value="medium">{fa ? "متوسط" : "Medium"}</SelectItem>
                                <SelectItem value="high">{fa ? "زیاد" : "High"}</SelectItem>
                                <SelectItem value="critical">{fa ? "بحرانی" : "Critical"}</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button type="submit">{fa ? "ساخت نسخه ۱" : "Create v1"}</Button>
                    </form>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-0">
                    {(q.data as any)?.data?.length ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{fa ? "دلیل" : "Reason"}</TableHead>
                                    <TableHead>{fa ? "کد" : "Code"}</TableHead>
                                    <TableHead>{fa ? "نسخه" : "Version"}</TableHead>
                                    <TableHead>{fa ? "وضعیت" : "Status"}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(q.data as any).data.map((r: any) => (
                                    <TableRow key={r.id}>
                                        <TableCell>{r.label_fa}</TableCell>
                                        <TableCell dir="ltr">{r.code}</TableCell>
                                        <TableCell>{faNumber(r.version)}</TableCell>
                                        <TableCell>
                                            {r.is_active ? (fa ? "فعال" : "Active") : fa ? "تاریخی" : "Historical"}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <Empty fa={fa} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
function DataQuality({ fa }: { fa: boolean }) {
    const q = useTraceability();
    const d = (q.data as any)?.data;
    const total = Number(d?.total_return_items || 0);
    const cards = [
        {
            t: fa ? "اتصال محصول" : "Product linkage",
            v: d?.product_linked,
            h: fa ? "اتصال قطعی آیتم مرجوعی از ردیف سفارش به محصول؛ بدون حدس." : "Deterministic return-item to product linkage.",
        },
        {
            t: fa ? "پوشش بازرسی" : "Inspection coverage",
            v: d?.inspected,
            h: fa
                ? "تعداد آیتم‌های مرجوعی دارای حداقل یک بازرسی فقط‌افزودنی."
                : "Return items with at least one append-only inspection.",
        },
        {
            t: fa ? "اتصال پرونده" : "Case linkage",
            v: d?.case_linked,
            h: fa ? "آیتم‌هایی که حداقل به یک پرونده کیفیت متصل شده‌اند." : "Return items linked to at least one quality case.",
        },
    ];
    const lot = d?.receiving_lot_batch_coverage;
    return (
        <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
                {cards.map((c) => (
                    <div key={c.t}>
                        <Metric title={c.t} value={total ? `${faNumber(c.v)} / ${faNumber(total)}` : "—"} help={c.h} />
                    </div>
                ))}
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        <InfoTitle
                            help={
                                fa
                                    ? "Phase 14 اکنون Supplier/PO/Receiving/Lot را فراهم می‌کند، اما برای نسبت‌دادن مرجوعی هنوز حلقه allocation موجودی تا ردیف سفارش لازم است."
                                    : "Phase 14 now provides Supplier/PO/Receiving/Lot, but return attribution still needs inventory-lot allocation to the fulfilled order line."
                            }
                        >
                            {fa ? "ردیابی تأمین و Lot/Batch" : "Supplier & lot/batch traceability"}
                        </InfoTitle>
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border p-4">
                        <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                            {fa ? "Phase 14 فعال" : "Phase 14 live"}
                        </Badge>
                        <div className="mt-3 font-semibold text-2xl">
                            {lot == null
                                ? "—"
                                : new Intl.NumberFormat(fa ? "fa-IR" : "en-US", {
                                      style: "percent",
                                      maximumFractionDigits: 1,
                                  }).format(Number(lot))}
                        </div>
                        <p className="mt-1 text-muted-foreground text-xs">
                            {fa ? "پوشش Lot/Batch در خطوط دریافت" : "Lot/Batch coverage across receiving lines"}
                        </p>
                    </div>
                    <div className="rounded-lg border border-warning/30 p-4">
                        <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
                            {fa ? "شکاف allocation" : "Allocation gap"}
                        </Badge>
                        <p className="mt-3 text-muted-foreground text-sm">
                            {fa
                                ? "هیچ تأمین‌کننده‌ای از روی شباهت محصول، تاریخ یا متن مرجوعی حدس زده نمی‌شود؛ attribution مشتری تا ایجاد اتصال قطعی Lot/Batch→Inventory allocation→Fulfilled order line بسته می‌ماند."
                                : "No supplier is inferred from product similarity, dates or return text; customer-return attribution stays closed until a deterministic Lot/Batch → inventory allocation → fulfilled order line link exists."}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
function Metrics({ fa }: { fa: boolean }) {
    const q = useMetrics();
    const d = (q.data as any)?.data;
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">
                    <InfoTitle
                        help={
                            fa
                                ? "هر شاخص باید تعریف تجاری، فرمول، واحد، مخرج و نسخه روشن داشته باشد؛ داده ناکافی صفر نیست."
                                : "Every metric requires a definition, formula, unit, denominator and version; insufficient data is not zero."
                        }
                    >
                        {fa ? "رجیستری شاخص‌ها" : "Metric registry"}
                    </InfoTitle>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {d?.definitions?.map((m: any) => {
                    const v = d.values?.[m.metric_key];
                    return (
                        <div key={m.metric_key} className="grid gap-3 border-b py-4 last:border-0 md:grid-cols-[1fr_1fr_220px]">
                            <div>
                                <b>{m.label_fa}</b>
                                <div className="text-muted-foreground text-xs" dir="ltr">
                                    {m.metric_key} · v{m.version}
                                </div>
                            </div>
                            <div className="text-muted-foreground text-sm">
                                {m.business_definition}
                                <div className="mt-1 text-xs" dir="ltr">
                                    {m.formula}
                                </div>
                            </div>
                            <div className="text-end font-semibold">
                                {v?.status === "available"
                                    ? new Intl.NumberFormat(fa ? "fa-IR" : "en-US", {
                                          style: "percent",
                                          maximumFractionDigits: 2,
                                      }).format(v.value)
                                    : fa
                                      ? "داده ناکافی"
                                      : "Insufficient data"}
                            </div>
                        </div>
                    );
                }) || <Empty fa={fa} />}
            </CardContent>
        </Card>
    );
}
function Governance({ fa }: { fa: boolean }) {
    const q = useAudit();
    return (
        <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
                <Metric
                    title={fa ? "حقیقت و فرضیه" : "Truth vs hypothesis"}
                    value={<BadgeCheck className="size-6 text-primary" />}
                    help={
                        fa
                            ? "گزارش مشتری، یافته مشاهده‌شده/استنباطی و علت ریشه‌ای تأییدشده سه سطح جدا هستند."
                            : "Customer report, observed/inferred finding and validated root cause are separate layers."
                    }
                />
                <Metric
                    title={fa ? "سیاست AI" : "AI policy"}
                    value={<Sparkles className="size-6 text-primary" />}
                    help={
                        fa
                            ? "AI نمی‌تواند پرونده را ببندد، تقصیر تأمین‌کننده را تأیید کند یا حقیقت تأییدشده بنویسد."
                            : "AI cannot close cases, validate supplier fault or write verified truth."
                    }
                />
                <Metric
                    title={fa ? "ممیزی" : "Audit"}
                    value={<ShieldCheck className="size-6 text-primary" />}
                    help={
                        fa
                            ? "از admin_audit_log موجود استفاده می‌شود؛ سامانه ممیزی دوم ساخته نشده است."
                            : "Uses canonical admin_audit_log; no second audit system exists."
                    }
                />
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{fa ? "رخدادهای ممیزی" : "Audit events"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {(q.data as any)?.data?.length ? (
                        (q.data as any).data.map((r: any) => (
                            <div key={r.id} className="flex justify-between gap-4 rounded-lg border p-3">
                                <div>
                                    <b className="text-sm" dir="ltr">
                                        {r.action}
                                    </b>
                                    <div className="text-muted-foreground text-xs" dir="ltr">
                                        {r.entity_kind} #{r.entity_id ?? "—"}
                                    </div>
                                </div>
                                <time className="text-muted-foreground text-xs">{r.occurred_at}</time>
                            </div>
                        ))
                    ) : (
                        <Empty fa={fa} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export function QualityWorkspace({ section }: { section: string }) {
    const locale = useLocale();
    const fa = locale === "fa";
    return (
        <Layout fa={fa}>
            {section === "overview" ? (
                <Overview fa={fa} />
            ) : section === "cases" ? (
                <Cases fa={fa} />
            ) : section === "signals" ? (
                <Signals fa={fa} />
            ) : section === "returns" ? (
                <Returns fa={fa} />
            ) : section === "voc" ? (
                <Voc fa={fa} />
            ) : section === "suppliers" ? (
                <Suppliers fa={fa} />
            ) : section === "actions" ? (
                <Actions fa={fa} />
            ) : section === "taxonomy" ? (
                <Taxonomy fa={fa} />
            ) : section === "dataQuality" ? (
                <DataQuality fa={fa} />
            ) : section === "metrics" ? (
                <Metrics fa={fa} />
            ) : (
                <Governance fa={fa} />
            )}
        </Layout>
    );
}
