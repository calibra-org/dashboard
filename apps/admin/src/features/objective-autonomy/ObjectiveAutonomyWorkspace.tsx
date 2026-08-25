"use client";

import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { Bot, ChartNoAxesCombined, ShieldCheck, Sparkles, TrendingUp } from "#/icons";
import {
    type AccessRow,
    type AutonomyObjective,
    type AutonomyOverview,
    type ObjectiveDetail,
    useObjectiveAutonomyMutation,
    useObjectiveAutonomyPrerequisites,
    useObjectiveAutonomyResource,
} from "#/lib/queries/objective-autonomy";
import { cn } from "#/lib/utils";

import { PostmortemPanel } from "./PostmortemPanel";

type Tab = "command" | "control" | "access";

const parse = <T,>(value: T | string | null | undefined, fallback: T): T => {
    if (value == null) return fallback;
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};
const faNumber = (value: unknown) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(Number(value ?? 0));
const faMoney = (value: unknown) => new Intl.NumberFormat("fa-IR").format(Number(value ?? 0));
const date = (value: string) =>
    new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function MetricCard({ title, value, hint }: { title: string; value: string; hint: string }) {
    return (
        <Card className="relative overflow-hidden border-border/70 p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-muted-foreground text-xs">{title}</p>
                    <p className="mt-2 font-semibold text-2xl tracking-tight">{value}</p>
                </div>
                <HelperTooltip text={hint}>
                    <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
                        <Sparkles className="size-4" />
                    </span>
                </HelperTooltip>
            </div>
        </Card>
    );
}

function LoopRail() {
    const stages = ["هدف", "مشاهده", "استراتژی", "شبیه‌سازی", "سبد", "حاکمیت", "اجرا", "پایش", "یادگیری"];
    return (
        <Card className="overflow-hidden p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                    <h2 className="font-semibold">حلقه کنترل خودمختار</h2>
                    <p className="text-muted-foreground text-xs">هر مرحله قبل از mutation قابل ردیابی و توقف است.</p>
                </div>
                <ShieldCheck className="size-5 text-primary" />
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-9">
                {stages.map((stage, index) => (
                    <div key={stage} className="rounded-xl border bg-muted/30 p-3 text-center">
                        <div className="mx-auto mb-2 grid size-7 place-items-center rounded-full bg-primary/10 font-semibold text-primary text-xs">
                            {new Intl.NumberFormat("fa-IR").format(index + 1)}
                        </div>
                        <span className="text-xs">{stage}</span>
                    </div>
                ))}
            </div>
        </Card>
    );
}

function Sparkline({ points }: { points: number[] }) {
    const normalized = points.length ? points : [0, 0];
    const min = Math.min(...normalized);
    const max = Math.max(...normalized);
    const spread = Math.max(1, max - min);
    const d = normalized
        .map(
            (point, index) =>
                `${index === 0 ? "M" : "L"} ${(index / Math.max(1, normalized.length - 1)) * 300} ${90 - ((point - min) / spread) * 70}`,
        )
        .join(" ");
    return (
        <svg viewBox="0 0 300 100" role="img" aria-label="روند checkpoint" className="h-28 w-full">
            <path
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary"
            />
        </svg>
    );
}

export function ObjectiveAutonomyWorkspace() {
    const locale = useLocale();
    const fa = locale === "fa";
    const overview = useObjectiveAutonomyResource<AutonomyOverview>("overview");
    const objectives = useObjectiveAutonomyResource<AutonomyObjective[]>("objectives");
    const [tab, setTab] = useState<Tab>("command");
    const access = useObjectiveAutonomyResource<AccessRow[]>("access", tab === "access");
    const prerequisites = useObjectiveAutonomyPrerequisites();
    const mutate = useObjectiveAutonomyMutation<unknown>();
    const [objectiveId, setObjectiveId] = useState("");
    const selected = objectives.data?.find((item) => item.public_id === objectiveId) ?? objectives.data?.[0];
    useEffect(() => {
        if (!objectiveId && objectives.data?.[0]) setObjectiveId(objectives.data[0].public_id);
    }, [objectiveId, objectives.data]);
    const detail = useObjectiveAutonomyResource<ObjectiveDetail>(
        `objectives/${selected?.public_id ?? "missing"}`,
        Boolean(selected),
    );

    const [name, setName] = useState("");
    const [metric, setMetric] = useState("contribution_profit_minor");
    const [baseline, setBaseline] = useState("0");
    const [target, setTarget] = useState("0");
    const [horizon, setHorizon] = useState("");
    const [budget, setBudget] = useState("0");
    const [autonomyLevel, setAutonomyLevel] = useState("propose");
    const [riskCeiling, setRiskCeiling] = useState("medium");
    const [minConfidence, setMinConfidence] = useState("0.65");
    const [scenarioId, setScenarioId] = useState("");
    const [portfolioId, setPortfolioId] = useState("");
    const [planId, setPlanId] = useState("");
    const [toolKeys, setToolKeys] = useState<string[]>([]);
    const [reason, setReason] = useState("");

    const [observedValue, setObservedValue] = useState("0");
    const [budgetSpent, setBudgetSpent] = useState("0");
    const [checkpointConfidence, setCheckpointConfidence] = useState("0.7");
    const [breaches, setBreaches] = useState("");
    const [evidence, setEvidence] = useState("");
    const [unexpectedHarm, setUnexpectedHarm] = useState(false);

    const latestCycle = detail.data?.cycles?.[0];
    const checkpoints = detail.data?.checkpoints ?? [];
    const trend = [...checkpoints].reverse().map((item) => Number(item.observed_value));
    const explanation = parse<Record<string, unknown>>(latestCycle?.explanation, {});
    const policy = parse<Record<string, unknown>>(latestCycle?.policy_snapshot, {});
    type RegisteredStep = { public_id: string; tool_key: string; risk_class: string; approval_required: boolean };
    const registeredSteps = Array.isArray(policy.registered_steps) ? (policy.registered_steps as RegisteredStep[]) : [];

    const progress = useMemo(() => {
        if (!selected) return 0;
        const base = Number(selected.baseline_value);
        const goal = Number(selected.target_value);
        const current = checkpoints[0] ? Number(checkpoints[0].observed_value) : base;
        if (goal === base) return current === goal ? 100 : 0;
        return Math.max(0, Math.min(100, ((current - base) / (goal - base)) * 100));
    }, [selected, checkpoints]);

    const createObjective = () =>
        mutate.mutate({
            path: "objectives",
            body: {
                name,
                target_metric: metric,
                direction: "maximize",
                baseline_value: Number(baseline),
                target_value: Number(target),
                horizon_end: new Date(horizon).toISOString(),
                budget_minor: Number(budget),
                constraints: {},
                allowed_tool_keys: toolKeys,
                autonomy_level: autonomyLevel,
                risk_ceiling: riskCeiling,
                minimum_confidence: Number(minConfidence),
                stop_loss: { max_budget_minor: Number(budget) },
                approvers: [],
                scenario_public_id: scenarioId,
                portfolio_plan_public_id: portfolioId,
                agent_plan_public_id: planId,
                reason,
            },
        });

    const tabs: Array<{ id: Tab; label: string }> = [
        { id: "command", label: "مرکز فرمان" },
        { id: "control", label: "کنترل و شفافیت" },
        { id: "access", label: "دسترسی" },
    ];
    const busy = mutate.isPending;

    return (
        <div className="space-y-6" dir={fa ? "rtl" : "ltr"}>
            <PageHeader
                title={fa ? "سیستم خودمختار هدف‌محور" : "Objective-Driven Autonomous Commerce OS"}
                subtitle={
                    fa
                        ? "هدف را تعریف کنید؛ Calibra فقط در مرز ابزارهای ثبت‌شده، شبیه‌سازی، سبد، سیاست و checkpoint حرکت می‌کند."
                        : "Define outcomes while Calibra stays inside registered tools, simulation, portfolio, policy and checkpoint boundaries."
                }
            />

            <div className="flex flex-wrap gap-2 rounded-2xl border bg-card p-2 shadow-sm">
                {tabs.map((item) => (
                    <Button
                        key={item.id}
                        variant={tab === item.id ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTab(item.id)}
                    >
                        {item.label}
                    </Button>
                ))}
            </div>

            {tab === "command" ? (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <MetricCard
                            title="هدف‌های فعال"
                            value={faNumber(overview.data?.kpis.active)}
                            hint="هدف‌هایی که اجازه ورود به حلقه کنترل دارند."
                        />
                        <MetricCard
                            title="چرخه‌های اجراشده"
                            value={faNumber(overview.data?.kpis.cycles)}
                            hint="هر چرخه شامل simulation و portfolio ranking قبل از execution است."
                        />
                        <MetricCard
                            title="هدف‌های متوقف"
                            value={faNumber(overview.data?.kpis.halted)}
                            hint="stop-loss، آسیب غیرمنتظره یا نقض قید، هدف را halt می‌کند."
                        />
                        <MetricCard
                            title="نسخه موتور"
                            value={overview.data?.engine_version ?? "—"}
                            hint="نسخه engine برای replay و explainability ثبت می‌شود."
                        />
                    </div>
                    <LoopRail />

                    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
                        <Card className="p-5">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <h2 className="font-semibold">هدف‌های تجاری</h2>
                                    <p className="text-muted-foreground text-xs">
                                        Objective contract + budget + autonomy ceiling + stop-loss
                                    </p>
                                </div>
                                <TrendingUp className="size-5 text-primary" />
                            </div>
                            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                                {objectives.data?.map((item) => (
                                    <Button
                                        key={item.public_id}
                                        size="sm"
                                        variant={selected?.public_id === item.public_id ? "default" : "outline"}
                                        onClick={() => setObjectiveId(item.public_id)}
                                    >
                                        {item.name}
                                    </Button>
                                ))}
                            </div>
                            {selected ? (
                                <div className="space-y-5">
                                    <div className="grid gap-3 sm:grid-cols-4">
                                        <div className="rounded-xl border p-3">
                                            <span className="text-muted-foreground text-xs">وضعیت</span>
                                            <p className="mt-1 font-medium">{selected.status}</p>
                                        </div>
                                        <div className="rounded-xl border p-3">
                                            <span className="text-muted-foreground text-xs">Autonomy</span>
                                            <p className="mt-1 font-medium">{selected.effective_autonomy_level}</p>
                                        </div>
                                        <div className="rounded-xl border p-3">
                                            <span className="text-muted-foreground text-xs">Risk ceiling</span>
                                            <p className="mt-1 font-medium">{selected.risk_ceiling}</p>
                                        </div>
                                        <div className="rounded-xl border p-3">
                                            <span className="text-muted-foreground text-xs">بودجه</span>
                                            <p className="mt-1 font-medium">{faMoney(selected.budget_minor)}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-2 flex justify-between text-xs">
                                            <span>پیشرفت هدف</span>
                                            <span>{faNumber(progress)}٪</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full bg-primary transition-all"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                        <div className="mt-2 flex justify-between text-muted-foreground text-xs">
                                            <span>خط مبنا {faNumber(selected.baseline_value)}</span>
                                            <span>هدف {faNumber(selected.target_value)}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            disabled={busy || selected.status === "active"}
                                            onClick={() =>
                                                mutate.mutate({
                                                    path: `objectives/${selected.public_id}/activate`,
                                                    body: { reason: "operator activation from Phase 28 command center" },
                                                })
                                            }
                                        >
                                            فعال‌سازی
                                        </Button>
                                        <Button
                                            variant="outline"
                                            disabled={busy || selected.status !== "active"}
                                            onClick={() =>
                                                mutate.mutate({ path: `objectives/${selected.public_id}/cycles`, body: {} })
                                            }
                                        >
                                            <Bot className="me-2 size-4" />
                                            شروع چرخه
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            disabled={busy || selected.status === "halted"}
                                            onClick={() =>
                                                mutate.mutate({
                                                    path: `objectives/${selected.public_id}/halt`,
                                                    body: { reason: "operator kill switch from Phase 28 command center" },
                                                })
                                            }
                                        >
                                            توقف اضطراری
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
                                    هنوز هدفی تعریف نشده است.
                                </div>
                            )}
                        </Card>

                        <Card className="p-5">
                            <div className="mb-4">
                                <h2 className="font-semibold">تعریف Objective جدید</h2>
                                <p className="text-muted-foreground text-xs">
                                    وابستگی‌ها از Phase 22/23/25 انتخاب می‌شوند؛ هیچ action خارج از Tool Registry پذیرفته نمی‌شود.
                                </p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="sm:col-span-2">
                                    <Label>نام هدف</Label>
                                    <Input value={name} onChange={(event) => setName(event.target.value)} />
                                </div>
                                <div>
                                    <Label>Baseline</Label>
                                    <Input type="number" value={baseline} onChange={(event) => setBaseline(event.target.value)} />
                                </div>
                                <div>
                                    <Label>Target</Label>
                                    <Input type="number" value={target} onChange={(event) => setTarget(event.target.value)} />
                                </div>
                                <div>
                                    <Label>Metric key</Label>
                                    <Input value={metric} onChange={(event) => setMetric(event.target.value)} />
                                </div>
                                <div>
                                    <Label>Horizon</Label>
                                    <Input
                                        type="datetime-local"
                                        value={horizon}
                                        onChange={(event) => setHorizon(event.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>Budget minor</Label>
                                    <Input type="number" value={budget} onChange={(event) => setBudget(event.target.value)} />
                                </div>
                                <div>
                                    <Label>Minimum confidence</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={minConfidence}
                                        onChange={(event) => setMinConfidence(event.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>Autonomy</Label>
                                    <Select
                                        value={autonomyLevel}
                                        onValueChange={(value) => setAutonomyLevel(String(value ?? ""))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="recommend">Recommend</SelectItem>
                                            <SelectItem value="propose">Propose</SelectItem>
                                            <SelectItem value="bounded_auto">Bounded auto</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Risk ceiling</Label>
                                    <Select value={riskCeiling} onValueChange={(value) => setRiskCeiling(String(value ?? ""))}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {["read_only", "low", "medium", "high", "critical"].map((risk) => (
                                                <SelectItem key={risk} value={risk}>
                                                    {risk}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="sm:col-span-2">
                                    <Label>Phase 23 scenario</Label>
                                    <Select value={scenarioId} onValueChange={(value) => setScenarioId(String(value ?? ""))}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="سناریو" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {prerequisites.data?.scenarios.map((item) => (
                                                <SelectItem key={item.public_id} value={item.public_id}>
                                                    {item.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="sm:col-span-2">
                                    <Label>Phase 25 portfolio</Label>
                                    <Select value={portfolioId} onValueChange={(value) => setPortfolioId(String(value ?? ""))}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="سبد" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {prerequisites.data?.portfolios.map((item) => (
                                                <SelectItem key={item.public_id} value={item.public_id}>
                                                    {item.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="sm:col-span-2">
                                    <Label>Phase 22 plan</Label>
                                    <Select value={planId} onValueChange={(value) => setPlanId(String(value ?? ""))}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="پلن Agent" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {prerequisites.data?.plans.map((item) => (
                                                <SelectItem key={item.public_id} value={item.public_id}>
                                                    {item.goal}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="sm:col-span-2">
                                    <Label>Registered tools</Label>
                                    <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-xl border p-3">
                                        {prerequisites.data?.tools.map((tool) => {
                                            const active = toolKeys.includes(tool.tool_key);
                                            return (
                                                <button
                                                    type="button"
                                                    key={`${tool.tool_key}:${tool.version}`}
                                                    onClick={() =>
                                                        setToolKeys(
                                                            active
                                                                ? toolKeys.filter((key) => key !== tool.tool_key)
                                                                : [...toolKeys, tool.tool_key],
                                                        )
                                                    }
                                                    className={cn(
                                                        "rounded-full border px-3 py-1.5 text-xs",
                                                        active
                                                            ? "border-primary bg-primary/10 text-primary"
                                                            : "text-muted-foreground",
                                                    )}
                                                >
                                                    {tool.tool_key} · {tool.risk_class}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="sm:col-span-2">
                                    <Label>Reason</Label>
                                    <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
                                </div>
                            </div>
                            <Button
                                className="mt-4 w-full"
                                disabled={
                                    busy || !name || !horizon || !scenarioId || !portfolioId || !planId || toolKeys.length === 0
                                }
                                onClick={createObjective}
                            >
                                ثبت Objective
                            </Button>
                        </Card>
                    </div>
                </>
            ) : null}

            {tab === "control" ? (
                <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    <Card className="p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h2 className="font-semibold">Checkpoint و Stop-loss</h2>
                                <p className="text-muted-foreground text-xs">کنترل پیوسته، نه اجرای بی‌نهایت.</p>
                            </div>
                            <ChartNoAxesCombined className="size-5 text-primary" />
                        </div>
                        <Sparkline points={trend} />
                        {selected ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <Label>Observed value</Label>
                                    <Input
                                        type="number"
                                        value={observedValue}
                                        onChange={(event) => setObservedValue(event.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>Budget spent</Label>
                                    <Input
                                        type="number"
                                        value={budgetSpent}
                                        onChange={(event) => setBudgetSpent(event.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>Confidence</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={checkpointConfidence}
                                        onChange={(event) => setCheckpointConfidence(event.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>Constraint breaches</Label>
                                    <Input
                                        value={breaches}
                                        onChange={(event) => setBreaches(event.target.value)}
                                        placeholder="stockout_rate, return_rate"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <Label>Evidence refs</Label>
                                    <Input
                                        value={evidence}
                                        onChange={(event) => setEvidence(event.target.value)}
                                        placeholder="source:id:label"
                                    />
                                </div>
                                <label className="flex items-center gap-2 rounded-xl border p-3 text-sm sm:col-span-2">
                                    <input
                                        type="checkbox"
                                        checked={unexpectedHarm}
                                        onChange={(event) => setUnexpectedHarm(event.target.checked)}
                                    />{" "}
                                    آسیب غیرمنتظره مشاهده شده
                                </label>
                                <Button
                                    className="sm:col-span-2"
                                    disabled={busy || !evidence}
                                    onClick={() =>
                                        mutate.mutate({
                                            path: `objectives/${selected.public_id}/checkpoints`,
                                            body: {
                                                cycle_public_id: latestCycle?.public_id,
                                                observed_value: Number(observedValue),
                                                budget_spent_minor: Number(budgetSpent),
                                                confidence: Number(checkpointConfidence),
                                                constraint_breaches: breaches
                                                    .split(/[,،]+/)
                                                    .map((item) => item.trim())
                                                    .filter(Boolean),
                                                unexpected_harm: unexpectedHarm,
                                                evidence_refs: [
                                                    {
                                                        source: evidence.split(":")[0] || "operator",
                                                        id: evidence.split(":")[1] || "manual",
                                                        label: evidence.split(":").slice(2).join(":") || "checkpoint evidence",
                                                    },
                                                ],
                                                reason: "Phase 28 checkpoint",
                                            },
                                        })
                                    }
                                >
                                    ثبت checkpoint
                                </Button>
                            </div>
                        ) : null}
                        <div className="mt-5 space-y-2">
                            {checkpoints.slice(0, 5).map((item) => (
                                <div
                                    key={item.public_id}
                                    className="flex items-center justify-between rounded-xl border p-3 text-xs"
                                >
                                    <div>
                                        <span className="font-medium">{item.decision}</span>
                                        <p className="text-muted-foreground">{item.reason}</p>
                                    </div>
                                    <div className="text-end">
                                        <p>{faNumber(item.observed_value)}</p>
                                        <p className="text-muted-foreground">{date(item.created_at)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                    <Card className="p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h2 className="font-semibold">شفافیت اپراتور</h2>
                                <p className="text-muted-foreground text-xs">
                                    What / Why / Data / Model / Policy / Approval / Result / Uncertainty
                                </p>
                            </div>
                            <ShieldCheck className="size-5 text-primary" />
                        </div>
                        {latestCycle ? (
                            <div className="space-y-3">
                                {[
                                    ["چه اتفاقی افتاد؟", explanation.what_happened],
                                    ["چرا؟", explanation.why],
                                    ["داده", JSON.stringify(explanation.data ?? {})],
                                    ["مدل و نسخه", JSON.stringify(explanation.model_versions ?? {})],
                                    ["سیاست", JSON.stringify(explanation.policy ?? {})],
                                    ["تأییدکننده", JSON.stringify(explanation.approved_by ?? [])],
                                    ["نتیجه", JSON.stringify(explanation.result ?? {})],
                                    ["عدم قطعیت", JSON.stringify(explanation.uncertainty ?? {})],
                                ].map(([label, value]) => (
                                    <div key={label as string} className="rounded-xl border bg-muted/20 p-3">
                                        <p className="font-medium text-xs">{String(label)}</p>
                                        <p className="mt-1 break-words text-muted-foreground text-xs">{String(value ?? "—")}</p>
                                    </div>
                                ))}
                                <div className="rounded-xl border p-3">
                                    <p className="mb-2 font-medium text-xs">Phase 22 action queue</p>
                                    <div className="space-y-2">
                                        {registeredSteps.map((step) => (
                                            <div
                                                key={step.public_id}
                                                className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-2 text-xs"
                                            >
                                                <span>
                                                    {step.tool_key} · {step.risk_class}
                                                </span>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={
                                                        busy ||
                                                        !selected ||
                                                        !latestCycle ||
                                                        selected.effective_autonomy_level !== "bounded_auto"
                                                    }
                                                    onClick={() =>
                                                        mutate.mutate({
                                                            path: `objectives/${selected?.public_id ?? "missing"}/cycles/${latestCycle.public_id}/execute`,
                                                            body: { step_public_id: step.public_id },
                                                        })
                                                    }
                                                >
                                                    اجرای کنترل‌شده
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
                                بعد از اجرای یک cycle، زنجیره توضیح کامل اینجا نمایش داده می‌شود.
                            </div>
                        )}
                    </Card>
                    <PostmortemPanel
                        objectivePublicId={selected?.public_id}
                        existing={detail.data?.postmortem ?? null}
                        latestCyclePublicId={latestCycle?.public_id}
                    />
                </div>
            ) : null}

            {tab === "access" ? (
                <Card className="p-5">
                    <div className="mb-4">
                        <h2 className="font-semibold">دسترسی زمینه‌ای Phase 28</h2>
                        <p className="text-muted-foreground text-xs">
                            Permissionهای backend؛ تغییر preset نیازمند step-up است و self-lockout مسدود می‌شود.
                        </p>
                    </div>
                    <div className="grid gap-3">
                        {access.data?.map((row) => (
                            <div
                                key={row.id}
                                className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[1fr_2fr_auto] lg:items-center"
                            >
                                <div>
                                    <p className="font-medium text-sm">{row.identity}</p>
                                    <p className="text-muted-foreground text-xs">Admin #{faNumber(row.id)}</p>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(row.permissions).map(([permission, allowed]) => (
                                        <span
                                            key={permission}
                                            className={cn(
                                                "rounded-full border px-2 py-1 text-[10px]",
                                                allowed
                                                    ? "border-primary/30 bg-primary/5 text-primary"
                                                    : "text-muted-foreground line-through",
                                            )}
                                        >
                                            {permission.replace("objective_autonomy.", "")}
                                        </span>
                                    ))}
                                </div>
                                <Select
                                    onValueChange={(preset) =>
                                        mutate.mutate({
                                            path: "access/preset",
                                            body: { user_id: row.id, preset, reason: "Phase 28 contextual access update" },
                                        })
                                    }
                                >
                                    <SelectTrigger className="w-40">
                                        <SelectValue placeholder="Preset" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {["owner", "operator", "strategist", "viewer"].map((preset) => (
                                            <SelectItem key={preset} value={preset}>
                                                {preset}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ))}
                    </div>
                </Card>
            ) : null}

            {mutate.isError ? (
                <Card className="border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
                    {mutate.error.message}
                </Card>
            ) : null}
        </div>
    );
}
