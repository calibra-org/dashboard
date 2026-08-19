"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

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
import { ChartNoAxesCombined, Link2, RefreshCw, Search, ShieldCheck } from "#/icons";
import { useAgenticGatewayMutation, useAgenticGatewayResource } from "#/lib/queries/agentic-gateway";

export type AgenticGatewaySection = "overview" | "channels" | "readiness" | "conformance";
type Json = Record<string, unknown>;

function Section({ title, help, children }: { title: string; help: string; children: ReactNode }) {
    return (
        <Card className="space-y-4 p-5">
            <div className="inline-flex items-center gap-2 font-semibold">
                <span>{title}</span>
                <HelperTooltip>{help}</HelperTooltip>
            </div>
            {children}
        </Card>
    );
}

function Metric({ label, help, value }: { label: string; help: string; value: ReactNode }) {
    return (
        <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{label}</span>
                <HelperTooltip>{help}</HelperTooltip>
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
        </Card>
    );
}

function State({ loading, error, empty, children }: { loading?: boolean; error?: Error | null; empty?: boolean; children: ReactNode }) {
    if (loading) return <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">در حال دریافت داده واقعی…</div>;
    if (error) return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error.message}</div>;
    if (empty) return <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">داده‌ای ثبت نشده است.</div>;
    return <>{children}</>;
}

function arrayValue(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value !== "string") return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

function objectValue(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value !== "string") return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

export function AgenticCommerceWorkspace({ section }: { section: AgenticGatewaySection }) {
    const t = useTranslations("agenticGateway");
    const overview = useAgenticGatewayResource<any>("overview", section === "overview");
    const channels = useAgenticGatewayResource<any>("channels", section === "channels" || section === "conformance");
    const actions = useAgenticGatewayResource<any[]>("actions", section === "channels");
    const readiness = useAgenticGatewayResource<any[]>("readiness", section === "readiness");
    const saveChannel = useAgenticGatewayMutation<any, Json>("POST");
    const savePrincipal = useAgenticGatewayMutation<any, Json>("POST");
    const createCapability = useAgenticGatewayMutation<any, Json>("POST");
    const runConformance = useAgenticGatewayMutation<any, Json>("POST");
    const refreshReadiness = useAgenticGatewayMutation<any, Json>("POST");

    const [channelKey, setChannelKey] = useState("");
    const [channelName, setChannelName] = useState("");
    const [adapterKey, setAdapterKey] = useState("native");
    const [mode, setMode] = useState("disabled");
    const [protocolVersion, setProtocolVersion] = useState("");
    const [reason, setReason] = useState("");
    const [channelPublicId, setChannelPublicId] = useState("");
    const [capability, setCapability] = useState("catalog.search");
    const [riskClass, setRiskClass] = useState("read_only");
    const [productId, setProductId] = useState("");
    const [principalKey, setPrincipalKey] = useState("");
    const [principalName, setPrincipalName] = useState("");
    const [principalStatus, setPrincipalStatus] = useState("disabled");
    const [principalScopes, setPrincipalScopes] = useState("catalog.search,catalog.product_graph");
    const [credentialFingerprint, setCredentialFingerprint] = useState("");
    const [rateWindow, setRateWindow] = useState("60");
    const [rateMax, setRateMax] = useState("60");
    const [principalReason, setPrincipalReason] = useState("");

    if (section === "overview") {
        const k = overview.data?.kpis ?? {};
        return (
            <div className="space-y-5">
                <PageHeader title={t("title")} subtitle={t("subtitle")} />
                <State loading={overview.isLoading} error={overview.error}>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <Metric label="کانال‌ها" help="تعداد کانال‌های Agentic ثبت‌شده." value={k.channels ?? "—"} />
                        <Metric label="کانال Live" help="فقط کانال دارای conformance موفق و تازه." value={k.live_channels ?? "—"} />
                        <Metric label="Agent فعال" help="principalهای فعال با scope و rate limit واقعی." value={k.active_principals ?? "—"} />
                        <Metric label="رویداد ۳۰ روز" help="رویدادهای واقعی ledger، بدون KPI ساختگی." value={k.events_30d ?? "—"} />
                        <Metric label="آمادگی محصول" help="امتیاز facts-based با missing facts صریح." value={k.avg_readiness_bp == null ? "—" : `${(k.avg_readiness_bp / 100).toFixed(1)}٪`} />
                        <Metric label="Policy block" help="Actionهایی که policy یا Trust/Risk رد کرده است." value={k.policy_blocks_30d ?? "—"} />
                    </div>
                </State>
                <Section title="مرز اجرایی Agentic Commerce" help="هسته commerce منبع حقیقت می‌ماند و adapter فقط قرارداد را ترجمه می‌کند.">
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-border p-4"><Link2 className="size-5"/><h3 className="mt-3 font-medium">Protocol adapters</h3><p className="mt-1 text-sm text-muted-foreground">فعال‌سازی فقط پس از conformance evidence.</p></div>
                        <div className="rounded-xl border border-border p-4"><ChartNoAxesCombined className="size-5"/><h3 className="mt-3 font-medium">Canonical graph</h3><p className="mt-1 text-sm text-muted-foreground">Catalog، قیمت و موجودی از سرویس‌های موجود خوانده می‌شوند.</p></div>
                        <div className="rounded-xl border border-border p-4"><ShieldCheck className="size-5"/><h3 className="mt-3 font-medium">Merchant control</h3><p className="mt-1 text-sm text-muted-foreground">Scope، rate limit، Trust/Risk، audit و kill switch قبل از mutation.</p></div>
                    </div>
                </Section>
            </div>
        );
    }

    if (section === "channels") {
        return (
            <div className="space-y-5">
                <PageHeader title="کانال‌ها، Agentها و قابلیت‌ها" subtitle="کنترل protocol، principal، scope، rate limit، capability و action ledger" />
                <Section title="کانال" help="Live شدن کانال بدون conformance PASS تازه در Backend رد می‌شود.">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div><Label>کلید کانال</Label><Input value={channelKey} onChange={(event) => setChannelKey(event.target.value)} /></div>
                        <div><Label>نام نمایشی</Label><Input value={channelName} onChange={(event) => setChannelName(event.target.value)} /></div>
                        <div><Label>Adapter</Label><Select value={adapterKey} onValueChange={(value) => setAdapterKey(String(value))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["native", "ucp", "acp", "mcp", "a2a", "custom"].map((value) => <SelectItem key={value} value={value}>{value.toUpperCase()}</SelectItem>)}</SelectContent></Select></div>
                        <div><Label>حالت</Label><Select value={mode} onValueChange={(value) => setMode(String(value))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["disabled", "shadow", "read_only", "live"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                        <div><Label>نسخه پروتکل</Label><Input value={protocolVersion} onChange={(event) => setProtocolVersion(event.target.value)} /></div>
                        <div><Label>دلیل تغییر</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} /></div>
                    </div>
                    <Button disabled={!channelKey || !channelName || reason.length < 8 || saveChannel.isPending} onClick={() => saveChannel.mutate({ path: "channels", body: { channel_key: channelKey, display_name: channelName, adapter_key: adapterKey, mode, protocol_version: protocolVersion || null, reason } })}>ذخیره کانال</Button>
                </Section>

                <Section title="Agent principal" help="فقط SHA-256 fingerprint ذخیره می‌شود و secret خام در Admin یا DB نگهداری نمی‌شود.">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <div><Label>Principal key</Label><Input value={principalKey} onChange={(event) => setPrincipalKey(event.target.value)} /></div>
                        <div><Label>نام نمایشی</Label><Input value={principalName} onChange={(event) => setPrincipalName(event.target.value)} /></div>
                        <div><Label>وضعیت</Label><Select value={principalStatus} onValueChange={(value) => setPrincipalStatus(String(value))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["disabled", "shadow", "active", "revoked"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                        <div className="xl:col-span-2"><Label>Scopeها</Label><Input value={principalScopes} onChange={(event) => setPrincipalScopes(event.target.value)} /></div>
                        <div><Label>SHA-256 fingerprint</Label><Input value={credentialFingerprint} onChange={(event) => setCredentialFingerprint(event.target.value)} /></div>
                        <div><Label>Window seconds</Label><Input value={rateWindow} onChange={(event) => setRateWindow(event.target.value)} inputMode="numeric" /></div>
                        <div><Label>Max actions</Label><Input value={rateMax} onChange={(event) => setRateMax(event.target.value)} inputMode="numeric" /></div>
                        <div><Label>دلیل تغییر</Label><Input value={principalReason} onChange={(event) => setPrincipalReason(event.target.value)} /></div>
                    </div>
                    <Button disabled={!principalKey || !principalName || principalReason.length < 8 || savePrincipal.isPending} onClick={() => savePrincipal.mutate({ path: "principals", body: { principal_key: principalKey, display_name: principalName, principal_type: "external_agent", status: principalStatus, scopes: principalScopes.split(",").map((scope) => scope.trim()).filter(Boolean), rate_limit_policy: { window_seconds: Number(rateWindow), max_actions: Number(rateMax) }, credential_fingerprint: credentialFingerprint ? `sha256:${credentialFingerprint.replace(/^sha256:/i, "").trim()}` : null, reason: principalReason } })}>ذخیره principal</Button>
                    <State loading={channels.isLoading} error={channels.error} empty={!channels.data?.principals?.length}>
                        <div className="grid gap-3 lg:grid-cols-2">{channels.data?.principals?.map((row: any) => { const policy = objectValue(row.rate_limit_policy); return <div key={row.public_id} className="rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-medium">{row.display_name}</div><div className="text-xs text-muted-foreground">{row.principal_key}</div></div><StatusBadge tone={row.status === "active" ? "success" : row.status === "revoked" ? "danger" : "neutral"}>{row.status}</StatusBadge></div><div className="mt-3 text-xs text-muted-foreground">Scope: {arrayValue(row.scopes).join("، ") || "—"}</div><div className="mt-1 text-xs text-muted-foreground">Rate: {String(policy.max_actions ?? 0)} / {String(policy.window_seconds ?? 0)}s</div></div>; })}</div>
                    </State>
                </Section>

                <Section title="Capability version" help="Schema، scope، risk class، digest و signature برای هر نسخه ثبت می‌شود.">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div><Label>Channel Public ID</Label><Input value={channelPublicId} onChange={(event) => setChannelPublicId(event.target.value)} /></div>
                        <div><Label>Capability</Label><Input value={capability} onChange={(event) => setCapability(event.target.value)} /></div>
                        <div><Label>Risk class</Label><Select value={riskClass} onValueChange={(value) => setRiskClass(String(value))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["read_only", "low", "medium", "high", "critical"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                    </div>
                    <Button disabled={!channelPublicId || !capability || createCapability.isPending} onClick={() => createCapability.mutate({ path: "capabilities", body: { channel_public_id: channelPublicId, capability_key: capability, protocol_version: protocolVersion || null, transport: "rest", endpoint_path: null, input_schema: { type: "object" }, output_schema: { type: "object" }, required_scopes: [capability], risk_class: riskClass, reason: reason || "ثبت نسخه قابلیت Agentic" } })}>ثبت نسخه قابلیت</Button>
                </Section>

                <Section title="کانال‌های ثبت‌شده" help="Mode واقعی Backend نمایش داده می‌شود.">
                    <State loading={channels.isLoading} error={channels.error} empty={!channels.data?.channels?.length}><div className="space-y-2">{channels.data?.channels?.map((row: any) => <div key={row.public_id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-4"><div><div className="font-medium">{row.display_name}</div><div className="text-xs text-muted-foreground">{row.channel_key} · {row.adapter_key}</div></div><StatusBadge tone={row.mode === "live" ? "success" : row.mode === "disabled" ? "neutral" : "warning"}>{row.mode}</StatusBadge></div>)}</div></State>
                </Section>

                <Section title="Action Ledger" help="Projection امن actionها بدون authorization token یا secret خام است.">
                    <State loading={actions.isLoading} error={actions.error} empty={!actions.data?.length}>
                        <Table><TableHeader><TableRow><TableHead>زمان</TableHead><TableHead>Principal</TableHead><TableHead>Capability</TableHead><TableHead>Risk</TableHead><TableHead>وضعیت</TableHead><TableHead>Policy</TableHead></TableRow></TableHeader><TableBody>{actions.data?.map((row: any) => <TableRow key={row.public_id}><TableCell>{row.created_at ? new Date(row.created_at).toLocaleString("fa-IR") : "—"}</TableCell><TableCell>{row.principal_key ?? "—"}</TableCell><TableCell>{row.capability_key}</TableCell><TableCell>{row.risk_class}</TableCell><TableCell><StatusBadge tone={row.status === "approved" || row.status === "completed" ? "success" : row.status === "blocked" || row.status === "failed" ? "danger" : "warning"}>{row.status}</StatusBadge></TableCell><TableCell>{String(objectValue(row.policy_result).reason ?? "—")}</TableCell></TableRow>)}</TableBody></Table>
                    </State>
                </Section>
            </div>
        );
    }

    if (section === "readiness") {
        return (
            <div className="space-y-5">
                <PageHeader title="آمادگی محصولات برای Agent" subtitle="امتیاز قابل توضیح، missing facts و freshness" />
                <Section title="ارزیابی محصول" help="امتیاز فقط از facts واقعی catalog و inventory ساخته می‌شود.">
                    <div className="flex flex-wrap items-end gap-3"><div className="min-w-48"><Label>Product ID</Label><Input value={productId} onChange={(event) => setProductId(event.target.value)} inputMode="numeric" /></div><Button disabled={!productId || refreshReadiness.isPending} onClick={() => refreshReadiness.mutate({ path: "readiness/refresh", body: { product_id: Number(productId), locale: "fa" } })}><RefreshCw className="me-2 size-4"/>بازمحاسبه</Button></div>
                </Section>
                <Section title="محصولات نیازمند تکمیل" help="کمترین readiness در بالا قرار می‌گیرد.">
                    <State loading={readiness.isLoading} error={readiness.error} empty={!readiness.data?.length}><div className="space-y-3">{readiness.data?.map((row: any) => <div key={row.product_id} className="rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-medium">{row.name ?? `محصول #${row.product_id}`}</div><div className="text-xs text-muted-foreground">SKU: {row.sku ?? "—"}</div></div><span className="font-mono text-sm">{(row.score_bp / 100).toFixed(1)}٪</span></div><Progress className="mt-3" value={row.score_bp / 100}/><div className="mt-3 flex flex-wrap gap-2">{(row.missing_facts ?? []).map((fact: string) => <span key={fact} className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{fact}</span>)}</div></div>)}</div></State>
                </Section>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <PageHeader title="Conformance و انتشار" subtitle="Adapter فقط پس از شواهد PASS حق Live شدن دارد" />
            <Section title="اجرای Conformance" help="Schema، signature، protocol version و kill switch deterministic کنترل می‌شوند.">
                <div className="flex flex-wrap items-end gap-3"><div className="min-w-80"><Label>Channel Public ID</Label><Input value={channelPublicId} onChange={(event) => setChannelPublicId(event.target.value)} /></div><Button disabled={!channelPublicId || runConformance.isPending} onClick={() => runConformance.mutate({ path: "conformance", body: { channel_public_id: channelPublicId, reason: reason || "اجرای کنترل انطباق قبل از انتشار" } })}><Search className="me-2 size-4"/>اجرای کنترل</Button></div>
            </Section>
            <Section title="آخرین Runها" help="PASS، FAIL و BLOCKED مستقیماً از Backend می‌آیند.">
                <State loading={channels.isLoading} error={channels.error} empty={!channels.data?.conformance?.length}><Table><TableHeader><TableRow><TableHead>Adapter</TableHead><TableHead>نسخه</TableHead><TableHead>وضعیت</TableHead><TableHead>زمان</TableHead></TableRow></TableHeader><TableBody>{channels.data?.conformance?.map((row: any) => <TableRow key={row.public_id}><TableCell>{row.adapter_key}</TableCell><TableCell>{row.protocol_version ?? "—"}</TableCell><TableCell><StatusBadge tone={row.status === "pass" ? "success" : row.status === "fail" ? "danger" : "warning"}>{row.status}</StatusBadge></TableCell><TableCell>{row.ran_at ? new Date(row.ran_at).toLocaleString("fa-IR") : "—"}</TableCell></TableRow>)}</TableBody></Table></State>
            </Section>
        </div>
    );
}
