"use client";
import { type ReactNode, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { Search as ScanSearch, ShieldAlert, SlidersHorizontal, UserCheck as UserRoundCheck } from "#/icons";
import { useAgentOrchestratorMutation, useAgentOrchestratorResource } from "#/lib/queries/agent-orchestrator";
export type AgentOrchestratorSection = "overview" | "agents" | "tools" | "plans" | "council";
const Info = ({ children, help }: { children: ReactNode; help: string }) => (
    <span className="inline-flex items-center gap-2 font-semibold">
        {children}
        <HelperTooltip>{help}</HelperTooltip>
    </span>
);
const Section = ({ title, help, children }: { title: string; help: string; children: ReactNode }) => (
    <Card className="space-y-4 p-5">
        <Info help={help}>{title}</Info>
        {children}
    </Card>
);
const Metric = ({ label, help, value }: { label: string; help: string; value: ReactNode }) => (
    <Card className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
            {label}
            <HelperTooltip>{help}</HelperTooltip>
        </div>
        <div className="mt-3 font-semibold text-2xl">{value}</div>
    </Card>
);
export function AgentOrchestratorWorkspace({ section }: { section: AgentOrchestratorSection }) {
    const overview = useAgentOrchestratorResource<any>("overview", section === "overview");
    const agents = useAgentOrchestratorResource<any[]>("agents", section === "agents" || section === "plans");
    const tools = useAgentOrchestratorResource<any[]>("tools", section === "tools");
    const plans = useAgentOrchestratorResource<any[]>("plans", section === "plans" || section === "council");
    const mutate = useAgentOrchestratorMutation();
    const [agentKey, setAgentKey] = useState("");
    const [agentName, setAgentName] = useState("");
    const [specialty, setSpecialty] = useState("growth");
    const [reason, setReason] = useState("");
    const [toolKey, setToolKey] = useState("");
    const [handlerKey, setHandlerKey] = useState("catalog.product.snapshot");
    const [risk, setRisk] = useState("read_only");
    const [agentId, setAgentId] = useState("");
    const [goal, setGoal] = useState("");
    const [stepTool, setStepTool] = useState("");
    if (section === "overview") {
        const k = overview.data?.kpis ?? {};
        return (
            <div className="space-y-5">
                <PageHeader
                    title="ارکستراسیون چند-Agent"
                    subtitle="برنامه، Tool Registry، تأیید انسانی، verification و kill switch"
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Metric label="Agentها" help="هویت‌های Agent tenant-scoped با scope و budget صریح." value={k.agents ?? "—"} />
                    <Metric label="Planها" help="Plan envelopeهای نسخه‌دار؛ نه promptهای پنهان." value={k.plans ?? "—"} />
                    <Metric label="اجرای ۳۰ روز" help="Tool runهای واقعی ledger." value={k.runs_30d ?? "—"} />
                    <Metric label="تعارض‌ها" help="تعارض‌های ثبت‌شده با objective و evidence." value={k.conflicts ?? "—"} />
                </div>
                <Section
                    title="مرز اجرای امن"
                    help="Agent فقط handlerهای از پیش ثبت‌شده را اجرا می‌کند؛ SQL/shell مستقیم ممنوع است."
                >
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-border p-4">
                            <SlidersHorizontal className="size-5" />
                            <h3 className="mt-3 font-medium">Tool Registry</h3>
                            <p className="mt-1 text-muted-foreground text-sm">schema، scope، risk، dry-run و rollback.</p>
                        </div>
                        <div className="rounded-xl border border-border p-4">
                            <UserRoundCheck className="size-5" />
                            <h3 className="mt-3 font-medium">Approval</h3>
                            <p className="mt-1 text-muted-foreground text-sm">
                                high/critical قبل از اجرا تأیید و step-up می‌خواهند.
                            </p>
                        </div>
                        <div className="rounded-xl border border-border p-4">
                            <ShieldAlert className="size-5" />
                            <h3 className="mt-3 font-medium">Kill switch</h3>
                            <p className="mt-1 text-muted-foreground text-sm">اجرای جدید را متوقف می‌کند، بدون پاک کردن trace.</p>
                        </div>
                    </div>
                </Section>
            </div>
        );
    }
    if (section === "agents")
        return (
            <div className="space-y-5">
                <PageHeader title="Agentها" subtitle="هویت، تخصص، scope و budget" />
                <Section title="ثبت Agent" help="هویت Agent مستقل از کاربر انسانی است و superadmin ارث نمی‌برد.">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <Label>کلید Agent</Label>
                            <Input value={agentKey} onChange={(e) => setAgentKey(e.target.value)} />
                        </div>
                        <div>
                            <Label>نام</Label>
                            <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} />
                        </div>
                        <div>
                            <Label>تخصص</Label>
                            <Select value={specialty} onValueChange={(value) => setSpecialty(String(value))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[
                                        "finance",
                                        "inventory",
                                        "procurement",
                                        "pricing",
                                        "growth",
                                        "customer",
                                        "seo",
                                        "content",
                                        "support",
                                        "risk",
                                        "quality",
                                        "operations_sre",
                                    ].map((x) => (
                                        <SelectItem key={x} value={x}>
                                            {x}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>دلیل تغییر</Label>
                            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                        </div>
                    </div>
                    <Button
                        disabled={!agentKey || !agentName || reason.length < 8}
                        onClick={() =>
                            mutate.mutate({
                                path: "agents",
                                body: {
                                    agent_key: agentKey,
                                    display_name: agentName,
                                    specialty,
                                    scopes: [`${specialty}.read`],
                                    budget_minor: 0,
                                    is_active: true,
                                    reason,
                                },
                            })
                        }
                    >
                        ذخیره Agent
                    </Button>
                </Section>
                <Section title="Agentهای فعال" help="kill switch و وضعیت از Backend خوانده می‌شود.">
                    <div className="space-y-2">
                        {agents.data?.map((a: any) => (
                            <div
                                key={a.public_id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-border p-4"
                            >
                                <div>
                                    <div className="font-medium">{a.display_name}</div>
                                    <div className="text-muted-foreground text-xs">
                                        {a.agent_key} · {a.specialty}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <StatusBadge tone={a.kill_switch ? "danger" : a.is_active ? "success" : "neutral"}>
                                        {a.kill_switch ? "متوقف" : a.is_active ? "فعال" : "غیرفعال"}
                                    </StatusBadge>
                                    <Button
                                        variant="outline"
                                        onClick={() =>
                                            mutate.mutate({
                                                path: "kill-switch",
                                                body: {
                                                    agent_public_id: a.public_id,
                                                    enabled: !a.kill_switch,
                                                    reason: "تغییر کنترل‌شده kill switch از پنل",
                                                },
                                            })
                                        }
                                    >
                                        {a.kill_switch ? "رفع توقف" : "توقف"}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>
            </div>
        );
    if (section === "tools")
        return (
            <div className="space-y-5">
                <PageHeader title="Tool Registry" subtitle="تنها مسیر مجاز برای actionهای Agent" />
                <Section
                    title="ثبت نسخه ابزار"
                    help="handler باید از allowlist deterministic باشد؛ نام دلخواه کد اجرایی ایجاد نمی‌کند."
                >
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <Label>Tool key</Label>
                            <Input value={toolKey} onChange={(e) => setToolKey(e.target.value)} />
                        </div>
                        <div>
                            <Label>Handler</Label>
                            <Select value={handlerKey} onValueChange={(value) => setHandlerKey(String(value))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {["catalog.product.snapshot", "commerce.order.read", "commerce.order.hold"].map((x) => (
                                        <SelectItem key={x} value={x}>
                                            {x}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Risk</Label>
                            <Select value={risk} onValueChange={(value) => setRisk(String(value))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {["read_only", "low", "medium", "high", "critical"].map((x) => (
                                        <SelectItem key={x} value={x}>
                                            {x}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>دلیل</Label>
                            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                        </div>
                    </div>
                    <Button
                        disabled={!toolKey || reason.length < 8}
                        onClick={() =>
                            mutate.mutate({
                                path: "tools",
                                body: {
                                    tool_key: toolKey,
                                    version: 1,
                                    handler_key: handlerKey,
                                    input_schema: { type: "object" },
                                    output_schema: { type: "object" },
                                    required_scopes: [],
                                    required_permission: null,
                                    risk_class: risk,
                                    supports_dry_run: true,
                                    reversible: handlerKey === "commerce.order.hold",
                                    rollback_plan:
                                        handlerKey === "commerce.order.hold" ? "بازگشت فقط از طریق state machine سفارش" : null,
                                    approval_required: risk === "high" || risk === "critical",
                                    side_effects: handlerKey === "commerce.order.hold" ? ["order.status"] : [],
                                    reason,
                                },
                            })
                        }
                    >
                        ثبت ابزار
                    </Button>
                </Section>
                <Section title="ابزارهای مجاز" help="هر نسخه به handler ثابت و risk class مشخص متصل است.">
                    <div className="space-y-2">
                        {tools.data?.map((x: any) => (
                            <div key={x.public_id} className="rounded-xl border border-border p-4">
                                <div className="flex justify-between gap-3">
                                    <span className="font-medium">
                                        {x.tool_key}@{x.version}
                                    </span>
                                    <StatusBadge
                                        tone={x.risk_class === "high" || x.risk_class === "critical" ? "warning" : "neutral"}
                                    >
                                        {x.risk_class}
                                    </StatusBadge>
                                </div>
                                <div className="mt-1 text-muted-foreground text-xs">handler: {x.handler_key}</div>
                            </div>
                        ))}
                    </div>
                </Section>
            </div>
        );
    if (section === "plans")
        return (
            <div className="space-y-5">
                <PageHeader title="Plan و اجرا" subtitle="Goal → evidence → constraints → steps → verification" />
                <Section title="ایجاد Plan محدود" help="هر step باید tool ثبت‌شده و idempotency key یکتا داشته باشد.">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <Label>Agent</Label>
                            <Select value={agentId} onValueChange={(value) => setAgentId(String(value))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="انتخاب" />
                                </SelectTrigger>
                                <SelectContent>
                                    {agents.data?.map((a: any) => (
                                        <SelectItem key={a.public_id} value={a.public_id}>
                                            {a.display_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Tool key</Label>
                            <Input value={stepTool} onChange={(e) => setStepTool(e.target.value)} />
                        </div>
                    </div>
                    <div>
                        <Label>هدف</Label>
                        <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} />
                    </div>
                    <Button
                        disabled={!agentId || goal.length < 8 || !stepTool}
                        onClick={() =>
                            mutate.mutate({
                                path: "plans",
                                body: {
                                    agent_public_id: agentId,
                                    goal,
                                    context_snapshot: { source: "admin" },
                                    constraints: {},
                                    evidence: [{ type: "operator_request" }],
                                    options: [{ key: "execute_registered_tool" }],
                                    expected_outcomes: {},
                                    risk: {},
                                    policy_evaluation: { status: "pending_execution" },
                                    verification_plan: { readback: true },
                                    learning_plan: { outcome_hook: true },
                                    steps: [
                                        {
                                            tool_key: stepTool,
                                            tool_version: 1,
                                            input: {},
                                            risk_class: "read_only",
                                            idempotency_key: crypto.randomUUID(),
                                        },
                                    ],
                                },
                            })
                        }
                    >
                        ثبت Plan
                    </Button>
                </Section>
                <Section title="Planهای اخیر" help="Plan trace حذف نمی‌شود و execution نتیجه جداگانه دارد.">
                    <div className="space-y-2">
                        {plans.data?.map((p: any) => (
                            <div key={p.public_id} className="rounded-xl border border-border p-4">
                                <div className="flex justify-between">
                                    <span className="font-medium">{p.agent_name}</span>
                                    <StatusBadge tone="neutral">{p.status}</StatusBadge>
                                </div>
                                <p className="mt-2 text-sm">{p.goal}</p>
                            </div>
                        ))}
                    </div>
                </Section>
            </div>
        );
    return (
        <div className="space-y-5">
            <PageHeader title="Agent Council" subtitle="حل اختلاف با objective، priority و evidence صریح" />
            <Section title="قاعده حل تعارض" help="هیچ مدل یا prompt حق ندارد بدون ثبت مبنای تصمیم، برنده را پنهانی تعیین کند.">
                <div className="flex items-start gap-3 rounded-xl border border-border p-4">
                    <ScanSearch className="mt-1 size-5" />
                    <div>
                        <div className="font-medium">Evidence-first arbitration</div>
                        <p className="mt-1 text-muted-foreground text-sm">
                            objective_key + priority_order + alternatives + evidence snapshot + resolution همگی در conflict ledger
                            ذخیره می‌شوند.
                        </p>
                    </div>
                </div>
            </Section>
            <Section title="Planهای قابل بررسی" help="برای ثبت conflict، API اختصاصی با audit سخت‌گیرانه استفاده می‌شود.">
                <div className="space-y-2">
                    {plans.data?.map((p: any) => (
                        <div key={p.public_id} className="rounded-xl border border-border p-4">
                            <span className="font-mono text-muted-foreground text-xs">{p.public_id}</span>
                            <p className="mt-2 text-sm">{p.goal}</p>
                        </div>
                    ))}
                </div>
            </Section>
        </div>
    );
}
