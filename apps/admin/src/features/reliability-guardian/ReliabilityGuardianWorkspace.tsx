"use client";

import { useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import {
    type ReliabilityIncident,
    type ReliabilityInvariant,
    type ReliabilityOverview,
    type ReliabilityRemediation,
    type ReliabilityScorecard,
    useReliabilityMutation,
    useReliabilityResource,
} from "#/lib/queries/reliability-guardian";

type Tab = "overview" | "invariants" | "incidents" | "remediations" | "scorecards";
const tabs: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: "نمای کلی" },
    { key: "invariants", label: "Invariantها" },
    { key: "incidents", label: "رخدادها" },
    { key: "remediations", label: "ترمیم‌ها" },
    { key: "scorecards", label: "امتیاز پایداری" },
];
const fa = (value: number | null | undefined) => new Intl.NumberFormat("fa-IR").format(Number(value ?? 0));
const when = (value: string | null | undefined) =>
    value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

function Pill({ children }: { children: React.ReactNode }) {
    return <span className="inline-flex rounded-full border bg-muted/40 px-2.5 py-1 text-xs">{children}</span>;
}
function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <Card className="border-border/70 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
                {label}
                <HelperTooltip text={hint} />
            </div>
            <div className="mt-2 font-semibold text-2xl tracking-tight">{value}</div>
        </Card>
    );
}
function ErrorLine({ message }: { message: string }) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">{message}</div>;
}

export function ReliabilityGuardianWorkspace() {
    const [tab, setTab] = useState<Tab>("overview");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const overview = useReliabilityResource<ReliabilityOverview>("overview");
    const invariants = useReliabilityResource<ReliabilityInvariant[]>("invariants");
    const incidents = useReliabilityResource<ReliabilityIncident[]>("incidents?limit=150");
    const remediations = useReliabilityResource<ReliabilityRemediation[]>("remediations?limit=150");
    const scorecards = useReliabilityResource<ReliabilityScorecard[]>("scorecards?limit=120");
    const post = useReliabilityMutation<Record<string, unknown>>();

    const run = (path: string, body: Record<string, unknown>) => {
        setMessage("");
        setError("");
        post.mutate(
            { path, body },
            {
                onSuccess: () => setMessage("عملیات با شواهد و ممیزی کامل ثبت شد."),
                onError: (requestError) => setError(requestError.message),
            },
        );
    };

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="Reliability Guardian و Self-Healing"
                subtitle="کنترل پایداری، رخداد و ترمیم برگشت‌پذیر؛ بدون ساختن telemetry یا truth موازی با سرویس‌های canonical کالیبرا."
            />
            <Card className="border-border/70 bg-gradient-to-br from-primary/10 via-background to-muted/30 p-6 shadow-sm">
                <div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
                    <div>
                        <Pill>Phase 32 · Reliability Guardian</Pill>
                        <h2 className="mt-3 font-semibold text-2xl">اول شواهد، بعد Incident، بعد ترمیم محدود و قابل برگشت</h2>
                        <p className="mt-3 max-w-3xl text-muted-foreground text-sm leading-7">
                            Synthetic evidence از Phase 24، دقت promise از Phase 31، rollback تنظیمات از Configuration Revision و
                            توقف آزمایش از Phase 17 خوانده می‌شود. فقط remediation کم‌ریسک اجازه اجرای خودکار دارد.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        {[
                            "Auto فقط Low-risk",
                            "Step-up برای عملیات حساس",
                            "Cooldown + rate budget",
                            "Verification + rollback",
                        ].map((item) => (
                            <div key={item} className="rounded-2xl border bg-background/70 p-3">
                                {item}
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
                <Button type="button" className="me-auto rounded-xl" disabled={post.isPending} onClick={() => run("cycle", {})}>
                    اجرای چرخه بررسی
                </Button>
            </div>
            {message ? <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">{message}</div> : null}
            {error ? <ErrorLine message={error} /> : null}

            {tab === "overview" ? (
                <div className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <Metric
                            label="Invariant فعال"
                            value={fa(overview.data?.active_invariants)}
                            hint="قواعد فعالی که در چرخه Guardian ارزیابی می‌شوند."
                        />
                        <Metric
                            label="Incident بحرانی"
                            value={fa(overview.data?.incidents?.critical)}
                            hint="رخدادهای critical در وضعیت باز، mitigating یا monitoring."
                        />
                        <Metric
                            label="ترمیم موفق ۳۰ روز"
                            value={fa(overview.data?.remediations_30d?.succeeded)}
                            hint="ترمیم‌هایی که شواهد چرخه بعدی اثر آن‌ها را تأیید کرده است."
                        />
                        <Metric
                            label="Reliability"
                            value={
                                overview.data?.latest_scorecard
                                    ? `${fa(Math.round(overview.data.latest_scorecard.reliability_bps / 100))}٪`
                                    : "—"
                            }
                            hint="امتیاز evidence-backed آخرین پنجره ارزیابی."
                        />
                    </div>
                    <Card className="p-5">
                        <h3 className="font-semibold">مرزهای منبع حقیقت</h3>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {Object.entries(overview.data?.boundaries ?? {}).map(([key, value]) => (
                                <div key={key} className="rounded-xl border bg-muted/20 p-3">
                                    <div className="text-muted-foreground text-xs">{key}</div>
                                    <div className="mt-1 font-medium text-sm">{value}</div>
                                </div>
                            ))}
                        </div>
                    </Card>
                    <CreatePolicyCard onRun={run} pending={post.isPending} />
                    <CreateInvariantCard onRun={run} pending={post.isPending} />
                </div>
            ) : null}

            {tab === "invariants" ? (
                <Card className="overflow-hidden">
                    <div className="border-b p-4 font-semibold">Invariantهای ثبت‌شده</div>
                    <div className="divide-y">
                        {(invariants.data ?? []).map((item) => (
                            <div key={item.public_id} className="grid gap-3 p-4 lg:grid-cols-[1.2fr_.7fr_.7fr_.7fr]">
                                <div>
                                    <div className="font-medium">{item.name}</div>
                                    <div className="mt-1 text-muted-foreground text-xs">
                                        {item.invariant_key} · {item.domain}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-xs">منبع</div>
                                    <div className="mt-1 text-sm">{item.source_kind}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-xs">شرط</div>
                                    <div className="mt-1 text-sm">
                                        {item.operator} {String(item.threshold)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Pill>{item.severity}</Pill>
                                    <Pill>{item.enabled ? "active" : "disabled"}</Pill>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            ) : null}

            {tab === "incidents" ? (
                <Card className="overflow-hidden">
                    <div className="border-b p-4 font-semibold">Incidentها</div>
                    <div className="divide-y">
                        {(incidents.data ?? []).map((item) => (
                            <div key={item.public_id} className="grid gap-3 p-4 lg:grid-cols-[1.2fr_.6fr_.7fr_auto]">
                                <div>
                                    <div className="font-medium">{item.invariant_name}</div>
                                    <div className="mt-1 text-muted-foreground text-xs">
                                        {when(item.opened_at)} · failure {fa(item.failure_count)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Pill>{item.severity}</Pill>
                                    <Pill>{item.status}</Pill>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-xs">Policy</div>
                                    <div className="mt-1 text-sm">{item.policy_name ?? "بدون policy"}</div>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={post.isPending || !item.policy_public_id || item.status === "resolved"}
                                    onClick={() =>
                                        run(`incidents/${item.public_id}/remediate`, {
                                            reason: "manual approved remediation from Reliability Guardian",
                                        })
                                    }
                                >
                                    ترمیم تاییدشده
                                </Button>
                            </div>
                        ))}
                    </div>
                </Card>
            ) : null}

            {tab === "remediations" ? (
                <Card className="overflow-hidden">
                    <div className="border-b p-4 font-semibold">اجرای Remediation</div>
                    <div className="divide-y">
                        {(remediations.data ?? []).map((item) => (
                            <div key={item.public_id} className="grid gap-3 p-4 lg:grid-cols-[1.2fr_.6fr_.8fr_auto]">
                                <div>
                                    <div className="font-medium">{item.policy_name}</div>
                                    <div className="mt-1 text-muted-foreground text-xs">
                                        {item.action_type} · {when(item.executed_at)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Pill>{item.risk_level}</Pill>
                                    <Pill>{item.status}</Pill>
                                </div>
                                <div className="text-muted-foreground text-xs">
                                    verification: {JSON.stringify(item.verification)}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={post.isPending || !["verifying", "succeeded"].includes(item.status)}
                                    onClick={() =>
                                        run(`remediations/${item.public_id}/rollback`, {
                                            reason: "operator requested reversible rollback",
                                        })
                                    }
                                >
                                    Rollback
                                </Button>
                            </div>
                        ))}
                    </div>
                </Card>
            ) : null}

            {tab === "scorecards" ? (
                <Card className="overflow-hidden">
                    <div className="border-b p-4 font-semibold">Scorecardهای پایداری</div>
                    <div className="divide-y">
                        {(scorecards.data ?? []).map((item) => (
                            <div key={item.id} className="grid gap-3 p-4 md:grid-cols-5">
                                <div>
                                    <div className="text-muted-foreground text-xs">پنجره</div>
                                    <div className="mt-1 text-sm">{when(item.window_end_at)}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-xs">Reliability</div>
                                    <div className="mt-1 font-semibold">{fa(Math.round(item.reliability_bps / 100))}٪</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-xs">ارزیابی</div>
                                    <div className="mt-1">{fa(item.evaluated_invariants)}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-xs">Incident باز</div>
                                    <div className="mt-1">{fa(item.open_incidents)}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground text-xs">Auto remediation</div>
                                    <div className="mt-1">{fa(item.auto_remediations)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            ) : null}
        </div>
    );
}

function CreatePolicyCard({
    onRun,
    pending,
}: {
    onRun: (path: string, body: Record<string, unknown>) => void;
    pending: boolean;
}) {
    const [policyKey, setPolicyKey] = useState("checkout.safe-pause");
    const [name, setName] = useState("توقف آزمایش پرریسک");
    const [experimentId, setExperimentId] = useState("");
    return (
        <Card className="p-5">
            <div className="mb-4">
                <h3 className="font-semibold">Policy ترمیم</h3>
                <p className="mt-1 text-muted-foreground text-xs">
                    برای auto-execute فقط risk=low پذیرفته می‌شود؛ عملیات دستی حساس به step-up نیاز دارند.
                </p>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
                <div>
                    <Label>کلید</Label>
                    <Input className="mt-2" value={policyKey} onChange={(event) => setPolicyKey(event.target.value)} />
                </div>
                <div>
                    <Label>نام</Label>
                    <Input className="mt-2" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div>
                    <Label>Experiment ID</Label>
                    <Input
                        className="mt-2"
                        inputMode="numeric"
                        value={experimentId}
                        onChange={(event) => setExperimentId(event.target.value)}
                    />
                </div>
                <div className="flex items-end">
                    <Button
                        className="w-full"
                        disabled={pending || !experimentId}
                        onClick={() =>
                            onRun("policies", {
                                policy_key: policyKey,
                                name,
                                action_type: "pause_experiment",
                                risk_level: "low",
                                auto_execute: true,
                                target: { experiment_id: Number(experimentId) },
                                cooldown_seconds: 900,
                                max_executions_per_hour: 1,
                                rollback_required: true,
                                reason: "create bounded reliability remediation policy",
                            })
                        }
                    >
                        ساخت Policy
                    </Button>
                </div>
            </div>
        </Card>
    );
}

function CreateInvariantCard({
    onRun,
    pending,
}: {
    onRun: (path: string, body: Record<string, unknown>) => void;
    pending: boolean;
}) {
    const [key, setKey] = useState("checkout.synthetic.pass-rate");
    const [name, setName] = useState("سلامت مسیر خرید Synthetic");
    const [source, setSource] = useState("synthetic_pass_rate");
    const [threshold, setThreshold] = useState("99");
    return (
        <Card className="p-5">
            <div className="mb-4">
                <h3 className="font-semibold">Invariant جدید</h3>
                <p className="mt-1 text-muted-foreground text-xs">
                    بدون داده کافی no_evidence ثبت می‌شود؛ Guardian KPI ساختگی تولید نمی‌کند.
                </p>
            </div>
            <div className="grid gap-4 md:grid-cols-5">
                <div>
                    <Label>کلید</Label>
                    <Input className="mt-2" value={key} onChange={(event) => setKey(event.target.value)} />
                </div>
                <div>
                    <Label>نام</Label>
                    <Input className="mt-2" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div>
                    <Label>منبع</Label>
                    <Select value={source} onValueChange={setSource}>
                        <SelectTrigger className="mt-2">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="synthetic_pass_rate">Phase 24 Synthetic</SelectItem>
                            <SelectItem value="fulfillment_promise_accuracy">Phase 31 Promise</SelectItem>
                            <SelectItem value="manual_metric">Manual metric</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label>Threshold %</Label>
                    <Input
                        className="mt-2"
                        inputMode="decimal"
                        value={threshold}
                        onChange={(event) => setThreshold(event.target.value)}
                    />
                </div>
                <div className="flex items-end">
                    <Button
                        className="w-full"
                        disabled={pending}
                        onClick={() =>
                            onRun("invariants", {
                                invariant_key: key,
                                name,
                                domain: source === "fulfillment_promise_accuracy" ? "fulfillment" : "commerce",
                                severity: "critical",
                                source_kind: source,
                                source_config: source === "synthetic_pass_rate" ? { journey_key: "checkout" } : {},
                                operator: "gte",
                                threshold: Number(threshold),
                                window_seconds: 900,
                                min_consecutive_failures: 2,
                                recovery_consecutive_passes: 2,
                                reason: "create reliability invariant",
                            })
                        }
                    >
                        ساخت Invariant
                    </Button>
                </div>
            </div>
        </Card>
    );
}
