"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import {
    type LiteCashObservation,
    type LiteCashOverview,
    type LiteCashPolicy,
    type LiteCashProfile,
    type LiteCashPurgeEvent,
    type LiteCashPurgeScope,
    type LiteCashSettings,
    type LiteCashSnapshot,
    type LiteCashTopology,
    type LiteCashWarmJob,
    useLiteCashMutation,
    useLiteCashResource,
} from "#/lib/queries/lite-cash";
import { cn } from "#/lib/utils";

type Tab = "overview" | "policies" | "purge" | "warm" | "optimization" | "edge" | "diagnostics" | "settings";

type Tone = "neutral" | "good" | "warn" | "danger";

const tabs: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: "نمای کلی" },
    { key: "policies", label: "سیاست‌های کش" },
    { key: "purge", label: "مرکز پاکسازی" },
    { key: "warm", label: "Warm / Preload" },
    { key: "optimization", label: "بهینه‌سازی" },
    { key: "edge", label: "Edge و Object Cache" },
    { key: "diagnostics", label: "عیب‌یابی" },
    { key: "settings", label: "تنظیمات" },
];

const fa = (value: number | null | undefined, digits = 0) =>
    new Intl.NumberFormat("fa-IR", { maximumFractionDigits: digits }).format(Number(value ?? 0));

const percent = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : `${fa(value * 100, 1)}٪`;

const dateTime = (value: string | null | undefined) =>
    value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

function operationKey(prefix: string): string {
    const id = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    return `${prefix}-${id}`;
}

function parseJson(value: string, fallback: Record<string, unknown> = {}): Record<string, unknown> {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON باید یک object معتبر باشد.");
    return parsed as Record<string, unknown>;
}

function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs",
                tone === "good" && "border-primary/30 bg-primary/10 text-primary",
                tone === "warn" && "border-accent bg-accent/40 text-accent-foreground",
                tone === "danger" && "border-destructive/30 bg-destructive/10 text-destructive",
                tone === "neutral" && "border-border bg-muted/40 text-muted-foreground",
            )}
        >
            {children}
        </span>
    );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <Card className="border-border/70 p-5 shadow-sm">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className="mt-2 font-semibold text-2xl tabular-nums tracking-tight">{value}</div>
            <div className="mt-2 text-muted-foreground text-xs leading-5">{hint}</div>
        </Card>
    );
}

function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
    return (
        <div
            className={cn(
                "rounded-xl border p-3 text-sm leading-6",
                tone === "danger" && "border-destructive/30 bg-destructive/5 text-destructive",
                tone === "warn" && "border-accent bg-accent/25 text-accent-foreground",
                tone === "good" && "border-primary/20 bg-primary/5",
                tone === "neutral" && "border-border bg-muted/20 text-muted-foreground",
            )}
        >
            {children}
        </div>
    );
}

function SectionTitle({ title, description, side }: { title: string; description: string; side?: ReactNode }) {
    return (
        <div className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-start md:justify-between">
            <div>
                <h3 className="font-semibold text-base">{title}</h3>
                <p className="mt-1 max-w-3xl text-muted-foreground text-sm leading-6">{description}</p>
            </div>
            {side}
        </div>
    );
}

function Empty({ children }: { children: ReactNode }) {
    return <div className="rounded-xl border border-dashed p-5 text-center text-muted-foreground text-sm">{children}</div>;
}

export function LiteCashWorkspace() {
    const [tab, setTab] = useState<Tab>("overview");
    const overview = useLiteCashResource<LiteCashOverview>("overview");
    const topology = useLiteCashResource<LiteCashTopology>("topology");

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="lite cash"
                subtitle="کنترل امن cache، invalidation، warm/preload، optimization، Edge و evidence؛ متصل به Bentocache و Redis موجود Calibra."
            />

            <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-primary/10 via-background to-muted/30 shadow-sm">
                <div className="grid gap-5 p-6 xl:grid-cols-[1.3fr_.7fr]">
                    <div>
                        <div className="flex flex-wrap gap-2">
                            <Pill tone="good">Phase 34</Pill>
                            <Pill>Bentocache L1/L2</Pill>
                            <Pill>Tenant RLS</Pill>
                            <Pill>Safe purge registry</Pill>
                            <Pill>No secrets</Pill>
                        </div>
                        <h2 className="mt-4 font-semibold text-2xl">کش سریع فقط وقتی ارزش دارد که قابل‌اعتماد، قابل‌ابطال و قابل‌مشاهده باشد</h2>
                        <p className="mt-3 max-w-4xl text-muted-foreground text-sm leading-7">
                            lite cash موتور کش دوم نمی‌سازد. همین cache فعلی Calibra را با policy، purge plan، warm job، optimization profile،
                            evidence و guardrail مدیریت می‌کند. مسیرهای مالی، سفارش، موجودی و داده‌های خصوصی عمداً از cache policy عمومی خارج‌اند.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <StatusTile label="Driver" value={topology.data?.driver ?? "—"} />
                        <StatusTile label="L1" value={topology.data?.l1_enabled ? "فعال" : "خاموش"} good={topology.data?.l1_enabled} />
                        <StatusTile label="L2" value={topology.data?.l2_enabled ? "فعال" : "غیرفعال"} good={topology.data?.l2_enabled} />
                        <StatusTile label="Bus" value={topology.data?.bus_enabled ? "همگام" : "غیرفعال"} good={topology.data?.bus_enabled} />
                    </div>
                </div>
                {overview.data?.risks.disabled ? (
                    <div className="border-destructive/30 border-t bg-destructive/10 px-6 py-3 text-destructive text-sm">
                        lite cash در تنظیمات tenant غیرفعال است. policyها حفظ شده‌اند اما فعال‌سازی runtime باید متوقف بماند.
                    </div>
                ) : null}
                {overview.data?.risks.debug_active ? (
                    <div className="border-accent border-t bg-accent/30 px-6 py-3 text-accent-foreground text-sm">
                        Debug mode زمان‌دار فعال است؛ برای جلوگیری از overhead، زمان انقضا را در تنظیمات بررسی کنید.
                    </div>
                ) : null}
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
                <Button type="button" variant="outline" className="me-auto rounded-xl" onClick={() => setTab("purge")}>
                    Purge plan
                </Button>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setTab("warm")}>
                    Warm plan
                </Button>
            </div>

            {tab === "overview" ? <OverviewPanel value={overview.data} loading={overview.isLoading} /> : null}
            {tab === "policies" ? <PoliciesPanel /> : null}
            {tab === "purge" ? <PurgePanel /> : null}
            {tab === "warm" ? <WarmPanel /> : null}
            {tab === "optimization" ? <OptimizationPanel /> : null}
            {tab === "edge" ? <EdgePanel /> : null}
            {tab === "diagnostics" ? <DiagnosticsPanel /> : null}
            {tab === "settings" ? <SettingsPanel /> : null}
        </div>
    );
}

function StatusTile({ label, value, good }: { label: string; value: string; good?: boolean }) {
    return (
        <div className="rounded-2xl border bg-background/70 p-3">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className="mt-1 flex items-center gap-2 font-medium">
                <span className={cn("size-2 rounded-full bg-muted-foreground/40", good && "bg-primary")} />
                {value}
            </div>
        </div>
    );
}

function OverviewPanel({ value, loading }: { value?: LiteCashOverview; loading: boolean }) {
    if (loading && !value) return <Card className="p-6 text-muted-foreground text-sm">در حال بارگذاری evidence و topology…</Card>;
    return (
        <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <Metric label="Policy" value={fa(value?.counts.policies)} hint={`${fa(value?.counts.enabled_policies)} policy فعال`} />
                <Metric label="Cache hit" value={percent(value?.health.hit_rate)} hint="فقط از observation واقعی" />
                <Metric label="Cache miss" value={percent(value?.health.miss_rate)} hint="صفر ساختگی نمایش داده نمی‌شود" />
                <Metric label="Stale served" value={percent(value?.health.stale_rate)} hint="grace / stale evidence" />
                <Metric
                    label="p95 origin"
                    value={value?.health.p95_origin_latency_ms == null ? "—" : `${fa(value.health.p95_origin_latency_ms, 1)} ms`}
                    hint={`بر اساس ${fa(value?.health.samples)} نمونه اخیر`}
                />
            </div>

            <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
                <Card className="p-5">
                    <SectionTitle
                        title="Topology"
                        description="حقایق runtime بدون host، token، password یا URL داخلی."
                        side={<Pill tone={value?.topology.secrets_exposed ? "danger" : "good"}>Secrets: hidden</Pill>}
                    />
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <StatusTile label="L1 memory" value={value?.topology.l1_enabled ? "On" : "Off"} good={value?.topology.l1_enabled} />
                        <StatusTile label="Redis L2" value={value?.topology.l2_enabled ? "On" : "Off"} good={value?.topology.l2_enabled} />
                        <StatusTile label="Invalidation bus" value={value?.topology.bus_enabled ? "On" : "Off"} good={value?.topology.bus_enabled} />
                        <StatusTile label="Purge scopes" value={fa(value?.topology.registered_purge_scopes)} good />
                    </div>
                    <div className="mt-4 rounded-xl border bg-muted/20 p-3 font-mono text-xs leading-6" dir="ltr">
                        {value?.topology.tenant_namespace ?? "t<tenant-id>:<domain>:<resource>:..."}
                    </div>
                </Card>

                <Card className="overflow-hidden">
                    <div className="border-b p-5">
                        <SectionTitle
                            title="Policy health matrix"
                            description="تعداد policyهای فعال به تفکیک سطح cache."
                            side={<Pill tone={value?.evidence.fresh ? "good" : "warn"}>{value?.evidence.fresh ? "Evidence تازه" : "Evidence قدیمی/ناموجود"}</Pill>}
                        />
                    </div>
                    <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
                        {(value?.policy_health ?? []).map((row) => (
                            <div key={row.kind} className="rounded-xl border bg-muted/15 p-4">
                                <div className="text-muted-foreground text-xs">{row.kind}</div>
                                <div className="mt-2 font-semibold text-xl">{fa(row.enabled)} / {fa(row.total)}</div>
                                <div className="mt-1 text-muted-foreground text-xs">فعال / کل</div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
                <HistoryCard title="آخرین پاکسازی‌ها" empty="هنوز purge event ثبت نشده است.">
                    {(value?.recent_purges ?? []).map((item) => (
                        <div key={item.public_id} className="grid gap-2 border-b p-4 last:border-b-0 md:grid-cols-[1fr_auto_auto] md:items-center">
                            <div>
                                <div className="font-medium text-sm">{item.scope}{item.target ? ` · ${item.target}` : ""}</div>
                                <div className="mt-1 text-muted-foreground text-xs">{dateTime(item.created_at)}</div>
                            </div>
                            <Pill tone={item.blast_radius === "broad" ? "danger" : item.blast_radius === "medium" ? "warn" : "neutral"}>{item.blast_radius}</Pill>
                            <Pill tone={item.status === "succeeded" ? "good" : item.status === "failed" ? "danger" : "neutral"}>{item.status}</Pill>
                        </div>
                    ))}
                </HistoryCard>
                <HistoryCard title="آخرین Warm jobها" empty="هنوز warm job ثبت نشده است.">
                    {(value?.recent_warm_jobs ?? []).map((item) => (
                        <div key={item.public_id} className="grid gap-2 border-b p-4 last:border-b-0 md:grid-cols-[1fr_auto_auto] md:items-center">
                            <div>
                                <div className="font-medium text-sm">{item.scope} · {item.target_key}</div>
                                <div className="mt-1 text-muted-foreground text-xs">{dateTime(item.created_at)}</div>
                            </div>
                            <Pill>{item.strategy}</Pill>
                            <Pill tone={item.status === "succeeded" ? "good" : item.status === "failed" ? "danger" : "neutral"}>{item.status}</Pill>
                        </div>
                    ))}
                </HistoryCard>
            </div>
        </div>
    );
}

function HistoryCard({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
    const rows = Array.isArray(children) ? children : [children];
    return (
        <Card className="overflow-hidden">
            <div className="border-b p-4 font-semibold">{title}</div>
            <div>{rows.length === 0 ? <div className="p-5 text-muted-foreground text-sm">{empty}</div> : children}</div>
        </Card>
    );
}

function PoliciesPanel() {
    const [query, setQuery] = useState("");
    const list = useLiteCashResource<LiteCashPolicy[]>("policies", { limit: 300, q: query || undefined });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selected = useMemo(() => (list.data ?? []).find((row) => row.public_id === selectedId) ?? null, [list.data, selectedId]);

    useEffect(() => {
        if (selectedId === null && (list.data?.length ?? 0) > 0) setSelectedId(list.data?.[0]?.public_id ?? null);
    }, [list.data, selectedId]);

    return (
        <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
            <Card className="overflow-hidden">
                <div className="border-b p-5">
                    <SectionTitle
                        title="Cache policy inventory"
                        description="هر policy باید tag، vary، TTL و route کنترل‌شده داشته باشد؛ مسیرهای correctness-sensitive رد می‌شوند."
                        side={<Button type="button" variant="outline" onClick={() => setSelectedId(null)}>Policy جدید</Button>}
                    />
                    <Input className="mt-4" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی نام، key یا route…" />
                </div>
                <div className="max-h-[680px] overflow-auto">
                    {(list.data ?? []).map((row) => (
                        <button
                            key={row.public_id}
                            type="button"
                            onClick={() => setSelectedId(row.public_id)}
                            className={cn(
                                "block w-full border-b p-4 text-start transition-colors hover:bg-muted/30",
                                selectedId === row.public_id && "bg-primary/5",
                            )}
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-sm">{row.name}</span>
                                <Pill tone={row.status === "enabled" ? "good" : "neutral"}>{row.status}</Pill>
                                <Pill tone={row.risk_tier === "critical" || row.risk_tier === "high" ? "danger" : "neutral"}>{row.risk_tier}</Pill>
                            </div>
                            <div className="mt-2 truncate font-mono text-muted-foreground text-xs" dir="ltr">{row.route_pattern}</div>
                            <div className="mt-2 text-muted-foreground text-xs">TTL {fa(row.ttl_seconds)}s · v{fa(row.version)}</div>
                        </button>
                    ))}
                    {(list.data?.length ?? 0) === 0 ? <div className="p-5"><Empty>Policy ثبت نشده است.</Empty></div> : null}
                </div>
            </Card>
            <PolicyEditor key={selected?.public_id ?? "new"} policy={selected} />
        </div>
    );
}

function PolicyEditor({ policy }: { policy: LiteCashPolicy | null }) {
    const create = useLiteCashMutation<LiteCashPolicy>();
    const update = useLiteCashMutation<LiteCashPolicy, Record<string, unknown>>("PATCH");
    const validate = useLiteCashMutation<LiteCashPolicy["validation"]>();
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState(() => ({
        policy_key: policy?.policy_key ?? "",
        name: policy?.name ?? "",
        description: policy?.description ?? "",
        kind: policy?.kind ?? "api",
        route_pattern: policy?.route_pattern ?? "/api/v1/products",
        status: policy?.status ?? "disabled",
        risk_tier: policy?.risk_tier ?? "medium",
        ttl_seconds: String(policy?.ttl_seconds ?? 300),
        grace_seconds: String(policy?.grace_seconds ?? 0),
        stale_if_error_seconds: String(policy?.stale_if_error_seconds ?? 0),
        soft_timeout_ms: String(policy?.soft_timeout_ms ?? 200),
        hard_timeout_ms: String(policy?.hard_timeout_ms ?? 2000),
        tags: (policy?.tags ?? ["catalog_products"]).join(", "),
        vary: (policy?.vary ?? ["tenant", "locale"]).join(", "),
        conditions: JSON.stringify(policy?.conditions ?? {}, null, 2),
        reason: "تنظیم policy cache",
    }));

    const submit = async () => {
        setError(null);
        setMessage(null);
        try {
            const body: Record<string, unknown> = {
                name: form.name,
                description: form.description,
                kind: form.kind,
                route_pattern: form.route_pattern,
                status: form.status,
                risk_tier: form.risk_tier,
                ttl_seconds: Number(form.ttl_seconds),
                grace_seconds: Number(form.grace_seconds),
                stale_if_error_seconds: Number(form.stale_if_error_seconds),
                soft_timeout_ms: Number(form.soft_timeout_ms),
                hard_timeout_ms: Number(form.hard_timeout_ms),
                tags: form.tags.split(",").map((value) => value.trim()).filter(Boolean),
                vary: form.vary.split(",").map((value) => value.trim()).filter(Boolean),
                conditions: parseJson(form.conditions),
                reason: form.reason,
            };
            if (policy) await update.mutateAsync({ path: `policies/${policy.public_id}`, body });
            else await create.mutateAsync({ path: "policies", body: { ...body, policy_key: form.policy_key } });
            setMessage("Policy ذخیره شد و guardrailهای server-side اعمال شدند.");
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "ذخیره policy ناموفق بود.");
        }
    };

    return (
        <Card className="p-5">
            <SectionTitle
                title={policy ? `ویرایش ${policy.name}` : "Policy جدید"}
                description="این فرم فقط configuration را تغییر می‌دهد؛ cache engine و مسیرهای حساس بدون validation تغییر نمی‌کنند."
                side={policy ? <Pill>v{fa(policy.version)}</Pill> : <Pill>Draft</Pill>}
            />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Policy key"><Input disabled={Boolean(policy)} value={form.policy_key} onChange={(event) => setForm({ ...form, policy_key: event.target.value })} dir="ltr" /></Field>
                <Field label="نام"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
                <Field label="نوع"><SimpleSelect value={form.kind} values={["api", "page", "asset", "query"]} onChange={(value) => setForm({ ...form, kind: value as typeof form.kind })} /></Field>
                <Field label="وضعیت"><SimpleSelect value={form.status} values={["disabled", "enabled", "archived"]} onChange={(value) => setForm({ ...form, status: value as typeof form.status })} /></Field>
                <Field label="ریسک"><SimpleSelect value={form.risk_tier} values={["low", "medium", "high", "critical"]} onChange={(value) => setForm({ ...form, risk_tier: value as typeof form.risk_tier })} /></Field>
                <Field label="Route pattern"><Input value={form.route_pattern} onChange={(event) => setForm({ ...form, route_pattern: event.target.value })} dir="ltr" /></Field>
                <Field label="TTL (s)"><Input type="number" value={form.ttl_seconds} onChange={(event) => setForm({ ...form, ttl_seconds: event.target.value })} /></Field>
                <Field label="Grace (s)"><Input type="number" value={form.grace_seconds} onChange={(event) => setForm({ ...form, grace_seconds: event.target.value })} /></Field>
                <Field label="Stale-if-error (s)"><Input type="number" value={form.stale_if_error_seconds} onChange={(event) => setForm({ ...form, stale_if_error_seconds: event.target.value })} /></Field>
                <Field label="Soft / Hard timeout (ms)"><div className="grid grid-cols-2 gap-2"><Input type="number" value={form.soft_timeout_ms} onChange={(event) => setForm({ ...form, soft_timeout_ms: event.target.value })} /><Input type="number" value={form.hard_timeout_ms} onChange={(event) => setForm({ ...form, hard_timeout_ms: event.target.value })} /></div></Field>
                <Field label="Registered tags"><Input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} dir="ltr" /></Field>
                <Field label="Vary dimensions"><Input value={form.vary} onChange={(event) => setForm({ ...form, vary: event.target.value })} dir="ltr" /></Field>
            </div>
            <Field label="توضیح"><Textarea className="mt-2 min-h-20" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
            <Field label="Conditions JSON"><Textarea className="mt-2 min-h-28 font-mono text-xs" value={form.conditions} onChange={(event) => setForm({ ...form, conditions: event.target.value })} dir="ltr" /></Field>
            <Field label="دلیل تغییر"><Input className="mt-2" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></Field>
            {error ? <div className="mt-4"><Notice tone="danger">{error}</Notice></div> : null}
            {message ? <div className="mt-4"><Notice tone="good">{message}</Notice></div> : null}
            <div className="mt-5 flex flex-wrap gap-2">
                <Button type="button" onClick={submit} disabled={create.isPending || update.isPending}>ذخیره Policy</Button>
                {policy ? (
                    <Button
                        type="button"
                        variant="outline"
                        disabled={validate.isPending}
                        onClick={async () => {
                            setError(null);
                            try {
                                const result = await validate.mutateAsync({ path: `policies/${policy.public_id}/validate`, body: {} });
                                setMessage(result && "valid" in result && result.valid ? "Validation موفق بود." : "Validation با finding برگشت.");
                            } catch (caught) {
                                setError(caught instanceof Error ? caught.message : "Validation ناموفق بود.");
                            }
                        }}
                    >
                        Validate
                    </Button>
                ) : null}
            </div>
            {policy && "errors" in policy.validation ? (
                <div className="mt-5 space-y-2">
                    {(policy.validation.errors ?? []).map((item) => <Notice key={item.code} tone="danger">{item.code}: {item.message}</Notice>)}
                    {(policy.validation.warnings ?? []).map((item) => <Notice key={item.code} tone="warn">{item.code}: {item.message}</Notice>)}
                </div>
            ) : null}
        </Card>
    );
}

function PurgePanel() {
    const registry = useLiteCashResource<LiteCashPurgeScope[]>("registry/purge-scopes");
    const history = useLiteCashResource<LiteCashPurgeEvent[]>("purges", { limit: 200 });
    const plan = useLiteCashMutation<LiteCashPurgeEvent>();
    const execute = useLiteCashMutation<LiteCashPurgeEvent>();
    const [scope, setScope] = useState("catalog_products");
    const [target, setTarget] = useState("");
    const [reason, setReason] = useState("پاکسازی کنترل‌شده cache");
    const [planned, setPlanned] = useState<LiteCashPurgeEvent | null>(null);
    const [error, setError] = useState<string | null>(null);
    const selectedScope = (registry.data ?? []).find((item) => item.scope === scope);

    const doPlan = async () => {
        setError(null);
        try {
            const body = { scope, target: target || undefined, idempotency_key: operationKey("plan"), reason };
            setPlanned(await plan.mutateAsync({ path: "purge/plan", body }));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "ساخت purge plan ناموفق بود.");
        }
    };

    const doExecute = async () => {
        setError(null);
        try {
            const body = { scope, target: target || undefined, idempotency_key: operationKey("purge"), reason };
            setPlanned(await execute.mutateAsync({ path: "purge/execute", body }));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "اجرای purge ناموفق بود.");
        }
    };

    return (
        <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
            <Card className="p-5">
                <SectionTitle title="Purge planner" description="هیچ Redis key یا wildcard دستی پذیرفته نمی‌شود؛ فقط scopeهای ثبت‌شده به CacheTags واقعی resolve می‌شوند." />
                <div className="mt-5 space-y-4">
                    <Field label="Scope">
                        <Select value={scope} onValueChange={setScope}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{(registry.data ?? []).map((item) => <SelectItem key={item.scope} value={item.scope}>{item.scope}{item.broad ? " · BROAD" : ""}</SelectItem>)}</SelectContent>
                        </Select>
                    </Field>
                    {selectedScope?.target_required ? <Field label="Target"><Input value={target} onChange={(event) => setTarget(event.target.value)} dir="ltr" placeholder={scope === "settings_group" ? "general" : "123"} /></Field> : null}
                    <Field label="دلیل"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
                    {selectedScope?.broad ? <Notice tone="danger">Full-tenant purge دارای blast radius گسترده است، global tenant registry را پاک نمی‌کند و در API به permission و identity step-up نیاز دارد.</Notice> : null}
                    {error ? <Notice tone="danger">{error}</Notice> : null}
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={doPlan} disabled={plan.isPending}>Dry run / Plan</Button>
                        <Button type="button" variant={selectedScope?.broad ? "destructive" : "default"} onClick={doExecute} disabled={execute.isPending}>اجرای پاکسازی</Button>
                    </div>
                </div>
                {planned ? (
                    <div className="mt-5 space-y-3 rounded-2xl border p-4">
                        <div className="flex flex-wrap items-center gap-2"><Pill>{planned.mode}</Pill><Pill tone={planned.blast_radius === "broad" ? "danger" : planned.blast_radius === "medium" ? "warn" : "good"}>{planned.blast_radius}</Pill><Pill tone={planned.status === "succeeded" ? "good" : planned.status === "failed" ? "danger" : "neutral"}>{planned.status}</Pill></div>
                        <div className="text-muted-foreground text-xs">Resolved tags</div>
                        <div className="max-h-48 overflow-auto rounded-xl bg-muted/30 p-3 font-mono text-xs leading-6" dir="ltr">{planned.resolved_tags.join("\n")}</div>
                    </div>
                ) : null}
            </Card>
            <HistoryTable title="Purge history" rows={history.data ?? []} columns={["Scope", "Blast", "Mode", "Status", "زمان"]} render={(item: LiteCashPurgeEvent) => [item.scope, item.blast_radius, item.mode, item.status, dateTime(item.created_at)]} />
        </div>
    );
}

function WarmPanel() {
    const jobs = useLiteCashResource<LiteCashWarmJob[]>("warm-jobs", { limit: 200 });
    const create = useLiteCashMutation<LiteCashWarmJob>();
    const cancel = useLiteCashMutation<LiteCashWarmJob>();
    const [form, setForm] = useState({ scope: "catalog", target_key: "catalog-main", strategy: "cold_fill", priority: "normal", concurrency: "2", plan: "{}", reason: "Warm cache plan" });
    const [error, setError] = useState<string | null>(null);

    return (
        <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
            <Card className="p-5">
                <SectionTitle title="Warm / preload plan" description="lite cash URL دلخواه را fetch نمی‌کند؛ plan نسخه‌پذیر می‌سازد و worker مورداعتماد progress واقعی را observe می‌کند." />
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Field label="Scope"><SimpleSelect value={form.scope} values={["catalog", "taxonomy", "storefront", "reports", "custom_registered"]} onChange={(value) => setForm({ ...form, scope: value })} /></Field>
                    <Field label="Strategy"><SimpleSelect value={form.strategy} values={["cold_fill", "refresh", "verify"]} onChange={(value) => setForm({ ...form, strategy: value })} /></Field>
                    <Field label="Priority"><SimpleSelect value={form.priority} values={["low", "normal", "high"]} onChange={(value) => setForm({ ...form, priority: value })} /></Field>
                    <Field label="Concurrency"><Input type="number" min={1} max={32} value={form.concurrency} onChange={(event) => setForm({ ...form, concurrency: event.target.value })} /></Field>
                    <Field label="Target key"><Input value={form.target_key} onChange={(event) => setForm({ ...form, target_key: event.target.value })} dir="ltr" /></Field>
                    <Field label="Reason"><Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></Field>
                </div>
                <Field label="Plan JSON"><Textarea className="mt-2 min-h-32 font-mono text-xs" value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })} dir="ltr" /></Field>
                <Notice tone="neutral">Progress از UI ساخته نمی‌شود. discovered/processed/success/failure فقط از observation مورداعتماد worker تغییر می‌کند.</Notice>
                {error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}
                <Button
                    type="button"
                    className="mt-4"
                    disabled={create.isPending}
                    onClick={async () => {
                        setError(null);
                        try {
                            await create.mutateAsync({
                                path: "warm-jobs",
                                body: {
                                    scope: form.scope,
                                    target_key: form.target_key,
                                    strategy: form.strategy,
                                    priority: form.priority,
                                    concurrency: Number(form.concurrency),
                                    plan: parseJson(form.plan),
                                    idempotency_key: operationKey("warm"),
                                    reason: form.reason,
                                },
                            });
                        } catch (caught) {
                            setError(caught instanceof Error ? caught.message : "ساخت warm job ناموفق بود.");
                        }
                    }}
                >
                    ایجاد Warm job
                </Button>
            </Card>
            <Card className="overflow-hidden">
                <div className="border-b p-5"><SectionTitle title="Warm queue" description="صف برنامه‌ریزی‌شده و evidence واقعی اجرای worker." /></div>
                <div className="max-h-[680px] overflow-auto divide-y">
                    {(jobs.data ?? []).map((job) => {
                        const progress = job.discovered_count > 0 ? Math.min(100, (job.processed_count / job.discovered_count) * 100) : null;
                        return (
                            <div key={job.public_id} className="p-4">
                                <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-sm">{job.scope} · {job.target_key}</span><Pill>{job.strategy}</Pill><Pill tone={job.status === "succeeded" ? "good" : job.status === "failed" ? "danger" : "neutral"}>{job.status}</Pill></div>
                                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4"><span>کشف: {fa(job.discovered_count)}</span><span>پردازش: {fa(job.processed_count)}</span><span>موفق: {fa(job.success_count)}</span><span>خطا: {fa(job.failure_count)}</span></div>
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: progress === null ? "0%" : `${progress}%` }} /></div>
                                <div className="mt-3 flex items-center justify-between gap-3"><span className="truncate font-mono text-muted-foreground text-[11px]" dir="ltr">{job.plan_sha256}</span>{!["succeeded", "partial", "failed", "cancelled"].includes(job.status) ? <Button type="button" size="sm" variant="outline" onClick={() => cancel.mutate({ path: `warm-jobs/${job.public_id}/cancel`, body: { reason: "لغو توسط اپراتور" } })}>لغو</Button> : null}</div>
                            </div>
                        );
                    })}
                    {(jobs.data?.length ?? 0) === 0 ? <div className="p-5"><Empty>Warm job ثبت نشده است.</Empty></div> : null}
                </div>
            </Card>
        </div>
    );
}

function OptimizationPanel() {
    const profiles = useLiteCashResource<LiteCashProfile[]>("profiles", { limit: 100 });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selected = useMemo(() => (profiles.data ?? []).find((row) => row.public_id === selectedId) ?? null, [profiles.data, selectedId]);
    useEffect(() => {
        if (selectedId === null && (profiles.data?.length ?? 0) > 0) setSelectedId(profiles.data?.[0]?.public_id ?? null);
    }, [profiles.data, selectedId]);

    return (
        <div className="grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
            <Card className="overflow-hidden">
                <div className="border-b p-5"><SectionTitle title="Optimization profiles" description="پروفایل‌ها artifact هستند؛ اعمال واقعی CSS/JS/image/edge باید توسط adapter مورداعتماد evidence بدهد." side={<Button type="button" variant="outline" onClick={() => setSelectedId(null)}>پروفایل جدید</Button>} /></div>
                <div className="divide-y">
                    {(profiles.data ?? []).map((profile) => (
                        <button key={profile.public_id} type="button" onClick={() => setSelectedId(profile.public_id)} className={cn("block w-full p-4 text-start hover:bg-muted/30", selectedId === profile.public_id && "bg-primary/5")}>
                            <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-sm">{profile.name}</span><Pill tone={profile.status === "active" ? "good" : "neutral"}>{profile.status}</Pill><Pill tone={profile.mode === "aggressive" ? "warn" : "neutral"}>{profile.mode}</Pill></div>
                            <div className="mt-2 text-muted-foreground text-xs">v{fa(profile.version)} · {dateTime(profile.updated_at)}</div>
                        </button>
                    ))}
                </div>
            </Card>
            <ProfileEditor key={selected?.public_id ?? "new"} profile={selected} />
        </div>
    );
}

function ProfileEditor({ profile }: { profile: LiteCashProfile | null }) {
    const create = useLiteCashMutation<LiteCashProfile>();
    const update = useLiteCashMutation<LiteCashProfile, Record<string, unknown>>("PATCH");
    const activate = useLiteCashMutation<LiteCashProfile>();
    const [error, setError] = useState<string | null>(null);
    const defaults = {
        css: { minify: true, remove_unused: false, critical_css: false, async_css: false, exclusions: [] },
        javascript: { minify: true, defer: true, delay_interaction: false, exclusions: [] },
        images: { lazy_load: true, lcp_priority: true, webp: true, avif: true, placeholder: "none" },
        fonts: { preload: [], self_host_preference: true, display: "swap", preconnect: [] },
        navigation: { speculation: "conservative", hover_prefetch: false },
        edge: { early_hints: false, tiered_cache_intent: false, origin_shield_intent: false },
    };
    const [form, setForm] = useState(() => ({
        profile_key: profile?.profile_key ?? "",
        name: profile?.name ?? "",
        mode: profile?.mode ?? "safe",
        css: JSON.stringify(profile?.css ?? defaults.css, null, 2),
        javascript: JSON.stringify(profile?.javascript ?? defaults.javascript, null, 2),
        images: JSON.stringify(profile?.images ?? defaults.images, null, 2),
        fonts: JSON.stringify(profile?.fonts ?? defaults.fonts, null, 2),
        navigation: JSON.stringify(profile?.navigation ?? defaults.navigation, null, 2),
        edge: JSON.stringify(profile?.edge ?? defaults.edge, null, 2),
        reason: "تنظیم optimization profile",
    }));

    const body = () => ({
        name: form.name,
        mode: form.mode,
        status: profile?.status ?? "draft",
        css: parseJson(form.css),
        javascript: parseJson(form.javascript),
        images: parseJson(form.images),
        fonts: parseJson(form.fonts),
        navigation: parseJson(form.navigation),
        edge: parseJson(form.edge),
        reason: form.reason,
    });

    return (
        <Card className="p-5">
            <SectionTitle title={profile ? profile.name : "پروفایل جدید"} description="حالت safe پیش‌فرض محافظه‌کار است؛ unused CSS، interaction-delay و edge features بدون adapter مورداعتماد فقط intent باقی می‌مانند." side={profile ? <Pill tone={profile.status === "active" ? "good" : "neutral"}>{profile.status}</Pill> : <Pill>Draft</Pill>} />
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <Field label="Profile key"><Input disabled={Boolean(profile)} value={form.profile_key} onChange={(event) => setForm({ ...form, profile_key: event.target.value })} dir="ltr" /></Field>
                <Field label="نام"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
                <Field label="Mode"><SimpleSelect value={form.mode} values={["safe", "balanced", "aggressive", "custom"]} onChange={(value) => setForm({ ...form, mode: value as typeof form.mode })} /></Field>
            </div>
            {form.mode === "aggressive" ? <div className="mt-4"><Notice tone="warn">Aggressive profile می‌تواند layout، interaction یا LCP را خراب کند؛ activation نیازمند identity step-up است.</Notice></div> : null}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <JsonField label="CSS" value={form.css} onChange={(value) => setForm({ ...form, css: value })} />
                <JsonField label="JavaScript" value={form.javascript} onChange={(value) => setForm({ ...form, javascript: value })} />
                <JsonField label="Images" value={form.images} onChange={(value) => setForm({ ...form, images: value })} />
                <JsonField label="Fonts" value={form.fonts} onChange={(value) => setForm({ ...form, fonts: value })} />
                <JsonField label="Navigation" value={form.navigation} onChange={(value) => setForm({ ...form, navigation: value })} />
                <JsonField label="Edge" value={form.edge} onChange={(value) => setForm({ ...form, edge: value })} />
            </div>
            <Field label="دلیل"><Input className="mt-2" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></Field>
            {error ? <div className="mt-4"><Notice tone="danger">{error}</Notice></div> : null}
            <div className="mt-5 flex flex-wrap gap-2">
                <Button
                    type="button"
                    disabled={create.isPending || update.isPending}
                    onClick={async () => {
                        setError(null);
                        try {
                            const payload = body();
                            if (profile) await update.mutateAsync({ path: `profiles/${profile.public_id}`, body: payload });
                            else await create.mutateAsync({ path: "profiles", body: { ...payload, profile_key: form.profile_key } });
                        } catch (caught) {
                            setError(caught instanceof Error ? caught.message : "ذخیره profile ناموفق بود.");
                        }
                    }}
                >
                    ذخیره Profile
                </Button>
                {profile && profile.status !== "active" ? <Button type="button" variant="outline" disabled={activate.isPending} onClick={() => activate.mutate({ path: `profiles/${profile.public_id}/activate`, body: { reason: form.reason } })}>Activate با Step-up</Button> : null}
            </div>
        </Card>
    );
}

function EdgePanel() {
    const topology = useLiteCashResource<LiteCashTopology>("topology");
    const settings = useLiteCashResource<LiteCashSettings>("settings");
    const rows = [
        ["Tenant namespace", "اجباری", "کلیدهای tenant هرگز share نمی‌شوند"],
        ["L1 memory", topology.data?.l1_enabled ? "فعال" : "خاموش", "zero-network repeat hit"],
        ["Redis L2", topology.data?.l2_enabled ? "فعال" : "خاموش", "shared cache بین replicaها"],
        ["Invalidation bus", topology.data?.bus_enabled ? "فعال" : "خاموش", "L1 coherence بین processها"],
        ["Edge provider", settings.data?.edge_provider ?? "none", "metadata بدون credential"],
        ["Purge by registered tag", "فعال", "URL/key دلخواه ممنوع"],
        ["Global flush", "ممنوع", "flushall / flushdb وجود ندارد"],
    ];
    return (
        <div className="space-y-5">
            <Card className="p-5"><SectionTitle title="Edge & object cache topology" description="این صفحه secret management نیست؛ فقط readiness و intentهای provider-neutral را نشان می‌دهد." />
                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Driver" value={topology.data?.driver ?? "—"} hint="runtime cache driver" /><Metric label="Purge registry" value={fa(topology.data?.registered_purge_scopes)} hint="scopeهای allow-listed" /><Metric label="Default TTL" value={`${fa(topology.data?.runtime_defaults.ttl_seconds)}s`} hint="tenant policy baseline" /><Metric label="Evidence" value={dateTime(topology.data?.last_observation_at)} hint="آخرین trusted observation" /></div>
            </Card>
            <Card className="overflow-hidden"><div className="border-b p-4 font-semibold">Capability matrix</div><div className="overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-background"><tr className="border-b text-muted-foreground"><th className="p-3 text-start font-medium">قابلیت</th><th className="p-3 text-start font-medium">وضعیت</th><th className="p-3 text-start font-medium">مرز</th></tr></thead><tbody>{rows.map(([name, state, note]) => <tr key={name} className="border-b last:border-0"><td className="p-3 font-medium">{name}</td><td className="p-3"><Pill tone={state === "ممنوع" ? "danger" : "neutral"}>{state}</Pill></td><td className="p-3 text-muted-foreground">{note}</td></tr>)}</tbody></table></div></Card>
            <Notice tone="neutral">Cloudflare/QUIC/custom فقط provider metadata هستند. API token، zone secret، Redis password و origin credential نه در DB ذخیره می‌شوند و نه به browser برمی‌گردند.</Notice>
        </div>
    );
}

function DiagnosticsPanel() {
    const observations = useLiteCashResource<LiteCashObservation[]>("observations", { limit: 500 });
    const snapshots = useLiteCashResource<LiteCashSnapshot[]>("snapshots", { limit: 100 });
    const topology = useLiteCashResource<LiteCashTopology>("topology");
    const exportQuery = useLiteCashResource<Record<string, unknown>>("export");
    const snapshot = useLiteCashMutation<LiteCashSnapshot>();
    const validateImport = useLiteCashMutation<{ valid: boolean; errors: Array<{ code: string; message: string }>; warnings: Array<{ code: string; message: string }>; fingerprint: string }>();
    const applyImport = useLiteCashMutation<Record<string, unknown>>();
    const [document, setDocument] = useState("");
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!document && exportQuery.data) setDocument(JSON.stringify(exportQuery.data, null, 2));
    }, [document, exportQuery.data]);

    return (
        <div className="space-y-5">
            <Card className="p-5">
                <SectionTitle title="Environment report" description="فقط runtime factهای safe؛ هیچ credential، host داخلی یا token در گزارش نیست." side={<Pill tone={topology.data?.secrets_exposed ? "danger" : "good"}>redacted</Pill>} />
                <div className="mt-5 grid gap-3 md:grid-cols-3"><StatusTile label="Driver" value={topology.data?.driver ?? "—"} /><StatusTile label="Namespace" value={topology.data?.tenant_namespace ?? "—"} good /><StatusTile label="Last evidence" value={dateTime(topology.data?.last_observation_at)} /></div>
            </Card>
            <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
                <Card className="overflow-hidden"><div className="border-b p-4 font-semibold">Observation log</div><div className="max-h-[520px] overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-background"><tr className="border-b text-muted-foreground"><th className="p-3 text-start">Source</th><th className="p-3 text-start">Metric</th><th className="p-3 text-start">Value</th><th className="p-3 text-start">Outcome</th><th className="p-3 text-start">Time</th></tr></thead><tbody>{(observations.data ?? []).map((row) => <tr key={row.id} className="border-b"><td className="p-3">{row.source}</td><td className="p-3 font-mono" dir="ltr">{row.metric_key}</td><td className="p-3 tabular-nums">{row.value == null ? "—" : `${row.value} ${row.unit}`}</td><td className="p-3">{row.outcome ?? "—"}</td><td className="p-3">{dateTime(row.observed_at)}</td></tr>)}</tbody></table></div></Card>
                <Card className="p-5"><SectionTitle title="Configuration snapshots" description="Snapshotها immutable هستند و secret ندارند." side={<Button type="button" variant="outline" size="sm" onClick={() => snapshot.mutate({ path: "snapshots", body: { snapshot_kind: "manual", reason: "Manual operator snapshot" } })}>Snapshot</Button>} /><div className="mt-4 space-y-2">{(snapshots.data ?? []).slice(0, 10).map((row) => <div key={row.public_id} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><Pill>{row.snapshot_kind}</Pill><span className="text-muted-foreground text-xs">{dateTime(row.created_at)}</span></div><div className="mt-2 truncate font-mono text-muted-foreground text-[11px]" dir="ltr">{row.fingerprint_sha256}</div><div className="mt-2 text-xs">{row.reason}</div></div>)}{(snapshots.data?.length ?? 0) === 0 ? <Empty>Snapshot وجود ندارد.</Empty> : null}</div></Card>
            </div>
            <Card className="p-5">
                <SectionTitle title="Import / Export" description="فقط settings، policies و optimization profiles. purge history، observationها و secretها export نمی‌شوند." />
                <Textarea className="mt-4 min-h-72 font-mono text-xs" dir="ltr" value={document} onChange={(event) => setDocument(event.target.value)} />
                {error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}
                {result ? <div className="mt-3"><Notice tone="good">{result}</Notice></div> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => setDocument(JSON.stringify(exportQuery.data ?? {}, null, 2))}>بارگذاری Export فعلی</Button>
                    <Button type="button" variant="outline" onClick={async () => { setError(null); try { const data = await validateImport.mutateAsync({ path: "import/validate", body: { document: parseJson(document), reason: "Import validation" } }); setResult(data.valid ? `Import معتبر است · ${data.fingerprint}` : `${data.errors.length} خطا پیدا شد.`); } catch (caught) { setError(caught instanceof Error ? caught.message : "Validation ناموفق بود."); } }}>Validate import</Button>
                    <Button type="button" onClick={async () => { setError(null); try { await applyImport.mutateAsync({ path: "import/apply", body: { document: parseJson(document), reason: "Apply configuration import" } }); setResult("Import به‌صورت atomic اعمال شد و snapshot قبل از تغییر ثبت شد."); } catch (caught) { setError(caught instanceof Error ? caught.message : "Import ناموفق بود."); } }}>Apply با Step-up</Button>
                </div>
            </Card>
        </div>
    );
}

function SettingsPanel() {
    const query = useLiteCashResource<LiteCashSettings>("settings");
    if (!query.data) return <Card className="p-6 text-muted-foreground text-sm">در حال بارگذاری تنظیمات…</Card>;
    return <SettingsEditor key={query.data.updated_at} settings={query.data} />;
}

function SettingsEditor({ settings }: { settings: LiteCashSettings }) {
    const update = useLiteCashMutation<LiteCashSettings, Record<string, unknown>>("PATCH");
    const [form, setForm] = useState({
        enabled: settings.enabled,
        default_ttl_seconds: String(settings.default_ttl_seconds),
        default_grace_seconds: String(settings.default_grace_seconds),
        default_stale_if_error_seconds: String(settings.default_stale_if_error_seconds),
        max_policy_ttl_seconds: String(settings.max_policy_ttl_seconds),
        max_warm_concurrency: String(settings.max_warm_concurrency),
        broad_purge_requires_step_up: settings.broad_purge_requires_step_up,
        debug_minutes: "0",
        default_profile: settings.default_profile,
        edge_provider: settings.edge_provider,
        reason: "تنظیم lite cash",
    });
    const [message, setMessage] = useState<string | null>(null);
    const debugActive = settings.debug_until ? new Date(settings.debug_until).getTime() > Date.now() : false;

    return (
        <Card className="p-5">
            <SectionTitle title="تنظیمات lite cash" description="تغییر هم‌مقدار no-op است و history/audit اضافی تولید نمی‌کند." side={<Pill tone={settings.enabled ? "good" : "danger"}>{settings.enabled ? "Enabled" : "Disabled"}</Pill>} />
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <ToggleRow label="Master enable" description="خاموش‌کردن control plane policyها را حذف نمی‌کند." checked={form.enabled} onChange={(checked) => setForm({ ...form, enabled: checked })} />
                <ToggleRow label="Broad purge step-up" description="Full-tenant purge نیازمند احراز هویت تکمیلی بماند." checked={form.broad_purge_requires_step_up} onChange={(checked) => setForm({ ...form, broad_purge_requires_step_up: checked })} />
                <Field label="Default TTL (s)"><Input type="number" value={form.default_ttl_seconds} onChange={(event) => setForm({ ...form, default_ttl_seconds: event.target.value })} /></Field>
                <Field label="Max policy TTL (s)"><Input type="number" value={form.max_policy_ttl_seconds} onChange={(event) => setForm({ ...form, max_policy_ttl_seconds: event.target.value })} /></Field>
                <Field label="Default grace (s)"><Input type="number" value={form.default_grace_seconds} onChange={(event) => setForm({ ...form, default_grace_seconds: event.target.value })} /></Field>
                <Field label="Stale-if-error (s)"><Input type="number" value={form.default_stale_if_error_seconds} onChange={(event) => setForm({ ...form, default_stale_if_error_seconds: event.target.value })} /></Field>
                <Field label="Max warm concurrency"><Input type="number" min={1} max={32} value={form.max_warm_concurrency} onChange={(event) => setForm({ ...form, max_warm_concurrency: event.target.value })} /></Field>
                <Field label="Default optimization"><SimpleSelect value={form.default_profile} values={["safe", "balanced", "aggressive", "custom"]} onChange={(value) => setForm({ ...form, default_profile: value as typeof form.default_profile })} /></Field>
                <Field label="Edge provider metadata"><SimpleSelect value={form.edge_provider} values={["none", "cloudflare", "quic", "custom"]} onChange={(value) => setForm({ ...form, edge_provider: value as typeof form.edge_provider })} /></Field>
                <Field label="Debug برای چند دقیقه"><Input type="number" min={0} max={1440} value={form.debug_minutes} onChange={(event) => setForm({ ...form, debug_minutes: event.target.value })} /></Field>
            </div>
            {debugActive ? <div className="mt-4"><Notice tone="warn">Debug mode تا {dateTime(settings.debug_until)} فعال است و بعد خودکار منقضی می‌شود.</Notice></div> : null}
            {!form.broad_purge_requires_step_up ? <div className="mt-4"><Notice tone="danger">غیرفعال‌کردن step-up برای broad purge ریسک عملیاتی بالایی دارد.</Notice></div> : null}
            <Field label="دلیل تغییر"><Input className="mt-2" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></Field>
            {message ? <div className="mt-4"><Notice tone="good">{message}</Notice></div> : null}
            <Button type="button" className="mt-5" disabled={update.isPending} onClick={async () => { await update.mutateAsync({ path: "settings", body: { enabled: form.enabled, default_ttl_seconds: Number(form.default_ttl_seconds), default_grace_seconds: Number(form.default_grace_seconds), default_stale_if_error_seconds: Number(form.default_stale_if_error_seconds), max_policy_ttl_seconds: Number(form.max_policy_ttl_seconds), max_warm_concurrency: Number(form.max_warm_concurrency), broad_purge_requires_step_up: form.broad_purge_requires_step_up, debug_minutes: Number(form.debug_minutes), default_profile: form.default_profile, edge_provider: form.edge_provider, reason: form.reason } }); setMessage("تنظیمات ذخیره شد و snapshot تغییر ثبت شد."); }}>ذخیره تنظیمات</Button>
        </Card>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return <div className="flex items-center justify-between gap-4 rounded-xl border p-4"><div><div className="font-medium text-sm">{label}</div><div className="mt-1 text-muted-foreground text-xs leading-5">{description}</div></div><Switch checked={checked} onCheckedChange={onChange} /></div>;
}

function SimpleSelect({ value, values, onChange }: { value: string; values: string[]; onChange: (value: string) => void }) {
    return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{values.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>;
}

function JsonField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return <Field label={label}><Textarea className="min-h-44 font-mono text-xs" value={value} onChange={(event) => onChange(event.target.value)} dir="ltr" /></Field>;
}

function HistoryTable<T>({ title, rows, columns, render }: { title: string; rows: T[]; columns: string[]; render: (item: T) => ReactNode[] }) {
    return <Card className="overflow-hidden"><div className="border-b p-4 font-semibold">{title}</div><div className="max-h-[680px] overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-background"><tr className="border-b text-muted-foreground">{columns.map((column) => <th key={column} className="p-3 text-start font-medium">{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b last:border-0">{render(row).map((cell, cellIndex) => <td key={cellIndex} className="p-3">{cell}</td>)}</tr>)}</tbody></table>{rows.length === 0 ? <div className="p-5"><Empty>داده‌ای ثبت نشده است.</Empty></div> : null}</div></Card>;
}
