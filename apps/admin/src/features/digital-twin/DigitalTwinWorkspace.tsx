"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { useDigitalTwinMutation, useDigitalTwinResource } from "#/lib/queries/digital-twin";

type Scenario = { public_id: string; title: string; objective: string; version: number; assumptions: Record<string, number> };
type Metric = { metric_key: string; p10: string | number; p50: string | number; p90: string | number; unit: string; confidence: string | number };
type Overview = { engine_version: string; scenarios: number; runs: number; latest_run: { public_id: string } | null; latest_metrics: Metric[] };

const fmt = (value: unknown) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(Number(value ?? 0));
const labels: Record<string, string> = { revenue: "درآمد", gross_margin: "حاشیه سود ناخالص", demand_units: "تقاضا", stockout_risk: "ریسک اتمام موجودی", service_level: "سطح خدمت", working_capital: "سرمایه در گردش", capital_pressure: "فشار سرمایه" };

function MetricCard({ metric }: { metric: Metric }) {
    const ratio = metric.unit === "ratio";
    const show = (v: unknown) => ratio ? `${fmt(Number(v) * 100)}٪` : fmt(v);
    return <Card className="relative overflow-hidden p-5">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
        <div className="flex items-center gap-2 text-muted-foreground text-sm">{labels[metric.metric_key] ?? metric.metric_key}<HelperTooltip>بازه عدم‌قطعیت P10/P50/P90 از snapshot واقعی سناریو؛ نه عدد تزئینی.</HelperTooltip></div>
        <div className="mt-3 font-semibold text-2xl tabular-nums">{show(metric.p50)}</div>
        <div className="mt-3 flex justify-between rounded-xl bg-muted/50 px-3 py-2 text-xs tabular-nums"><span>P10 · {show(metric.p10)}</span><span>P90 · {show(metric.p90)}</span></div>
        <div className="mt-2 text-muted-foreground text-xs">اعتماد {fmt(Number(metric.confidence) * 100)}٪</div>
    </Card>;
}

export function DigitalTwinWorkspace() {
    const overview = useDigitalTwinResource<Overview>("overview");
    const scenarios = useDigitalTwinResource<Scenario[]>("scenarios");
    const create = useDigitalTwinMutation<Scenario>();
    const run = useDigitalTwinMutation<any>();
    const [title, setTitle] = useState(""); const [objective, setObjective] = useState("");
    const [demand, setDemand] = useState("1"); const [price, setPrice] = useState("1"); const [cost, setCost] = useState("1"); const [lead, setLead] = useState("1"); const [capacity, setCapacity] = useState("1");
    const metrics = overview.data?.latest_metrics ?? [];
    const risk = useMemo(() => metrics.find((m) => m.metric_key === "stockout_risk"), [metrics]);
    return <div className="space-y-6">
        <PageHeader title="اتاق جنگ سناریو" subtitle="Commerce Digital Twin · شبیه‌سازی تصمیم قبل از اجرای واقعی" />
        <div className="grid gap-3 md:grid-cols-3">
            <Card className="p-5"><div className="text-muted-foreground text-sm">سناریوها</div><div className="mt-2 text-3xl font-semibold">{overview.data?.scenarios ?? "—"}</div></Card>
            <Card className="p-5"><div className="text-muted-foreground text-sm">Runهای بازتولیدپذیر</div><div className="mt-2 text-3xl font-semibold">{overview.data?.runs ?? "—"}</div></Card>
            <Card className="p-5"><div className="text-muted-foreground text-sm">موتور</div><div className="mt-2 font-semibold">{overview.data?.engine_version ?? "—"}</div><div className="mt-1 text-xs text-muted-foreground">deterministic · non-mutating</div></Card>
        </div>
        {overview.isError ? <Card className="border-destructive/40 p-5 text-destructive">دریافت وضعیت Digital Twin ناموفق بود.</Card> : null}
        <div className="grid gap-4 xl:grid-cols-[1.05fr_1.95fr]">
            <Card className="space-y-4 p-5">
                <div><h2 className="font-semibold text-lg">سناریوی جدید</h2><p className="mt-1 text-muted-foreground text-sm">فرض‌ها bounded هستند و هیچ عملیات واقعی روی سفارش، قیمت یا موجودی انجام نمی‌شود.</p></div>
                <div><Label>عنوان</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً رشد تقاضای پاییز" /></div>
                <div><Label>هدف تصمیم</Label><Textarea value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="چه تصمیمی را قبل از اجرا می‌خواهیم بسنجیم؟" /></div>
                <div className="grid grid-cols-2 gap-3">
                    {[ ["تقاضا", demand, setDemand], ["قیمت", price, setPrice], ["هزینه", cost, setCost], ["Lead time", lead, setLead], ["ظرفیت", capacity, setCapacity] ].map(([label, value, setter]: any) => <div key={label}><Label>{label} ×</Label><Input inputMode="decimal" value={value} onChange={(e) => setter(e.target.value)} /></div>)}
                </div>
                <Button className="w-full" disabled={title.trim().length < 3 || objective.trim().length < 8 || create.isPending} onClick={() => create.mutate({ path: "scenarios", body: { title, objective, assumptions: { demand_multiplier: Number(demand), price_multiplier: Number(price), cost_multiplier: Number(cost), lead_time_multiplier: Number(lead), capacity_multiplier: Number(capacity), campaign_lift: 0, service_level_target: 0.9 }, source_refs: {} } })}>ذخیره سناریو</Button>
            </Card>
            <div className="space-y-4">
                <Card className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-lg">سناریوهای آماده</h2><p className="text-muted-foreground text-sm">هر اجرا snapshot و hash مستقل دارد.</p></div>{risk ? <div className="rounded-full border px-3 py-1 text-sm">ریسک موجودی: {fmt(Number(risk.p50) * 100)}٪</div> : null}</div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {scenarios.isLoading ? <div className="text-muted-foreground text-sm">در حال بارگذاری…</div> : null}
                        {scenarios.data?.length === 0 ? <div className="text-muted-foreground text-sm">هنوز سناریویی ثبت نشده است.</div> : null}
                        {scenarios.data?.map((s) => <div key={s.public_id} className="rounded-2xl border bg-card/70 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{s.title}</div><div className="mt-1 line-clamp-2 text-muted-foreground text-sm">{s.objective}</div></div><span className="rounded-full bg-muted px-2 py-1 text-xs">v{s.version}</span></div><Button variant="outline" className="mt-4 w-full" disabled={run.isPending} onClick={() => run.mutate({ path: `scenarios/${s.public_id}/run`, body: { seed: 23001 } })}>اجرای شبیه‌سازی</Button></div>)}
                    </div>
                </Card>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map((m) => <MetricCard key={m.metric_key} metric={m} />)}</div>
            </div>
        </div>
    </div>;
}
