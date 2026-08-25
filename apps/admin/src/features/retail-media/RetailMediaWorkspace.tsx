"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { BadgePercent, ChartNoAxesCombined, Megaphone, ShieldCheck, Sparkles, Users, Wallet } from "#/icons";
import {
    type RetailMediaAccessRow,
    type RetailMediaCampaign,
    type RetailMediaCommission,
    type RetailMediaCreator,
    type RetailMediaMeasurement,
    type RetailMediaOverview,
    type RetailMediaPlacement,
    useRetailMediaMutation,
    useRetailMediaResource,
} from "#/lib/queries/retail-media";
import { cn } from "#/lib/utils";

type Tab = "overview" | "campaigns" | "placements" | "creators" | "measurement" | "access";
type Advertiser = { id: number; public_id: string; name: string; kind: string; status: string };

const tabs: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: "نمای کلی" },
    { key: "campaigns", label: "کمپین‌ها" },
    { key: "placements", label: "جایگاه‌ها" },
    { key: "creators", label: "سازندگان" },
    { key: "measurement", label: "اندازه‌گیری" },
    { key: "access", label: "دسترسی" },
];

const money = (value: number | null | undefined) => new Intl.NumberFormat("fa-IR").format(Number(value ?? 0));
const number = (value: number | null | undefined) => new Intl.NumberFormat("fa-IR").format(Number(value ?? 0));

function StatusPill({ status }: { status: string }) {
    const labels: Record<string, string> = {
        draft: "پیش‌نویس",
        review: "در بررسی",
        active: "فعال",
        paused: "متوقف",
        ended: "پایان‌یافته",
        archived: "آرشیو",
        commission: "کمیسیون",
        refund_adjustment: "اصلاح برگشت وجه",
        payout: "پرداخت",
        manual_adjustment: "اصلاح دستی",
    };
    return <span className="inline-flex rounded-full border bg-muted/50 px-2.5 py-1 font-medium text-[11px]">{labels[status] ?? status}</span>;
}

function MetricCard({ title, value, hint, icon: Icon }: { title: string; value: string; hint: string; icon: typeof Wallet }) {
    return (
        <Card className="relative overflow-hidden border-border/70 p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-muted-foreground text-xs">{title}</p>
                    <p className="mt-2 font-semibold text-2xl tracking-tight">{value}</p>
                </div>
                <div className="rounded-xl border bg-primary/5 p-2.5 text-primary"><Icon className="size-5" /></div>
            </div>
            <p className="mt-3 text-muted-foreground text-xs leading-5">{hint}</p>
        </Card>
    );
}

function EmptyState({ title, body }: { title: string; body: string }) {
    return (
        <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
            <Sparkles className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">{title}</p>
            <p className="mt-1 text-muted-foreground text-sm">{body}</p>
        </div>
    );
}

function ErrorState({ message }: { message: string }) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">{message}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <Label>{label}</Label>
                {hint ? <HelperTooltip text={hint} /> : null}
            </div>
            {children}
        </div>
    );
}

export function RetailMediaWorkspace() {
    const [tab, setTab] = useState<Tab>("overview");
    const overview = useRetailMediaResource<RetailMediaOverview>("overview");
    const campaigns = useRetailMediaResource<RetailMediaCampaign[]>("campaigns");
    const advertisers = useRetailMediaResource<Advertiser[]>("advertisers", tab === "campaigns");
    const placements = useRetailMediaResource<RetailMediaPlacement[]>("placements", tab === "placements" || tab === "campaigns");
    const creators = useRetailMediaResource<RetailMediaCreator[]>("creators", tab === "creators");
    const commissions = useRetailMediaResource<RetailMediaCommission[]>("commissions", tab === "creators");
    const measurement = useRetailMediaResource<RetailMediaMeasurement>("measurement", tab === "overview" || tab === "measurement");
    const access = useRetailMediaResource<RetailMediaAccessRow[]>("access", tab === "access");

    const post = useRetailMediaMutation<Record<string, unknown>>();
    const patch = useRetailMediaMutation<Record<string, unknown>>("PATCH");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const run = (path: string, body: Record<string, unknown>, method: "POST" | "PATCH" = "POST") => {
        setMessage("");
        setError("");
        const mutation = method === "PATCH" ? patch : post;
        mutation.mutate(
            { path, body },
            {
                onSuccess: () => setMessage("تغییر با موفقیت ثبت شد."),
                onError: (err) => setError(err.message),
            },
        );
    };

    const chartData = useMemo(
        () =>
            (measurement.data?.campaigns ?? []).map((item) => ({
                name: item.name.length > 16 ? `${item.name.slice(0, 16)}…` : item.name,
                spend: item.delivery.spend_minor,
                revenue: item.delivery.revenue_minor ?? 0,
                incremental: item.incrementality.incremental_contribution_minor ?? 0,
            })),
        [measurement.data],
    );

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="رسانه تجاری و اقتصاد سازندگان"
                description="کنترل یکپارچه تبلیغات بومی، بودجه و pacing، جایگاه‌های Sponsored، همکاری سازندگان و سنجش incrementality با guardrailهای اعتماد."
            />

            <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-primary/10 via-background to-muted/30 p-6 shadow-sm">
                <div className="absolute -start-24 -top-24 size-56 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
                    <div>
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs backdrop-blur">
                            <BadgePercent className="size-4 text-primary" /> Phase 30 · Retail Media OS
                        </div>
                        <h2 className="font-semibold text-2xl tracking-tight">درآمد تبلیغاتی، بدون فروختن اعتماد مشتری</h2>
                        <p className="mt-3 max-w-3xl text-muted-foreground text-sm leading-7">
                            محصول نامرتبط، ناامن یا ناموجود قبل از bid حذف می‌شود. Sponsored label اجباری است و bid فقط سیگنال محدود رتبه است؛ اندازه‌گیری نیز زیر حد cohort نمایش داده نمی‌شود.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        {["Eligibility قبل از auction", "Budget ledger ممیزی‌پذیر", "Refund-aware commission", "Phase 17 incrementality"].map((item) => (
                            <div key={item} className="rounded-2xl border bg-background/70 p-3 backdrop-blur">
                                <ShieldCheck className="mb-2 size-4 text-primary" />
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </Card>

            <div className="flex flex-wrap gap-2 rounded-2xl border bg-muted/20 p-2">
                {tabs.map((item) => (
                    <Button
                        key={item.key}
                        type="button"
                        variant={tab === item.key ? "default" : "ghost"}
                        className="rounded-xl"
                        onClick={() => setTab(item.key)}
                    >
                        {item.label}
                    </Button>
                ))}
            </div>

            {message ? <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">{message}</div> : null}
            {error ? <ErrorState message={error} /> : null}

            {tab === "overview" ? <OverviewTab overview={overview.data} loading={overview.isLoading} error={overview.error} chartData={chartData} /> : null}
            {tab === "campaigns" ? (
                <CampaignsTab campaigns={campaigns.data ?? []} advertisers={advertisers.data ?? []} placements={placements.data ?? []} run={run} />
            ) : null}
            {tab === "placements" ? <PlacementsTab placements={placements.data ?? []} run={run} /> : null}
            {tab === "creators" ? <CreatorsTab creators={creators.data ?? []} commissions={commissions.data ?? []} campaigns={campaigns.data ?? []} run={run} /> : null}
            {tab === "measurement" ? <MeasurementTab data={measurement.data} loading={measurement.isLoading} error={measurement.error} chartData={chartData} /> : null}
            {tab === "access" ? <AccessTab rows={access.data ?? []} run={run} /> : null}
        </div>
    );
}

function OverviewTab({
    overview,
    loading,
    error,
    chartData,
}: {
    overview?: RetailMediaOverview;
    loading: boolean;
    error: Error | null;
    chartData: Array<{ name: string; spend: number; revenue: number; incremental: number }>;
}) {
    if (loading) return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Card key={index} className="h-36 animate-pulse bg-muted/30" />)}</div>;
    if (error) return <ErrorState message={error.message} />;
    if (!overview) return <EmptyState title="هنوز داده‌ای نیست" body="بعد از ایجاد اولین کمپین، شاخص‌های واقعی اینجا نمایش داده می‌شوند." />;
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="کمپین فعال" value={number(overview.kpis.active_campaigns)} hint={`از ${number(overview.kpis.campaigns)} کمپین`} icon={Megaphone} />
                <MetricCard title="جایگاه فعال" value={number(overview.kpis.active_placements)} hint="Search، Category، Story، Video و کانال‌های رضایت‌محور" icon={BadgePercent} />
                <MetricCard title="هزینه رسانه" value={money(overview.kpis.net_media_spend_minor)} hint="از ledger واقعی؛ بدون metric نمایشی" icon={Wallet} />
                <MetricCard title="کمیسیون در انتظار" value={money(overview.kpis.pending_commission_minor)} hint="تا پایان holding period و reconciliation برگشت وجه" icon={Users} />
            </div>
            <Card className="p-5">
                <div className="mb-5 flex items-center justify-between gap-4">
                    <div><h3 className="font-semibold">Spend در برابر درآمد منتسب و contribution افزایشی</h3><p className="mt-1 text-muted-foreground text-xs">اعداد فقط از measurement API؛ cohortهای کوچک suppression می‌شوند.</p></div>
                    <ChartNoAxesCombined className="size-5 text-primary" />
                </div>
                {chartData.length ? (
                    <div className="h-80 w-full" dir="ltr">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip formatter={(value) => money(Number(value))} />
                                <Bar dataKey="spend" name="Spend" fill="var(--muted-foreground)" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="revenue" name="Attributed revenue" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="incremental" name="Incremental contribution" fill="var(--chart-2, var(--primary))" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : <EmptyState title="نمودار هنوز داده ندارد" body="پس از delivery و رسیدن cohort به حد حریم خصوصی، نمودار فعال می‌شود." />}
            </Card>
        </div>
    );
}

function CampaignsTab({ campaigns, advertisers, placements, run }: { campaigns: RetailMediaCampaign[]; advertisers: Advertiser[]; placements: RetailMediaPlacement[]; run: (path: string, body: Record<string, unknown>, method?: "POST" | "PATCH") => void }) {
    const [advertiserName, setAdvertiserName] = useState("");
    const [advertiserId, setAdvertiserId] = useState("");
    const [campaignName, setCampaignName] = useState("");
    const [budget, setBudget] = useState("");
    const [bid, setBid] = useState("");
    const [selectedCampaign, setSelectedCampaign] = useState("");
    const [productId, setProductId] = useState("");
    const [relevance, setRelevance] = useState("7500");
    const [quality, setQuality] = useState("7500");
    const [placementId, setPlacementId] = useState("");
    const [creative, setCreative] = useState("{}");
    const [funding, setFunding] = useState("");
    const [reason, setReason] = useState("تنظیم عملیاتی Phase 30");

    return (
        <div className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="p-5">
                    <h3 className="font-semibold">تعریف تبلیغ‌دهنده و کمپین</h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <Field label="نام تبلیغ‌دهنده"><Input value={advertiserName} onChange={(event) => setAdvertiserName(event.target.value)} placeholder="برند / تأمین‌کننده" /></Field>
                        <div className="flex items-end"><Button className="w-full" variant="outline" onClick={() => run("advertisers", { name: advertiserName, kind: "brand", metadata: {}, reason })}>ثبت تبلیغ‌دهنده</Button></div>
                        <Field label="تبلیغ‌دهنده">
                            <Select value={advertiserId} onValueChange={setAdvertiserId}><SelectTrigger><SelectValue placeholder="انتخاب" /></SelectTrigger><SelectContent>{advertisers.map((item) => <SelectItem key={item.public_id} value={item.public_id}>{item.name}</SelectItem>)}</SelectContent></Select>
                        </Field>
                        <Field label="نام کمپین"><Input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} /></Field>
                        <Field label="بودجه کل (minor unit)" hint="مبلغ همیشه در کوچک‌ترین واحد پول ذخیره می‌شود."><Input inputMode="numeric" value={budget} onChange={(event) => setBudget(event.target.value)} /></Field>
                        <Field label="Bid پایه"><Input inputMode="numeric" value={bid} onChange={(event) => setBid(event.target.value)} /></Field>
                        <div className="sm:col-span-2"><Button className="w-full" onClick={() => run("campaigns", { advertiser_public_id: advertiserId, name: campaignName, objective: "incremental_contribution", bid_model: "cpc", default_bid_minor: Number(bid), budget_total_minor: Number(budget), currency: "IRR", attribution_window_days: 7, reason })}>ساخت کمپین CPC</Button></div>
                    </div>
                </Card>

                <Card className="p-5">
                    <h3 className="font-semibold">اتصال delivery</h3>
                    <p className="mt-1 text-muted-foreground text-xs">Safety/Relevance/Quality قبل از bid enforce می‌شوند؛ بدون product approved + placement فعال، کمپین فعال نمی‌شود.</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <Field label="کمپین"><Select value={selectedCampaign} onValueChange={setSelectedCampaign}><SelectTrigger><SelectValue placeholder="انتخاب" /></SelectTrigger><SelectContent>{campaigns.map((item) => <SelectItem key={item.public_id} value={item.public_id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
                        <Field label="Product ID"><Input inputMode="numeric" value={productId} onChange={(event) => setProductId(event.target.value)} /></Field>
                        <Field label="Relevance (bps)"><Input value={relevance} onChange={(event) => setRelevance(event.target.value)} /></Field>
                        <Field label="Quality (bps)"><Input value={quality} onChange={(event) => setQuality(event.target.value)} /></Field>
                        <div className="sm:col-span-2"><Button variant="outline" className="w-full" onClick={() => run(`campaigns/${selectedCampaign}/products`, { product_id: Number(productId), relevance_bps: Number(relevance), quality_bps: Number(quality), safety_status: "approved", reason })}>ثبت محصول واجد شرایط</Button></div>
                        <Field label="جایگاه"><Select value={placementId} onValueChange={setPlacementId}><SelectTrigger><SelectValue placeholder="انتخاب" /></SelectTrigger><SelectContent>{placements.map((item) => <SelectItem key={item.public_id} value={item.public_id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
                        <Field label="Creative JSON"><Textarea value={creative} onChange={(event) => setCreative(event.target.value)} className="min-h-20 font-mono text-xs" /></Field>
                        <div className="sm:col-span-2"><Button variant="outline" className="w-full" onClick={() => { try { run(`campaigns/${selectedCampaign}/placements`, { placement_public_id: placementId, bid_multiplier_bps: 10000, creative: JSON.parse(creative), reason }); } catch { /* JSON input stays visible for correction */ } }}>اتصال جایگاه و creative</Button></div>
                        <Field label="ثبت تأمین بودجه"><Input value={funding} onChange={(event) => setFunding(event.target.value)} placeholder="minor unit" /></Field>
                        <div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => run(`campaigns/${selectedCampaign}/funding`, { amount_minor: Number(funding), funding_source: "merchant", idempotency_key: `ui-fund-${selectedCampaign}-${funding}`, metadata: {}, reason })}>ثبت funding</Button></div>
                    </div>
                </Card>
            </div>

            <Card className="overflow-hidden">
                <div className="border-b p-5"><h3 className="font-semibold">کمپین‌های واقعی</h3></div>
                {campaigns.length ? <div className="divide-y">{campaigns.map((item) => {
                    const pct = item.budget.budget_total_minor > 0 ? Math.min(100, (item.budget.spent_minor / item.budget.budget_total_minor) * 100) : 0;
                    return <div key={item.public_id} className="p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h4 className="font-medium">{item.name}</h4><StatusPill status={item.status} /></div><p className="mt-1 text-muted-foreground text-xs">{item.advertiser_name} · {item.bid_model.toUpperCase()} · Attribution {item.attribution_window_days} روز</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => run(`campaigns/${item.public_id}/status`, { status: item.status === "active" ? "paused" : "active", reason })}>{item.status === "active" ? "توقف" : "فعال‌سازی"}</Button></div></div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3"><div><p className="text-muted-foreground text-xs">Budget</p><p className="font-medium">{money(item.budget.budget_total_minor)}</p></div><div><p className="text-muted-foreground text-xs">Spend</p><p className="font-medium">{money(item.budget.spent_minor)}</p></div><div><p className="text-muted-foreground text-xs">Remaining</p><p className="font-medium">{money(item.budget.remaining_minor)}</p></div></div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
                    </div>;
                })}</div> : <div className="p-5"><EmptyState title="کمپینی ثبت نشده" body="اول تبلیغ‌دهنده و سپس کمپین را از فرم بالا بسازید." /></div>}
            </Card>
        </div>
    );
}

function PlacementsTab({ placements, run }: { placements: RetailMediaPlacement[]; run: (path: string, body: Record<string, unknown>) => void }) {
    const [key, setKey] = useState(""); const [name, setName] = useState(""); const [surface, setSurface] = useState("search"); const [disclosure, setDisclosure] = useState("تبلیغ"); const [reason, setReason] = useState("تعریف جایگاه Sponsored");
    return <div className="space-y-6"><Card className="p-5"><h3 className="font-semibold">تعریف جایگاه Sponsored</h3><div className="mt-4 grid gap-4 md:grid-cols-4"><Field label="کلید"><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="search.top" /></Field><Field label="نام"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="سطح"><Select value={surface} onValueChange={setSurface}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["search","category","product","story","video","collection","live","email","push"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field><Field label="برچسب افشا"><Input value={disclosure} onChange={(e) => setDisclosure(e.target.value)} /></Field><div className="md:col-span-4"><Button className="w-full" onClick={() => run("placements", { placement_key: key, name, surface, disclosure_text: disclosure, minimum_relevance_bps: 6000, minimum_quality_bps: 6000, privacy_min_cohort: 20, metadata: {}, reason })}>ساخت جایگاه با guardrail استاندارد</Button></div></div></Card><div className="grid gap-4 lg:grid-cols-2">{placements.map((item) => <Card key={item.public_id} className="p-5"><div className="flex items-start justify-between gap-3"><div><h4 className="font-medium">{item.name}</h4><p className="mt-1 font-mono text-muted-foreground text-xs">{item.placement_key}</p></div><StatusPill status={item.status} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-muted/30 p-3">افشا: <b>{item.disclosure_text}</b></div><div className="rounded-xl bg-muted/30 p-3">Cohort ≥ {number(item.privacy_min_cohort)}</div><div className="rounded-xl bg-muted/30 p-3">Relevance ≥ {number(item.minimum_relevance_bps)}</div><div className="rounded-xl bg-muted/30 p-3">Quality ≥ {number(item.minimum_quality_bps)}</div></div><Button className="mt-4" size="sm" variant="outline" onClick={() => run(`placements/${item.public_id}/status`, { status: item.status === "active" ? "paused" : "active", reason })}>{item.status === "active" ? "توقف" : "فعال"}</Button></Card>)}</div></div>;
}

function CreatorsTab({ creators, commissions, campaigns, run }: { creators: RetailMediaCreator[]; commissions: RetailMediaCommission[]; campaigns: RetailMediaCampaign[]; run: (path: string, body: Record<string, unknown>) => void }) {
    const [name, setName] = useState(""); const [creatorId, setCreatorId] = useState(""); const [code, setCode] = useState(""); const [campaignId, setCampaignId] = useState(""); const [bps, setBps] = useState("500"); const [payout, setPayout] = useState(""); const reason = "عملیات creator economy";
    return <div className="space-y-6"><div className="grid gap-4 xl:grid-cols-2"><Card className="p-5"><h3 className="font-semibold">ثبت سازنده</h3><div className="mt-4 grid gap-4"><Field label="نام نمایش"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field><Button onClick={() => run("creators", { display_name: name, holding_days: 30, disclosure_text: "همکاری تبلیغاتی", metadata: {}, reason })}>ساخت سازنده با holding ۳۰ روزه</Button></div></Card><Card className="p-5"><h3 className="font-semibold">لینک همکاری / پرداخت</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="سازنده"><Select value={creatorId} onValueChange={setCreatorId}><SelectTrigger><SelectValue placeholder="انتخاب" /></SelectTrigger><SelectContent>{creators.map((item) => <SelectItem key={item.public_id} value={item.public_id}>{item.display_name}</SelectItem>)}</SelectContent></Select></Field><Field label="کد"><Input value={code} onChange={(e) => setCode(e.target.value)} /></Field><Field label="کمپین (اختیاری)"><Select value={campaignId} onValueChange={setCampaignId}><SelectTrigger><SelectValue placeholder="بدون کمپین" /></SelectTrigger><SelectContent>{campaigns.map((item) => <SelectItem key={item.public_id} value={item.public_id}>{item.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Commission bps"><Input value={bps} onChange={(e) => setBps(e.target.value)} /></Field><Button variant="outline" onClick={() => run(`creators/${creatorId}/links`, { ...(campaignId ? { campaign_public_id: campaignId } : {}), code, commission_bps: Number(bps), attribution_window_days: 7, reason })}>ساخت لینک</Button><div className="flex gap-2"><Input value={payout} onChange={(e) => setPayout(e.target.value)} placeholder="مبلغ payout" /><Button variant="outline" onClick={() => run(`creators/${creatorId}/payouts`, { amount_minor: Number(payout), currency: "IRR", payout_ref: `manual-${Date.now()}`, idempotency_key: `ui-payout-${creatorId}-${payout}-${Date.now()}`, reason })}>ثبت پرداخت</Button></div></div></Card></div><div className="grid gap-4 lg:grid-cols-2">{creators.map((item) => <Card key={item.public_id} className="p-5"><div className="flex items-center justify-between"><div><h4 className="font-medium">{item.display_name}</h4><p className="text-muted-foreground text-xs">{item.handle ?? "بدون handle"} · holding {item.holding_days} روز</p></div><StatusPill status={item.status} /></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted/30 p-3"><p className="text-muted-foreground text-xs">قابل پرداخت</p><p className="font-medium">{money(item.balance.available_minor)}</p></div><div className="rounded-xl bg-muted/30 p-3"><p className="text-muted-foreground text-xs">در انتظار</p><p className="font-medium">{money(item.balance.pending_minor)}</p></div></div><p className="mt-3 text-muted-foreground text-xs">{item.disclosure_text} · {item.links.length} لینک فعال/ثبت‌شده</p></Card>)}</div><Card className="overflow-hidden"><div className="border-b p-5"><h3 className="font-semibold">Ledger کمیسیون</h3></div><div className="max-h-[32rem] divide-y overflow-auto">{commissions.map((row) => <div key={row.id} className="grid gap-2 p-4 text-sm sm:grid-cols-[1.2fr_.8fr_.8fr_.8fr]"><div><p className="font-medium">{row.creator_name}</p><p className="text-muted-foreground text-xs">{row.source_ref ?? "—"}</p></div><StatusPill status={row.entry_kind} /><span className={cn("font-medium", row.amount_minor < 0 && "text-destructive")}>{money(row.amount_minor)} {row.currency}</span><span className="text-muted-foreground text-xs">{new Intl.DateTimeFormat("fa-IR").format(new Date(row.occurred_at))}</span></div>)}</div></Card></div>;
}

function MeasurementTab({ data, loading, error, chartData }: { data?: RetailMediaMeasurement; loading: boolean; error: Error | null; chartData: Array<{ name: string; spend: number; revenue: number; incremental: number }> }) {
    if (loading) return <Card className="h-80 animate-pulse bg-muted/30" />; if (error) return <ErrorState message={error.message} />; if (!data) return <EmptyState title="داده‌ای برای اندازه‌گیری نیست" body="کمپین و delivery ایجاد کنید." />;
    return <div className="space-y-6"><Card className="p-5"><h3 className="font-semibold">Measurement posture</h3><p className="mt-2 text-muted-foreground text-sm leading-7">گزارش در سطح cohort زیر threshold نمایش داده نمی‌شود. Incremental contribution فقط وقتی از Phase 17 evidence موجود باشد نمایش داده می‌شود؛ attributed revenue جایگزین incrementality نیست.</p></Card><div className="grid gap-4 xl:grid-cols-2">{data.campaigns.map((item) => <Card key={item.campaign_public_id} className="p-5"><div className="flex items-start justify-between"><div><h4 className="font-medium">{item.name}</h4><p className="mt-1 text-muted-foreground text-xs">Experiment {item.incrementality.experiment_id ?? "—"} · Holdout {item.incrementality.holdout_id ?? "—"}</p></div>{item.privacy.suppressed ? <span className="rounded-full border bg-muted px-2.5 py-1 text-xs">حریم خصوصی: suppressed</span> : <span className="rounded-full border bg-primary/5 px-2.5 py-1 text-xs">Cohort {number(item.privacy.cohort)}</span>}</div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl bg-muted/30 p-3"><p className="text-muted-foreground text-xs">Impression</p><p>{item.delivery.impressions === null ? "—" : number(item.delivery.impressions)}</p></div><div className="rounded-xl bg-muted/30 p-3"><p className="text-muted-foreground text-xs">Click</p><p>{item.delivery.clicks === null ? "—" : number(item.delivery.clicks)}</p></div><div className="rounded-xl bg-muted/30 p-3"><p className="text-muted-foreground text-xs">Revenue</p><p>{item.delivery.revenue_minor === null ? "—" : money(item.delivery.revenue_minor)}</p></div><div className="rounded-xl bg-muted/30 p-3"><p className="text-muted-foreground text-xs">Incremental</p><p>{item.incrementality.incremental_contribution_minor === null ? "—" : money(item.incrementality.incremental_contribution_minor)}</p></div></div></Card>)}</div>{chartData.length ? <Card className="p-5"><div className="h-80" dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis /><Tooltip formatter={(value) => money(Number(value))} /><Bar dataKey="spend" fill="var(--muted-foreground)" /><Bar dataKey="incremental" fill="var(--primary)" /></BarChart></ResponsiveContainer></div></Card> : null}</div>;
}

function AccessTab({ rows, run }: { rows: RetailMediaAccessRow[]; run: (path: string, body: Record<string, unknown>) => void }) {
    const [presetByUser, setPresetByUser] = useState<Record<number, string>>({});
    return <Card className="overflow-hidden"><div className="border-b p-5"><h3 className="font-semibold">دسترسی‌های Phase 30</h3><p className="mt-1 text-muted-foreground text-xs">کنترل‌ها در backend enforce می‌شوند. تغییر preset نیازمند step-up است و self-lockout مسدود می‌شود.</p></div>{rows.length ? <div className="divide-y">{rows.map((row) => <div key={row.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_1.5fr_auto]"><div><p className="font-medium">{row.identity}</p><p className="text-muted-foreground text-xs">Admin #{row.id}</p></div><div className="flex flex-wrap gap-2">{Object.entries(row.permissions).map(([permission, allowed]) => <span key={permission} className={cn("rounded-full border px-2 py-1 text-[10px]", allowed ? "bg-primary/5" : "bg-destructive/5 text-destructive")}>{permission.replace("retail_media.", "")} · {allowed ? "✓" : "×"}</span>)}</div><div className="flex gap-2"><Select value={presetByUser[row.id] ?? "viewer"} onValueChange={(value) => setPresetByUser((current) => ({ ...current, [row.id]: value }))}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{["owner","growth","operator","finance","analyst","viewer"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Button variant="outline" onClick={() => run("access/preset", { user_id: row.id, preset: presetByUser[row.id] ?? "viewer", reason: "تنظیم دسترسی Phase 30" })}>اعمال</Button></div></div>)}</div> : <div className="p-5"><EmptyState title="ادمینی برای نمایش نیست" body="پس از تعریف کاربر ادمین، ماتریس دسترسی اینجا دیده می‌شود." /></div>}</Card>;
}
