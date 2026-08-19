"use client";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@calibra/panel-kit";
import { useActionState, useState } from "react";

import { ShieldCheck, Sparkles } from "#/icons";

import { initialPricingMutationState, mutatePricingGovernanceAction } from "./actions";
import type { PricingPolicySummary, PricingPolicyVersion, PricingProposal } from "./types";

interface GovernanceProps {
    policies: PricingPolicySummary[];
    proposals: PricingProposal[];
    locale: string;
    mode: "policies" | "proposals";
}

export function PricingGovernance({ policies, proposals, locale, mode }: GovernanceProps) {
    const fa = locale.toLowerCase().startsWith("fa");
    if (mode === "proposals") return <ProposalWorkspace policies={policies} proposals={proposals} locale={locale} fa={fa} />;
    return <PolicyWorkspace policies={policies} locale={locale} fa={fa} />;
}

function PolicyWorkspace({ policies, locale, fa }: { policies: PricingPolicySummary[]; locale: string; fa: boolean }) {
    const active = policies.filter((policy) => policy.latest_version?.state === "active").length;
    const review = policies.filter((policy) =>
        ["review", "approved", "scheduled"].includes(policy.latest_version?.state ?? ""),
    ).length;
    const frozen = policies.filter((policy) => policy.status === "frozen").length;

    return (
        <div className="flex flex-col gap-5">
            <section className="grid gap-3 sm:grid-cols-3" aria-label={fa ? "خلاصه حاکمیت قیمت" : "Pricing governance summary"}>
                <GovernanceMetric
                    label={fa ? "سیاست فعال" : "Active policies"}
                    value={active}
                    detail={fa ? "در مسیر checkout قابل اعمال" : "Eligible in checkout guardrails"}
                />
                <GovernanceMetric
                    label={fa ? "در انتظار تصمیم" : "Awaiting decision"}
                    value={review}
                    detail="Review / Approved / Scheduled"
                />
                <GovernanceMetric
                    label={fa ? "Freeze اضطراری" : "Emergency freezes"}
                    value={frozen}
                    detail={fa ? "Activation جدید مسدود است" : "New activation is blocked"}
                />
            </section>

            <CreatePolicyForm locale={locale} fa={fa} />

            <section className="flex flex-col gap-3" aria-label={fa ? "سیاست‌های قیمت" : "Pricing policies"}>
                {policies.length === 0 ? (
                    <EmptyGovernance
                        title={fa ? "هنوز سیاستی ثبت نشده" : "No pricing policies yet"}
                        detail={
                            fa
                                ? "اولین policy را به‌صورت Draft بسازید؛ تا زمان Approval و Activation هیچ اثری روی checkout ندارد."
                                : "Create the first policy as a draft. It has no checkout effect until approval and activation."
                        }
                    />
                ) : (
                    policies.map((policy) => <PolicyCard key={policy.id} policy={policy} locale={locale} fa={fa} />)
                )}
            </section>
        </div>
    );
}

function CreatePolicyForm({ locale, fa }: { locale: string; fa: boolean }) {
    const [state, action, pending] = useActionState(mutatePricingGovernanceAction, initialPricingMutationState);
    return (
        <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="size-4" aria-hidden="true" />
                    {fa ? "ساخت Policy نسخه‌پذیر" : "Create a versioned policy"}
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
                <form action={action} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <input type="hidden" name="operation" value="create_policy" />
                    <input type="hidden" name="locale" value={locale} />
                    <GovernanceField
                        id="create-policy-key"
                        name="policy_key"
                        label={fa ? "کلید Policy" : "Policy key"}
                        placeholder="margin-protection"
                        required
                    />
                    <GovernanceField
                        id="create-policy-name"
                        name="name"
                        label={fa ? "نام" : "Name"}
                        placeholder={fa ? "محافظ حاشیه سود" : "Margin protection"}
                        required
                    />
                    <GovernanceField
                        id="create-policy-objective"
                        name="objective"
                        label={fa ? "هدف" : "Objective"}
                        placeholder="margin_protection"
                    />
                    <GovernanceField
                        id="create-policy-currency"
                        name="currency"
                        label={fa ? "ارز" : "Currency"}
                        defaultValue="IRR"
                        required
                    />
                    <GovernanceField id="create-policy-product" name="product_id" label="Product ID" inputMode="numeric" />
                    <GovernanceField id="create-policy-variation" name="variation_id" label="Variation ID" inputMode="numeric" />
                    <GovernanceField
                        id="create-policy-floor"
                        name="floor_price_minor"
                        label={fa ? "کف قیمت (minor)" : "Price floor (minor)"}
                        inputMode="numeric"
                    />
                    <GovernanceField
                        id="create-policy-margin"
                        name="minimum_margin_percent"
                        label={fa ? "حداقل Margin %" : "Minimum margin %"}
                        inputMode="decimal"
                    />
                    <GovernanceField
                        id="create-policy-discount"
                        name="maximum_discount_percent"
                        label={fa ? "حداکثر تخفیف %" : "Maximum discount %"}
                        inputMode="decimal"
                    />
                    <div className="md:col-span-2 xl:col-span-3">
                        <Label htmlFor="create-policy-reason">{fa ? "دلیل و زمینه تصمیم" : "Decision rationale"}</Label>
                        <Textarea
                            id="create-policy-reason"
                            name="reason"
                            className="mt-2 min-h-20"
                            placeholder={
                                fa
                                    ? "چرا این Guardrail لازم است و به چه شواهدی تکیه دارد؟"
                                    : "Why is this guardrail needed and what evidence supports it?"
                            }
                        />
                    </div>
                    <div className="flex items-end">
                        <Button type="submit" className="w-full" disabled={pending}>
                            {pending ? (fa ? "در حال ثبت…" : "Saving…") : fa ? "ایجاد Draft" : "Create draft"}
                        </Button>
                    </div>
                </form>
                <MutationFeedback state={state} />
            </CardContent>
        </Card>
    );
}

function PolicyCard({ policy, locale, fa }: { policy: PricingPolicySummary; locale: string; fa: boolean }) {
    const version = policy.latest_version;
    return (
        <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/10">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-base">{policy.name}</CardTitle>
                            <Badge variant="outline" tone={policy.status === "frozen" ? "danger" : "success"}>
                                {policy.status === "frozen" ? (fa ? "Freeze" : "Frozen") : fa ? "قابل مدیریت" : "Manageable"}
                            </Badge>
                            {version ? <LifecycleBadge state={version.state} fa={fa} /> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
                            <span dir="ltr">{policy.policy_key}</span>
                            <span>
                                {fa ? "نسخه" : "Version"}: {version?.version ?? "—"}
                            </span>
                            <span>
                                {fa ? "هدف" : "Objective"}: {policy.objective ?? "—"}
                            </span>
                            <span>{scopeLabel(version, fa)}</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">{version ? <GuardrailBadges version={version} fa={fa} /> : null}</div>
                </div>
            </CardHeader>
            <CardContent className="grid gap-5 pt-5 xl:grid-cols-[1.35fr_0.65fr]">
                <div className="flex flex-col gap-4">
                    {version ? <LifecycleActionForm policy={policy} version={version} locale={locale} fa={fa} /> : null}
                    <CreateVersionForm policy={policy} locale={locale} fa={fa} />
                </div>
                <div className="flex flex-col gap-3">
                    <FreezeForm policy={policy} locale={locale} fa={fa} />
                    <div className="rounded-xl border bg-muted/15 p-4 text-xs leading-6">
                        <div className="flex items-center gap-2 font-medium text-sm">
                            <ShieldCheck className="size-4" aria-hidden="true" />
                            {fa ? "ردپای حاکمیتی" : "Governance trace"}
                        </div>
                        <div className="mt-3 text-muted-foreground">
                            {fa
                                ? "هر تغییر state با actor، reason، evidence، correlation و idempotency در ledger و Audit Log ثبت می‌شود. Active policy فقط Guardrail است و قیمت کاتالوگ را مستقیم بازنویسی نمی‌کند."
                                : "Every state change records actor, reason, evidence, correlation and idempotency in the ledger and audit log. An active policy is a guardrail and does not directly rewrite catalog prices."}
                        </div>
                        {policy.freeze_reason ? (
                            <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 p-2 text-danger">
                                {policy.freeze_reason}
                            </div>
                        ) : null}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function LifecycleActionForm({
    policy,
    version,
    locale,
    fa,
}: {
    policy: PricingPolicySummary;
    version: PricingPolicyVersion;
    locale: string;
    fa: boolean;
}) {
    const [state, action, pending] = useActionState(mutatePricingGovernanceAction, initialPricingMutationState);
    const [scheduledLocal, setScheduledLocal] = useState("");
    const scheduledAt = isoFromLocalInput(scheduledLocal);
    const actions = lifecycleActions(version.state, fa);
    const prefix = `policy-${policy.id}-transition`;

    return (
        <div className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-sm">
                    {fa ? "Approval / Rollout / Rollback" : "Approval / rollout / rollback"}
                </div>
                <span className="text-muted-foreground text-xs">expected_version: {version.version}</span>
            </div>
            {actions.length === 0 ? (
                <p className="mt-3 text-muted-foreground text-xs">
                    {fa
                        ? "برای این state اقدام مستقیمی وجود ندارد؛ نسخه جدید بسازید."
                        : "No direct transition is available from this state; create a new version."}
                </p>
            ) : (
                <form action={action} className="mt-4 flex flex-col gap-3">
                    <input type="hidden" name="operation" value="transition" />
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="policy_id" value={policy.id} />
                    <input type="hidden" name="expected_version" value={version.version} />
                    <input type="hidden" name="scheduled_at" value={scheduledAt} />
                    <GovernanceField
                        id={`${prefix}-reason`}
                        name="reason"
                        label={fa ? "دلیل اقدام" : "Action rationale"}
                        placeholder={fa ? "دلیل قابل ممیزی برای این تغییر state" : "Auditable reason for this state change"}
                        required
                    />
                    {version.state === "approved" ? (
                        <div className="flex flex-col gap-2">
                            <Label htmlFor={`${prefix}-schedule`}>
                                {fa ? "زمان Schedule (اختیاری)" : "Schedule time (optional)"}
                            </Label>
                            <Input
                                id={`${prefix}-schedule`}
                                type="datetime-local"
                                value={scheduledLocal}
                                onChange={(event) => setScheduledLocal(event.target.value)}
                                dir="ltr"
                            />
                        </div>
                    ) : null}
                    {version.state === "active" ? (
                        <GovernanceField
                            id={`${prefix}-rollback`}
                            name="rollback_to_version"
                            label={fa ? "نسخه مقصد Rollback" : "Rollback target version"}
                            inputMode="numeric"
                        />
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                        {actions.map((item) => (
                            <Button
                                key={item.value}
                                type="submit"
                                name="action"
                                value={item.value}
                                size="sm"
                                variant={item.tone === "default" ? "default" : "outline"}
                                tone={item.tone === "default" ? "default" : item.tone}
                                disabled={pending || (item.value === "schedule" && !scheduledAt)}
                            >
                                {item.label}
                            </Button>
                        ))}
                    </div>
                </form>
            )}
            <MutationFeedback state={state} />
        </div>
    );
}

function CreateVersionForm({ policy, locale, fa }: { policy: PricingPolicySummary; locale: string; fa: boolean }) {
    const [state, action, pending] = useActionState(mutatePricingGovernanceAction, initialPricingMutationState);
    if (policy.status === "frozen") return null;
    const prefix = `policy-${policy.id}-version`;
    return (
        <form action={action} className="rounded-xl border border-dashed p-4">
            <input type="hidden" name="operation" value="create_version" />
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="policy_id" value={policy.id} />
            <div className="font-medium text-sm">{fa ? "نسخه بعدی" : "Next version"}</div>
            <p className="mt-1 text-muted-foreground text-xs">
                {fa
                    ? "اگر Guardrail خالی بماند، scope و currency از آخرین نسخه به ارث می‌رسند؛ Guardrailهای واردشده جایگزین نسخه جدید می‌شوند."
                    : "Scope and currency inherit from the latest version when omitted; entered guardrails become the new version guardrails."}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <GovernanceField
                    id={`${prefix}-floor`}
                    name="floor_price_minor"
                    label={fa ? "کف قیمت" : "Price floor"}
                    inputMode="numeric"
                />
                <GovernanceField id={`${prefix}-margin`} name="minimum_margin_percent" label="Margin %" inputMode="decimal" />
                <GovernanceField
                    id={`${prefix}-discount`}
                    name="maximum_discount_percent"
                    label={fa ? "تخفیف %" : "Discount %"}
                    inputMode="decimal"
                />
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                    <Label htmlFor={`${prefix}-reason`}>{fa ? "دلیل نسخه جدید" : "New version rationale"}</Label>
                    <Input
                        id={`${prefix}-reason`}
                        name="reason"
                        className="mt-2"
                        placeholder={fa ? "دلیل ساخت نسخه جدید" : "Reason for the new version"}
                        required
                    />
                </div>
                <Button type="submit" variant="outline" size="sm" disabled={pending}>
                    {fa ? "ساخت Draft جدید" : "Create new draft"}
                </Button>
            </div>
            <MutationFeedback state={state} />
        </form>
    );
}

function FreezeForm({ policy, locale, fa }: { policy: PricingPolicySummary; locale: string; fa: boolean }) {
    const [state, action, pending] = useActionState(mutatePricingGovernanceAction, initialPricingMutationState);
    const frozen = policy.status === "frozen";
    const reasonId = `policy-${policy.id}-freeze-reason`;
    return (
        <form action={action} className="rounded-xl border p-4">
            <input type="hidden" name="operation" value="freeze" />
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="policy_id" value={policy.id} />
            <input type="hidden" name="frozen" value={frozen ? "false" : "true"} />
            <div className="font-medium text-sm">{fa ? "Emergency Control" : "Emergency control"}</div>
            <p className="mt-1 text-muted-foreground text-xs">
                {fa
                    ? "Freeze جلوی transitionهای عادی activation را می‌گیرد؛ rollback/stop همچنان برای خروج امن باقی می‌ماند."
                    : "Freeze blocks normal activation transitions while rollback/stop remain available for a safe exit."}
            </p>
            <div className="mt-3 flex flex-col gap-2">
                <Label htmlFor={reasonId}>{fa ? "دلیل Freeze / Unfreeze" : "Freeze / unfreeze reason"}</Label>
                <Input
                    id={reasonId}
                    name="reason"
                    placeholder={fa ? "دلیل Freeze / Unfreeze" : "Freeze / unfreeze reason"}
                    required
                />
                <Button type="submit" variant="outline" tone={frozen ? "success" : "danger"} size="sm" disabled={pending}>
                    {frozen ? (fa ? "Unfreeze Policy" : "Unfreeze policy") : fa ? "Freeze فوری" : "Emergency freeze"}
                </Button>
            </div>
            <MutationFeedback state={state} />
        </form>
    );
}

function ProposalWorkspace({
    policies,
    proposals,
    locale,
    fa,
}: {
    policies: PricingPolicySummary[];
    proposals: PricingProposal[];
    locale: string;
    fa: boolean;
}) {
    return (
        <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <CreateProposalForm policies={policies} locale={locale} fa={fa} />
            <Card className="overflow-hidden">
                <CardHeader className="border-b bg-muted/20">
                    <CardTitle className="text-base">{fa ? "Proposal Queue" : "Proposal queue"}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 pt-5">
                    {proposals.length === 0 ? (
                        <EmptyGovernance
                            title={fa ? "Proposal ثبت نشده" : "No proposals recorded"}
                            detail={
                                fa
                                    ? "پیشنهاد قیمت صرفاً evidence و candidate است و قیمت کاتالوگ را تغییر نمی‌دهد."
                                    : "A pricing proposal is evidence plus a candidate; it never mutates catalog pricing by itself."
                            }
                        />
                    ) : (
                        proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />)
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function CreateProposalForm({ policies, locale, fa }: { policies: PricingPolicySummary[]; locale: string; fa: boolean }) {
    const [state, action, pending] = useActionState(mutatePricingGovernanceAction, initialPricingMutationState);
    return (
        <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20">
                <CardTitle className="text-base">{fa ? "ثبت پیشنهاد قیمت" : "Record a pricing proposal"}</CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
                {policies.length === 0 ? (
                    <EmptyGovernance
                        title={fa ? "ابتدا یک Policy بسازید" : "Create a policy first"}
                        detail={
                            fa
                                ? "هر Proposal باید به یک Policy حاکمیتی متصل باشد."
                                : "Every proposal must be linked to a governance policy."
                        }
                    />
                ) : (
                    <form action={action} className="grid gap-4 sm:grid-cols-2">
                        <input type="hidden" name="operation" value="create_proposal" />
                        <input type="hidden" name="locale" value={locale} />
                        <div className="flex flex-col gap-2 sm:col-span-2">
                            <Label htmlFor="proposal-policy">Policy</Label>
                            <select
                                id="proposal-policy"
                                name="policy_id"
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                required
                            >
                                {policies.map((policy) => (
                                    <option key={policy.id} value={policy.id}>
                                        {policy.name} · v{policy.latest_version?.version ?? "—"}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <GovernanceField
                            id="proposal-product"
                            name="product_id"
                            label="Product ID"
                            inputMode="numeric"
                            required
                        />
                        <GovernanceField id="proposal-variation" name="variation_id" label="Variation ID" inputMode="numeric" />
                        <GovernanceField
                            id="proposal-reference"
                            name="reference_price_minor"
                            label={fa ? "قیمت مرجع" : "Reference price"}
                            inputMode="numeric"
                            required
                        />
                        <GovernanceField
                            id="proposal-candidate"
                            name="candidate_price_minor"
                            label={fa ? "قیمت Candidate" : "Candidate price"}
                            inputMode="numeric"
                            required
                        />
                        <GovernanceField
                            id="proposal-currency"
                            name="currency"
                            label={fa ? "ارز" : "Currency"}
                            defaultValue="IRR"
                            required
                        />
                        <GovernanceField
                            id="proposal-objective"
                            name="objective"
                            label={fa ? "هدف" : "Objective"}
                            placeholder="margin_protection"
                        />
                        <div className="sm:col-span-2">
                            <Label htmlFor="proposal-rationale">{fa ? "Rationale / Evidence" : "Rationale / evidence"}</Label>
                            <Textarea
                                id="proposal-rationale"
                                name="rationale"
                                className="mt-2 min-h-24"
                                placeholder={
                                    fa
                                        ? "منطق پیشنهاد، شواهد و محدودیت‌های آن را ثبت کنید."
                                        : "Record the proposal rationale, evidence, and limitations."
                                }
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <Button type="submit" className="w-full" disabled={pending}>
                                {pending
                                    ? fa
                                        ? "در حال ثبت…"
                                        : "Saving…"
                                    : fa
                                      ? "ثبت Proposal بدون تغییر قیمت"
                                      : "Record proposal without repricing"}
                            </Button>
                        </div>
                    </form>
                )}
                <MutationFeedback state={state} />
            </CardContent>
        </Card>
    );
}

function ProposalCard({ proposal }: { proposal: PricingProposal }) {
    const delta =
        proposal.reference_price_minor === 0
            ? 0
            : Math.round(
                  ((proposal.candidate_price_minor - proposal.reference_price_minor) / proposal.reference_price_minor) * 10_000,
              ) / 100;
    return (
        <div className="rounded-xl border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 font-medium text-sm">
                        <span>#{proposal.id}</span>
                        <Badge variant="outline" tone="info">
                            {proposal.status}
                        </Badge>
                    </div>
                    <div className="mt-2 text-muted-foreground text-xs">
                        Policy #{proposal.policy_id} · Product #{proposal.product_id}
                        {proposal.variation_id ? ` / Variation #${proposal.variation_id}` : ""}
                    </div>
                </div>
                <div className="text-end">
                    <div className="font-semibold tabular-nums" dir="ltr">
                        {proposal.candidate_price_minor.toLocaleString()} {proposal.currency}
                    </div>
                    <div
                        className={`mt-1 text-xs ${delta > 0 ? "text-success" : delta < 0 ? "text-warning" : "text-muted-foreground"}`}
                        dir="ltr"
                    >
                        {delta > 0 ? "+" : ""}
                        {delta}%
                    </div>
                </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <RuntimeChip
                    label="Reference"
                    value={`${proposal.reference_price_minor.toLocaleString()} ${proposal.currency}`}
                />
                <RuntimeChip label="Objective" value={proposal.objective ?? "—"} />
            </div>
            {proposal.rationale ? <p className="mt-3 text-muted-foreground text-xs leading-6">{proposal.rationale}</p> : null}
        </div>
    );
}

function GovernanceMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
    return (
        <div className="rounded-xl border bg-muted/10 p-4">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className="mt-2 font-semibold text-2xl tabular-nums">{value}</div>
            <div className="mt-1 text-muted-foreground text-xs">{detail}</div>
        </div>
    );
}

function GovernanceField({
    id,
    name,
    label,
    placeholder,
    defaultValue,
    inputMode = "text",
    required,
}: {
    id: string;
    name: string;
    label: string;
    placeholder?: string;
    defaultValue?: string;
    inputMode?: "text" | "numeric" | "decimal";
    required?: boolean;
}) {
    return (
        <div className="flex flex-col gap-2">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                name={name}
                placeholder={placeholder}
                defaultValue={defaultValue}
                inputMode={inputMode}
                required={required}
                dir={inputMode === "text" ? undefined : "ltr"}
            />
        </div>
    );
}

function LifecycleBadge({ state, fa }: { state: PricingPolicyVersion["state"]; fa: boolean }) {
    const tone =
        state === "active"
            ? "success"
            : state === "review" || state === "approved" || state === "scheduled"
              ? "warning"
              : state === "rolled_back" || state === "stopped"
                ? "danger"
                : "info";
    return (
        <Badge variant="outline" tone={tone}>
            {fa ? lifecycleLabelFa(state) : state.replaceAll("_", " ")}
        </Badge>
    );
}

function GuardrailBadges({ version, fa }: { version: PricingPolicyVersion; fa: boolean }) {
    const floor = numericGuardrail(version, "floor_price_minor");
    const margin = numericGuardrail(version, "minimum_margin_percent");
    const discount = numericGuardrail(version, "maximum_discount_percent");
    return (
        <>
            {floor !== null ? (
                <Badge variant="outline">
                    {fa ? "کف" : "Floor"}: {floor.toLocaleString()}
                </Badge>
            ) : null}
            {margin !== null ? <Badge variant="outline">Margin ≥ {margin}%</Badge> : null}
            {discount !== null ? (
                <Badge variant="outline">
                    {fa ? "تخفیف" : "Discount"} ≤ {discount}%
                </Badge>
            ) : null}
        </>
    );
}

function MutationFeedback({ state }: { state: { ok: boolean; error: string | null; message: string | null } }) {
    if (!state.error && !state.message) return null;
    return (
        <div
            className={`mt-3 rounded-lg border p-3 text-xs ${state.error ? "border-danger/30 bg-danger/5 text-danger" : "border-success/30 bg-success/5 text-success"}`}
            role={state.error ? "alert" : "status"}
        >
            {state.error ?? state.message}
        </div>
    );
}

function EmptyGovernance({ title, detail }: { title: string; detail: string }) {
    return (
        <div className="rounded-xl border border-dashed bg-muted/10 p-6 text-center">
            <div className="font-medium text-sm">{title}</div>
            <p className="mx-auto mt-2 max-w-xl text-muted-foreground text-xs leading-6">{detail}</p>
        </div>
    );
}

function RuntimeChip({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border bg-muted/10 px-3 py-2 text-xs">
            <span className="text-muted-foreground">{label}: </span>
            <span className="font-medium">{value}</span>
        </div>
    );
}

function numericGuardrail(version: PricingPolicyVersion, key: string): number | null {
    const value = version.guardrails?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scopeLabel(version: PricingPolicyVersion | null, fa: boolean): string {
    if (!version?.product_id) return fa ? "Scope: همه محصولات" : "Scope: all products";
    if (version.variation_id) return `Product #${version.product_id} / Variation #${version.variation_id}`;
    return `Product #${version.product_id}`;
}

function lifecycleLabelFa(state: PricingPolicyVersion["state"]): string {
    if (state === "draft") return "پیش‌نویس";
    if (state === "review") return "در بررسی";
    if (state === "approved") return "تأییدشده";
    if (state === "scheduled") return "زمان‌بندی‌شده";
    if (state === "active") return "فعال";
    if (state === "paused") return "متوقف موقت";
    if (state === "stopped") return "متوقف";
    return "Rollback شده";
}

function lifecycleActions(state: PricingPolicyVersion["state"], fa: boolean) {
    if (state === "draft")
        return [{ value: "submit", label: fa ? "ارسال برای Review" : "Submit for review", tone: "default" as const }];
    if (state === "review")
        return [{ value: "approve", label: fa ? "Approve مستقل" : "Independent approval", tone: "success" as const }];
    if (state === "approved")
        return [
            { value: "activate", label: "Activate", tone: "success" as const },
            { value: "schedule", label: "Schedule", tone: "warning" as const },
        ];
    if (state === "scheduled")
        return [
            { value: "activate", label: fa ? "Activate در موعد" : "Activate when due", tone: "success" as const },
            { value: "stop", label: fa ? "لغو Schedule" : "Stop schedule", tone: "danger" as const },
        ];
    if (state === "active")
        return [
            { value: "pause", label: "Pause", tone: "warning" as const },
            { value: "stop", label: "Stop", tone: "danger" as const },
            { value: "rollback", label: "Rollback", tone: "danger" as const },
        ];
    if (state === "paused")
        return [
            { value: "activate", label: "Resume", tone: "success" as const },
            { value: "stop", label: "Stop", tone: "danger" as const },
        ];
    return [];
}

function isoFromLocalInput(value: string): string {
    if (!value) return "";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}
