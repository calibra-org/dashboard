"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import {
    useGrowthPortfolioMutation,
    useGrowthPortfolioResource,
} from "#/lib/queries/growth-portfolio";

type Overview = {
    solver_version: string;
    plans: number;
    runs: number;
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

type Run = {
    public_id: string;
    plan_name: string;
    objective?: string;
    expected_value_p10_minor: number;
    expected_value_p50_minor: number;
    expected_value_p90_minor: number;
    resource_utilization: Record<string, unknown> | string;
    generated_at: string;
};

const money = (value: unknown) => new Intl.NumberFormat("fa-IR").format(Number(value ?? 0));
const percent = (value: unknown) => `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(value ?? 0) * 100)}٪`;

export function GrowthPortfolioWorkspace() {
    const overview = useGrowthPortfolioResource<Overview>("overview");
    const plans = useGrowthPortfolioResource<Plan[]>("plans");
    const runs = useGrowthPortfolioResource<Run[]>("runs");
    const mutate = useGrowthPortfolioMutation<any>();

    const [name, setName] = useState("");
    const [objective, setObjective] = useState("");
    const [cashBudget, setCashBudget] = useState("0");
    const [hoursBudget, setHoursBudget] = useState("0");
    const [maxRisk, setMaxRisk] = useState("0.5");

    const latest = useMemo(() => runs.data?.[0] ?? overview.data?.latest_runs?.[0], [overview.data, runs.data]);
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

    const selectedPlan = plans.data?.[0];

    return (
        <div className="space-y-6">
            <PageHeader
                title="موتور سبد رشد"
                subtitle="Autonomous Growth Portfolio Engine · انتخاب بهترین مجموعه اقدام تحت محدودیت نقدینگی، زمان، ظرفیت و ریسک"
            />

            <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6">
                <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
                    <div>
                        <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-primary">PORTFOLIO FIRST</span>
                            <span className="rounded-full border px-3 py-1">Hard Constraints</span>
                            <span className="rounded-full border px-3 py-1">Explainable Deferrals</span>
                            <span className="rounded-full border px-3 py-1">Outcome Feedback</span>
                        </div>
                        <h2 className="mt-5 max-w-3xl font-semibold text-2xl leading-9">
                            به‌جای انتخاب بهترین recommendation، بهترین ترکیب recommendationها را انتخاب کن.
                        </h2>
                        <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-7">
                            منبع فرصت‌ها همان Decision Intelligence فاز ۱۰ باقی می‌ماند. این لایه فقط snapshot، constraint، portfolio run و نتیجهٔ واقعی سبد را نگه می‌دارد.
                        </p>
                    </div>
                    <div className="rounded-2xl border bg-background/70 p-4">
                        <div className="text-muted-foreground text-sm">Solver</div>
                        <div className="mt-2 font-mono text-sm">{overview.data?.solver_version ?? "—"}</div>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <div className="rounded-xl bg-muted/40 p-3">
                                <div className="text-muted-foreground text-xs">Planها</div>
                                <div className="mt-1 text-2xl font-semibold">{money(overview.data?.plans)}</div>
                            </div>
                            <div className="rounded-xl bg-muted/40 p-3">
                                <div className="text-muted-foreground text-xs">Runها</div>
                                <div className="mt-1 text-2xl font-semibold">{money(overview.data?.runs)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Card className="p-5">
                    <div className="text-muted-foreground text-sm">Expected P50</div>
                    <div className="mt-2 text-3xl font-semibold tabular-nums">{money(latest?.expected_value_p50_minor)}</div>
                </Card>
                <Card className="p-5">
                    <div className="text-muted-foreground text-sm">Expected range</div>
                    <div className="mt-2 text-lg font-semibold tabular-nums">
                        {money(latest?.expected_value_p10_minor)} — {money(latest?.expected_value_p90_minor)}
                    </div>
                </Card>
                <Card className="p-5">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        مصرف نقدینگی
                        <HelperTooltip>مصرف واقعی از constraint snapshot همان Run؛ نه بودجهٔ تزئینی.</HelperTooltip>
                    </div>
                    <div className="mt-2 text-2xl font-semibold tabular-nums">{money(latestUtilization.cash)}</div>
                </Card>
                <Card className="p-5">
                    <div className="text-muted-foreground text-sm">بیشترین ریسک منتخب</div>
                    <div className="mt-2 text-2xl font-semibold tabular-nums">{percent(latestUtilization.max_risk)}</div>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
                <Card className="space-y-4 p-5">
                    <div>
                        <h2 className="font-semibold text-lg">Plan جدید</h2>
                        <p className="text-muted-foreground text-sm">Objective و hard constraintها را شفاف تعریف کن؛ optimizer حق شکستن آن‌ها را ندارد.</p>
                    </div>
                    <div>
                        <Label>نام سبد</Label>
                        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="مثلاً سبد رشد پاییز" />
                    </div>
                    <div>
                        <Label>هدف</Label>
                        <Textarea
                            value={objective}
                            onChange={(event) => setObjective(event.target.value)}
                            placeholder="مثلاً بیشینه‌سازی contribution سه‌ماهه با حفظ ریسک و نقدینگی"
                        />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                        <div>
                            <Label>بودجه نقدی</Label>
                            <Input inputMode="numeric" value={cashBudget} onChange={(event) => setCashBudget(event.target.value)} />
                        </div>
                        <div>
                            <Label>ساعت تیم</Label>
                            <Input inputMode="decimal" value={hoursBudget} onChange={(event) => setHoursBudget(event.target.value)} />
                        </div>
                        <div>
                            <Label>حداکثر ریسک</Label>
                            <Input inputMode="decimal" value={maxRisk} onChange={(event) => setMaxRisk(event.target.value)} />
                        </div>
                    </div>
                    <Button
                        className="w-full"
                        disabled={name.trim().length < 3 || objective.trim().length < 8 || mutate.isPending}
                        onClick={() =>
                            mutate.mutate({
                                path: "plans",
                                body: {
                                    name: name.trim(),
                                    objective: objective.trim(),
                                    cash_budget_minor: Math.max(0, Number(cashBudget || 0)),
                                    team_hours_budget: Math.max(0, Number(hoursBudget || 0)),
                                    max_risk: Math.min(1, Math.max(0, Number(maxRisk || 0))),
                                    channel_limits: {},
                                    policy_constraints: { high_risk_auto_cancel: false },
                                },
                            })
                        }
                    >
                        ساخت Plan
                    </Button>
                </Card>

                <Card className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="font-semibold text-lg">Portfolio Plans</h2>
                            <p className="text-muted-foreground text-sm">هر Run به نسخهٔ Plan و snapshot فرصت‌های فاز ۱۰ قفل می‌شود.</p>
                        </div>
                        {selectedPlan ? (
                            <Button
                                disabled={mutate.isPending}
                                onClick={() => mutate.mutate({ path: `plans/${selectedPlan.public_id}/run`, body: {} })}
                            >
                                Optimize آخرین Plan
                            </Button>
                        ) : null}
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {plans.data?.map((plan) => (
                            <div key={plan.public_id} className="rounded-2xl border p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="font-medium">{plan.name}</div>
                                        <div className="mt-1 line-clamp-2 text-muted-foreground text-sm">{plan.objective}</div>
                                    </div>
                                    <span className="rounded-full border px-2 py-1 text-xs">v{plan.version}</span>
                                </div>
                                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                                    <div className="rounded-xl bg-muted/40 p-2">
                                        <div className="text-muted-foreground">نقد</div>
                                        <div className="mt-1 font-medium">{money(plan.cash_budget_minor)}</div>
                                    </div>
                                    <div className="rounded-xl bg-muted/40 p-2">
                                        <div className="text-muted-foreground">ساعت</div>
                                        <div className="mt-1 font-medium">{money(plan.team_hours_budget)}</div>
                                    </div>
                                    <div className="rounded-xl bg-muted/40 p-2">
                                        <div className="text-muted-foreground">ریسک</div>
                                        <div className="mt-1 font-medium">{percent(plan.max_risk)}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            <Card className="p-5">
                <div>
                    <h2 className="font-semibold text-lg">Portfolio Run Ledger</h2>
                    <p className="text-muted-foreground text-sm">Expected distribution، resource utilization و outcome feedback برای هر نسخه نگه‌داری می‌شود.</p>
                </div>
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead className="text-muted-foreground">
                            <tr className="border-b">
                                <th className="px-3 py-3 text-start font-medium">Plan</th>
                                <th className="px-3 py-3 text-start font-medium">P10</th>
                                <th className="px-3 py-3 text-start font-medium">P50</th>
                                <th className="px-3 py-3 text-start font-medium">P90</th>
                                <th className="px-3 py-3 text-start font-medium">زمان تولید</th>
                            </tr>
                        </thead>
                        <tbody>
                            {runs.data?.map((run) => (
                                <tr key={run.public_id} className="border-b last:border-0">
                                    <td className="px-3 py-3 font-medium">{run.plan_name}</td>
                                    <td className="px-3 py-3 tabular-nums">{money(run.expected_value_p10_minor)}</td>
                                    <td className="px-3 py-3 font-semibold tabular-nums">{money(run.expected_value_p50_minor)}</td>
                                    <td className="px-3 py-3 tabular-nums">{money(run.expected_value_p90_minor)}</td>
                                    <td className="px-3 py-3 text-muted-foreground">{new Date(run.generated_at).toLocaleString("fa-IR")}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {runs.data?.length === 0 ? <div className="p-8 text-center text-muted-foreground text-sm">هنوز Runی تولید نشده است.</div> : null}
                </div>
            </Card>
        </div>
    );
}
