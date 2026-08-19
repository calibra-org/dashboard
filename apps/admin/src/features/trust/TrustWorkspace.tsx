"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { PageHeader } from "#/components/PageHeader";
import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Progress } from "#/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Textarea } from "#/components/ui/textarea";
import {
    ArrowLeft,
    ChartNoAxesCombined,
    Link2,
    LockKeyhole,
    RefreshCw,
    Search as ScanSearch,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    UserCheck as UserRoundCheck,
} from "#/icons";
import { Link } from "#/lib/i18n/navigation";
import { useTrustMutation, useTrustPage, useTrustResource } from "#/lib/queries/trust";

export type TrustSection = "overview" | "cases" | "case-detail" | "graph" | "policies" | "signals" | "models";

type JsonRecord = Record<string, unknown>;

interface PageEnvelope<T> {
    data: T;
    meta?: { page?: number; limit?: number; total?: number; total_pages?: number };
}

interface TrustCase extends JsonRecord {
    public_id: string;
    title: string;
    pattern: string;
    subject_type: string;
    subject_id: string;
    order_id?: number | null;
    risk_score: number;
    risk_band: string;
    confidence_bp?: number | null;
    false_positive_risk_bp?: number | null;
    status: string;
    recommended_action?: string | null;
    assigned_to_user_id?: number | null;
    sla_due_at?: string | null;
    policy_key?: string | null;
    policy_version?: number | null;
    model_id?: string | null;
    model_version?: string | null;
    opened_at?: string | null;
    updated_at?: string | null;
    version: number;
    evidence?: TrustEvidence[];
    signals?: TrustSignal[];
    decisions?: JsonRecord[];
    actions?: JsonRecord[];
    outcomes?: JsonRecord[];
}

interface TrustEvidence extends JsonRecord {
    id?: number;
    evidence_type?: string;
    evidence_ref?: string | null;
    summary?: string | null;
    weight?: number | null;
    confidence_bp?: number | null;
    is_sensitive?: boolean;
    created_at?: string | null;
}

interface TrustSignal extends JsonRecord {
    public_id?: string;
    event_type?: string;
    source?: string;
    source_ref?: string | null;
    subject_type?: string;
    subject_id?: string;
    signal_type?: string;
    risk_band?: string;
    score_delta?: number;
    confidence_bp?: number;
    privacy_classification?: string;
    rule_key?: string | null;
    rule_version?: number | null;
    model_id?: string | null;
    model_version?: string | null;
    evidence?: JsonRecord;
    occurred_at?: string | null;
    received_at?: string | null;
}

interface OverviewData extends JsonRecord {
    kpis: {
        open_cases: number;
        high_or_severe_cases: number;
        decisions_30d: number;
        signals_30d: number;
        active_enforcements: number;
        prevented_loss_minor_30d: number | null;
        false_positive_rate_bp: number | null;
        outcome_coverage_bp: number | null;
    };
    recent_cases: TrustCase[];
    decision_distribution: Array<{ action: string; count: number }>;
    active_patterns: Array<{ signal_type: string; count: number; latest_at?: string | null }>;
    freshness: { generated_at: string; sources: string[] };
}

interface GraphNode extends JsonRecord {
    key: string;
    type: string;
    id: string;
}

interface GraphEdge extends JsonRecord {
    public_id?: string;
    source_type?: string;
    source_id?: string;
    target_type?: string;
    target_id?: string;
    relationship?: string;
    is_inferred?: boolean;
    confidence_bp?: number;
    provenance_type?: string | null;
    provenance_ref?: string | null;
    valid_from?: string | null;
    valid_to?: string | null;
}

interface GraphData extends JsonRecord {
    root?: { type: string; id: string } | null;
    depth?: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
    freshness?: { generated_at?: string };
}

interface AccessRow extends JsonRecord {
    id: number;
    identity: string;
    permissions: Record<string, boolean>;
}

interface ModelsData extends JsonRecord {
    models: ModelRow[];
    quality?: JsonRecord;
}

interface ModelRow extends JsonRecord {
    public_id: string;
    model_id: string;
    version: string;
    purpose: string;
    owner: string;
    status: string;
    rollout_percent: number;
    features?: string[];
    privacy_controls?: JsonRecord;
    evaluation?: JsonRecord;
    calibration?: JsonRecord;
    limitations?: string[];
    rollback_version?: string | null;
    created_at?: string | null;
}

function toneForStatus(value: unknown): StatusTone {
    const text = String(value ?? "").toLowerCase();
    if (
        ["trusted", "allow", "allowed", "resolved", "champion", "healthy", "verified", "completed"].some((token) =>
            text.includes(token),
        )
    )
        return "success";
    if (["severe", "block", "blocked", "failed", "danger", "critical"].some((token) => text.includes(token))) return "danger";
    if (
        ["high", "elevated", "hold", "held", "warning", "appealed", "waiting", "challenger"].some((token) => text.includes(token))
    )
        return "warning";
    if (["monitor", "review", "step_up", "active", "info"].some((token) => text.includes(token))) return "info";
    return "neutral";
}

function percentFromBp(value: unknown): string {
    const number = Number(value);
    return Number.isFinite(number) ? `${(number / 100).toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪` : "—";
}

function numberFa(value: unknown): string {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("fa-IR") : "—";
}

function moneyMinorFa(value: unknown): string {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return `${number.toLocaleString("fa-IR")} واحد خرد`;
}

function dateFa(value: unknown): string {
    if (!value) return "—";
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
        ? "—"
        : new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function safeJson(value: string, fallback: JsonRecord = {}): JsonRecord {
    try {
        const parsed = JSON.parse(value) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonRecord) : fallback;
    } catch {
        return fallback;
    }
}

function signalLabel(value: unknown): string {
    const key = String(value ?? "");
    const labels: Record<string, string> = {
        identity_velocity: "سرعت غیرعادی احراز هویت",
        coupon_farming: "سوءاستفاده انبوه از کد تخفیف",
        refund_velocity: "الگوی غیرعادی بازپرداخت",
        return_velocity: "الگوی غیرعادی مرجوعی",
        approved_agent: "عامل خرید تأییدشده",
        unknown_automation: "اتوماسیون ناشناخته",
        abusive_bot: "ربات مخرب",
        verification_budget: "عبور از سقف احراز هویت",
    };
    return labels[key] ?? key;
}

function subjectLabel(value: unknown): string {
    const key = String(value ?? "");
    const labels: Record<string, string> = {
        customer: "مشتری",
        customer_account: "حساب مشتری",
        account: "حساب",
        device: "دستگاه",
        session: "نشست",
        address: "نشانی",
        order: "سفارش",
        coupon: "کد تخفیف",
        refund: "بازپرداخت",
        return: "مرجوعی",
        ticket: "تیکت",
        phone: "شماره تماس",
        email: "ایمیل",
        ip: "شبکه/IP",
        automation: "اتوماسیون",
    };
    return labels[key] ?? key;
}

function InfoTitle({ title, help }: { title: string; help: string }) {
    return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
            <span>{title}</span>
            <HelperTooltip>{help}</HelperTooltip>
        </span>
    );
}

function EmptyState({ children }: { children: ReactNode }) {
    return <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">{children}</div>;
}

function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
    const t = useTranslations("Trust");
    const needsStepUp = /step.?up|E_IDENTITY_STEP_UP_REQUIRED/i.test(message);
    return (
        <Card tone="danger" title={t("errorTitle")}>
            <div className="space-y-3 text-sm">
                <p className="break-words">{needsStepUp ? t("stepUpRequired") : message}</p>
                <div className="flex flex-wrap gap-2">
                    {retry ? (
                        <Button type="button" variant="outline" onClick={retry}>
                            <RefreshCw className="size-4" aria-hidden="true" />
                            {t("retry")}
                        </Button>
                    ) : null}
                    {needsStepUp ? (
                        <Button asChild>
                            <Link href="/identity/step-up">
                                <LockKeyhole className="size-4" aria-hidden="true" />
                                {t("openStepUp")}
                            </Link>
                        </Button>
                    ) : null}
                </div>
            </div>
        </Card>
    );
}

function MetricCard({ label, help, value, tone }: { label: string; help: string; value: string; tone?: StatusTone }) {
    return (
        <Card title={<InfoTitle title={label} help={help} />} className="min-h-28 border-border/80 bg-card/95 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <strong className="font-semibold text-2xl tracking-tight tabular-nums">{value}</strong>
                {tone ? <StatusBadge tone={tone}>{label}</StatusBadge> : null}
            </div>
        </Card>
    );
}

function SectionCard({
    title,
    help,
    children,
    action,
}: {
    title: string;
    help: string;
    children: ReactNode;
    action?: ReactNode;
}) {
    return (
        <Card title={<InfoTitle title={title} help={help} />} action={action} className="border-border/80 shadow-sm">
            {children}
        </Card>
    );
}

function RiskBadge({ band }: { band: string }) {
    const t = useTranslations("Trust");
    const key = `risk.${band}` as Parameters<typeof t>[0];
    return <StatusBadge tone={toneForStatus(band)}>{t(key)}</StatusBadge>;
}

function StatusLabel({ value }: { value: string }) {
    const t = useTranslations("Trust");
    const key = `status.${value}` as Parameters<typeof t>[0];
    let label = value;
    try {
        label = t(key);
    } catch {
        label = value;
    }
    return <StatusBadge tone={toneForStatus(value)}>{label}</StatusBadge>;
}

function WorkspaceShell({
    section,
    primaryAction,
    children,
}: {
    section: TrustSection;
    primaryAction?: ReactNode;
    children: ReactNode;
}) {
    const t = useTranslations("Trust");
    const titleKey = section === "case-detail" ? "sections.caseDetail.title" : `sections.${section}.title`;
    const subtitleKey = section === "case-detail" ? "sections.caseDetail.subtitle" : `sections.${section}.subtitle`;
    return (
        <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-5 px-4 py-5 sm:px-5 lg:px-7 lg:py-6">
            <PageHeader
                title={t(titleKey as Parameters<typeof t>[0])}
                subtitle={t(subtitleKey as Parameters<typeof t>[0])}
                actions={primaryAction}
            />
            <div className="flex items-start gap-2 rounded-lg border border-info/25 bg-info/8 px-4 py-3 text-sm leading-6">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
                <div className="min-w-0">
                    <InfoTitle title={t("eyebrow")} help={t("help.workspace")} />
                    <p className="mt-1 text-muted-foreground">{t("help.workspace")}</p>
                </div>
            </div>
            {children}
        </div>
    );
}

function Overview() {
    const t = useTranslations("Trust");
    const query = useTrustResource<OverviewData>("overview");
    const scan = useTrustMutation<{ path: string }, JsonRecord>("POST");

    if (query.isError)
        return (
            <WorkspaceShell section="overview">
                <ErrorState message={query.error.message} retry={() => query.refetch()} />
            </WorkspaceShell>
        );
    const data = query.data;
    const k = data?.kpis;
    return (
        <WorkspaceShell
            section="overview"
            primaryAction={
                <Button type="button" onClick={() => scan.mutate({ path: "scan" })} isLoading={scan.isPending}>
                    <ScanSearch className="size-4" aria-hidden="true" />
                    {t("runScan")}
                </Button>
            }
        >
            {scan.isError ? <ErrorState message={scan.error.message} /> : null}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    label={t("metrics.openCases")}
                    help={t("help.openCases")}
                    value={query.isLoading ? "…" : numberFa(k?.open_cases)}
                />
                <MetricCard
                    label={t("metrics.highCases")}
                    help={t("help.highCases")}
                    value={query.isLoading ? "…" : numberFa(k?.high_or_severe_cases)}
                    tone="warning"
                />
                <MetricCard
                    label={t("metrics.decisions30d")}
                    help={t("help.decisions")}
                    value={query.isLoading ? "…" : numberFa(k?.decisions_30d)}
                />
                <MetricCard
                    label={t("metrics.signals30d")}
                    help={t("help.signals")}
                    value={query.isLoading ? "…" : numberFa(k?.signals_30d)}
                />
                <MetricCard
                    label={t("metrics.activeEnforcement")}
                    help={t("help.activeEnforcement")}
                    value={query.isLoading ? "…" : numberFa(k?.active_enforcements)}
                    tone="info"
                />
                <MetricCard
                    label={t("metrics.preventedLoss")}
                    help={t("help.preventedLoss")}
                    value={query.isLoading ? "…" : moneyMinorFa(k?.prevented_loss_minor_30d)}
                />
                <MetricCard
                    label={t("metrics.falsePositive")}
                    help={t("help.falsePositive")}
                    value={query.isLoading ? "…" : percentFromBp(k?.false_positive_rate_bp)}
                />
                <MetricCard
                    label={t("metrics.outcomeCoverage")}
                    help={t("help.outcomeCoverage")}
                    value={query.isLoading ? "…" : percentFromBp(k?.outcome_coverage_bp)}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.85fr)]">
                <SectionCard title={t("blocks.attention")} help={t("help.attention")}>
                    {query.isLoading ? (
                        <EmptyState>{t("loading")}</EmptyState>
                    ) : !data?.recent_cases?.length ? (
                        <EmptyState>{t("empty")}</EmptyState>
                    ) : (
                        <div className="space-y-2">
                            {data.recent_cases.map((row) => (
                                <div
                                    key={row.public_id}
                                    className="flex flex-col gap-3 rounded-lg border border-border/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <RiskBadge band={row.risk_band} />
                                            <span className="truncate font-medium text-sm">{row.title}</span>
                                        </div>
                                        <div className="text-muted-foreground text-xs">
                                            {subjectLabel(row.subject_type)}: {row.subject_id} · {t("fields.riskBand")}{" "}
                                            {numberFa(row.risk_score)} · {dateFa(row.updated_at)}
                                        </div>
                                    </div>
                                    <Button asChild variant="outline" size="sm">
                                        <Link href={`/quality-trust/cases/${row.public_id}` as never}>
                                            {t("actions.viewCase")}
                                            <ArrowLeft className="size-3.5" aria-hidden="true" />
                                        </Link>
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>

                <div className="grid gap-4">
                    <SectionCard title={t("blocks.distribution")} help={t("help.distribution")}>
                        <div className="space-y-3">
                            {(data?.decision_distribution ?? []).map((row) => {
                                const total = (data?.decision_distribution ?? []).reduce((sum, item) => sum + item.count, 0);
                                const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
                                return (
                                    <div key={row.action} className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-2 text-xs">
                                            <span>{t(`actions.${row.action}` as Parameters<typeof t>[0])}</span>
                                            <span className="tabular-nums">
                                                {numberFa(row.count)} · {numberFa(pct)}٪
                                            </span>
                                        </div>
                                        <Progress
                                            value={pct}
                                            tone={
                                                toneForStatus(row.action) === "danger"
                                                    ? "danger"
                                                    : toneForStatus(row.action) === "warning"
                                                      ? "warning"
                                                      : "info"
                                            }
                                        />
                                    </div>
                                );
                            })}
                            {!data?.decision_distribution?.length && !query.isLoading ? (
                                <EmptyState>{t("empty")}</EmptyState>
                            ) : null}
                        </div>
                    </SectionCard>
                    <SectionCard title={t("blocks.patterns")} help={t("help.patterns")}>
                        <div className="space-y-2">
                            {(data?.active_patterns ?? []).map((row) => (
                                <div
                                    key={row.signal_type}
                                    className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm"
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate">{signalLabel(row.signal_type)}</span>
                                        <span className="block truncate text-muted-foreground text-[11px]" dir="ltr">
                                            {row.signal_type}
                                        </span>
                                    </span>
                                    <span className="font-medium tabular-nums">{numberFa(row.count)}</span>
                                </div>
                            ))}
                            {!data?.active_patterns?.length && !query.isLoading ? <EmptyState>{t("empty")}</EmptyState> : null}
                        </div>
                    </SectionCard>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title={t("blocks.friction")} help={t("help.friction")}>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {[
                            ["trusted", "allow"],
                            ["low", "monitor"],
                            ["medium", "monitor"],
                            ["elevated", "step_up"],
                            ["high", "hold"],
                            ["severe", "block"],
                        ].map(([band, action]) => (
                            <div key={band} className="rounded-lg border border-border/80 p-3">
                                <RiskBadge band={band} />
                                <div className="mt-2 text-muted-foreground text-xs">
                                    → {t(`actions.${action}` as Parameters<typeof t>[0])}
                                </div>
                            </div>
                        ))}
                    </div>
                </SectionCard>
                <SectionCard title={t("blocks.freshness")} help={t("help.freshness")}>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">زمان تولید نما</span>
                            <span className="text-end tabular-nums">{dateFa(data?.freshness.generated_at)}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {(data?.freshness.sources ?? []).map((source) => (
                                <StatusBadge key={source} tone="neutral">
                                    {source}
                                </StatusBadge>
                            ))}
                        </div>
                    </div>
                </SectionCard>
            </div>
        </WorkspaceShell>
    );
}

function Cases() {
    const t = useTranslations("Trust");
    const [q, setQ] = useState("");
    const [riskBand, setRiskBand] = useState("all");
    const path = `cases?limit=50${q ? `&q=${encodeURIComponent(q)}` : ""}${riskBand !== "all" ? `&risk_band=${encodeURIComponent(riskBand)}` : ""}`;
    const query = useTrustPage<TrustCase[]>(path);
    const rows = query.data?.data ?? [];
    return (
        <WorkspaceShell
            section="cases"
            primaryAction={
                <Button variant="outline" onClick={() => query.refetch()}>
                    <RefreshCw className="size-4" aria-hidden="true" />
                    {t("refresh")}
                </Button>
            }
        >
            <SectionCard title={t("blocks.caseQueue")} help={t("help.caseQueue")}>
                <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
                    <div className="space-y-1.5">
                        <Label htmlFor="trust-case-search">{t("fields.search")}</Label>
                        <Input
                            id="trust-case-search"
                            value={q}
                            onChange={(event) => setQ(event.target.value)}
                            placeholder="شناسه، عنوان یا موضوع"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>
                            <InfoTitle title={t("fields.riskBand")} help={t("help.riskScore")} />
                        </Label>
                        <Select value={riskBand} onValueChange={(value) => setRiskBand(String(value ?? "all"))}>
                            <SelectTrigger>
                                <SelectValue placeholder="همهٔ سطوح" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">همهٔ سطوح</SelectItem>
                                {["trusted", "low", "medium", "elevated", "high", "severe"].map((band) => (
                                    <SelectItem key={band} value={band}>
                                        {t(`risk.${band}` as Parameters<typeof t>[0])}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                {query.isError ? (
                    <ErrorState message={query.error.message} retry={() => query.refetch()} />
                ) : query.isLoading ? (
                    <EmptyState>{t("loading")}</EmptyState>
                ) : rows.length === 0 ? (
                    <EmptyState>{t("empty")}</EmptyState>
                ) : (
                    <>
                        <div className="hidden overflow-x-auto md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>پرونده</TableHead>
                                        <TableHead>{t("fields.subject")}</TableHead>
                                        <TableHead>
                                            <InfoTitle title={t("fields.riskBand")} help={t("help.riskScore")} />
                                        </TableHead>
                                        <TableHead>{t("fields.recommended")}</TableHead>
                                        <TableHead>{t("fields.owner")}</TableHead>
                                        <TableHead>{t("fields.status")}</TableHead>
                                        <TableHead className="text-end">عملیات</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((row) => (
                                        <TableRow key={row.public_id}>
                                            <TableCell>
                                                <div className="font-medium">{row.title}</div>
                                                <div className="text-muted-foreground text-xs">{row.public_id}</div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs">
                                                    {subjectLabel(row.subject_type)}: {row.subject_id}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <RiskBadge band={row.risk_band} />
                                                    <span className="tabular-nums">{numberFa(row.risk_score)}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {row.recommended_action ? (
                                                    <StatusBadge tone={toneForStatus(row.recommended_action)}>
                                                        {row.recommended_action}
                                                    </StatusBadge>
                                                ) : (
                                                    "—"
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {row.assigned_to_user_id ? `#${numberFa(row.assigned_to_user_id)}` : "—"}
                                            </TableCell>
                                            <TableCell>
                                                <StatusLabel value={row.status} />
                                            </TableCell>
                                            <TableCell className="text-end">
                                                <Button asChild size="sm" variant="outline">
                                                    <Link href={`/quality-trust/cases/${row.public_id}` as never}>
                                                        {t("actions.open")}
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="grid gap-3 md:hidden">
                            {rows.map((row) => (
                                <Card key={row.public_id}>
                                    <div className="space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-medium text-sm">{row.title}</div>
                                                <div className="truncate text-muted-foreground text-xs">{row.public_id}</div>
                                            </div>
                                            <RiskBadge band={row.risk_band} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <span className="text-muted-foreground">{t("fields.subject")}</span>
                                            <span className="text-end">
                                                {subjectLabel(row.subject_type)}: {row.subject_id}
                                            </span>
                                            <span className="text-muted-foreground">{t("fields.status")}</span>
                                            <span className="text-end">
                                                <StatusLabel value={row.status} />
                                            </span>
                                        </div>
                                        <Button asChild className="w-full" variant="outline">
                                            <Link href={`/quality-trust/cases/${row.public_id}` as never}>
                                                {t("actions.viewCase")}
                                            </Link>
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </>
                )}
            </SectionCard>
        </WorkspaceShell>
    );
}

function CaseDetail({ publicId }: { publicId: string }) {
    const t = useTranslations("Trust");
    const query = useTrustResource<TrustCase>(`cases/${publicId}`);
    const access = useTrustResource<AccessRow[]>("access");
    const assign = useTrustMutation<{ path: string; body: unknown }, TrustCase>("POST");
    const decide = useTrustMutation<{ path: string; body: unknown }, JsonRecord>("POST");
    const appeal = useTrustMutation<{ path: string; body: unknown }, TrustCase>("POST");
    const outcome = useTrustMutation<{ path: string; body: unknown }, JsonRecord>("POST");
    const [assignmentReason, setAssignmentReason] = useState("");
    const [decisionReason, setDecisionReason] = useState("");
    const [outcomeNotes, setOutcomeNotes] = useState("");
    const [reasonCode, setReasonCode] = useState("manual_review");
    const [action, setAction] = useState("monitor");
    const [override, setOverride] = useState(false);
    const [assignee, setAssignee] = useState("");
    const [outcomeValue, setOutcomeValue] = useState("confirmed_abuse");
    const [falsePositive, setFalsePositive] = useState(false);
    const [measurementConfidence, setMeasurementConfidence] = useState("8000");
    const [actualLossMinor, setActualLossMinor] = useState("");
    const [preventedLossMinor, setPreventedLossMinor] = useState("");
    const [finalAssessment, setFinalAssessment] = useState("");
    const row = query.data;

    const submitDecision = () => {
        if (!row) return;
        decide.mutate({
            path: `cases/${row.public_id}/${override ? "override" : "decision"}`,
            body: {
                action,
                reason_code: reasonCode,
                reason: decisionReason,
                expected_version: row.version,
                idempotency_key: crypto.randomUUID(),
            },
        });
    };

    const mutationError = assign.error ?? decide.error ?? appeal.error ?? outcome.error;
    return (
        <WorkspaceShell
            section="case-detail"
            primaryAction={
                <Button asChild variant="outline">
                    <Link href="/quality-trust/cases">
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        بازگشت به صف پرونده‌ها
                    </Link>
                </Button>
            }
        >
            {query.isError ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
            {mutationError ? <ErrorState message={mutationError.message} /> : null}
            {query.isLoading ? (
                <EmptyState>{t("loading")}</EmptyState>
            ) : row ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <MetricCard
                            label={t("fields.riskBand")}
                            help={t("help.riskScore")}
                            value={`${numberFa(row.risk_score)} / ۱۰۰`}
                            tone={toneForStatus(row.risk_band)}
                        />
                        <MetricCard
                            label={t("fields.confidence")}
                            help={t("help.confidence")}
                            value={percentFromBp(row.confidence_bp)}
                        />
                        <MetricCard
                            label={t("fields.falsePositive")}
                            help={t("help.falsePositiveRisk")}
                            value={percentFromBp(row.false_positive_risk_bp)}
                        />
                        <MetricCard
                            label={t("fields.status")}
                            help={t("help.caseQueue")}
                            value={t(`status.${row.status}` as Parameters<typeof t>[0])}
                        />
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,0.8fr)]">
                        <div className="space-y-4">
                            <SectionCard title={t("blocks.evidence")} help={t("help.evidence")}>
                                <div className="space-y-2">
                                    {(row.evidence ?? []).map((item, index) => (
                                        <div key={String(item.id ?? index)} className="rounded-lg border border-border/80 p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="font-medium text-sm">
                                                    {signalLabel(item.evidence_type ?? "evidence")}
                                                </span>
                                                {item.is_sensitive ? (
                                                    <StatusBadge tone="warning">حساس</StatusBadge>
                                                ) : (
                                                    <StatusBadge tone="neutral">قابل مشاهده</StatusBadge>
                                                )}
                                            </div>
                                            <p className="mt-2 text-muted-foreground text-sm leading-6">
                                                {String(item.summary ?? "—")}
                                            </p>
                                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                                <span>وزن اثر: {numberFa(item.weight)}</span>
                                                {item.evidence_ref ? (
                                                    <span className="break-all">مرجع: {item.evidence_ref}</span>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                    {!(row.evidence ?? []).length ? <EmptyState>{t("empty")}</EmptyState> : null}
                                </div>
                            </SectionCard>
                            <SectionCard title={t("blocks.timeline")} help={t("help.decision")}>
                                <div className="space-y-2">
                                    {[
                                        ...(row.decisions ?? []).map((item) => ({ kind: "تصمیم", item })),
                                        ...(row.actions ?? []).map((item) => ({ kind: "اقدام", item })),
                                    ]
                                        .sort((a, b) =>
                                            String((b.item as JsonRecord).created_at ?? "").localeCompare(
                                                String((a.item as JsonRecord).created_at ?? ""),
                                            ),
                                        )
                                        .map((entry, index) => (
                                            <div
                                                key={`${entry.kind}-${index}`}
                                                className="grid gap-2 rounded-lg border border-border/80 p-3 sm:grid-cols-[7rem_1fr_auto] sm:items-center"
                                            >
                                                <StatusBadge tone={entry.kind === "اقدام" ? "info" : "neutral"}>
                                                    {entry.kind}
                                                </StatusBadge>
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm">
                                                        {String(
                                                            entry.item.action ??
                                                                entry.item.action_type ??
                                                                entry.item.reason_code ??
                                                                "—",
                                                        )}
                                                    </div>
                                                    <div className="truncate text-muted-foreground text-xs">
                                                        {String(entry.item.reason ?? entry.item.status ?? "")}
                                                    </div>
                                                </div>
                                                <span className="text-muted-foreground text-xs tabular-nums">
                                                    {dateFa(entry.item.created_at)}
                                                </span>
                                            </div>
                                        ))}
                                    {!(row.decisions ?? []).length && !(row.actions ?? []).length ? (
                                        <EmptyState>{t("empty")}</EmptyState>
                                    ) : null}
                                </div>
                            </SectionCard>
                        </div>

                        <div className="space-y-4">
                            <SectionCard title={t("blocks.assignment")} help={t("help.access")}>
                                <div className="space-y-3">
                                    <Select value={assignee} onValueChange={(value) => setAssignee(String(value ?? ""))}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="انتخاب Reviewer" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(access.data ?? []).map((user) => (
                                                <SelectItem key={user.id} value={String(user.id)}>
                                                    {user.identity}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        value={assignmentReason}
                                        onChange={(event) => setAssignmentReason(event.target.value)}
                                        placeholder="دلیل واگذاری پرونده"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full"
                                        disabled={!assignee || assignmentReason.trim().length < 4 || assign.isPending}
                                        isLoading={assign.isPending}
                                        onClick={() =>
                                            assign.mutate({
                                                path: `cases/${row.public_id}/assign`,
                                                body: {
                                                    assignee_user_id: Number(assignee),
                                                    expected_version: row.version,
                                                    reason: assignmentReason,
                                                },
                                            })
                                        }
                                    >
                                        <UserRoundCheck className="size-4" aria-hidden="true" />
                                        {t("actions.assign")}
                                    </Button>
                                </div>
                            </SectionCard>

                            <SectionCard title={t("blocks.review")} help={override ? t("help.override") : t("help.decision")}>
                                <div className="space-y-3">
                                    <Label>
                                        <InfoTitle title={t("fields.action")} help={t("help.friction")} />
                                    </Label>
                                    <Select value={action} onValueChange={(value) => setAction(String(value ?? "monitor"))}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {["allow", "monitor", "step_up", "hold", "block", "dismiss"].map((value) => (
                                                <SelectItem key={value} value={value}>
                                                    {t(`actions.${value}` as Parameters<typeof t>[0])}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        value={reasonCode}
                                        onChange={(event) => setReasonCode(event.target.value)}
                                        placeholder={t("fields.reasonCode")}
                                        dir="ltr"
                                    />
                                    <Textarea
                                        value={decisionReason}
                                        onChange={(event) => setDecisionReason(event.target.value)}
                                        placeholder="دلیل مستند Reviewer؛ حداقل ۸ نویسه"
                                    />
                                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 p-3">
                                        <div>
                                            <InfoTitle title={t("actions.override")} help={t("help.override")} />
                                            <p className="mt-1 text-muted-foreground text-xs">
                                                نیازمند دسترسی ویژه و Step-up تازه است.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={override}
                                            onCheckedChange={setOverride}
                                            aria-label={t("actions.override")}
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        className="w-full"
                                        tone={["block"].includes(action) ? "danger" : undefined}
                                        disabled={decisionReason.trim().length < 8 || decide.isPending}
                                        isLoading={decide.isPending}
                                        onClick={submitDecision}
                                    >
                                        <ShieldAlert className="size-4" aria-hidden="true" />
                                        {override ? t("actions.override") : t(`actions.${action}` as Parameters<typeof t>[0])}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full"
                                        disabled={decisionReason.trim().length < 8 || appeal.isPending}
                                        isLoading={appeal.isPending}
                                        onClick={() =>
                                            appeal.mutate({
                                                path: `cases/${row.public_id}/appeal`,
                                                body: { reason: decisionReason, expected_version: row.version },
                                            })
                                        }
                                    >
                                        {t("actions.appeal")}
                                    </Button>
                                </div>
                            </SectionCard>

                            <SectionCard title={t("blocks.outcome")} help={t("help.outcome")}>
                                <div className="space-y-3">
                                    <Input
                                        value={outcomeValue}
                                        onChange={(event) => setOutcomeValue(event.target.value)}
                                        placeholder={t("fields.outcome")}
                                        dir="ltr"
                                    />
                                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 p-3">
                                        <InfoTitle title={t("fields.falsePositive")} help={t("help.falsePositive")} />
                                        <Switch
                                            checked={falsePositive}
                                            onCheckedChange={setFalsePositive}
                                            aria-label={t("fields.falsePositive")}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input
                                            type="number"
                                            min="0"
                                            value={actualLossMinor}
                                            onChange={(event) => setActualLossMinor(event.target.value)}
                                            placeholder="زیان واقعی (واحد خرد)"
                                        />
                                        <Input
                                            type="number"
                                            min="0"
                                            value={preventedLossMinor}
                                            onChange={(event) => setPreventedLossMinor(event.target.value)}
                                            placeholder="زیان جلوگیری‌شده"
                                        />
                                    </div>
                                    <Input
                                        value={finalAssessment}
                                        onChange={(event) => setFinalAssessment(event.target.value)}
                                        placeholder="ارزیابی نهایی"
                                    />
                                    <Textarea
                                        value={outcomeNotes}
                                        onChange={(event) => setOutcomeNotes(event.target.value)}
                                        placeholder="یادداشت نتیجه و شواهد پس از بررسی"
                                    />
                                    <Input
                                        type="number"
                                        min="0"
                                        max="10000"
                                        value={measurementConfidence}
                                        onChange={(event) => setMeasurementConfidence(event.target.value)}
                                        placeholder="Confidence (basis points)"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full"
                                        isLoading={outcome.isPending}
                                        disabled={!outcomeValue}
                                        onClick={() =>
                                            outcome.mutate({
                                                path: `cases/${row.public_id}/outcome`,
                                                body: {
                                                    outcome: outcomeValue,
                                                    is_false_positive: falsePositive,
                                                    actual_loss_minor: actualLossMinor ? Number(actualLossMinor) : null,
                                                    prevented_loss_minor: preventedLossMinor ? Number(preventedLossMinor) : null,
                                                    final_assessment: finalAssessment || null,
                                                    measurement_confidence_bp: Number(measurementConfidence),
                                                    notes: outcomeNotes || null,
                                                },
                                            })
                                        }
                                    >
                                        {t("actions.recordOutcome")}
                                    </Button>
                                </div>
                            </SectionCard>
                        </div>
                    </div>
                </>
            ) : null}
        </WorkspaceShell>
    );
}

function Graph() {
    const t = useTranslations("Trust");
    const [subjectType, setSubjectType] = useState("customer");
    const [subjectId, setSubjectId] = useState("");
    const [depth, setDepth] = useState("1");
    const enabled = subjectId.trim().length > 0;
    const query = useTrustResource<GraphData>(
        `graph?subject_type=${encodeURIComponent(subjectType)}&subject_id=${encodeURIComponent(subjectId)}&depth=${depth}`,
        enabled,
    );
    const nodeMap = useMemo(() => new Map((query.data?.nodes ?? []).map((node) => [node.key, node])), [query.data?.nodes]);
    return (
        <WorkspaceShell
            section="graph"
            primaryAction={
                <Button variant="outline" onClick={() => query.refetch()} disabled={!enabled}>
                    <RefreshCw className="size-4" aria-hidden="true" />
                    {t("refresh")}
                </Button>
            }
        >
            <SectionCard title={t("blocks.graph")} help={t("help.graph")}>
                <div className="mb-4 grid gap-3 md:grid-cols-[12rem_minmax(0,1fr)_9rem]">
                    <div className="space-y-1.5">
                        <Label>{t("fields.subjectType")}</Label>
                        <Input value={subjectType} onChange={(event) => setSubjectType(event.target.value)} dir="ltr" />
                    </div>
                    <div className="space-y-1.5">
                        <Label>{t("fields.subjectId")}</Label>
                        <Input
                            value={subjectId}
                            onChange={(event) => setSubjectId(event.target.value)}
                            dir="ltr"
                            placeholder="14812"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>
                            <InfoTitle title={t("fields.depth")} help={t("help.graphDepth")} />
                        </Label>
                        <Select value={depth} onValueChange={(value) => setDepth(String(value ?? "1"))}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[1, 2, 3].map((item) => (
                                    <SelectItem key={item} value={String(item)}>
                                        {numberFa(item)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                {!enabled ? (
                    <EmptyState>برای نمایش گراف، نوع و شناسهٔ موجودیت را وارد کنید.</EmptyState>
                ) : query.isError ? (
                    <ErrorState message={query.error.message} retry={() => query.refetch()} />
                ) : query.isLoading ? (
                    <EmptyState>{t("loading")}</EmptyState>
                ) : !(query.data?.edges ?? []).length ? (
                    <EmptyState>{t("empty")}</EmptyState>
                ) : (
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
                        <div className="space-y-2">
                            {(query.data?.edges ?? []).map((edge, index) => {
                                const sourceKey = `${edge.source_type}:${edge.source_id}`;
                                const targetKey = `${edge.target_type}:${edge.target_id}`;
                                return (
                                    <div key={edge.public_id ?? index} className="rounded-lg border border-border/80 p-3">
                                        <div className="flex flex-wrap items-center gap-2 text-sm">
                                            <StatusBadge tone={edge.is_inferred ? "warning" : "success"}>
                                                {edge.is_inferred ? "استنباطی" : "تأییدشده"}
                                            </StatusBadge>
                                            <span>
                                                {nodeMap.get(sourceKey)?.type ?? edge.source_type}:{edge.source_id}
                                            </span>
                                            <Link2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                                            <span>
                                                {nodeMap.get(targetKey)?.type ?? edge.target_type}:{edge.target_id}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-3 text-muted-foreground text-xs">
                                            <span>{edge.relationship}</span>
                                            <span>اطمینان: {percentFromBp(edge.confidence_bp)}</span>
                                            <span>{dateFa(edge.valid_from)}</span>
                                            <span>
                                                {edge.provenance_type ?? "—"}
                                                {edge.provenance_ref ? ` · ${edge.provenance_ref}` : ""}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <SectionCard title={t("blocks.relationship")} help={t("help.graph")}>
                            <div className="space-y-3 text-sm">
                                <p>تعداد گره‌ها: {numberFa(query.data?.nodes.length)}</p>
                                <p>تعداد رابطه‌ها: {numberFa(query.data?.edges.length)}</p>
                                <p>عمق اعمال‌شده: {numberFa(query.data?.depth)}</p>
                                <p className="text-muted-foreground text-xs">
                                    هر رابطه همراه با منشأ (provenance) و میزان اطمینان ذخیره می‌شود؛ علامت «استنباطی» هرگز معادل
                                    حقیقت تأییدشده نیست.
                                </p>
                            </div>
                        </SectionCard>
                    </div>
                )}
            </SectionCard>
        </WorkspaceShell>
    );
}

function Policies() {
    const t = useTranslations("Trust");
    const policies = useTrustResource<JsonRecord[]>("policies");
    const access = useTrustResource<AccessRow[]>("access");
    const create = useTrustMutation<{ path: string; body: unknown }, JsonRecord>("POST");
    const simulate = useTrustMutation<{ path: string; body: unknown }, JsonRecord>("POST");
    const preset = useTrustMutation<{ path: string; body: unknown }, JsonRecord>("POST");
    const [policyKey, setPolicyKey] = useState("promotion_abuse_severe");
    const [policyStatus, setPolicyStatus] = useState("draft");
    const [effect, setEffect] = useState("hold");
    const [scopeJson, setScopeJson] = useState('{"surface":"commerce"}');
    const [conditionsJson, setConditionsJson] = useState('[{"field":"risk_score","operator":"gte","value":90}]');
    const [policyReason, setPolicyReason] = useState("");
    const [accessReason, setAccessReason] = useState("");
    const [approvalRequired, setApprovalRequired] = useState(true);
    const [context, setContext] = useState('{"risk_score":93,"signal_type":"coupon_farming"}');
    const [selectedUser, setSelectedUser] = useState("");
    const [selectedPreset, setSelectedPreset] = useState("reviewer");
    const simResult = simulate.data?.data as JsonRecord | undefined;
    return (
        <WorkspaceShell
            section="policies"
            primaryAction={
                <Button
                    type="button"
                    onClick={() =>
                        create.mutate({
                            path: "policies",
                            body: {
                                policy_key: policyKey,
                                status: policyStatus,
                                scope: safeJson(scopeJson),
                                conditions: (() => {
                                    try {
                                        const parsed = JSON.parse(conditionsJson) as unknown;
                                        return Array.isArray(parsed) ? parsed : [];
                                    } catch {
                                        return [];
                                    }
                                })(),
                                effect,
                                approval_required: approvalRequired,
                                reason: policyReason,
                            },
                        })
                    }
                    isLoading={create.isPending}
                    disabled={policyReason.trim().length < 8}
                >
                    <SlidersHorizontal className="size-4" aria-hidden="true" />
                    {t("actions.createPolicy")}
                </Button>
            }
        >
            {create.isError ? <ErrorState message={create.error.message} /> : null}
            {simulate.isError ? <ErrorState message={simulate.error.message} /> : null}
            {preset.isError ? <ErrorState message={preset.error.message} /> : null}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
                <SectionCard title={t("blocks.policies")} help={t("help.policy")}>
                    {policies.isError ? (
                        <ErrorState message={policies.error.message} retry={() => policies.refetch()} />
                    ) : policies.isLoading ? (
                        <EmptyState>{t("loading")}</EmptyState>
                    ) : !(policies.data ?? []).length ? (
                        <EmptyState>{t("notConfigured")}</EmptyState>
                    ) : (
                        <div className="space-y-2">
                            {(policies.data ?? []).map((row, index) => (
                                <div key={String(row.public_id ?? index)} className="rounded-lg border border-border/80 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <div className="font-medium text-sm">{String(row.policy_key)}</div>
                                            <div className="text-muted-foreground text-xs">
                                                v{String(row.version)} · {String(row.effect)}
                                            </div>
                                        </div>
                                        <StatusLabel value={String(row.status)} />
                                    </div>
                                    <div className="mt-2 text-muted-foreground text-xs">
                                        نیاز به تأیید: {row.approval_required ? "بله" : "خیر"} · {dateFa(row.created_at)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>
                <SectionCard title={t("blocks.newPolicy")} help={t("help.policy")}>
                    <div className="space-y-3">
                        <Input
                            value={policyKey}
                            onChange={(event) => setPolicyKey(event.target.value)}
                            placeholder={t("fields.policyKey")}
                            dir="ltr"
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <Select value={policyStatus} onValueChange={(value) => setPolicyStatus(String(value))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="draft">{t("status.draft")}</SelectItem>
                                    <SelectItem value="active">{t("status.active")}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={effect} onValueChange={(value) => setEffect(String(value))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {["allow", "monitor", "step_up", "hold", "block"].map((value) => (
                                        <SelectItem key={value} value={value}>
                                            {t(`actions.${value}` as Parameters<typeof t>[0])}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>
                                <InfoTitle title={t("fields.scope")} help={t("help.policy")} />
                            </Label>
                            <Textarea
                                value={scopeJson}
                                onChange={(event) => setScopeJson(event.target.value)}
                                dir="ltr"
                                className="min-h-20 font-mono text-xs"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>
                                <InfoTitle title={t("fields.conditions")} help={t("help.policySimulation")} />
                            </Label>
                            <Textarea
                                value={conditionsJson}
                                onChange={(event) => setConditionsJson(event.target.value)}
                                dir="ltr"
                                className="min-h-28 font-mono text-xs"
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 p-3">
                            <InfoTitle title={t("fields.approval")} help={t("help.policy")} />
                            <Switch
                                checked={approvalRequired}
                                onCheckedChange={setApprovalRequired}
                                aria-label={t("fields.approval")}
                            />
                        </div>
                        <Textarea
                            value={policyReason}
                            onChange={(event) => setPolicyReason(event.target.value)}
                            placeholder="دلیل ساخت نسخهٔ جدید Policy"
                        />
                    </div>
                </SectionCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <SectionCard
                    title={t("blocks.simulator")}
                    help={t("help.policySimulation")}
                    action={
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                simulate.mutate({
                                    path: "policies/simulate",
                                    body: { policy_key: policyKey, context: safeJson(context) },
                                })
                            }
                            isLoading={simulate.isPending}
                        >
                            <ScanSearch className="size-3.5" aria-hidden="true" />
                            {t("simulate")}
                        </Button>
                    }
                >
                    <Textarea
                        value={context}
                        onChange={(event) => setContext(event.target.value)}
                        dir="ltr"
                        className="min-h-28 font-mono text-xs"
                    />
                    {simResult ? (
                        <pre
                            className="mt-3 max-h-64 overflow-auto rounded-lg border border-border/80 bg-muted/30 p-3 text-xs"
                            dir="ltr"
                        >
                            {JSON.stringify(simResult, null, 2)}
                        </pre>
                    ) : null}
                </SectionCard>
                <SectionCard title={t("blocks.access")} help={t("help.access")}>
                    <div className="space-y-3">
                        <Select value={selectedUser} onValueChange={(value) => setSelectedUser(String(value ?? ""))}>
                            <SelectTrigger>
                                <SelectValue placeholder="انتخاب مدیر" />
                            </SelectTrigger>
                            <SelectContent>
                                {(access.data ?? []).map((row) => (
                                    <SelectItem key={row.id} value={String(row.id)}>
                                        {row.identity}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={selectedPreset} onValueChange={(value) => setSelectedPreset(String(value ?? "reviewer"))}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {["owner", "risk_admin", "reviewer", "analyst"].map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {value}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Textarea
                            value={accessReason}
                            onChange={(event) => setAccessReason(event.target.value)}
                            placeholder="دلیل تغییر دسترسی مدیر"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            disabled={!selectedUser || accessReason.trim().length < 8}
                            isLoading={preset.isPending}
                            onClick={() =>
                                preset.mutate({
                                    path: "access/preset",
                                    body: { user_id: Number(selectedUser), preset: selectedPreset, reason: accessReason },
                                })
                            }
                        >
                            {t("apply")}
                        </Button>
                        <p className="text-muted-foreground text-xs">
                            Preset فقط مجموعهٔ permissionهای واقعی backend را تنظیم می‌کند؛ مجوز نمایشی ساخته نمی‌شود.
                        </p>
                    </div>
                </SectionCard>
            </div>
        </WorkspaceShell>
    );
}

function Signals() {
    const t = useTranslations("Trust");
    const query = useTrustResource<TrustSignal[]>("signals?limit=200");
    const scan = useTrustMutation<{ path: string }, JsonRecord>("POST");
    return (
        <WorkspaceShell
            section="signals"
            primaryAction={
                <Button type="button" onClick={() => scan.mutate({ path: "scan" })} isLoading={scan.isPending}>
                    <ScanSearch className="size-4" aria-hidden="true" />
                    {t("runScan")}
                </Button>
            }
        >
            {scan.isError ? <ErrorState message={scan.error.message} /> : null}
            <SectionCard title={t("blocks.signalLedger")} help={t("help.signalLedger")}>
                {query.isError ? (
                    <ErrorState message={query.error.message} retry={() => query.refetch()} />
                ) : query.isLoading ? (
                    <EmptyState>{t("loading")}</EmptyState>
                ) : !(query.data ?? []).length ? (
                    <EmptyState>{t("notConfigured")}</EmptyState>
                ) : (
                    <div className="space-y-2">
                        {(query.data ?? []).map((row, index) => (
                            <div
                                key={row.public_id ?? index}
                                className="grid gap-2 rounded-lg border border-border/80 p-3 lg:grid-cols-[minmax(12rem,1fr)_10rem_9rem_9rem_11rem] lg:items-center"
                            >
                                <div className="min-w-0">
                                    <div className="truncate font-medium text-sm">
                                        {signalLabel(row.signal_type ?? row.event_type)}
                                    </div>
                                    <div className="truncate text-muted-foreground text-xs">
                                        {row.source} · {subjectLabel(row.subject_type)}: {row.subject_id}
                                    </div>
                                </div>
                                <RiskBadge band={row.risk_band ?? "medium"} />
                                <div className="text-xs">
                                    <InfoTitle title={percentFromBp(row.confidence_bp)} help={t("help.confidence")} />
                                </div>
                                <StatusBadge tone="neutral">{row.privacy_classification ?? "internal"}</StatusBadge>
                                <div className="text-muted-foreground text-xs tabular-nums">
                                    <div>{dateFa(row.occurred_at)}</div>
                                    <div>{dateFa(row.received_at)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>
            <SectionCard title={t("blocks.automation")} help={t("help.automation")}>
                <div className="grid gap-3 md:grid-cols-3">
                    {["approved_agent", "unknown_automation", "abusive_bot"].map((kind) => {
                        const count = (query.data ?? []).filter(
                            (row) => row.signal_type === kind || String(row.evidence?.automation_class ?? "") === kind,
                        ).length;
                        return (
                            <div key={kind} className="rounded-lg border border-border/80 p-4">
                                <div className="font-medium text-sm">
                                    {kind === "approved_agent"
                                        ? "Agent تأییدشده"
                                        : kind === "unknown_automation"
                                          ? "Automation ناشناخته"
                                          : "Bot مخرب"}
                                </div>
                                <div className="mt-2 font-semibold text-2xl tabular-nums">{numberFa(count)}</div>
                                <div className="mt-1 text-muted-foreground text-xs">فقط از Signal ثبت‌شده شمرده می‌شود.</div>
                            </div>
                        );
                    })}
                </div>
            </SectionCard>
        </WorkspaceShell>
    );
}

function Models() {
    const t = useTranslations("Trust");
    const models = useTrustResource<ModelsData>("models");
    const outcomes = useTrustResource<JsonRecord>("outcomes");
    const register = useTrustMutation<{ path: string; body: unknown }, JsonRecord>("POST");
    const rollout = useTrustMutation<{ path: string; body: unknown }, JsonRecord>("PATCH");
    const [modelId, setModelId] = useState("trust-risk");
    const [version, setVersion] = useState("");
    const [owner, setOwner] = useState("");
    const [purpose, setPurpose] = useState("Trust risk ranking");
    const [features, setFeatures] = useState("risk_score,signal_velocity,device_fanout");
    const [limitations, setLimitations] = useState("برای تصمیم نهایی بدون Policy و evidence استفاده نشود");
    const [reason, setReason] = useState("");
    const [rolloutTarget, setRolloutTarget] = useState("10");
    return (
        <WorkspaceShell
            section="models"
            primaryAction={
                <Button
                    type="button"
                    onClick={() =>
                        register.mutate({
                            path: "models",
                            body: {
                                model_id: modelId,
                                version,
                                purpose,
                                owner,
                                features: features
                                    .split(",")
                                    .map((item) => item.trim())
                                    .filter(Boolean),
                                privacy_controls: { sensitive_features: "default_deny" },
                                evaluation: {},
                                calibration: {},
                                deployment: { surface: "trust", mode: "shadow_until_rollout" },
                                limitations: limitations.split("\n").filter(Boolean),
                                rollback_version: null,
                                reason,
                            },
                        })
                    }
                    isLoading={register.isPending}
                    disabled={!version || !owner || reason.trim().length < 8}
                >
                    <ChartNoAxesCombined className="size-4" aria-hidden="true" />
                    {t("actions.registerModel")}
                </Button>
            }
        >
            {register.isError ? <ErrorState message={register.error.message} /> : null}
            {rollout.isError ? <ErrorState message={rollout.error.message} /> : null}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
                <SectionCard title={t("blocks.models")} help={t("help.modelRegistry")}>
                    {models.isError ? (
                        <ErrorState message={models.error.message} retry={() => models.refetch()} />
                    ) : models.isLoading ? (
                        <EmptyState>{t("loading")}</EmptyState>
                    ) : !(models.data?.models ?? []).length ? (
                        <EmptyState>{t("notConfigured")}</EmptyState>
                    ) : (
                        <div className="space-y-2">
                            {(models.data?.models ?? []).map((row) => (
                                <div key={row.public_id} className="rounded-lg border border-border/80 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <div className="font-medium text-sm">
                                                {row.model_id} · {row.version}
                                            </div>
                                            <div className="text-muted-foreground text-xs">
                                                {row.owner} · {row.purpose}
                                            </div>
                                        </div>
                                        <StatusLabel value={row.status} />
                                    </div>
                                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                                        <div>
                                            <div className="mb-1 flex justify-between text-xs">
                                                <span>
                                                    <InfoTitle title={t("fields.rollout")} help={t("help.rollout")} />
                                                </span>
                                                <span>{numberFa(row.rollout_percent)}٪</span>
                                            </div>
                                            <Progress
                                                value={row.rollout_percent}
                                                tone={row.status === "champion" ? "success" : "info"}
                                            />
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={reason.trim().length < 8}
                                                onClick={() =>
                                                    rollout.mutate({
                                                        path: `models/${row.public_id}/rollout`,
                                                        body: {
                                                            status: "challenger",
                                                            rollout_percent: Math.min(
                                                                100,
                                                                Math.max(0, Number(rolloutTarget) || 0),
                                                            ),
                                                            reason,
                                                        },
                                                    })
                                                }
                                            >
                                                نسخهٔ رقیب
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={reason.trim().length < 8 || (Number(rolloutTarget) || 0) <= 0}
                                                onClick={() =>
                                                    rollout.mutate({
                                                        path: `models/${row.public_id}/rollout`,
                                                        body: {
                                                            status: "champion",
                                                            rollout_percent: Math.min(
                                                                100,
                                                                Math.max(1, Number(rolloutTarget) || 1),
                                                            ),
                                                            reason,
                                                        },
                                                    })
                                                }
                                            >
                                                نسخهٔ اصلی
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={reason.trim().length < 8}
                                                onClick={() =>
                                                    rollout.mutate({
                                                        path: `models/${row.public_id}/rollout`,
                                                        body: { status: "rollback_ready", rollout_percent: 0, reason },
                                                    })
                                                }
                                            >
                                                آمادهٔ بازگشت
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>
                <SectionCard title={t("blocks.registerModel")} help={t("help.modelRegistry")}>
                    <div className="space-y-3">
                        <Input
                            value={modelId}
                            onChange={(event) => setModelId(event.target.value)}
                            placeholder={t("fields.modelId")}
                            dir="ltr"
                        />
                        <Input
                            value={version}
                            onChange={(event) => setVersion(event.target.value)}
                            placeholder={t("fields.version")}
                            dir="ltr"
                        />
                        <Input
                            value={owner}
                            onChange={(event) => setOwner(event.target.value)}
                            placeholder={t("fields.modelOwner")}
                        />
                        <Input
                            value={purpose}
                            onChange={(event) => setPurpose(event.target.value)}
                            placeholder={t("fields.purpose")}
                        />
                        <Textarea
                            value={features}
                            onChange={(event) => setFeatures(event.target.value)}
                            placeholder={t("fields.features")}
                            dir="ltr"
                        />
                        <Textarea
                            value={limitations}
                            onChange={(event) => setLimitations(event.target.value)}
                            placeholder={t("fields.limitations")}
                        />
                        <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
                            <Input
                                type="number"
                                min="0"
                                max="100"
                                value={rolloutTarget}
                                onChange={(event) => setRolloutTarget(event.target.value)}
                                placeholder="درصد انتشار"
                            />
                            <Textarea
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                placeholder="دلیل ثبت نسخه یا تغییر انتشار؛ حداقل ۸ نویسه"
                            />
                        </div>
                    </div>
                </SectionCard>
            </div>
            <SectionCard title={t("blocks.quality")} help={t("help.modelQuality")}>
                {outcomes.isError ? (
                    <ErrorState message={outcomes.error.message} retry={() => outcomes.refetch()} />
                ) : outcomes.isLoading ? (
                    <EmptyState>{t("loading")}</EmptyState>
                ) : (
                    <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <MetricCard
                                label="نتیجه‌های برچسب‌خورده در ۳۰ روز"
                                help={t("help.modelQuality")}
                                value={numberFa(models.data?.quality?.labeled_outcomes_30d)}
                            />
                            <MetricCard
                                label="نرخ مثبت کاذب"
                                help={t("help.falsePositive")}
                                value={percentFromBp(models.data?.quality?.false_positive_rate_bp)}
                            />
                        </div>
                        <div className="space-y-2">
                            {((outcomes.data?.rows as JsonRecord[] | undefined) ?? []).slice(0, 20).map((row, index) => (
                                <div
                                    key={index}
                                    className="grid gap-2 rounded-lg border border-border/80 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                                >
                                    <div>
                                        <div className="font-medium text-sm">
                                            {String(row.final_assessment ?? row.outcome ?? "نتیجه ثبت‌شده")}
                                        </div>
                                        <div className="text-muted-foreground text-xs">{dateFa(row.created_at)}</div>
                                    </div>
                                    <StatusBadge tone={row.is_false_positive ? "warning" : "success"}>
                                        {row.is_false_positive ? "مثبت کاذب" : "تأییدشده"}
                                    </StatusBadge>
                                    <span className="text-muted-foreground text-xs">
                                        اطمینان: {percentFromBp(row.measurement_confidence_bp)}
                                    </span>
                                </div>
                            ))}
                            {!((outcomes.data?.rows as JsonRecord[] | undefined) ?? []).length ? (
                                <EmptyState>{t("empty")}</EmptyState>
                            ) : null}
                        </div>
                    </div>
                )}
            </SectionCard>
        </WorkspaceShell>
    );
}

export function TrustWorkspace({ section, casePublicId }: { section: TrustSection; casePublicId?: string }) {
    if (section === "overview") return <Overview />;
    if (section === "cases") return <Cases />;
    if (section === "case-detail")
        return casePublicId ? (
            <CaseDetail publicId={casePublicId} />
        ) : (
            <WorkspaceShell section="case-detail">
                <EmptyState>شناسهٔ پرونده ارسال نشده است.</EmptyState>
            </WorkspaceShell>
        );
    if (section === "graph") return <Graph />;
    if (section === "policies") return <Policies />;
    if (section === "signals") return <Signals />;
    return <Models />;
}
