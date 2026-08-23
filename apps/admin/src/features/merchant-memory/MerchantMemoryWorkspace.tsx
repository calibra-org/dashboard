"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { useMerchantMemoryMutation, useMerchantMemoryResource } from "#/lib/queries/merchant-memory";

type MemoryRow = {
    id: number;
    public_id: string;
    memory_key: string;
    memory_class: string;
    scope_kind: string;
    scope_key: string | null;
    title: string;
    lesson: string;
    context: string;
    confidence: number | string;
    strength: number | string;
    privacy_level: string;
    retention_class: string;
    status: string;
    version: number;
    expires_at: string | null;
    updated_at: string;
    retrieval_score?: number;
    evidence?: Evidence[];
};

type Evidence = {
    id?: number;
    source_kind: string;
    source_ref: string;
    source_route?: string | null;
    label: string;
    evidence_role?: string;
};

type Overview = {
    version: string;
    memories: Array<{ memory_class: string; status: string; count: string | number }>;
    feedback: Array<{ feedback: string; count: string | number }>;
    retrieval_count: number;
    repeat_errors_prevented: number;
};

type RetrievalResult = {
    retrieval_public_id: string;
    restricted_allowed: boolean;
    results: MemoryRow[];
};

const classLabels: Record<string, string> = {
    operational_incident: "رخداد عملیاتی",
    supplier_lesson: "درس تأمین‌کننده",
    campaign_lesson: "درس کمپین",
    pricing_lesson: "درس قیمت‌گذاری",
    customer_segment_behavior: "رفتار سگمنت مشتری",
    product_quality: "کیفیت محصول",
    architecture_process_decision: "تصمیم معماری/فرآیند",
    policy_precedent: "سابقه سیاستی",
};

const statusLabels: Record<string, string> = {
    active: "فعال",
    superseded: "جایگزین‌شده",
    expired: "منقضی",
    revoked: "لغوشده",
};

const percent = (value: unknown) =>
    `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(value ?? 0) * 100)}٪`;

export function MerchantMemoryWorkspace() {
    const overview = useMerchantMemoryResource<Overview>("overview");
    const memories = useMerchantMemoryResource<MemoryRow[]>("memories?limit=50");
    const createMemory = useMerchantMemoryMutation<MemoryRow>();
    const retrieveMemory = useMerchantMemoryMutation<RetrievalResult>();
    const feedback = useMerchantMemoryMutation<{ recorded: boolean }>();

    const [query, setQuery] = useState("");
    const [retrieval, setRetrieval] = useState<RetrievalResult | null>(null);
    const [memoryKey, setMemoryKey] = useState("");
    const [title, setTitle] = useState("");
    const [context, setContext] = useState("");
    const [lesson, setLesson] = useState("");
    const [sourceKind, setSourceKind] = useState("intelligence_outcome");
    const [sourceRef, setSourceRef] = useState("");
    const [sourceLabel, setSourceLabel] = useState("");
    const [message, setMessage] = useState<string | null>(null);

    const counts = useMemo(() => {
        const rows = overview.data?.memories ?? [];
        return {
            total: rows.reduce((sum, row) => sum + Number(row.count), 0),
            active: rows.filter((row) => row.status === "active").reduce((sum, row) => sum + Number(row.count), 0),
            superseded: rows.filter((row) => row.status === "superseded").reduce((sum, row) => sum + Number(row.count), 0),
            expired: rows.filter((row) => row.status === "expired").reduce((sum, row) => sum + Number(row.count), 0),
        };
    }, [overview.data]);

    const handleRetrieve = async () => {
        if (query.trim().length < 2) return;
        setMessage(null);
        try {
            const result = await retrieveMemory.mutateAsync({
                path: "retrieve",
                body: { query: query.trim(), purpose: "decision_support", limit: 8 },
            });
            setRetrieval(result);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "بازیابی حافظه ناموفق بود.");
        }
    };

    const handleCreate = async () => {
        if (!memoryKey.trim() || !title.trim() || !context.trim() || !lesson.trim() || !sourceRef.trim() || !sourceLabel.trim()) {
            setMessage("برای ثبت حافظه، کلید، عنوان، زمینه، درس و منبع معتبر لازم است.");
            return;
        }
        setMessage(null);
        try {
            await createMemory.mutateAsync({
                path: "memories",
                body: {
                    memory_key: memoryKey.trim(),
                    memory_class: "operational_incident",
                    scope_kind: "merchant",
                    title: title.trim(),
                    context: context.trim(),
                    lesson: lesson.trim(),
                    confidence: 0.7,
                    strength: 0.7,
                    privacy_level: "internal",
                    retention_class: "standard",
                    evidence: [
                        {
                            source_kind: sourceKind,
                            source_ref: sourceRef.trim(),
                            label: sourceLabel.trim(),
                            evidence_role: "supporting",
                        },
                    ],
                },
            });
            setMemoryKey("");
            setTitle("");
            setContext("");
            setLesson("");
            setSourceRef("");
            setSourceLabel("");
            setMessage("حافظه با evidence معتبر ثبت شد.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "ثبت حافظه ناموفق بود.");
        }
    };

    const handleFeedback = async (row: MemoryRow, kind: "useful" | "irrelevant" | "applied" | "incorrect") => {
        if (!retrieval) return;
        try {
            await feedback.mutateAsync({
                path: `retrievals/${retrieval.retrieval_public_id}/feedback`,
                body: {
                    memory_public_id: row.public_id,
                    feedback: kind,
                    usefulness_score: kind === "useful" || kind === "applied" ? 1 : 0,
                },
            });
            setMessage("بازخورد برای سنجش اثربخشی حافظه ثبت شد.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "ثبت بازخورد ناموفق بود.");
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="حافظه سازمانی فروشگاه"
                description="Merchant Memory — دانش تصمیم‌ها را با منبع، سابقه تغییر، انقضا و سنجش اثربخشی نگه می‌دارد؛ نه به‌صورت متن آزاد و بدون سند."
            />

            <div className="grid gap-3 md:grid-cols-4">
                <Metric label="کل حافظه‌ها" value={counts.total} />
                <Metric label="حافظه فعال" value={counts.active} />
                <Metric label="جایگزین/منقضی" value={counts.superseded + counts.expired} />
                <Metric label="خطای تکراری پیشگیری‌شده" value={overview.data?.repeat_errors_prevented ?? 0} />
            </div>

            <Card className="space-y-4 p-5">
                <div>
                    <h2 className="text-base font-semibold">بازیابی تصمیم‌محور</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        نتیجه فقط از حافظه‌های فعال و source-linked برمی‌گردد. حافظه منقضی یا superseded در بازیابی عادی حذف می‌شود.
                    </p>
                </div>
                <div className="flex flex-col gap-2 md:flex-row">
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="مثلاً در اختلال قبلی تأمین‌کننده چه تصمیمی گرفتیم؟"
                        className="flex-1"
                    />
                    <Button onClick={handleRetrieve} disabled={retrieveMemory.isPending || query.trim().length < 2}>
                        {retrieveMemory.isPending ? "در حال بازیابی…" : "بازیابی حافظه"}
                    </Button>
                </div>
                {retrieval ? (
                    <div className="space-y-3 border-t border-border pt-4">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>شناسه بازیابی: {retrieval.retrieval_public_id}</span>
                            <span>•</span>
                            <span>{new Intl.NumberFormat("fa-IR").format(retrieval.results.length)} نتیجه</span>
                        </div>
                        {retrieval.results.length === 0 ? (
                            <p className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">حافظه مرتبط و معتبر پیدا نشد.</p>
                        ) : (
                            retrieval.results.map((row) => (
                                <MemoryCard key={row.public_id} row={row} onFeedback={handleFeedback} />
                            ))
                        )}
                    </div>
                ) : null}
            </Card>

            <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
                <Card className="space-y-4 p-5">
                    <div>
                        <h2 className="text-base font-semibold">ثبت حافظه مستند</h2>
                        <p className="mt-1 text-sm text-muted-foreground">هر حافظه باید حداقل یک رکورد معتبر از authorityهای قبلی داشته باشد.</p>
                    </div>
                    <Field label="کلید پایدار حافظه">
                        <Input value={memoryKey} onChange={(event) => setMemoryKey(event.target.value)} placeholder="supplier-delay-q3" />
                    </Field>
                    <Field label="عنوان">
                        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="درس اختلال تأمین‌کننده" />
                    </Field>
                    <Field label="زمینه">
                        <Textarea value={context} onChange={(event) => setContext(event.target.value)} rows={3} />
                    </Field>
                    <Field label="درس قابل استفاده مجدد">
                        <Textarea value={lesson} onChange={(event) => setLesson(event.target.value)} rows={3} />
                    </Field>
                    <div className="grid gap-3 md:grid-cols-2">
                        <Field label="نوع منبع">
                            <select
                                value={sourceKind}
                                onChange={(event) => setSourceKind(event.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                                <option value="intelligence_outcome">Outcome فاز ۱۰</option>
                                <option value="intelligence_decision">Decision فاز ۱۰</option>
                                <option value="governance_approval">Approval فاز ۱۱</option>
                                <option value="experiment_analysis">Analysis فاز ۱۷</option>
                                <option value="orchestrator_tool_run">Tool Run فاز ۲۲</option>
                                <option value="growth_portfolio_outcome">Outcome فاز ۲۵</option>
                            </select>
                        </Field>
                        <Field label="شناسه رکورد منبع">
                            <Input value={sourceRef} onChange={(event) => setSourceRef(event.target.value)} inputMode="numeric" />
                        </Field>
                    </div>
                    <Field label="برچسب evidence">
                        <Input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} placeholder="نتیجه اندازه‌گیری‌شده تصمیم" />
                    </Field>
                    <Button onClick={handleCreate} disabled={createMemory.isPending} className="w-full">
                        {createMemory.isPending ? "در حال ثبت…" : "ثبت حافظه مستند"}
                    </Button>
                </Card>

                <Card className="p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-base font-semibold">دفتر حافظه</h2>
                            <p className="mt-1 text-sm text-muted-foreground">نسخه‌ها و وضعیت retention بدون overwrite قابل ممیزی هستند.</p>
                        </div>
                        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                            {overview.data?.version ?? "merchant-memory"}
                        </span>
                    </div>
                    <div className="space-y-3">
                        {(memories.data ?? []).map((row) => (
                            <div key={row.public_id} className="rounded-lg border border-border p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <div className="font-medium">{row.title}</div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {classLabels[row.memory_class] ?? row.memory_class} · نسخه {new Intl.NumberFormat("fa-IR").format(row.version)}
                                        </div>
                                    </div>
                                    <span className="rounded-full bg-muted px-2 py-1 text-xs">{statusLabels[row.status] ?? row.status}</span>
                                </div>
                                <p className="mt-3 text-sm leading-6">{row.lesson}</p>
                                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                    <span>اطمینان {percent(row.confidence)}</span>
                                    <span>قدرت {percent(row.strength)}</span>
                                    <span>حریم: {row.privacy_level}</span>
                                    <span>نگهداشت: {row.retention_class}</span>
                                </div>
                            </div>
                        ))}
                        {!memories.isLoading && (memories.data?.length ?? 0) === 0 ? (
                            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">هنوز حافظه‌ای ثبت نشده است.</div>
                        ) : null}
                    </div>
                </Card>
            </div>

            {message ? <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">{message}</div> : null}
        </div>
    );
}

function Metric({ label, value }: { label: string; value: number }) {
    return (
        <Card className="p-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-2 text-2xl font-semibold">{new Intl.NumberFormat("fa-IR").format(value)}</div>
        </Card>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            {children}
        </div>
    );
}

function MemoryCard({
    row,
    onFeedback,
}: {
    row: MemoryRow;
    onFeedback: (row: MemoryRow, kind: "useful" | "irrelevant" | "applied" | "incorrect") => void;
}) {
    return (
        <div className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <div className="font-medium">{row.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        {classLabels[row.memory_class] ?? row.memory_class} · امتیاز بازیابی {percent(row.retrieval_score ?? 0)}
                    </div>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-xs">{statusLabels[row.status] ?? row.status}</span>
            </div>
            <p className="mt-3 text-sm leading-6">{row.lesson}</p>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {(row.evidence ?? []).slice(0, 3).map((item, index) => (
                    <div key={`${item.source_kind}-${item.source_ref}-${index}`}>منبع: {item.label} · {item.source_kind} #{item.source_ref}</div>
                ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onFeedback(row, "useful")}>مفید بود</Button>
                <Button size="sm" variant="outline" onClick={() => onFeedback(row, "applied")}>استفاده شد</Button>
                <Button size="sm" variant="ghost" onClick={() => onFeedback(row, "irrelevant")}>نامرتبط</Button>
                <Button size="sm" variant="ghost" onClick={() => onFeedback(row, "incorrect")}>نادرست</Button>
            </div>
        </div>
    );
}
