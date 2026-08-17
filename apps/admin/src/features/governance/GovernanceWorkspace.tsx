"use client";

import { useLocale } from "next-intl";
import { type FormEvent, type ReactNode, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Textarea } from "#/components/ui/textarea";
import {
    Activity,
    Bot,
    CheckCircle2,
    CircleGauge,
    Clock3,
    Hash,
    Network,
    RefreshCw,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
    TriangleAlert,
    Users,
} from "#/icons";
import { Link } from "#/lib/i18n/navigation";
import {
    type GovernanceApproval,
    useCreateAgent,
    useCreateApproval,
    useCreatePolicy,
    useDecideApproval,
    useGovernanceAgents,
    useGovernanceApprovals,
    useGovernanceLedger,
    useGovernanceOverview,
    useGovernancePolicies,
    useGovernanceRegistry,
    useGovernanceShadow,
    useKillSwitch,
    useReviewShadow,
    useVerifyLedger,
} from "#/lib/queries/governance";
import { cn } from "#/lib/utils";

export type GovernanceSection = "overview" | "policies" | "approvals" | "agents" | "ledger" | "shadow";
type Locale = "fa" | "en";

const sections: Array<{ key: GovernanceSection; href: string; fa: string; en: string; icon: typeof ShieldCheck }> = [
    { key: "overview", href: "/governance/overview", fa: "نمای کلی", en: "Overview", icon: CircleGauge },
    { key: "policies", href: "/governance/policies", fa: "سیاست‌ها", en: "Policies", icon: ShieldCheck },
    { key: "approvals", href: "/governance/approvals", fa: "مرکز تأیید", en: "Approval Center", icon: Users },
    { key: "agents", href: "/governance/agents", fa: "عامل‌ها", en: "Agent Principals", icon: Bot },
    { key: "ledger", href: "/governance/ledger", fa: "دفتر اقدام", en: "Action Ledger", icon: Hash },
    { key: "shadow", href: "/governance/shadow", fa: "Shadow و خودکاری", en: "Shadow & Autonomy", icon: Sparkles },
];

function tr(locale: Locale, fa: string, en: string) {
    return locale === "fa" ? fa : en;
}
function number(value: number, locale: Locale) {
    return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(value);
}
function date(value: string | null | undefined, locale: Locale) {
    return value
        ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(value),
          )
        : "—";
}
function hash(value: string | null | undefined) {
    return value ? `${value.slice(0, 9)}…${value.slice(-6)}` : "—";
}

function State({ value }: { value: string }) {
    const destructive = ["deny", "denied", "rejected", "reject", "failed"].includes(value);
    const positive = ["allow", "allowed", "approved", "approve", "executed"].includes(value);
    return <Badge variant={destructive ? "destructive" : positive ? "default" : "secondary"}>{value}</Badge>;
}

function Metric({
    label,
    value,
    note,
    icon: Icon,
    tone,
}: {
    label: string;
    value: ReactNode;
    note: string;
    icon: typeof ShieldCheck;
    tone?: "good" | "warn";
}) {
    return (
        <Card
            className={cn(
                "relative overflow-hidden border-border/70",
                tone === "good" && "bg-gradient-to-br from-primary/10 via-card to-success/10",
                tone === "warn" && "bg-gradient-to-br from-warning/10 via-card to-danger/5",
            )}
        >
            <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">{label}</span>
                    <span className="grid size-9 place-items-center rounded-xl border bg-background/80">
                        <Icon className="size-4" />
                    </span>
                </div>
                <div className="font-semibold text-2xl tabular-nums tracking-tight">{value}</div>
                <p className="mt-1 text-muted-foreground text-xs">{note}</p>
            </CardContent>
        </Card>
    );
}
function Empty({ children }: { children: ReactNode }) {
    return <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">{children}</div>;
}

export function GovernanceWorkspace({ section = "overview" }: { section?: GovernanceSection }) {
    const locale = (useLocale() === "en" ? "en" : "fa") as Locale;
    const overview = useGovernanceOverview();
    const registry = useGovernanceRegistry();
    const policies = useGovernancePolicies();
    const agents = useGovernanceAgents();
    const approvals = useGovernanceApprovals();
    const ledger = useGovernanceLedger();
    const shadow = useGovernanceShadow();

    return (
        <div className="flex flex-col gap-6 pb-12">
            <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-card to-success/10 p-6 shadow-sm lg:p-8">
                <div className="absolute -end-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="mb-2 flex items-center gap-2 font-medium text-primary text-xs">
                            <ShieldCheck className="size-4" /> CALIBRA GOVERNANCE OS · PHASE 11
                        </div>
                        <h1 className="font-semibold text-3xl tracking-tight">
                            {tr(locale, "مرکز حکمرانی، سیاست و دفتر اقدام", "Governance, Policy & Action Ledger")}
                        </h1>
                        <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
                            {tr(
                                locale,
                                "مسیر واحد برای تصمیم، تأیید، Step-up، اجرای محدود و مدرک تغییرناپذیر انسان‌ها، سرویس‌ها و Agentها.",
                                "One control plane for policy decisions, approvals, identity step-up, bounded execution, and tamper-evident evidence for humans, services, and agents.",
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border bg-background/75 px-3 py-2 backdrop-blur">
                        <span
                            className={cn("size-2 rounded-full", overview.data?.ledgerIntegrity.ok ? "bg-success" : "bg-warning")}
                        />
                        <span className="text-xs">
                            {overview.data?.ledgerIntegrity.ok
                                ? tr(locale, "زنجیره Ledger معتبر است", "Ledger chain verified")
                                : tr(locale, "Ledger نیاز به بررسی دارد", "Ledger verification required")}
                        </span>
                    </div>
                </div>
            </section>

            <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Governance sections">
                {sections.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Button key={item.key} asChild size="sm" variant={section === item.key ? "default" : "outline"}>
                            <Link href={item.href as never}>
                                <Icon className="size-3.5" />
                                {locale === "fa" ? item.fa : item.en}
                            </Link>
                        </Button>
                    );
                })}
            </nav>

            {overview.data ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Metric
                        label={tr(locale, "Policy فعال", "Current policies")}
                        value={number(overview.data.policyCount, locale)}
                        note={tr(locale, "آخرین نسخه هر policy key", "Latest version per policy key")}
                        icon={ShieldCheck}
                    />
                    <Metric
                        label={tr(locale, "تأیید در انتظار", "Pending approvals")}
                        value={number(overview.data.pendingApprovals, locale)}
                        note={tr(locale, "صف تصمیم انسانی", "Human decision queue")}
                        icon={Clock3}
                        tone={overview.data.pendingApprovals ? "warn" : "good"}
                    />
                    <Metric
                        label={tr(locale, "Agent فعال", "Active agents")}
                        value={`${number(overview.data.activeAgentCount, locale)} / ${number(overview.data.agentCount, locale)}`}
                        note={`${number(overview.data.killedAgentCount, locale)} ${tr(locale, "عامل متوقف", "kill-switched")}`}
                        icon={Bot}
                    />
                    <Metric
                        label={tr(locale, "مدرک Ledger", "Ledger evidence")}
                        value={number(overview.data.ledgerEntries, locale)}
                        note={`#${number(overview.data.ledgerLastSequence, locale)} · ${overview.data.ledgerIntegrity.ok ? "verified" : (overview.data.ledgerIntegrity.reason ?? "check")}`}
                        icon={Hash}
                        tone={overview.data.ledgerIntegrity.ok ? "good" : "warn"}
                    />
                </div>
            ) : null}

            {overview.isError ||
            registry.isError ||
            policies.isError ||
            agents.isError ||
            approvals.isError ||
            ledger.isError ||
            shadow.isError ? (
                <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-danger text-sm">
                    {tr(
                        locale,
                        "بخشی از داده‌های Governance بارگذاری نشد. وضعیت اتصال یا سطح دسترسی را بررسی کنید.",
                        "Some governance data could not be loaded. Check connectivity or access permissions.",
                    )}
                </div>
            ) : null}
            {section === "overview" ? (
                <Overview
                    locale={locale}
                    overview={overview.data}
                    approvals={approvals.data ?? []}
                    actions={registry.data?.actions ?? []}
                />
            ) : null}
            {section === "policies" ? (
                <Policies locale={locale} policies={policies.data ?? []} actions={registry.data?.actions ?? []} />
            ) : null}
            {section === "approvals" ? (
                <Approvals locale={locale} approvals={approvals.data ?? []} actions={registry.data?.actions ?? []} />
            ) : null}
            {section === "agents" ? <Agents locale={locale} agents={agents.data ?? []} /> : null}
            {section === "ledger" ? (
                <Ledger locale={locale} entries={ledger.data ?? []} integrity={overview.data?.ledgerIntegrity} />
            ) : null}
            {section === "shadow" ? <Shadow locale={locale} payload={shadow.data} /> : null}
        </div>
    );
}

function Overview({
    locale,
    overview,
    approvals,
    actions,
}: {
    locale: Locale;
    overview: ReturnType<typeof useGovernanceOverview>["data"];
    approvals: GovernanceApproval[];
    actions: ReturnType<typeof useGovernanceRegistry>["data"] extends { actions: infer A } ? A : never;
}) {
    const max = Math.max(1, ...(overview?.autonomyDistribution ?? []).map((item) => item.count));
    const pending = approvals.filter((item) => item.status === "pending").slice(0, 5);
    return (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Activity className="size-4" />
                        {tr(locale, "توزیع سطح خودکاری", "Autonomy distribution")}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {(overview?.autonomyDistribution ?? []).map((item) => (
                        <div key={item.level} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3">
                            <span className="font-mono text-xs">L{item.level}</span>
                            <div className="h-3 overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-primary transition-[width]"
                                    style={{ width: `${Math.max(3, (item.count / max) * 100)}%` }}
                                />
                            </div>
                            <span className="text-end text-xs tabular-nums">{number(item.count, locale)}</span>
                        </div>
                    ))}
                    <div className="rounded-xl border bg-muted/20 p-3 text-muted-foreground text-xs leading-5">
                        {tr(
                            locale,
                            "خودکاری سوییچ سراسری نیست؛ هر Action سقف مستقل دارد و ارتقا فقط از مسیر Shadow و evidence انجام می‌شود.",
                            "Autonomy is not a global toggle. Every action has its own ceiling and promotion is earned through shadow evidence.",
                        )}
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ShieldAlert className="size-4" />
                        {tr(locale, "صف تصمیم فوری", "Decision queue")}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {pending.length ? (
                        <div className="space-y-3">
                            {pending.map((item) => (
                                <div className="rounded-xl border p-3" key={item.id}>
                                    <div className="flex items-center justify-between gap-2">
                                        <code className="text-xs">{item.actionKey}</code>
                                        <State value={item.status} />
                                    </div>
                                    <div className="mt-2 text-muted-foreground text-xs">
                                        {item.reference} · {date(item.expiresAt, locale)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty>{tr(locale, "صف تأیید خالی است.", "Approval queue is clear.")}</Empty>
                    )}
                </CardContent>
            </Card>
            <Card className="xl:col-span-2">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Network className="size-4" />
                        Action Registry
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {actions.map((action) => (
                            <div className="rounded-xl border bg-muted/10 p-3" key={action.key}>
                                <div className="flex items-start justify-between gap-2">
                                    <code className="text-xs">{action.key}</code>
                                    <Badge variant="outline">L{action.maxAutonomy}</Badge>
                                </div>
                                <div className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
                                    <span>{action.risk}</span>
                                    <span>•</span>
                                    <span>{action.reversibility}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function Policies({
    locale,
    policies,
    actions,
}: {
    locale: Locale;
    policies: NonNullable<ReturnType<typeof useGovernancePolicies>["data"]>;
    actions: NonNullable<ReturnType<typeof useGovernanceRegistry>["data"]>["actions"];
}) {
    const create = useCreatePolicy();
    const [actionPattern, setActionPattern] = useState(actions[0]?.key ?? "*");
    const [effect, setEffect] = useState("require_approval");
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await create.mutateAsync({
            policyKey: String(form.get("policyKey")),
            name: String(form.get("name")),
            actionPattern,
            effect,
            priority: Number(form.get("priority") || 100),
            reason: String(form.get("reason")),
            scope: {},
            predicate: {},
            enabled: true,
        });
        event.currentTarget.reset();
    }
    return (
        <div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{tr(locale, "ثبت نسخه جدید Policy", "Create policy version")}</CardTitle>
                </CardHeader>
                <CardContent>
                    <form className="space-y-3" onSubmit={submit}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="policy-key">Policy key</Label>
                                <Input id="policy-key" name="policyKey" required placeholder="finance.refund.limit" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="priority">{tr(locale, "اولویت", "Priority")}</Label>
                                <Input id="priority" name="priority" type="number" min={0} max={10000} defaultValue={100} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="policy-name">{tr(locale, "نام", "Name")}</Label>
                            <Input id="policy-name" name="name" required />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Action</Label>
                            <Select value={actionPattern} onValueChange={(value) => setActionPattern(String(value ?? ""))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="*">*</SelectItem>
                                    {actions.map((action) => (
                                        <SelectItem key={action.key} value={action.key}>
                                            {locale === "fa" ? action.labelFa : action.labelEn} · {action.key}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Effect</Label>
                            <Select value={effect} onValueChange={(value) => setEffect(String(value ?? ""))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {["allow", "deny", "require_approval", "require_step_up", "limit"].map((item) => (
                                        <SelectItem key={item} value={item}>
                                            {item}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="policy-reason">{tr(locale, "دلیل و مالک تصمیم", "Decision rationale")}</Label>
                            <Textarea id="policy-reason" name="reason" required rows={3} />
                        </div>
                        {create.error ? (
                            <p className="text-danger text-xs">
                                {tr(
                                    locale,
                                    "برای تغییر Policy یک Step-up تازه لازم است یا ورودی معتبر نیست.",
                                    "A fresh step-up is required or the policy input is invalid.",
                                )}
                            </p>
                        ) : null}
                        <Button className="w-full" disabled={create.isPending}>
                            <ShieldCheck className="size-4" />
                            {tr(locale, "ثبت نسخه غیرقابل‌ویرایش", "Append immutable version")}
                        </Button>
                    </form>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Business Constitution</CardTitle>
                </CardHeader>
                <CardContent>
                    {policies.length ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Policy</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Effect</TableHead>
                                    <TableHead>Version</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {policies.map((policy) => (
                                    <TableRow key={policy.id}>
                                        <TableCell>
                                            <div className="font-medium text-sm">{policy.name}</div>
                                            <code className="text-[11px] text-muted-foreground">{policy.policyKey}</code>
                                        </TableCell>
                                        <TableCell>
                                            <code className="text-xs">{policy.actionPattern}</code>
                                        </TableCell>
                                        <TableCell>
                                            <State value={policy.effect} />
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-xs">v{policy.version}</div>
                                            <div className="font-mono text-[10px] text-muted-foreground">
                                                {hash(policy.contentHash)}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <Empty>
                            {tr(
                                locale,
                                "هنوز Policy سفارشی ثبت نشده است؛ Action Registry guardrail پایه را نگه می‌دارد.",
                                "No custom policy yet; Action Registry baselines still apply.",
                            )}
                        </Empty>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Approvals({
    locale,
    approvals,
    actions,
}: {
    locale: Locale;
    approvals: GovernanceApproval[];
    actions: NonNullable<ReturnType<typeof useGovernanceRegistry>["data"]>["actions"];
}) {
    const create = useCreateApproval();
    const decide = useDecideApproval();
    const [actionKey, setActionKey] = useState(actions[0]?.key ?? "configuration.apply");
    const [workflowKind, setWorkflowKind] = useState("single");
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await create.mutateAsync({
            actionKey,
            resourceType: String(form.get("resourceType") || "") || null,
            resourceId: String(form.get("resourceId") || "") || null,
            reason: String(form.get("reason")),
            workflowKind,
            separationOfDuties: true,
            expiresInMinutes: 1440,
            payload: {},
        });
        event.currentTarget.reset();
    }
    return (
        <div className="grid gap-4 xl:grid-cols-[.75fr_1.25fr]">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{tr(locale, "درخواست تأیید جدید", "New approval request")}</CardTitle>
                </CardHeader>
                <CardContent>
                    <form className="space-y-3" onSubmit={submit}>
                        <div className="space-y-1.5">
                            <Label>Action</Label>
                            <Select value={actionKey} onValueChange={(value) => setActionKey(String(value ?? ""))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {actions.map((action) => (
                                        <SelectItem key={action.key} value={action.key}>
                                            {locale === "fa" ? action.labelFa : action.labelEn}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Input name="resourceType" placeholder="resource type" />
                            <Input name="resourceId" placeholder="resource id" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Workflow</Label>
                            <Select value={workflowKind} onValueChange={(value) => setWorkflowKind(String(value ?? ""))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="single">single</SelectItem>
                                    <SelectItem value="sequential">sequential</SelectItem>
                                    <SelectItem value="quorum">quorum</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Textarea
                            name="reason"
                            required
                            placeholder={tr(locale, "چرا این اقدام لازم است؟", "Why is this action necessary?")}
                        />
                        {create.error ? (
                            <p className="text-danger text-xs">
                                {tr(
                                    locale,
                                    "درخواست ثبت نشد؛ ورودی و مجوز را بررسی کنید.",
                                    "Request failed; check the input and permissions.",
                                )}
                            </p>
                        ) : null}
                        <Button className="w-full" disabled={create.isPending}>
                            <Users className="size-4" />
                            {tr(locale, "ارسال به Approval Center", "Send to Approval Center")}
                        </Button>
                    </form>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{tr(locale, "صف زنده تصمیم", "Live decision queue")}</CardTitle>
                </CardHeader>
                <CardContent>
                    {approvals.length ? (
                        <div className="space-y-3">
                            {approvals.map((item) => (
                                <div className="rounded-xl border p-4" key={item.id}>
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <code className="text-xs">{item.actionKey}</code>
                                                <State value={item.status} />
                                            </div>
                                            <code className="mt-1 block text-[10px] text-muted-foreground">{item.reference}</code>
                                        </div>
                                        <span className="text-muted-foreground text-xs">{date(item.expiresAt, locale)}</span>
                                    </div>
                                    <p className="mt-3 text-sm leading-6">{item.reason}</p>
                                    <div className="mt-3 flex flex-wrap gap-1">
                                        {item.steps.map((step) => (
                                            <Badge variant="outline" key={step.id}>
                                                {step.index + 1}. {step.label} · {step.status} · q{step.quorum}
                                            </Badge>
                                        ))}
                                    </div>
                                    {item.status === "pending" ? (
                                        <div className="mt-4 flex gap-2">
                                            <Button
                                                size="sm"
                                                disabled={decide.isPending}
                                                onClick={() =>
                                                    decide.mutate({
                                                        reference: item.reference,
                                                        decision: "approve",
                                                        reason: "Approved in Governance Center",
                                                    })
                                                }
                                            >
                                                <CheckCircle2 className="size-3.5" />
                                                {tr(locale, "تأیید", "Approve")}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                disabled={decide.isPending}
                                                onClick={() =>
                                                    decide.mutate({
                                                        reference: item.reference,
                                                        decision: "reject",
                                                        reason: "Rejected in Governance Center",
                                                    })
                                                }
                                            >
                                                <TriangleAlert className="size-3.5" />
                                                {tr(locale, "رد", "Reject")}
                                            </Button>
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty>{tr(locale, "درخواستی وجود ندارد.", "No approval requests.")}</Empty>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Agents({ locale, agents }: { locale: Locale; agents: NonNullable<ReturnType<typeof useGovernanceAgents>["data"]> }) {
    const create = useCreateAgent();
    const kill = useKillSwitch();
    const [autonomy, setAutonomy] = useState("1");
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await create.mutateAsync({
            principalKey: String(form.get("principalKey")),
            name: String(form.get("name")),
            autonomyLevel: Number(autonomy),
            allowedActions: String(form.get("allowedActions") || "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            prohibitedActions: ["governance.approval.break_glass"],
            dataAccessClasses: ["operational"],
            budgetLimitMinor: form.get("budget") ? Number(form.get("budget")) : null,
            budgetCurrency: "IRR",
            enabled: true,
        });
        event.currentTarget.reset();
    }
    return (
        <div className="grid gap-4 xl:grid-cols-[.7fr_1.3fr]">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{tr(locale, "تعریف Agent Principal", "Create agent principal")}</CardTitle>
                </CardHeader>
                <CardContent>
                    <form className="space-y-3" onSubmit={submit}>
                        <Input name="principalKey" required placeholder="seo-agent" />
                        <Input name="name" required placeholder={tr(locale, "نام نمایشی", "Display name")} />
                        <div className="space-y-1.5">
                            <Label>{tr(locale, "سطح خودکاری", "Autonomy level")}</Label>
                            <Select value={autonomy} onValueChange={(value) => setAutonomy(String(value ?? ""))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[0, 1, 2, 3, 4, 5].map((level) => (
                                        <SelectItem key={level} value={String(level)}>
                                            L{level}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Input name="allowedActions" required placeholder="seo.action.apply, content.publish" />
                        <Input
                            name="budget"
                            type="number"
                            min={0}
                            placeholder={tr(locale, "سقف بودجه minor units", "Budget limit in minor units")}
                        />
                        {create.error ? (
                            <p className="text-danger text-xs">
                                {tr(
                                    locale,
                                    "تعریف عامل به Step-up تازه نیاز دارد یا ورودی معتبر نیست.",
                                    "Creating an agent needs a fresh step-up or valid input.",
                                )}
                            </p>
                        ) : null}
                        <Button className="w-full" disabled={create.isPending}>
                            <Bot className="size-4" />
                            {tr(locale, "ساخت عامل محدودشده", "Create governed agent")}
                        </Button>
                    </form>
                </CardContent>
            </Card>
            <div className="grid gap-3 md:grid-cols-2">
                {agents.map((agent) => (
                    <Card key={agent.id} className={cn(agent.killSwitch && "border-danger/40 bg-danger/5")}>
                        <CardContent className="p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Bot className="size-4" />
                                        <span className="font-medium">{agent.name}</span>
                                    </div>
                                    <code className="mt-1 block text-[11px] text-muted-foreground">{agent.principalKey}</code>
                                </div>
                                <Badge variant={agent.killSwitch ? "destructive" : "outline"}>L{agent.autonomyLevel}</Badge>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-lg bg-muted/40 p-2">
                                    <span className="text-muted-foreground">Allowed</span>
                                    <div className="mt-1 font-medium">{number(agent.allowedActions.length, locale)}</div>
                                </div>
                                <div className="rounded-lg bg-muted/40 p-2">
                                    <span className="text-muted-foreground">Budget</span>
                                    <div className="mt-1 font-medium">
                                        {agent.budgetLimitMinor == null ? "∞" : number(agent.budgetLimitMinor, locale)}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1">
                                {agent.allowedActions.slice(0, 5).map((action) => (
                                    <Badge key={action} variant="secondary">
                                        {action}
                                    </Badge>
                                ))}
                            </div>
                            <Button
                                className="mt-4 w-full"
                                size="sm"
                                variant={agent.killSwitch ? "outline" : "destructive"}
                                disabled={kill.isPending}
                                onClick={() => kill.mutate({ id: agent.id, enabled: !agent.killSwitch })}
                            >
                                {agent.killSwitch ? <RefreshCw className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
                                {agent.killSwitch
                                    ? tr(locale, "آزادسازی Kill Switch", "Release kill switch")
                                    : tr(locale, "توقف اضطراری", "Emergency stop")}
                            </Button>
                            {kill.error ? (
                                <p className="mt-2 text-[11px] text-danger">
                                    {tr(
                                        locale,
                                        "Kill Switch به Step-up تازه نیاز دارد.",
                                        "Kill switch requires a fresh step-up.",
                                    )}
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                ))}
                {!agents.length ? (
                    <Empty>{tr(locale, "هنوز Agent Principal تعریف نشده.", "No agent principals yet.")}</Empty>
                ) : null}
            </div>
        </div>
    );
}

function Ledger({
    locale,
    entries,
    integrity,
}: {
    locale: Locale;
    entries: NonNullable<ReturnType<typeof useGovernanceLedger>["data"]>;
    integrity?: ReturnType<typeof useGovernanceOverview>["data"] extends infer T
        ? T extends { ledgerIntegrity: infer I }
            ? I
            : never
        : never;
}) {
    const verify = useVerifyLedger();
    return (
        <div className="space-y-4">
            <Card className={cn("border-2", integrity?.ok ? "border-success/30 bg-success/5" : "border-warning/40 bg-warning/5")}>
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        {integrity?.ok ? (
                            <CheckCircle2 className="mt-0.5 size-5 text-success" />
                        ) : (
                            <TriangleAlert className="mt-0.5 size-5 text-warning" />
                        )}
                        <div>
                            <div className="font-medium">
                                {integrity?.ok
                                    ? tr(locale, "زنجیره SHA-256 معتبر است", "SHA-256 chain is valid")
                                    : tr(locale, "زنجیره نیاز به اعتبارسنجی دارد", "Chain requires verification")}
                            </div>
                            <p className="mt-1 text-muted-foreground text-xs">
                                {tr(
                                    locale,
                                    "sequence و previous_hash تاریخچه هر tenant را به هم زنجیر می‌کند و رکوردهای Ledger در DB قابل ویرایش/حذف نیستند.",
                                    "Sequence and previous_hash chain each tenant history; ledger rows cannot be updated or deleted in the database.",
                                )}
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" disabled={verify.isPending} onClick={() => verify.mutate()}>
                        <Hash className="size-4" />
                        {tr(locale, "اعتبارسنجی کامل", "Verify full chain")}
                    </Button>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{tr(locale, "دفتر اقدام تغییرناپذیر", "Immutable action ledger")}</CardTitle>
                </CardHeader>
                <CardContent>
                    {entries.length ? (
                        <div>
                            {entries.map((entry) => (
                                <div
                                    key={entry.id}
                                    className="relative grid gap-3 border-s ps-6 pb-6 md:grid-cols-[5rem_1fr_auto]"
                                >
                                    <span className="absolute -start-[5px] top-1 size-2.5 rounded-full border-2 border-background bg-primary" />
                                    <div className="font-mono text-muted-foreground text-xs">#{entry.sequence}</div>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <code className="font-medium text-xs">{entry.actionKey}</code>
                                            <State value={entry.resultStatus} />
                                            <Badge variant="outline">{entry.actorType}</Badge>
                                        </div>
                                        <p className="mt-1 text-sm">{entry.reason}</p>
                                        <div className="mt-2 grid gap-1 font-mono text-[10px] text-muted-foreground sm:grid-cols-2">
                                            <span>prev {hash(entry.previousHash)}</span>
                                            <span>hash {hash(entry.entryHash)}</span>
                                        </div>
                                    </div>
                                    <div className="text-muted-foreground text-xs">{date(entry.occurredAt, locale)}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty>{tr(locale, "Ledger هنوز خالی است.", "The ledger is empty.")}</Empty>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Shadow({ locale, payload }: { locale: Locale; payload: ReturnType<typeof useGovernanceShadow>["data"] }) {
    const review = useReviewShadow();
    const observations = payload?.data ?? [];
    const readiness = payload?.readiness;
    const rate = (value = 0) => `${Math.round(value * 100)}%`;
    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                    label={tr(locale, "نمونه بررسی‌شده", "Reviewed samples")}
                    value={number(readiness?.reviewed ?? 0, locale)}
                    note={readiness?.criteriaVersion ?? "phase11.v1"}
                    icon={Activity}
                />
                <Metric
                    label={tr(locale, "هم‌راستایی انسانی", "Human agreement")}
                    value={rate(readiness?.agreementRate)}
                    note={tr(locale, "هدف ≥ 95٪", "target ≥ 95%")}
                    icon={Users}
                    tone={(readiness?.agreementRate ?? 0) >= 0.95 ? "good" : undefined}
                />
                <Metric
                    label={tr(locale, "نرخ شکست", "Failure rate")}
                    value={rate(readiness?.failureRate)}
                    note={tr(locale, "هدف ≤ 2٪", "target ≤ 2%")}
                    icon={TriangleAlert}
                    tone={(readiness?.failureRate ?? 1) <= 0.02 ? "good" : "warn"}
                />
                <Metric
                    label={tr(locale, "مرحله پیشنهادی", "Recommended stage")}
                    value={`L${readiness?.recommendedStage ?? 0}`}
                    note={
                        readiness?.eligible
                            ? tr(locale, "واجد شرایط بررسی ارتقا", "eligible for promotion review")
                            : tr(locale, "evidence کافی نیست", "insufficient evidence")
                    }
                    icon={Sparkles}
                />
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Shadow observations</CardTitle>
                </CardHeader>
                <CardContent>
                    {observations.length ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Stage</TableHead>
                                    <TableHead>{tr(locale, "تصمیم انسان", "Human")}</TableHead>
                                    <TableHead>Proposal hash</TableHead>
                                    <TableHead />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {observations.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <code className="text-xs">{item.actionKey}</code>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">L{item.autonomyStage}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            {item.humanDecision ? (
                                                <State value={item.humanDecision} />
                                            ) : (
                                                <Badge variant="secondary">pending</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-mono text-[10px]">{hash(item.proposalHash)}</TableCell>
                                        <TableCell>
                                            {!item.reviewedAt ? (
                                                <div className="flex gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={review.isPending}
                                                        onClick={() => review.mutate({ id: item.id, humanDecision: "approve" })}
                                                    >
                                                        {tr(locale, "تأیید", "Approve")}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={review.isPending}
                                                        onClick={() => review.mutate({ id: item.id, humanDecision: "reject" })}
                                                    >
                                                        {tr(locale, "رد", "Reject")}
                                                    </Button>
                                                </div>
                                            ) : null}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <Empty>
                            {tr(
                                locale,
                                "Agentها هنوز proposal در Shadow Mode ثبت نکرده‌اند.",
                                "Agents have not recorded shadow proposals yet.",
                            )}
                        </Empty>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
