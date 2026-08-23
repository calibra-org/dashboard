"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { useMerchantMemoryMutation, useMerchantMemoryResource } from "#/lib/queries/merchant-memory";

type Overview = {
    engine_version: string;
    active_memories: number;
    superseded_memories: number;
    expired_memories: number;
    retrieval_count: number;
    effectiveness_samples: number;
    retrieval_usefulness: number | null;
    repeat_error_reduction_proxy: number | null;
};

type Source = {
    id: number;
    source_phase: string;
    source_kind: string;
    source_id: string;
    label: string;
    evidence_role: string;
};

type Memory = {
    id: number;
    public_id: string;
    memory_class: string;
    title: string;
    context: string;
    lesson: string;
    confidence: number | string;
    strength: number | string;
    status: string;
    sensitivity: string;
    retention_class: string;
    relevant_from: string;
    expires_at: string | null;
    sources?: Source[];
    lineage?: {
        predecessors: Array<{ relation: string; public_id: string; title: string; status: string }>;
        successors: Array<{ relation: string; public_id: string; title: string; status: string }>;
    };
};

type Retrieval = {
    retrieval_public_id: string;
    engine_version: string;
    memories: Array<
        Memory & {
            retrieval_score?: number;
            score_components?: { lexical?: number; confidence?: number; strength?: number };
        }
    >;
};

const classLabels: Record<string, string> = {
    operational_incident: "رخداد عملیاتی",
    supplier_lesson: "درس تأمین‌کننده",
    campaign_lesson: "درس کمپین",
    pricing_lesson: "درس قیمت‌گذاری",
    customer_segment_behavior: "رفتار سگمنت مشتری",
    product_quality: "کیفیت محصول",
    architecture_process_decision: "تصمیم معماری/فرایند",
    policy_precedent: "سابقه سیاستی",
};

const percent = (value: unknown) =>
    value == null ? "—" : `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(value) * 100)}٪`;

export function MerchantMemoryWorkspace() {
    const overview = useMerchantMemoryResource<Overview>("overview");
    const records = useMerchantMemoryResource<Memory[]>("records");
    const createMemory = useMerchantMemoryMutation<Memory>();
    const retrieve = useMerchantMemoryMutation<Retrieval>();
    const [retrieval, setRetrieval] = useState<Retrieval | null>(null);
    const [query, setQuery] = useState("");
    const [title, setTitle] = useState("");
    const [lesson, setLesson] = useState("");
    const [context, setContext] = useState("");
    const [sourceId, setSourceId] = useState("");

    const memoryRows = useMemo(() => records.data ?? [], [records.data]);

    async function runRetrieval() {
        const result = await retrieve.mutateAsync({
            path: "retrieve",
            body: {
                query,
                purpose: "decision_support",
                consumer: "human",
                limit: 12,
            },
        });
        setRetrieval(result);
    }

    async function createReviewedMemory() {
        await createMemory.mutateAsync({
            path: "records",
            body: {
                memory_class: "architecture_process_decision",
                title,
                context,
                lesson,
                confidence: 0.8,
                strength: 0.75,
                sensitivity: "internal",
                retention_class: "standard",
                allowed_consumers: ["human", "agent"],
                purposes: ["decision_support"],
                sources: [
                    {
                        source_phase: "manual_reviewed",
                        source_kind: "operator_review",
                        source_id: sourceId || "manual",
                        label: "بازبینی اپراتور",
                        evidence_role: "primary",
                        observed_at: new Date().toISOString(),
                    },
                ],
            },
        });
        setTitle("");
        setLesson("");
        setContext("");
        setSourceId("");
    }

    return (
        <div dir="rtl" className="space-y-6 p-6">
            <PageHeader
                title="حافظه سازمانی بازرگان"
                description="Merchant Memory & Organizational Learning — دانش ساخت‌یافته، منبع‌دار و قابل ممیزی برای تصمیم‌های آینده"
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4">
                    <p className="text-muted-foreground text-sm">حافظه فعال</p>
                    <p className="mt-2 font-semibold text-3xl">{overview.data?.active_memories ?? "—"}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-muted-foreground text-sm">بازیابی‌ها</p>
                    <p className="mt-2 font-semibold text-3xl">{overview.data?.retrieval_count ?? "—"}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-muted-foreground text-sm">سودمندی بازیابی</p>
                    <p className="mt-2 font-semibold text-3xl">{percent(overview.data?.retrieval_usefulness)}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-muted-foreground text-sm">کاهش تکرار خطا</p>
                    <p className="mt-2 font-semibold text-3xl">{percent(overview.data?.repeat_error_reduction_proxy)}</p>
                </Card>
            </div>

            <Card className="space-y-4 p-5">
                <div>
                    <h2 className="font-semibold text-lg">بازیابی منبع‌دار</h2>
                    <p className="text-muted-foreground text-sm">فقط memory فعال، غیرمنقضی و دارای evidence وارد نتیجه می‌شود.</p>
                </div>
                <div className="flex flex-col gap-3 md:flex-row">
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="مثلاً: درس کمپین تخفیف یا تأمین‌کننده"
                    />
                    <Button onClick={runRetrieval} disabled={retrieve.isPending || !query.trim()}>
                        بازیابی حافظه
                    </Button>
                </div>
                {retrieval ? (
                    <div className="space-y-3">
                        <p className="text-muted-foreground text-xs">Retrieval ID: {retrieval.retrieval_public_id}</p>
                        {retrieval.memories.length === 0 ? (
                            <p className="text-muted-foreground text-sm">حافظه مرتبطی پیدا نشد.</p>
                        ) : null}
                        {retrieval.memories.map((memory) => (
                            <div key={memory.public_id} className="rounded-lg border p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <strong>{memory.title}</strong>
                                    <span className="text-muted-foreground text-xs">
                                        {classLabels[memory.memory_class] ?? memory.memory_class}
                                    </span>
                                </div>
                                <p className="mt-2 text-sm">{memory.lesson}</p>
                                <div className="mt-3 flex flex-wrap gap-3 text-muted-foreground text-xs">
                                    <span>اعتماد: {percent(memory.confidence)}</span>
                                    <span>قدرت: {percent(memory.strength)}</span>
                                    <span>حساسیت: {memory.sensitivity}</span>
                                    <span>Evidence: {memory.sources?.length ?? 0}</span>
                                    {memory.retrieval_score != null ? <span>Score: {memory.retrieval_score}</span> : null}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null}
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                <Card className="p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="font-semibold text-lg">دفتر حافظه</h2>
                            <p className="text-muted-foreground text-sm">Active / superseded / expiry / evidence lineage</p>
                        </div>
                        <span className="text-muted-foreground text-xs">
                            {overview.data?.engine_version ?? "merchant-memory"}
                        </span>
                    </div>
                    <div className="space-y-3">
                        {memoryRows.map((memory) => (
                            <div key={memory.public_id} className="rounded-lg border p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <strong>{memory.title}</strong>
                                        <p className="mt-1 text-muted-foreground text-sm">{memory.lesson}</p>
                                    </div>
                                    <span className="rounded-md border px-2 py-1 text-xs">{memory.status}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-3 text-muted-foreground text-xs">
                                    <span>{classLabels[memory.memory_class] ?? memory.memory_class}</span>
                                    <span>{memory.sensitivity}</span>
                                    <span>{memory.retention_class}</span>
                                    <span>اعتماد {percent(memory.confidence)}</span>
                                    <span>
                                        {memory.expires_at
                                            ? `انقضا: ${new Date(memory.expires_at).toLocaleDateString("fa-IR")}`
                                            : "بدون انقضای صریح"}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>

                <Card className="space-y-4 p-5">
                    <div>
                        <h2 className="font-semibold text-lg">ثبت درس بازبینی‌شده</h2>
                        <p className="text-muted-foreground text-sm">
                            برای knowledge دستی فقط مسیر manual_reviewed استفاده می‌شود.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label>عنوان</Label>
                        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>زمینه</Label>
                        <Textarea value={context} onChange={(event) => setContext(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>درس</Label>
                        <Textarea value={lesson} onChange={(event) => setLesson(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>شناسه مرجع بازبینی</Label>
                        <Input value={sourceId} onChange={(event) => setSourceId(event.target.value)} />
                    </div>
                    <Button
                        className="w-full"
                        onClick={createReviewedMemory}
                        disabled={createMemory.isPending || !title.trim() || !context.trim() || !lesson.trim()}
                    >
                        ثبت حافظه
                    </Button>
                </Card>
            </div>
        </div>
    );
}
