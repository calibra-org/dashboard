"use client";
import { useLocale } from "next-intl";
import type { FormEvent, ReactNode } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { BadgeCheck, ShieldCheck } from "#/icons";
import { Link } from "#/lib/i18n/navigation";

import {
    useAddEvidence,
    useAddFinding,
    useAddSource,
    useAdjudicate,
    useCase,
    useCreateAction,
    useCreateOutcome,
    useUpdateCase,
} from "./queries";

function T({ children, help }: { children: ReactNode; help: string }) {
    return (
        <span className="inline-flex items-center gap-1">
            {children}
            <HelperTooltip>{help}</HelperTooltip>
        </span>
    );
}
const flow: Record<string, string[]> = {
    open: ["triaged"],
    triaged: ["investigating"],
    investigating: ["action_required", "resolved"],
    action_required: ["verifying", "resolved"],
    verifying: ["resolved"],
    resolved: ["closed", "investigating"],
    closed: [],
};
export function QualityCaseDetail({ id }: { id: number }) {
    const locale = useLocale();
    const fa = locale === "fa";
    const q = useCase(id);
    const update = useUpdateCase(id);
    const source = useAddSource(id);
    const evidence = useAddEvidence(id);
    const finding = useAddFinding(id);
    const adjudicate = useAdjudicate(id);
    const action = useCreateAction();
    const outcome = useCreateOutcome();
    const d = q.data;
    if (q.isLoading || !d)
        return <div className="p-8 text-muted-foreground text-sm">{fa ? "در حال بارگذاری پرونده…" : "Loading case…"}</div>;
    const caseData = d;
    async function transition(status: string) {
        let closure_waiver_reason: null | string = null;
        if (status === "closed" && caseData.outcomes.length === 0) {
            closure_waiver_reason = window.prompt(
                fa
                    ? "برای بستن بدون نتیجه اندازه‌گیری‌شده، دلیل معافیت ممیزی‌شده را وارد کنید:"
                    : "Enter the audited waiver reason for closure without a measured outcome:",
            );
            if (!closure_waiver_reason) return;
        }
        await update.mutateAsync({ expected_version: caseData.version, status, closure_waiver_reason });
    }
    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <Link href="/quality/cases" className="text-muted-foreground text-xs hover:underline">
                        {fa ? "بازگشت به پرونده‌ها" : "Back to cases"}
                    </Link>
                    <div className="mt-2 flex items-center gap-2">
                        <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                            <ShieldCheck className="size-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-1">
                                <h1 className="font-semibold text-xl">{d.title}</h1>
                                <HelperTooltip>
                                    {fa
                                        ? "مرکز بررسی پرونده؛ منبع، شواهد، یافته، اقدام و نتیجه در یک تاریخچه قابل ممیزی نگه‌داری می‌شوند."
                                        : "Investigation center joining sources, evidence, findings, actions and outcomes."}
                                </HelperTooltip>
                            </div>
                            <div className="text-muted-foreground text-xs" dir="ltr">
                                {d.reference} · v{d.version}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{d.status}</Badge>
                    <Badge variant="outline">{d.severity}</Badge>
                    {(flow[d.status] || []).map((s) => (
                        <Button
                            key={s}
                            size="sm"
                            variant={s === "closed" ? "outline" : "default"}
                            onClick={() => transition(s)}
                            disabled={update.isPending}
                        >
                            {s}
                        </Button>
                    ))}
                </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="text-muted-foreground text-xs">
                            <T
                                help={
                                    fa
                                        ? "محصول و تنوع برای منبع مرجوعی فقط از ردیف واقعی سفارش تکمیل می‌شوند."
                                        : "Return-linked product/variant is deterministically derived from the order line."
                                }
                            >
                                {fa ? "محصول / تنوع" : "Product / Variant"}
                            </T>
                        </div>
                        <b className="mt-2 block" dir="ltr">
                            {d.product_id ? `#${d.product_id}${d.variation_id ? ` / v#${d.variation_id}` : ""}` : "—"}
                        </b>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-muted-foreground text-xs">
                            <T
                                help={
                                    fa
                                        ? "وضعیت بسته‌شده با حل‌شده یکی نیست و به نتیجه یا معافیت ممیزی‌شده نیاز دارد."
                                        : "Closed is not the same as resolved and requires an outcome or audited waiver."
                                }
                            >
                                {fa ? "راستی‌آزمایی" : "Verification"}
                            </T>
                        </div>
                        <b className="mt-2 block">{d.verification_status}</b>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-muted-foreground text-xs">
                            <T help={fa ? "شواهد ثبت‌شده بعداً بازنویسی نمی‌شوند." : "Evidence is append-only and never rewritten."}>
                                {fa ? "شواهد" : "Evidence"}
                            </T>
                        </div>
                        <b className="mt-2 block">{d.evidence.length}</b>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-muted-foreground text-xs">
                            <T
                                help={
                                    fa
                                        ? "Outcome نتیجه واقعی و قابل‌اندازه‌گیری اقدام است؛ پیش‌بینی نیست."
                                        : "Outcome is a measured action result, not a prediction."
                                }
                            >
                                {fa ? "نتیجه اندازه‌گیری‌شده" : "Measured outcomes"}
                            </T>
                        </div>
                        <b className="mt-2 block">{d.outcomes.length}</b>
                    </CardContent>
                </Card>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">
                            <T
                                help={
                                    fa
                                        ? "فقط شناسه واقعی مرجوعی، نقد، تیکت یا بازپرداخت قابل اتصال است و سرور آن را در مستأجر بررسی می‌کند."
                                        : "Only real tenant-visible return, review, ticket or refund IDs can be linked."
                                }
                            >
                                {fa ? "منابع مرجع" : "Canonical sources"}
                            </T>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <form
                            className="flex gap-2"
                            onSubmit={async (e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                const kind = String(f.get("kind"));
                                await source.mutateAsync({ [kind]: Number(f.get("source_id")), source_role: "signal" });
                                e.currentTarget.reset();
                            }}
                        >
                            <Select name="kind" defaultValue="return_item_id">
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="return_item_id">{fa ? "آیتم مرجوعی" : "Return item"}</SelectItem>
                                    <SelectItem value="product_review_id">{fa ? "نقد محصول" : "Product review"}</SelectItem>
                                    <SelectItem value="support_ticket_id">{fa ? "تیکت" : "Ticket"}</SelectItem>
                                    <SelectItem value="refund_id">{fa ? "بازپرداخت" : "Refund"}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input name="source_id" type="number" min="1" required />
                            <Button type="submit">{fa ? "اتصال" : "Link"}</Button>
                        </form>
                        {d.sources.map((s: any) => (
                            <div key={s.id} className="rounded-lg border p-3 text-xs" dir="ltr">
                                {s.return_item_id
                                    ? `return_item #${s.return_item_id}`
                                    : s.product_review_id
                                      ? `review #${s.product_review_id}`
                                      : s.support_ticket_id
                                        ? `ticket #${s.support_ticket_id}`
                                        : `refund #${s.refund_id}`}
                            </div>
                        ))}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">
                            <T
                                help={
                                    fa
                                        ? "Evidence با هش محتوا dedupe می‌شود و پس از ثبت ویرایش نمی‌شود."
                                        : "Evidence is content-hash deduplicated and immutable after creation."
                                }
                            >
                                {fa ? "شواهد تغییرناپذیر" : "Immutable evidence"}
                            </T>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                await evidence.mutateAsync({
                                    evidence_type: String(f.get("type")),
                                    source_system: "admin",
                                    provenance_type: "operator",
                                    summary: String(f.get("summary")),
                                });
                                e.currentTarget.reset();
                            }}
                            className="grid gap-2 sm:grid-cols-[180px_1fr_auto]"
                        >
                            <Input name="type" defaultValue="operator_note" dir="ltr" />
                            <Input name="summary" required placeholder={fa ? "شرح شواهد مشاهده‌شده" : "Observed evidence"} />
                            <Button type="submit">{fa ? "ثبت" : "Record"}</Button>
                        </form>
                        {d.evidence.map((e: any) => (
                            <div key={e.id} className="rounded-lg border p-3">
                                <div className="text-muted-foreground text-xs" dir="ltr">
                                    {e.evidence_type} · {e.provenance_type}
                                </div>
                                <p className="mt-1 text-sm">{e.summary}</p>
                            </div>
                        ))}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">
                            <T
                                help={
                                    fa
                                        ? "یافته مشاهده‌شده/استنباطی فقط با داوری انسانی به تأییدشده یا ردشده می‌رود."
                                        : "Observed/inferred findings require human adjudication to become validated or disproven."
                                }
                            >
                                {fa ? "یافته‌ها و علت ریشه‌ای" : "Findings & root cause"}
                            </T>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <form
                            className="grid gap-2 sm:grid-cols-[180px_1fr_auto]"
                            onSubmit={async (e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                await finding.mutateAsync({
                                    truth_state: "observed",
                                    finding_type: String(f.get("type")),
                                    statement: String(f.get("statement")),
                                });
                                e.currentTarget.reset();
                            }}
                        >
                            <Input name="type" defaultValue="observation" dir="ltr" />
                            <Input name="statement" required placeholder={fa ? "بیان دقیق یافته" : "Precise finding"} />
                            <Button type="submit">{fa ? "ثبت" : "Record"}</Button>
                        </form>
                        {d.findings.map((f: any) => (
                            <div key={f.id} className="rounded-lg border p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <Badge variant="outline">{f.truth_state}</Badge>
                                        <span className="ms-2 text-xs" dir="ltr">
                                            {f.finding_type}
                                        </span>
                                    </div>
                                    {["observed", "inferred"].includes(f.truth_state) ? (
                                        <div className="flex gap-1">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                    adjudicate.mutate({
                                                        findingId: f.id,
                                                        body: { expected_version: f.version, truth_state: "validated" },
                                                    })
                                                }
                                            >
                                                {fa ? "تأیید" : "Validate"}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                    adjudicate.mutate({
                                                        findingId: f.id,
                                                        body: { expected_version: f.version, truth_state: "disproven" },
                                                    })
                                                }
                                            >
                                                {fa ? "رد" : "Disprove"}
                                            </Button>
                                        </div>
                                    ) : null}
                                </div>
                                <p className="mt-2 text-sm">{f.statement}</p>
                            </div>
                        ))}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">
                            <T
                                help={
                                    fa
                                        ? "اقدام، برنامه اصلاح را ثبت می‌کند؛ اجرای تغییر در دامنه مالک محصول/محتوا/خرید انجام می‌شود."
                                        : "The action records the plan; real changes execute in the owning product/content/procurement domain."
                                }
                            >
                                {fa ? "اقدام و نتیجه" : "Action & outcome"}
                            </T>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <form
                            className="grid gap-2 sm:grid-cols-[180px_1fr_auto]"
                            onSubmit={async (e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                await action.mutateAsync({
                                    quality_case_id: id,
                                    action_type: String(f.get("type")),
                                    title: String(f.get("title")),
                                    verification_metric_key: "return_rate_delivered_units",
                                });
                                e.currentTarget.reset();
                            }}
                        >
                            <Select name="type" defaultValue="product_qa">
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="product_qa">{fa ? "کنترل کیفیت محصول" : "Product QA"}</SelectItem>
                                    <SelectItem value="content_correction">
                                        {fa ? "اصلاح محتوا" : "Content correction"}
                                    </SelectItem>
                                    <SelectItem value="packaging_correction">
                                        {fa ? "اصلاح بسته‌بندی" : "Packaging correction"}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <Input name="title" required placeholder={fa ? "عنوان اقدام" : "Action title"} />
                            <Button type="submit">{fa ? "ایجاد" : "Create"}</Button>
                        </form>
                        <form
                            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                            onSubmit={async (e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                await outcome.mutateAsync({
                                    quality_case_id: id,
                                    metric_key: "return_rate_delivered_units",
                                    unit: "ratio",
                                    baseline_value: Number(f.get("baseline")),
                                    actual_value: Number(f.get("actual")),
                                    assessment: String(f.get("assessment")),
                                });
                                e.currentTarget.reset();
                            }}
                        >
                            <Input name="baseline" type="number" step="0.0001" placeholder={fa ? "مقدار پایه" : "Baseline"} />
                            <Input name="actual" type="number" step="0.0001" placeholder={fa ? "مقدار واقعی" : "Actual"} />
                            <Button type="submit">{fa ? "ثبت نتیجه" : "Record outcome"}</Button>
                            <Textarea
                                className="sm:col-span-3"
                                name="assessment"
                                required
                                placeholder={fa ? "ارزیابی نتیجه و اثرات جانبی" : "Outcome assessment and side effects"}
                            />
                        </form>
                        {d.actions.map((a: any) => (
                            <div key={a.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                                <span>{a.title}</span>
                                <Badge variant="outline">{a.status}</Badge>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        <T
                            help={
                                fa
                                    ? "AI در این فاز تحلیل‌گر است، نه داور؛ بدون provider واقعی هیچ کنترل نمایشی AI وجود ندارد."
                                    : "AI is an analyst, not a judge; no fake AI control is rendered without a real provider."
                            }
                        >
                            {fa ? "سیاست تصمیم‌گیری" : "Decision policy"}
                        </T>
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex items-start gap-3 text-muted-foreground text-sm">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    <p>
                        {fa
                            ? "گزارش مشتری ≠ یافته بازرسی ≠ علت ریشه‌ای تأییدشده. هیچ تقصیر تأمین‌کننده‌ای بدون زنجیره ردیابی واقعی تأیید نمی‌شود."
                            : "Customer report ≠ inspection finding ≠ validated root cause. Supplier fault is never validated without a real traceability chain."}
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
