"use client";

import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { useGrowthPortfolioMutation, useGrowthPortfolioResource } from "#/lib/queries/growth-portfolio";

type Overview = {
    solver_version: string;
    plans: number;
    runs: number;
    rebalances: number;
    realization_ratio: number | null;
    latest_runs: Run[];
};

type Plan = {
    public_id: string;
    name: string;
    objective: string;
    status: string;
    version: number;
    cash_budget_minor: number | null;
    team_hours_budget: number | string | null;
    max_risk: number | string | null;
};

type Opportunity = {
    id: number;
    title_fa: string;
    summary_fa: string;
    domain: string;
    expected_value_minor: number | null;
    confidence: number | string | null;
    priority_score: number | string;
};

type Candidate = {
    id: number;
    intelligence_case_id: number;
    title_fa: string;
    domain: string;
    expected_incremental_contribution_minor: number;
    confidence: number | string;
    required_cash_minor: number;
    team_hours: number | string;
    risk: number | string;
};

type Run = {
    id: number;
    public_id: string;
    plan_name: string;
    status: string;
    expected_value_p10_minor: number;
    expected_value_p50_minor: number;
    expected_value_p90_minor: number;
    resource_utilization: Record<string, unknown> | string;
    generated_at: string;
};

type RunItem = {
    id: number;
    intelligence_case_id: number;
    title_fa: string;
    domain: string;
    decision: "selected" | "deferred" | "infeasible";
    reason: string;
    expected_weighted_value_minor: number;
    binding_constraints: string[] | string;
    risk: number | string;
};

type RunDetail = Run & {
    items: RunItem[];
    outcomes: Array<{
        id: number;
        realized_value_minor: number;
        realization_ratio: number | string | null;
        attribution_confidence: number | string | null;
        measurement_window: string | null;
        measured_at: string;
    }>;
};

type Rebalance = {
    public_id: string;
    plan_name: string;
    trigger_kind: string;
    status: string;
    protected_active_case_ids: number[] | string;
    approval_reference: string | null;
    detected_at: string;
};

const money = (value: unknown) => new Intl.NumberFormat("fa-IR").format(Number(value ?? 0));
const percent = (value: unknown) =>
    `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(value ?? 0) * 100)}٪`;

const decisionLabel: Record<RunItem["decision"], string> = {
    selected: "منتخب",
    deferred: "تعویق",
    infeasible: "غیرقابل‌اجرا",
};

const triggerLabels: Record<string, string> = {
    stockout: "اتمام موجودی",
    campaign_outcome: "نتیجه کمپین",
    cash_settlement_delay: "تأخیر تسویه نقدی",
    supplier_incident: "اختلال تأمین‌کننده",
};

function parsedArray(value: number[] | string | undefined) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
        return JSON.parse(value) as number[];
    } catch {
        return [];
    }
}

function parsedConstraints(value: string[] | string | undefined) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
        return JSON.parse(value) as string[];
    } catch {
        return [];
    }
}

export function GrowthPortfolioWorkspace() {
    const overview = useGrowthPortfolioResource<Overview>("overview");
    const plans = useGrowthPortfolioResource<Plan[]>("plans");
    const opportunities = useGrowthPortfolioResource<Opportunity[]>("opportunities");
    const runs = useGrowthPortfolioResource<Run[]>("runs");
    const rebalances = useGrowthPortfolioResource<Rebalance[]>("rebalances");
    const create = useGrowthPortfolioMutation<any>();
    const remove = useGrowthPortfolioMutation<any>("DELETE");

    const [planId, setPlanId] = useState("");
    const selectedPlan = useMemo(
        () => plans.data?.find((plan) => plan.public_id === planId) ?? plans.data?.[0],
        [planId, plans.data],
    );
    useEffect(() => {
        if (!planId && plans.data?.[0]) setPlanId(plans.data[0].public_id);
    }, [planId, plans.data]);

    const candidates = useGrowthPortfolioResource<Candidate[]>(
        `plans/${selectedPlan?.public_id ?? "missing"}/candidates`,
        Boolean(selectedPlan),
    );
    const [runId, setRunId] = useState("");
    const selectedRunId = runId || runs.data?.[0]?.public_id || "";
    const runDetail = useGrowthPortfolioResource<RunDetail>(`runs/${selectedRunId}`, Boolean(selectedRunId));

    const [name, setName] = useState("");
    const [objective, setObjective] = useState("");
    const [cashBudget, setCashBudget] = useState("0");
    const [hoursBudget, setHoursBudget] = useState("0");
    const [maxRisk, setMaxRisk] = useState("0.5");
    const [maxSelected, setMaxSelected] = useState("8");
    const [minConfidence, setMinConfidence] = useState("0.45");

    const [opportunityId, setOpportunityId] = useState("");
    const selectedOpportunity = opportunities.data?.find((item) => String(item.id) === opportunityId);
    const [candidateValue, setCandidateValue] = useState("0");
    const [candidateCash, setCandidateCash] = useState("0");
    const [candidateHours, setCandidateHours] = useState("1");
    const [candidateConfidence, setCandidateConfidence] = useState("0.7");
    const [candidateRisk, setCandidateRisk] = useState("0.3");
    const [dependencies, setDependencies] = useState("");
    const [exclusiveWith, setExclusiveWith] = useState("");

    useEffect(() => {
        if (!selectedOpportunity) return;
        setCandidateValue(String(selectedOpportunity.expected_value_minor ?? 0));
        setCandidateConfidence(String(selectedOpportunity.confidence ?? 0.7));
    }, [selectedOpportunity]);

    const [triggerKind, setTriggerKind] = useState("stockout");
    const [triggerNote, setTriggerNote] = useState("");
    const [overrideCash, setOverrideCash] = useState("");
    const [activeCaseIds, setActiveCaseIds] = useState("");

    const [realizedValue, setRealizedValue] = useState("0");
    const [attributionConfidence, setAttributionConfidence] = useState("0.7");
    const [measurementWindow, setMeasurementWindow] = useState("30d");
    const [sourceOutcomeIds, setSourceOutcomeIds] = useState("");

    const latest = runs.data?.[0] ?? overview.data?.latest_runs?.[0];
    const latestUtilization = useMemo(() => {
        if (!latest?.resource_utilization) return {} as Record<string, unknown>;
        if (typeof latest.resource_utilization === "string") {
            try {
                return JSON.parse(latest.resource_utilization) as Record<string, unknown>;
            } catch {
                return {} as Record<string, unknown>;
            }
        }
        return latest.resource_utilization;
    }, [latest]);

    const loading =
        overview.isLoading || plans.isLoading || opportunities.isLoading || runs.isLoading || rebalances.isLoading;
    const errored =
        overview.isError || plans.isError || opportunities.isError || runs.isError || rebalances.isError;

    const numberList = (value: string) =>
        [...new Set(value.split(/[,،\s]+/).map(Number).filter((item) => Number.isSafeInteger(item) && item > 0))];

    return (
        <div className="space-y-6">
            <PageHeader
                title="موتور سبد رشد"
                subtitle="Autonomous Growth Portfolio Engine · انتخاب سبد اقدام تحت محدودیت منابع، ریسک، policy و dependency"
            />

            <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6">
                <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
                    <div>
                        <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-primary">PORTFOLIO FIRST</span>
                            <span className="rounded-full border px-3 py-1">Hard Constraints</span>
                            <span className="rounded-full border px-3 py-1">Explainable Deferrals</span>
                            <span className="rounded-full border px-3 py-1">Governed Rebalance</span>
                            <span className="rounded-full border px-3 py-1">Outcome Feedback</span>
                        </div>
                        <h2 className="mt-5 max-w-3xl font-semibold text-2xl leading-9">
                            بهترین recommendation کافی نیست؛ بهترین ترکیب قابل‌اجرا را انتخاب کن.
                        </h2>
                        <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-7">
                            فرصت و outcome همچنان از Decision Intelligence فاز ۱۰ می‌آید. این لایه فقط snapshot، constraint، portfolio decision، دلیل عدم انتخاب و evidence بازتوازن را نگه می‌دارد.
                        </p>
                    </div>
                    <div className="rounded-2xl border bg-background/70 p-4">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground text-sm">Solver</span>
                            <HelperTooltip>نسخه solver داخل هر Run ثبت می‌شود تا تصمیم‌ها بازتولیدپذیر باشند.</HelperTooltip>
                        </div>
                        <div className="mt-2 font-mono text-sm">{overview.data?.solver_version ?? "—"}</div>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <div className="rounded-xl bg-muted/40 p-3">
                                <div className="text-muted-foreground text-xs">Plan</div>
                                <div className="mt-1 text-2xl font-semibold">{money(overview.data?.plans)}</div>
                            </div>
                            <div className="rounded-xl bg-muted/40 p-3">
                                <div className="text-muted-foreground text-xs">Rebalance</div>
                                <div className="mt-1 text-2xl font-semibold">{money(overview.data?.rebalances)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {errored ? <Card className="border-destructive/40 p-5 text-destructive">دریافت داده‌های سبد رشد ناموفق بود.</Card> : null}
            {loading ? <Card className="p-5 text-muted-foreground">در حال بارگذاری داده‌های Portfolio…</Card> : null}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Card className="p-5">
                    <div className="text-muted-foreground text-sm">Expected P50</div>
                    <div className="mt-2 text-3xl font-semibold tabular-nums">{money(latest?.expected_value_p50_minor)}</div>
                </Card>
                <Card className="p-5">
                    <div className="text-muted-foreground text-sm">Expected range</div>
                    <div className="mt-2 font-semibold tabular-nums">{money(latest?.expected_value_p10_minor)} — {money(latest?.expected_value_p90_minor)}</div>
                </Card>
                <Card className="p-5">
                    <div className="text-muted-foreground text-sm">مصرف نقدینگی</div>
                    <div className="mt-2 text-2xl font-semibold tabular-nums">{money(latestUtilization.cash)}</div>
                </Card>
                <Card className="p-5">
                    <div className="text-muted-foreground text-sm">بیشترین ریسک منتخب</div>
                    <div className="mt-2 text-2xl font-semibold tabular-nums">{percent(latestUtilization.max_risk)}</div>
                </Card>
                <Card className="p-5">
                    <div className="text-muted-foreground text-sm">Realization</div>
                    <div className="mt-2 text-2xl font-semibold tabular-nums">
                        {overview.data?.realization_ratio == null ? "—" : percent(overview.data.realization_ratio)}
                    </div>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
                <Card className="space-y-4 p-5">
                    <div>
                        <h2 className="font-semibold text-lg">Plan و policy</h2>
                        <p className="text-muted-foreground text-sm">Objective و hard constraintها شفاف و قابل ممیزی‌اند.</p>
                    </div>
                    <div>
                        <Label>نام سبد</Label>
                        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="مثلاً سبد رشد پاییز" />
                    </div>
                    <div>
                        <Label>هدف</Label>
                        <Textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="بیشینه‌سازی contribution با حفظ نقدینگی و ریسک" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div><Label>بودجه نقدی</Label><Input inputMode="numeric" value={cashBudget} onChange={(event) => setCashBudget(event.target.value)} /></div>
                        <div><Label>ساعت تیم</Label><Input inputMode="decimal" value={hoursBudget} onChange={(event) => setHoursBudget(event.target.value)} /></div>
                        <div><Label>حداکثر ریسک</Label><Input inputMode="decimal" value={maxRisk} onChange={(event) => setMaxRisk(event.target.value)} /></div>
                        <div><Label>حداکثر اقدام منتخب</Label><Input inputMode="numeric" value={maxSelected} onChange={(event) => setMaxSelected(event.target.value)} /></div>
                        <div><Label>حداقل confidence</Label><Input inputMode="decimal" value={minConfidence} onChange={(event) => setMinConfidence(event.target.value)} /></div>
                    </div>
                    <Button
                        className="w-full"
                        disabled={name.trim().length < 3 || objective.trim().length < 8 || create.isPending}
                        onClick={() => create.mutate({
                            path: "plans",
                            body: {
                                name: name.trim(),
                                objective: objective.trim(),
                                cash_budget_minor: Math.max(0, Number(cashBudget || 0)),
                                team_hours_budget: Math.max(0, Number(hoursBudget || 0)),
                                max_risk: Math.min(1, Math.max(0, Number(maxRisk || 0))),
                                channel_limits: {},
                                policy_constraints: {
                                    max_selected_actions: Math.min(24, Math.max(1, Number(maxSelected || 1))),
                                    min_confidence: Math.min(1, Math.max(0, Number(minConfidence || 0))),
                                    approval_risk_threshold: 0.65,
                                    high_risk_auto_cancel: false,
                                },
                            },
                        })}
                    >ساخت Plan</Button>
                </Card>

                <Card className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="font-semibold text-lg">Portfolio Plans</h2>
                            <p className="text-muted-foreground text-sm">برای مدیریت candidate و اجرای optimizer یک Plan را انتخاب کن.</p>
                        </div>
                        {selectedPlan ? <Button disabled={create.isPending || !candidates.data?.length} onClick={() => create.mutate({ path: `plans/${selectedPlan.public_id}/run`, body: {} })}>Optimize</Button> : null}
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {plans.data?.map((plan) => (
                            <button key={plan.public_id} type="button" onClick={() => setPlanId(plan.public_id)} className={`rounded-2xl border p-4 text-start transition ${selectedPlan?.public_id === plan.public_id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
                                <div className="flex items-start justify-between gap-3"><div><div className="font-medium">{plan.name}</div><div className="mt-1 line-clamp-2 text-muted-foreground text-sm">{plan.objective}</div></div><span className="rounded-full border px-2 py-1 text-xs">v{plan.version}</span></div>
                                <div className="mt-4 grid grid-cols-3 gap-2 text-xs"><div className="rounded-xl bg-muted/40 p-2"><div className="text-muted-foreground">نقد</div><div className="mt-1 font-medium">{money(plan.cash_budget_minor)}</div></div><div className="rounded-xl bg-muted/40 p-2"><div className="text-muted-foreground">ساعت</div><div className="mt-1 font-medium">{money(plan.team_hours_budget)}</div></div><div className="rounded-xl bg-muted/40 p-2"><div className="text-muted-foreground">ریسک</div><div className="mt-1 font-medium">{percent(plan.max_risk)}</div></div></div>
                            </button>
                        ))}
                    </div>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
                <Card className="space-y-4 p-5">
                    <div><h2 className="font-semibold text-lg">Candidate management</h2><p className="text-muted-foreground text-sm">منبع فقط opportunity/recommendation باز فاز ۱۰ است.</p></div>
                    <div><Label>Opportunity</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={opportunityId} onChange={(event) => setOpportunityId(event.target.value)}><option value="">انتخاب فرصت…</option>{opportunities.data?.map((item) => <option key={item.id} value={item.id}>{item.title_fa} · {item.domain}</option>)}</select></div>
                    <div className="grid gap-3 sm:grid-cols-2"><div><Label>Incremental value</Label><Input inputMode="numeric" value={candidateValue} onChange={(event) => setCandidateValue(event.target.value)} /></div><div><Label>Cash</Label><Input inputMode="numeric" value={candidateCash} onChange={(event) => setCandidateCash(event.target.value)} /></div><div><Label>Team hours</Label><Input inputMode="decimal" value={candidateHours} onChange={(event) => setCandidateHours(event.target.value)} /></div><div><Label>Confidence</Label><Input inputMode="decimal" value={candidateConfidence} onChange={(event) => setCandidateConfidence(event.target.value)} /></div><div><Label>Risk</Label><Input inputMode="decimal" value={candidateRisk} onChange={(event) => setCandidateRisk(event.target.value)} /></div></div>
                    <div><Label>Dependency case IDs</Label><Input value={dependencies} onChange={(event) => setDependencies(event.target.value)} placeholder="12, 18" /></div>
                    <div><Label>Exclusive case IDs</Label><Input value={exclusiveWith} onChange={(event) => setExclusiveWith(event.target.value)} placeholder="22, 31" /></div>
                    <Button className="w-full" disabled={!selectedPlan || !selectedOpportunity || create.isPending} onClick={() => selectedPlan && selectedOpportunity && create.mutate({ path: `plans/${selectedPlan.public_id}/candidates`, body: { intelligence_case_id: selectedOpportunity.id, expected_incremental_contribution_minor: Number(candidateValue || 0), confidence: Math.min(1, Math.max(0, Number(candidateConfidence || 0))), required_cash_minor: Math.max(0, Number(candidateCash || 0)), team_hours: Math.max(0, Number(candidateHours || 0)), warehouse_capacity: 0, supplier_capacity: 0, risk: Math.min(1, Math.max(0, Number(candidateRisk || 0))), reversibility: 0.7, time_to_value: 0.7, customer_impact: 0.7, strategic_alignment: 0.7, dependencies: numberList(dependencies), exclusive_with: numberList(exclusiveWith), channel_requirements: {} } })}>افزودن به Portfolio</Button>
                </Card>

                <Card className="p-5">
                    <div><h2 className="font-semibold text-lg">Candidate ledger</h2><p className="text-muted-foreground text-sm">Snapshot هر candidate به version منبع Phase 10 قفل می‌شود.</p></div>
                    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="text-muted-foreground"><tr className="border-b"><th className="px-3 py-3 text-start">فرصت</th><th className="px-3 py-3 text-start">Value</th><th className="px-3 py-3 text-start">Confidence</th><th className="px-3 py-3 text-start">Risk</th><th className="px-3 py-3 text-start">Cash</th><th className="px-3 py-3" /></tr></thead><tbody>{candidates.data?.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="px-3 py-3"><div className="font-medium">{item.title_fa}</div><div className="text-muted-foreground text-xs">#{item.intelligence_case_id} · {item.domain}</div></td><td className="px-3 py-3 tabular-nums">{money(item.expected_incremental_contribution_minor)}</td><td className="px-3 py-3">{percent(item.confidence)}</td><td className="px-3 py-3">{percent(item.risk)}</td><td className="px-3 py-3 tabular-nums">{money(item.required_cash_minor)}</td><td className="px-3 py-3 text-end"><Button variant="outline" disabled={!selectedPlan || remove.isPending} onClick={() => selectedPlan && remove.mutate({ path: `plans/${selectedPlan.public_id}/candidates/${item.id}`, body: {} })}>حذف</Button></td></tr>)}</tbody></table>{candidates.data?.length === 0 ? <div className="p-8 text-center text-muted-foreground text-sm">برای این Plan هنوز candidate ثبت نشده است.</div> : null}</div>
                </Card>
            </div>

            <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-lg">Portfolio Run Ledger</h2><p className="text-muted-foreground text-sm">P10/P50/P90، constraint snapshot و تصمیم هر candidate قابل drill-down است.</p></div></div>
                <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead className="text-muted-foreground"><tr className="border-b"><th className="px-3 py-3 text-start">Plan</th><th className="px-3 py-3 text-start">Status</th><th className="px-3 py-3 text-start">P10</th><th className="px-3 py-3 text-start">P50</th><th className="px-3 py-3 text-start">P90</th><th className="px-3 py-3 text-start">زمان</th></tr></thead><tbody>{runs.data?.map((run) => <tr key={run.public_id} onClick={() => setRunId(run.public_id)} className={`cursor-pointer border-b last:border-0 ${selectedRunId === run.public_id ? "bg-primary/5" : "hover:bg-muted/30"}`}><td className="px-3 py-3 font-medium">{run.plan_name}</td><td className="px-3 py-3">{run.status}</td><td className="px-3 py-3 tabular-nums">{money(run.expected_value_p10_minor)}</td><td className="px-3 py-3 font-semibold tabular-nums">{money(run.expected_value_p50_minor)}</td><td className="px-3 py-3 tabular-nums">{money(run.expected_value_p90_minor)}</td><td className="px-3 py-3 text-muted-foreground">{new Date(run.generated_at).toLocaleString("fa-IR")}</td></tr>)}</tbody></table></div>
            </Card>

            {runDetail.data ? <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
                <Card className="p-5"><div><h2 className="font-semibold text-lg">Run drill-down</h2><p className="text-muted-foreground text-sm">Selected / Deferred / Infeasible با دلیل و binding constraint.</p></div><div className="mt-4 space-y-2">{runDetail.data.items.map((item) => <div key={item.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-medium">{item.title_fa}</div><div className="mt-1 text-muted-foreground text-xs">#{item.intelligence_case_id} · {item.domain}</div></div><span className="rounded-full border px-2.5 py-1 text-xs">{decisionLabel[item.decision]}</span></div><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-muted/50 px-2 py-1">Value {money(item.expected_weighted_value_minor)}</span><span className="rounded-lg bg-muted/50 px-2 py-1">Risk {percent(item.risk)}</span>{parsedConstraints(item.binding_constraints).map((constraint) => <span key={constraint} className="rounded-lg border px-2 py-1">{constraint}</span>)}</div><div className="mt-2 text-muted-foreground text-xs">{item.reason}</div></div>)}</div></Card>
                <Card className="space-y-4 p-5"><div><h2 className="font-semibold text-lg">Realized outcome</h2><p className="text-muted-foreground text-sm">Evidence فقط از outcomeهای Phase 10 متعلق به همین Run پذیرفته می‌شود.</p></div><div><Label>Realized value</Label><Input inputMode="numeric" value={realizedValue} onChange={(event) => setRealizedValue(event.target.value)} /></div><div><Label>Attribution confidence</Label><Input inputMode="decimal" value={attributionConfidence} onChange={(event) => setAttributionConfidence(event.target.value)} /></div><div><Label>Measurement window</Label><Input value={measurementWindow} onChange={(event) => setMeasurementWindow(event.target.value)} /></div><div><Label>Phase 10 outcome IDs</Label><Input value={sourceOutcomeIds} onChange={(event) => setSourceOutcomeIds(event.target.value)} placeholder="101, 102" /></div><Button className="w-full" disabled={create.isPending} onClick={() => create.mutate({ path: `runs/${runDetail.data.public_id}/outcomes`, body: { realized_value_minor: Number(realizedValue || 0), attribution_confidence: Math.min(1, Math.max(0, Number(attributionConfidence || 0))), measurement_window: measurementWindow.trim() || undefined, source_outcome_ids: numberList(sourceOutcomeIds) } })}>ثبت Outcome</Button><div className="space-y-2">{runDetail.data.outcomes.map((outcome) => <div key={outcome.id} className="rounded-xl bg-muted/40 p-3 text-sm"><div className="flex justify-between gap-3"><span>{money(outcome.realized_value_minor)}</span><span>{outcome.realization_ratio == null ? "—" : percent(outcome.realization_ratio)}</span></div><div className="mt-1 text-muted-foreground text-xs">{outcome.measurement_window ?? "بدون بازه"} · confidence {percent(outcome.attribution_confidence)}</div></div>)}</div></Card>
            </div> : null}

            <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
                <Card className="space-y-4 p-5"><div><h2 className="font-semibold text-lg">Dynamic Rebalance</h2><p className="text-muted-foreground text-sm">تغییر شرایط Portfolio را refresh می‌کند؛ action فعال پرریسک بدون approval حذف نمی‌شود.</p></div><div><Label>Trigger</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={triggerKind} onChange={(event) => setTriggerKind(event.target.value)}>{Object.entries(triggerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><Label>شرح/شواهد trigger</Label><Textarea value={triggerNote} onChange={(event) => setTriggerNote(event.target.value)} placeholder="مثلاً تأمین‌کننده اصلی SKUهای کمپین را تا ۷۲ ساعت آینده تحویل نمی‌دهد." /></div><div><Label>Cash override (اختیاری)</Label><Input inputMode="numeric" value={overrideCash} onChange={(event) => setOverrideCash(event.target.value)} placeholder="خالی = بودجه Plan" /></div><div><Label>Active case IDs (اختیاری)</Label><Input value={activeCaseIds} onChange={(event) => setActiveCaseIds(event.target.value)} placeholder="علاوه بر actionهای in_progress فاز ۱۰" /></div><Button className="w-full" disabled={!selectedPlan || create.isPending} onClick={() => selectedPlan && create.mutate({ path: `plans/${selectedPlan.public_id}/rebalance`, body: { trigger_kind: triggerKind, trigger_snapshot: { note: triggerNote.trim() }, constraint_overrides: overrideCash.trim() ? { cash_budget_minor: Math.max(0, Number(overrideCash)) } : {}, active_case_ids: numberList(activeCaseIds) } })}>محاسبه Rebalance</Button></Card>
                <Card className="p-5"><div><h2 className="font-semibold text-lg">Rebalance & Approval Ledger</h2><p className="text-muted-foreground text-sm">Approval reference مستقیماً از Governance OS می‌آید.</p></div><div className="mt-4 space-y-2">{rebalances.data?.map((event) => { const protectedIds = parsedArray(event.protected_active_case_ids); return <div key={event.public_id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-medium">{event.plan_name}</div><div className="mt-1 text-muted-foreground text-xs">{triggerLabels[event.trigger_kind] ?? event.trigger_kind} · {new Date(event.detected_at).toLocaleString("fa-IR")}</div></div><span className="rounded-full border px-2.5 py-1 text-xs">{event.status}</span></div>{protectedIds.length ? <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">اقدام‌های فعال پرریسک محافظت‌شده: {protectedIds.map((id) => `#${id}`).join("، ")}<div className="mt-1 font-mono text-xs text-muted-foreground">{event.approval_reference ?? "approval pending"}</div></div> : null}{event.status === "approval_required" ? <Button className="mt-3" variant="outline" disabled={create.isPending} onClick={() => create.mutate({ path: `rebalances/${event.public_id}/apply`, body: {} })}>اعمال پس از Approval</Button> : null}</div>; })}</div></Card>
            </div>
        </div>
    );
}
