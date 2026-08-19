"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { PageHeader } from "#/components/PageHeader";
import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Progress } from "#/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { ChartNoAxesCombined, Link2, RefreshCw, ScanSearch, ShieldCheck } from "#/icons";
import { useAgenticGatewayMutation, useAgenticGatewayResource } from "#/lib/queries/agentic-gateway";

export type AgenticGatewaySection = "overview" | "channels" | "readiness" | "conformance";
type Json = Record<string, unknown>;

function InfoTitle({ children, help }: { children: ReactNode; help: string }) {
    return <span className="inline-flex items-center gap-2 font-semibold">{children}<HelperTooltip>{help}</HelperTooltip></span>;
}

function Section({ title, help, children }: { title: string; help: string; children: ReactNode }) {
    return <Card className="space-y-4 p-5"><InfoTitle help={help}>{title}</InfoTitle>{children}</Card>;
}

function Metric({ label, help, value }: { label: string; help: string; value: ReactNode }) {
    return <Card className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><span>{label}</span><HelperTooltip>{help}</HelperTooltip></div><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div></Card>;
}

function State({ loading, error, empty, children }: { loading?: boolean; error?: Error | null; empty?: boolean; children: ReactNode }) {
    if (loading) return <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">در حال دریافت داده واقعی…</div>;
    if (error) return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error.message}</div>;
    if (empty) return <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">داده‌ای ثبت نشده است.</div>;
    return <>{children}</>;
}

export function AgenticCommerceWorkspace({ section }: { section: AgenticGatewaySection }) {
    const t = useTranslations("agenticGateway");
    const overview = useAgenticGatewayResource<any>("overview", section === "overview");
    const channels = useAgenticGatewayResource<any>("channels", section === "channels" || section === "conformance");
    const readiness = useAgenticGatewayResource<any[]>("readiness", section === "readiness");
    const saveChannel = useAgenticGatewayMutation<any, Json>("POST");
    const createCapability = useAgenticGatewayMutation<any, Json>("POST");
    const runConformance = useAgenticGatewayMutation<any, Json>("POST");
    const refreshReadiness = useAgenticGatewayMutation<any, Json>("POST");

    const [channelKey, setChannelKey] = useState("");
    const [channelName, setChannelName] = useState("");
    const [adapterKey, setAdapterKey] = useState("native");
    const [mode, setMode] = useState("disabled");
    const [protocolVersion, setProtocolVersion] = useState("");
    const [reason, setReason] = useState("");
    const [capChannel, setCapChannel] = useState("");
    const [capability, setCapability] = useState("catalog.search");
    const [riskClass, setRiskClass] = useState("read_only");
    const [productId, setProductId] = useState("");

    if (section === "overview") {
        const k = overview.data?.kpis ?? {};
        return <div className="space-y-5"><PageHeader title={t("title")} subtitle={t("subtitle")} />
            <State loading={overview.isLoading} error={overview.error}>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <Metric label="کانال‌ها" help="تعداد کانال‌های Agentic تعریف‌شده، صرف‌نظر از فعال بودن." value={k.channels ?? "—"} />
                    <Metric label="کانال Live" help="فقط کانالی که conformance موفق و تازه داشته و صریحاً Live شده است." value={k.live_channels ?? "—"} />
                    <Metric label="Agent فعال" help="principalهای Agent با scope و وضعیت فعال؛ بدون نمایش credential خام." value={k.active_principals ?? "—"} />
                    <Metric label="رویداد ۳۰ روز" help="eventهای واقعی ثبت‌شده در ledger کانال." value={k.events_30d ?? "—"} />
                    <Metric label="میانگین آمادگی محصول" help="امتیاز decomposition-based از facts موجود؛ نبود facts به‌صورت missing ثبت می‌شود." value={k.avg_readiness_bp == null ? "—" : `${(k.avg_readiness_bp / 100).toFixed(1)}٪`} />
                    <Metric label="مسدودشده توسط policy" help="Agent actionهایی که policy اجازه اجرا نداده است." value={k.policy_blocks_30d ?? "—"} />
                </div>
            </State>
            <Section title="مرز اجرایی Agentic Commerce" help="Core commerce protocol-neutral می‌ماند؛ adapterها فقط ترجمه قرارداد هستند.">
                <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border p-4"><Link2 className="size-5"/><h3 className="mt-3 font-medium">Protocol adapters</h3><p className="mt-1 text-sm text-muted-foreground">UCP / ACP / MCP / A2A فقط پس از conformance evidence فعال می‌شوند.</p></div>
                    <div className="rounded-xl border border-border p-4"><ChartNoAxesCombined className="size-5"/><h3 className="mt-3 font-medium">Canonical product graph</h3><p className="mt-1 text-sm text-muted-foreground">محصول، قیمت و موجودی از دامنه‌های فعلی خوانده می‌شوند؛ truth موازی ساخته نمی‌شود.</p></div>
                    <div className="rounded-xl border border-border p-4"><ShieldCheck className="size-5"/><h3 className="mt-3 font-medium">Merchant control</h3><p className="mt-1 text-sm text-muted-foreground">scope، rate limit، policy، audit و kill switch قبل از mutation.</p></div>
                </div>
            </Section>
        </div>;
    }

    if (section === "channels") return <div className="space-y-5"><PageHeader title="کانال‌ها و قابلیت‌ها" subtitle="تعریف کانال protocol-neutral، نسخه قابلیت و مرز دسترسی Agent" />
        <Section title="ثبت یا ویرایش کانال" help="Live شدن کانال بدون conformance PASS تازه در Backend رد می‌شود.">
            <div className="grid gap-4 md:grid-cols-2">
                <div><Label>کلید کانال</Label><Input value={channelKey} onChange={(e) => setChannelKey(e.target.value)} placeholder="google-ai-mode" /></div>
                <div><Label>نام نمایشی</Label><Input value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="Google AI Mode" /></div>
                <div><Label>Adapter</Label><Select value={adapterKey} onValueChange={setAdapterKey}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["native", "ucp", "acp", "mcp", "a2a", "custom"].map((value) => <SelectItem key={value} value={value}>{value.toUpperCase()}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>حالت</Label><Select value={mode} onValueChange={setMode}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="disabled">غیرفعال</SelectItem><SelectItem value="shadow">سایه</SelectItem><SelectItem value="read_only">فقط‌خواندنی</SelectItem><SelectItem value="live">Live</SelectItem></SelectContent></Select></div>
                <div><Label>نسخه پروتکل</Label><Input value={protocolVersion} onChange={(e) => setProtocolVersion(e.target.value)} placeholder="2026-04-08" /></div>
                <div><Label>دلیل تغییر</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="حداقل ۸ کاراکتر" /></div>
            </div>
            <Button disabled={!channelKey || !channelName || reason.length < 8 || saveChannel.isPending} onClick={() => saveChannel.mutate({ path: "channels", body: { channel_key: channelKey, display_name: channelName, adapter_key: adapterKey, mode, protocol_version: protocolVersion || null, reason } })}>{saveChannel.isPending ? "در حال ذخیره…" : "ذخیره کانال"}</Button>
        </Section>
        <Section title="نسخه قابلیت" help="هر capability دارای schema، scope، risk class، digest و signature نسخه‌بندی‌شده است.">
            <div className="grid gap-4 md:grid-cols-2"><div><Label>Channel Public ID</Label><Input value={capChannel} onChange={(e) => setCapChannel(e.target.value)} /></div><div><Label>Capability</Label><Input value={capability} onChange={(e) => setCapability(e.target.value)} /></div><div><Label>Risk class</Label><Select value={riskClass} onValueChange={setRiskClass}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["read_only", "low", "medium", "high", "critical"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div></div>
            <Button disabled={!capChannel || !capability || createCapability.isPending} onClick={() => createCapability.mutate({ path: "capabilities", body: { channel_public_id: capChannel, capability_key: capability, protocol_version: protocolVersion || null, transport: "rest", endpoint_path: null, input_schema: { type: "object" }, output_schema: { type: "object" }, required_scopes: [capability], risk_class: riskClass, reason: reason || "ثبت نسخه قابلیت Agentic" } })}>ثبت نسخه قابلیت</Button>
        </Section>
        <Section title="کانال‌های ثبت‌شده" help="وضعیت واقعی Backend نمایش داده می‌شود؛ label پروتکل بدون evidence به Live تبدیل نمی‌شود.">
            <State loading={channels.isLoading} error={channels.error} empty={!channels.data?.channels?.length}><div className="space-y-2">{channels.data?.channels?.map((row: any) => <div key={row.public_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"><div><div className="font-medium">{row.display_name}</div><div className="text-xs text-muted-foreground">{row.channel_key} · {row.adapter_key} · v{row.version}</div></div><StatusBadge tone={row.mode === "live" ? "success" : row.mode === "disabled" ? "neutral" : "warning"}>{row.mode}</StatusBadge></div>)}</div></State>
        </Section>
    </div>;

    if (section === "readiness") return <div className="space-y-5"><PageHeader title="آمادگی محصولات برای Agent" subtitle="امتیاز قابل توضیح، missing facts و freshness برای هر محصول" />
        <Section title="ارزیابی یک محصول" help="امتیاز فقط از facts واقعی catalog/inventory ساخته می‌شود و missing facts پنهان نمی‌شوند."><div className="flex flex-wrap items-end gap-3"><div className="min-w-48"><Label>Product ID</Label><Input value={productId} onChange={(e) => setProductId(e.target.value)} inputMode="numeric" /></div><Button disabled={!productId || refreshReadiness.isPending} onClick={() => refreshReadiness.mutate({ path: "readiness/refresh", body: { product_id: Number(productId), locale: "fa" } })}><RefreshCw className="me-2 size-4"/>بازمحاسبه</Button></div></Section>
        <Section title="محصولات نیازمند تکمیل" help="کمترین readiness در بالا قرار می‌گیرد تا مسیر اصلاح روشن باشد."><State loading={readiness.isLoading} error={readiness.error} empty={!readiness.data?.length}><div className="space-y-3">{readiness.data?.map((row: any) => <div key={row.product_id} className="rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-medium">{row.name ?? `محصول #${row.product_id}`}</div><div className="text-xs text-muted-foreground">SKU: {row.sku ?? "—"}</div></div><span className="font-mono text-sm">{(row.score_bp / 100).toFixed(1)}٪</span></div><Progress className="mt-3" value={row.score_bp / 100}/><div className="mt-3 flex flex-wrap gap-2">{(row.missing_facts ?? []).map((fact: string) => <span key={fact} className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{fact}</span>)}</div></div>)}</div></State></Section>
    </div>;

    return <div className="space-y-5"><PageHeader title="Conformance و انتشار" subtitle="هیچ adapter قبل از شواهد PASS حق Live شدن ندارد" />
        <Section title="اجرای Conformance" help="schema، signature، protocol version و kill switch به‌صورت deterministic کنترل می‌شوند."><div className="flex flex-wrap items-end gap-3"><div className="min-w-80"><Label>Channel Public ID</Label><Input value={capChannel} onChange={(e) => setCapChannel(e.target.value)} /></div><Button disabled={!capChannel || runConformance.isPending} onClick={() => runConformance.mutate({ path: "conformance", body: { channel_public_id: capChannel, reason: reason || "اجرای کنترل انطباق قبل از انتشار" } })}><ScanSearch className="me-2 size-4"/>اجرای کنترل</Button></div></Section>
        <Section title="آخرین Runها" help="PASS/FAIL/BLOCKED از Backend می‌آید و failure summary قابل مشاهده است."><State loading={channels.isLoading} error={channels.error} empty={!channels.data?.conformance?.length}><Table><TableHeader><TableRow><TableHead>Adapter</TableHead><TableHead>نسخه</TableHead><TableHead>وضعیت</TableHead><TableHead>زمان</TableHead></TableRow></TableHeader><TableBody>{channels.data?.conformance?.map((row: any) => <TableRow key={row.public_id}><TableCell>{row.adapter_key}</TableCell><TableCell>{row.protocol_version ?? "—"}</TableCell><TableCell><StatusBadge tone={row.status === "pass" ? "success" : row.status === "fail" ? "danger" : "warning"}>{row.status}</StatusBadge></TableCell><TableCell>{row.ran_at ? new Date(row.ran_at).toLocaleString("fa-IR") : "—"}</TableCell></TableRow>)}</TableBody></Table></State></Section>
    </div>;
}
