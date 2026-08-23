"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useSyntheticCommerceMutation, useSyntheticCommerceResource } from "#/lib/queries/synthetic-commerce";

type Overview = {
    runner_version: string;
    isolation: {
        synthetic_only: boolean;
        providers: string;
        analytics: string;
        production_mutation: boolean;
    };
    counts: { environments: number; personas: number; scenarios: number; runs: number };
    metrics: {
        journey_coverage: number;
        regressions_caught: number;
        false_alarms: number;
        gate_pass_rate: number;
    };
    recommended_personas: string[];
    critical_journey: string[];
};
type Environment = { public_id: string; name: string; namespace: string; status: string };
type Persona = {
    public_id: string;
    name: string;
    archetype: string;
    device_profile: string;
    network_profile: string;
};
type Seed = { public_id: string; name: string; version: number; seed: number; status: string };
type Scenario = {
    public_id: string;
    title: string;
    journey_key: string;
    persona_name: string;
    persona_archetype: string;
    seed_name: string;
    seed_version: number;
};
type Run = {
    public_id: string;
    scenario_title: string;
    journey_key: string;
    status: string;
    passed_gates: number;
    failed_gates: number;
    blocked_gates: number;
    false_alarm_gates: number;
    journey_coverage: string | number;
};

const personaLabels: Record<string, string> = {
    "new-buyer": "خریدار جدید",
    "returning-loyal": "مشتری وفادار",
    "expert-technical": "خریدار فنی",
    "price-sensitive": "حساس به قیمت",
    "urgent-buyer": "خرید فوری",
    "b2b-like": "خریدار B2B",
    "mobile-low-bandwidth": "موبایل با اینترنت ضعیف",
    "fa-typo-heavy-search": "جست‌وجوی فارسی با غلط تایپی",
    accessibility: "دسترس‌پذیری",
    "suspicious-bot": "رفتار مشکوک/بات",
    "legitimate-ai-shopping-agent": "عامل خرید هوش مصنوعی مجاز",
};
const journeyLabels: Record<string, string> = {
    homepage: "خانه",
    search: "جست‌وجو",
    pdp: "محصول",
    cart: "سبد",
    checkout: "تسویه",
    payment: "پرداخت",
    "fulfillment-promise": "وعده ارسال",
    support: "پشتیبانی",
};

function percent(value: number | string) {
    return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(Number(value || 0) * 100)}٪`;
}

function statusLabel(status: string) {
    return (
        (
            {
                queued: "در صف",
                running: "در اجرا",
                passed: "پاس",
                failed: "شکست",
                blocked: "مسدود",
            } as Record<string, string>
        )[status] ?? status
    );
}

export function SyntheticCommerceWorkspace() {
    const overview = useSyntheticCommerceResource<Overview>("overview");
    const environments = useSyntheticCommerceResource<Environment[]>("environments");
    const personas = useSyntheticCommerceResource<Persona[]>("personas");
    const seeds = useSyntheticCommerceResource<Seed[]>("seeds");
    const scenarios = useSyntheticCommerceResource<Scenario[]>("scenarios");
    const runs = useSyntheticCommerceResource<Run[]>("runs");
    const mutate = useSyntheticCommerceMutation<any>();

    const [environmentName, setEnvironmentName] = useState("");
    const [personaName, setPersonaName] = useState("");
    const [personaArchetype, setPersonaArchetype] = useState("new-buyer");
    const [seedName, setSeedName] = useState("baseline");
    const [seedValue, setSeedValue] = useState("24001");
    const [scenarioTitle, setScenarioTitle] = useState("");
    const [environmentId, setEnvironmentId] = useState("");
    const [personaId, setPersonaId] = useState("");
    const [seedId, setSeedId] = useState("");

    const frozenSeeds = useMemo(() => seeds.data?.filter((seed) => seed.status === "frozen") ?? [], [seeds.data]);
    const selectedEnvironment = environmentId || environments.data?.[0]?.public_id || "";
    const selectedPersona = personaId || personas.data?.[0]?.public_id || "";
    const selectedSeed = seedId || frozenSeeds[0]?.public_id || "";
    const loading =
        overview.isLoading ||
        environments.isLoading ||
        personas.isLoading ||
        seeds.isLoading ||
        scenarios.isLoading ||
        runs.isLoading;
    const errored =
        overview.isError || environments.isError || personas.isError || seeds.isError || scenarios.isError || runs.isError;

    return (
        <div className="space-y-6">
            <PageHeader
                title="آزمایشگاه پیش‌انتشار"
                subtitle="Synthetic Shopper · آزمون journey واقعی بدون آلوده‌کردن سفارش، پرداخت، موجودی یا آنالیتیکس واقعی"
            />

            <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-0">
                <div className="grid gap-6 p-6 lg:grid-cols-[1.55fr_1fr]">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-medium text-primary text-xs">
                                SYNTHETIC ONLY
                            </span>
                            <span className="rounded-full border px-3 py-1 text-xs">Provider Stubbed</span>
                            <span className="rounded-full border px-3 py-1 text-xs">Analytics Isolated</span>
                        </div>
                        <h2 className="mt-5 max-w-2xl font-semibold text-2xl leading-9">
                            قبل از انتشار، مسیر خرید را مثل یک مشتری واقعی بشکن؛ نه بعد از انتشار.
                        </h2>
                        <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-7">
                            هر Run به Environment مصنوعی و Seed فریز‌شده قفل است. نتیجهٔ AI یا شبیه‌سازی حقیقت مشتری تلقی نمی‌شود و
                            فقط evidence پیش‌انتشار است.
                        </p>
                    </div>
                    <div className="rounded-2xl border bg-background/70 p-4 backdrop-blur">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground text-sm">Runner</span>
                            <HelperTooltip>نسخه runner برای بازتولیدپذیری هر Run در input hash ثبت می‌شود.</HelperTooltip>
                        </div>
                        <div className="mt-2 font-mono text-sm">{overview.data?.runner_version ?? "—"}</div>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: percent(overview.data?.metrics.journey_coverage ?? 0) }}
                            />
                        </div>
                        <div className="mt-2 flex justify-between text-muted-foreground text-xs">
                            <span>پوشش journey</span>
                            <span>{percent(overview.data?.metrics.journey_coverage ?? 0)}</span>
                        </div>
                    </div>
                </div>
            </Card>

            {errored ? (
                <Card className="border-destructive/40 p-5 text-destructive">دریافت داده‌های آزمایشگاه پیش‌انتشار ناموفق بود.</Card>
            ) : null}
            {loading ? <Card className="p-5 text-muted-foreground">در حال همگام‌سازی وضعیت آزمایشگاه…</Card> : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                    ["نرخ پاس Gate", percent(overview.data?.metrics.gate_pass_rate ?? 0), "فقط Gateهای گزارش‌شده از runner"],
                    [
                        "Regression کشف‌شده",
                        new Intl.NumberFormat("fa-IR").format(overview.data?.metrics.regressions_caught ?? 0),
                        "شکست‌های semantic قبل از انتشار",
                    ],
                    [
                        "False Alarm",
                        new Intl.NumberFormat("fa-IR").format(overview.data?.metrics.false_alarms ?? 0),
                        "برای سنجش کیفیت خود سیستم تست",
                    ],
                    ["Runها", new Intl.NumberFormat("fa-IR").format(overview.data?.counts.runs ?? 0), "Runهای tenant فعلی"],
                ].map(([label, value, hint]) => (
                    <Card key={label} className="p-5">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            {label}
                            <HelperTooltip>{hint}</HelperTooltip>
                        </div>
                        <div className="mt-3 font-semibold text-3xl tabular-nums">{value}</div>
                    </Card>
                ))}
            </div>

            <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="font-semibold text-lg">مسیر بحرانی تجارت</h2>
                        <p className="text-muted-foreground text-sm">Gateها باید خطای کسب‌وکاری را بگیرند، نه فقط HTTP 500.</p>
                    </div>
                    <span className="rounded-full border px-3 py-1 text-xs">Evidence-first · Trace-first</span>
                </div>
                <div className="mt-5 grid gap-2 md:grid-cols-4 xl:grid-cols-8">
                    {(overview.data?.critical_journey ?? []).map((step, index) => (
                        <div key={step} className="relative rounded-xl border bg-muted/20 px-3 py-4 text-center">
                            <div className="mx-auto mb-2 flex size-7 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-xs">
                                {index + 1}
                            </div>
                            <div className="text-sm">{journeyLabels[step] ?? step}</div>
                        </div>
                    ))}
                </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card className="space-y-4 p-5">
                    <div>
                        <h2 className="font-semibold text-lg">زیرساخت ایزوله</h2>
                        <p className="text-muted-foreground text-sm">
                            Environment، Persona و Seed را بدون تماس با production truth آماده کن.
                        </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                        <div>
                            <Label>نام Environment مصنوعی</Label>
                            <Input
                                value={environmentName}
                                onChange={(event) => setEnvironmentName(event.target.value)}
                                placeholder="مثلاً Release Candidate 24"
                            />
                        </div>
                        <Button
                            className="self-end"
                            disabled={environmentName.trim().length < 3 || mutate.isPending}
                            onClick={() => mutate.mutate({ path: "environments", body: { name: environmentName.trim() } })}
                        >
                            ساخت Environment
                        </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div>
                            <Label>Persona</Label>
                            <Input
                                value={personaName}
                                onChange={(event) => setPersonaName(event.target.value)}
                                placeholder="مثلاً خریدار فنی کم‌حوصله"
                            />
                        </div>
                        <div>
                            <Label>Archetype</Label>
                            <select
                                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                value={personaArchetype}
                                onChange={(event) => setPersonaArchetype(event.target.value)}
                            >
                                {(overview.data?.recommended_personas ?? []).map((persona) => (
                                    <option key={persona} value={persona}>
                                        {personaLabels[persona] ?? persona}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        disabled={personaName.trim().length < 3 || mutate.isPending}
                        onClick={() =>
                            mutate.mutate({
                                path: "personas",
                                body: {
                                    name: personaName.trim(),
                                    archetype: personaArchetype,
                                    locale: "fa-IR",
                                    device_profile: personaArchetype === "mobile-low-bandwidth" ? "mobile" : "desktop",
                                    network_profile: personaArchetype === "mobile-low-bandwidth" ? "low-bandwidth" : "normal",
                                    behavior_profile: {},
                                    accessibility_profile: personaArchetype === "accessibility" ? { keyboard_only: true } : {},
                                },
                            })
                        }
                    >
                        ذخیره Persona
                    </Button>
                    <div className="grid gap-3 md:grid-cols-3">
                        <div>
                            <Label>Environment</Label>
                            <select
                                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                value={selectedEnvironment}
                                onChange={(event) => setEnvironmentId(event.target.value)}
                            >
                                <option value="">انتخاب…</option>
                                {environments.data?.map((environment) => (
                                    <option key={environment.public_id} value={environment.public_id}>
                                        {environment.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Label>نام Seed</Label>
                            <Input value={seedName} onChange={(event) => setSeedName(event.target.value)} />
                        </div>
                        <div>
                            <Label>Seed deterministic</Label>
                            <Input inputMode="numeric" value={seedValue} onChange={(event) => setSeedValue(event.target.value)} />
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        disabled={!selectedEnvironment || !seedName.trim() || Number(seedValue) < 1 || mutate.isPending}
                        onClick={() =>
                            mutate.mutate({
                                path: "seeds",
                                body: {
                                    environment_public_id: selectedEnvironment,
                                    name: seedName.trim(),
                                    seed: Number(seedValue),
                                    fixture_manifest: {
                                        version: 1,
                                        source: "synthetic-only",
                                        production_truth_mutation: false,
                                    },
                                },
                            })
                        }
                    >
                        ساخت نسخه Seed
                    </Button>
                    <div className="space-y-2">
                        {seeds.data?.slice(0, 5).map((seed) => (
                            <div
                                key={seed.public_id}
                                className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                            >
                                <div className="text-sm">
                                    <span className="font-medium">{seed.name}</span> · v{seed.version} · {seed.status}
                                </div>
                                {seed.status === "draft" ? (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => mutate.mutate({ path: `seeds/${seed.public_id}/freeze`, body: {} })}
                                    >
                                        Freeze
                                    </Button>
                                ) : (
                                    <span className="text-muted-foreground text-xs">immutable</span>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>

                <Card className="space-y-4 p-5">
                    <div>
                        <h2 className="font-semibold text-lg">Scenario Library</h2>
                        <p className="text-muted-foreground text-sm">
                            Scenario فقط با Seed فریز‌شده و Environment مصنوعی قابل اجراست.
                        </p>
                    </div>
                    <div>
                        <Label>عنوان سناریو</Label>
                        <Input
                            value={scenarioTitle}
                            onChange={(event) => setScenarioTitle(event.target.value)}
                            placeholder="مثلاً جست‌وجوی غلط‌تایپی تا پرداخت"
                        />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                        <div>
                            <Label>Environment</Label>
                            <select
                                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                value={selectedEnvironment}
                                onChange={(event) => setEnvironmentId(event.target.value)}
                            >
                                <option value="">انتخاب…</option>
                                {environments.data?.map((environment) => (
                                    <option key={environment.public_id} value={environment.public_id}>
                                        {environment.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Label>Persona</Label>
                            <select
                                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                value={selectedPersona}
                                onChange={(event) => setPersonaId(event.target.value)}
                            >
                                <option value="">انتخاب…</option>
                                {personas.data?.map((persona) => (
                                    <option key={persona.public_id} value={persona.public_id}>
                                        {persona.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Label>Frozen Seed</Label>
                            <select
                                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                value={selectedSeed}
                                onChange={(event) => setSeedId(event.target.value)}
                            >
                                <option value="">انتخاب…</option>
                                {frozenSeeds.map((seed) => (
                                    <option key={seed.public_id} value={seed.public_id}>
                                        {seed.name} · v{seed.version}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <Button
                        className="w-full"
                        disabled={
                            scenarioTitle.trim().length < 3 ||
                            !selectedEnvironment ||
                            !selectedPersona ||
                            !selectedSeed ||
                            mutate.isPending
                        }
                        onClick={() =>
                            mutate.mutate({
                                path: "scenarios",
                                body: {
                                    environment_public_id: selectedEnvironment,
                                    persona_public_id: selectedPersona,
                                    seed_public_id: selectedSeed,
                                    title: scenarioTitle.trim(),
                                    journey_key: "critical-commerce",
                                    steps: overview.data?.critical_journey ?? [],
                                    gate_policy: {
                                        fail_on_critical: true,
                                        require_trace_on_failure: true,
                                        require_screenshot_on_failure: true,
                                    },
                                },
                            })
                        }
                    >
                        ذخیره Scenario
                    </Button>
                    <div className="grid gap-3">
                        {scenarios.data?.map((scenario) => (
                            <div key={scenario.public_id} className="rounded-2xl border bg-card/70 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="font-medium">{scenario.title}</div>
                                        <div className="mt-1 text-muted-foreground text-xs">
                                            {scenario.persona_name} · {scenario.seed_name} v{scenario.seed_version}
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        disabled={mutate.isPending}
                                        onClick={() =>
                                            mutate.mutate({
                                                path: `scenarios/${scenario.public_id}/run`,
                                                body: {},
                                            })
                                        }
                                    >
                                        صف اجرای تست
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="font-semibold text-lg">Run Ledger</h2>
                        <p className="text-muted-foreground text-sm">
                            Runهای completed immutable هستند؛ screenshot/trace واقعی از runner به همان Run متصل می‌شود.
                        </p>
                    </div>
                    <div className="flex gap-2 text-xs">
                        <span className="rounded-full border px-3 py-1">Trace on failure</span>
                        <span className="rounded-full border px-3 py-1">Screenshot on failure</span>
                    </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead className="text-muted-foreground">
                            <tr className="border-b text-start">
                                <th className="px-3 py-3 text-start font-medium">Scenario</th>
                                <th className="px-3 py-3 text-start font-medium">وضعیت</th>
                                <th className="px-3 py-3 text-start font-medium">Coverage</th>
                                <th className="px-3 py-3 text-start font-medium">Pass</th>
                                <th className="px-3 py-3 text-start font-medium">Fail</th>
                                <th className="px-3 py-3 text-start font-medium">Blocked</th>
                                <th className="px-3 py-3 text-start font-medium">False alarm</th>
                            </tr>
                        </thead>
                        <tbody>
                            {runs.data?.map((run) => (
                                <tr key={run.public_id} className="border-b last:border-0">
                                    <td className="px-3 py-3 font-medium">{run.scenario_title}</td>
                                    <td className="px-3 py-3">
                                        <span className="rounded-full border px-2 py-1 text-xs">{statusLabel(run.status)}</span>
                                    </td>
                                    <td className="px-3 py-3 tabular-nums">{percent(run.journey_coverage)}</td>
                                    <td className="px-3 py-3 tabular-nums">{run.passed_gates}</td>
                                    <td className="px-3 py-3 tabular-nums">{run.failed_gates}</td>
                                    <td className="px-3 py-3 tabular-nums">{run.blocked_gates}</td>
                                    <td className="px-3 py-3 tabular-nums">{run.false_alarm_gates}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {runs.data?.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">هنوز Runی ثبت نشده است.</div>
                    ) : null}
                </div>
            </Card>
        </div>
    );
}
