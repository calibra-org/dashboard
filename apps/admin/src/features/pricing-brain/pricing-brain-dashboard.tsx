"use client";

import {
    Badge,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    HelperTooltip,
    Input,
    Label,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@calibra/panel-kit";
import { useActionState, type ReactNode } from "react";

import { BadgePercent, BarChart3, Package, ShieldCheck, Sparkles, TrendingUp, Wallet } from "#/icons";
import { Link } from "#/lib/i18n/navigation";

import { initialPricingSimulationState, simulatePricingAction } from "./actions";
import { PricingGovernance } from "./pricing-governance";
import type { PricingBrainOverview } from "./types";

export function PricingBrainDashboard({ overview, locale }: { overview: PricingBrainOverview; locale: string }) {
    const fa = locale.toLowerCase().startsWith("fa");
    const copy = workspaceCopy(fa);

    return (
        <div className="flex flex-col gap-6" dir={fa ? "rtl" : "ltr"}>
            <header className="overflow-hidden rounded-2xl border bg-gradient-to-bl from-primary/10 via-background to-background p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-5">
                    <div className="flex items-start gap-4">
                        <div className="grid size-12 shrink-0 place-items-center rounded-2xl border bg-background/80 text-primary shadow-sm">
                            <Sparkles className="size-5" aria-hidden="true" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="font-semibold text-2xl tracking-tight">{copy.title}</h1>
                                <Badge variant="outline" tone="info">Phase 18</Badge>
                                <Badge variant="outline" tone="success">Autonomy L{overview.runtime.autonomy_level}</Badge>
                                <Badge variant="outline" tone={overview.policies.some((item) => item.status === "frozen") ? "warning" : "success"}>
                                    {overview.policies.some((item) => item.status === "frozen") ? copy.freezePresent : copy.governanceReady}
                                </Badge>
                            </div>
                            <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-7">{copy.description}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" size="sm">
                            <Link href="/economics">{copy.economics}</Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                            <Link href="/coupons">{copy.promotions}</Link>
                        </Button>
                    </div>
                </div>
            </header>

            <Tabs defaultValue="overview" variant="line" className="w-full">
                <TabsList className="w-full justify-start overflow-x-auto">
                    <TabsTrigger value="overview">{copy.tabOverview}</TabsTrigger>
                    <TabsTrigger value="policies">{copy.tabPolicies}</TabsTrigger>
                    <TabsTrigger value="proposals">{copy.tabProposals}</TabsTrigger>
                    <TabsTrigger value="simulation">{copy.tabSimulation}</TabsTrigger>
                    <TabsTrigger value="evidence">{copy.tabEvidence}</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-5">
                    <OverviewTab overview={overview} fa={fa} />
                </TabsContent>
                <TabsContent value="policies" className="mt-5">
                    <PricingGovernance policies={overview.policies} proposals={overview.proposals} locale={locale} mode="policies" />
                </TabsContent>
                <TabsContent value="proposals" className="mt-5">
                    <PricingGovernance policies={overview.policies} proposals={overview.proposals} locale={locale} mode="proposals" />
                </TabsContent>
                <TabsContent value="simulation" className="mt-5">
                    <SimulationLab fa={fa} />
                </TabsContent>
                <TabsContent value="evidence" className="mt-5">
                    <EvidenceWorkspace overview={overview} fa={fa} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function OverviewTab({ overview, fa }: { overview: PricingBrainOverview; fa: boolean }) {
    const activePolicies = overview.policies.filter((item) => item.latest_version?.state === "active").length;
    const awaitingApproval = overview.policies.filter((item) => ["review", "approved", "scheduled"].includes(item.latest_version?.state ?? "")).length;
    return (
        <div className="flex flex-col gap-5">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label={fa ? "نمای کلیدی قیمت‌گذاری" : "Pricing KPIs"}>
                <MetricCard
                    title={fa ? "پوشش قیمت" : "Pricing coverage"}
                    value={`${overview.catalog.pricing_coverage_percent}%`}
                    detail={fa ? `${overview.catalog.priced_products} از ${overview.catalog.products} محصول` : `${overview.catalog.priced_products} of ${overview.catalog.products} products`}
                    icon={<Package className="size-4" aria-hidden="true" />}
                    help={fa ? "از regular_price کاتالوگ tenant فعلی محاسبه می‌شود." : "Calculated from regular_price in the current tenant catalog."}
                    progress={overview.catalog.pricing_coverage_percent}
                />
                <MetricCard
                    title={fa ? "پوشش COGS" : "COGS coverage"}
                    value={`${overview.economics.coverage_percent}%`}
                    detail={fa ? `${overview.economics.covered_products} محصول با Cost Evidence` : `${overview.economics.covered_products} products with cost evidence`}
                    icon={<Wallet className="size-4" aria-hidden="true" />}
                    help={fa ? "پوشش واقعی Phase 12 Economics؛ داده مفقود با unavailable نمایش داده می‌شود." : "Real Phase 12 Economics coverage; missing data remains unavailable."}
                    progress={overview.economics.coverage_percent}
                />
                <MetricCard
                    title={fa ? "کوپن فعال" : "Active coupons"}
                    value={`${overview.promotions.active_coupons}`}
                    detail={fa ? `از ${overview.promotions.coupons} کوپن` : `of ${overview.promotions.coupons} coupons`}
                    icon={<BadgePercent className="size-4" aria-hidden="true" />}
                    help={fa ? "از domain فعلی Coupons و Discounter مشترک خوانده می‌شود." : "Read from the existing Coupons domain and shared Discounter."}
                />
                <MetricCard
                    title={fa ? "Policy فعال" : "Active policies"}
                    value={`${activePolicies}`}
                    detail={fa ? `${awaitingApproval} مورد در مسیر تصمیم` : `${awaitingApproval} awaiting decision`}
                    icon={<ShieldCheck className="size-4" aria-hidden="true" />}
                    help={fa ? "فقط نسخه active و unfrozen می‌تواند Guardrail checkout باشد." : "Only active, unfrozen versions can guard checkout."}
                />
            </section>

            <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
                <Card className="overflow-hidden">
                    <CardHeader className="border-b bg-muted/20">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <BarChart3 className="size-4" aria-hidden="true" />
                            {fa ? "مسیر تصمیم تا Checkout" : "Decision path to checkout"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-5">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <FlowStep index="01" title={fa ? "Proposal" : "Proposal"} detail={fa ? `${overview.proposals.length} پیشنهاد ثبت‌شده` : `${overview.proposals.length} recorded proposals`} />
                            <FlowStep index="02" title={fa ? "Approval" : "Approval"} detail={fa ? `${awaitingApproval} تصمیم باز` : `${awaitingApproval} open decisions`} />
                            <FlowStep index="03" title={fa ? "Guardrail" : "Guardrail"} detail={fa ? `${activePolicies} نسخه فعال` : `${activePolicies} active versions`} />
                            <FlowStep index="04" title="Checkout" detail={fa ? "revalidation + snapshot اتمیک" : "atomic revalidation + snapshot"} />
                        </div>
                        <div className="mt-5 rounded-xl border bg-muted/10 p-4 text-muted-foreground text-sm leading-7">
                            {fa
                                ? "Phase 18 قیمت کاتالوگ را مستقیم بازنویسی نمی‌کند. Price Resolver و Discounter تنها مسیر serving باقی می‌مانند؛ Policy فعال صرفاً candidate را در همان transaction checkout کنترل می‌کند و ردپای immutable ثبت می‌شود."
                                : "Phase 18 does not directly rewrite catalog pricing. Price Resolver and Discounter remain the sole serving path; an active policy only validates the candidate inside the checkout transaction and records an immutable trace."}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ShieldCheck className="size-4" aria-hidden="true" />
                            {fa ? "Authority Map" : "Authority map"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 text-sm">
                        <RuntimeRow label="Base price" value="Price Resolver" />
                        <RuntimeRow label="Promotion" value="Discounter" />
                        <RuntimeRow label="COGS" value="Phase 12 Economics" />
                        <RuntimeRow label="Governance" value="Phase 18 Policy Version" />
                        <RuntimeRow label="Catalog repricing" value={fa ? "خودکار: غیرفعال" : "Automatic: disabled"} />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function SimulationLab({ fa }: { fa: boolean }) {
    const [state, formAction, pending] = useActionState(simulatePricingAction, initialPricingSimulationState);
    return (
        <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20">
                <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="size-4" aria-hidden="true" />
                    {fa ? "آزمایشگاه تصمیم قیمت" : "Pricing decision lab"}
                    <HelperTooltip side="bottom">
                        {fa
                            ? "Simulation و checkout guardrail از همان pricing decision core استفاده می‌کنند. Simulation هیچ قیمت محصولی را ذخیره یا فعال نمی‌کند."
                            : "Simulation and checkout guardrails use the same pricing decision core. Simulation never saves or activates product pricing."}
                    </HelperTooltip>
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
                <form action={formAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Field name="reference_price" label={fa ? "قیمت مرجع" : "Reference price"} required help={fa ? "قیمت مرجع در integer minor units." : "Reference price in integer minor units."} />
                    <Field name="candidate_price" label={fa ? "قیمت پیشنهادی" : "Candidate price"} required help={fa ? "Candidate برای ارزیابی؛ صفر یا بیشتر." : "Candidate to evaluate; zero or greater."} />
                    <Field name="quantity" label={fa ? "تعداد" : "Quantity"} defaultValue="1" help={fa ? "برای درآمد و سود سناریو." : "Used for scenario revenue and profit."} />
                    <Field name="product_id" label="Product ID" help={fa ? "برای بازیابی COGS از Phase 12 وقتی COGS دستی خالی است." : "Used to resolve Phase 12 COGS when manual COGS is empty."} />
                    <Field name="variation_id" label="Variation ID" help={fa ? "برای Cost Evidence سطح واریانت." : "For variation-level cost evidence."} />
                    <Field name="floor_price" label={fa ? "کف قیمت" : "Price floor"} help={fa ? "Candidate پایین‌تر از این مقدار رد می‌شود." : "Candidates below this amount are rejected."} />
                    <Field name="cogs" label={fa ? "COGS دستی" : "Manual COGS"} help={fa ? "اختیاری؛ در غیر این صورت Snapshot و Cost Layer بررسی می‌شوند." : "Optional; otherwise realized snapshots and cost layers are checked."} />
                    <Field name="minimum_margin_percent" label={fa ? "حداقل Margin (%)" : "Minimum margin (%)"} help={fa ? "بدون COGS، Guardrail با missing_economics fail-closed می‌شود." : "Without COGS this guardrail fails closed with missing_economics."} />
                    <Field name="maximum_discount_percent" label={fa ? "حداکثر تخفیف (%)" : "Maximum discount (%)"} help={fa ? "حداکثر افت مجاز نسبت به قیمت مرجع." : "Maximum permitted drop from reference price."} />
                    <div className="flex items-end md:col-span-2 xl:col-span-3">
                        <Button type="submit" className="w-full" disabled={pending}>
                            {pending ? (fa ? "در حال شبیه‌سازی…" : "Simulating…") : fa ? "شبیه‌سازی و کنترل Guardrail" : "Simulate and validate guardrails"}
                        </Button>
                    </div>
                </form>
                {state.error ? <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-danger text-sm" role="alert">{fa ? state.error : "Simulation failed. Check inputs, permissions, and Economics availability."}</div> : null}
                {state.data ? <SimulationResult data={state.data} fa={fa} /> : null}
            </CardContent>
        </Card>
    );
}

function EvidenceWorkspace({ overview, fa }: { overview: PricingBrainOverview; fa: boolean }) {
    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <EvidenceCard
                title={fa ? "اقتصاد Phase 12" : "Phase 12 Economics"}
                status={overview.economics.status === "available" ? (fa ? "متصل" : "Available") : fa ? "بدون پوشش" : "Unavailable"}
                tone={overview.economics.status === "available" ? "success" : "warning"}
                reason={overview.economics.latest_cost_evidence_at ? `${fa ? "آخرین شواهد هزینه" : "Latest cost evidence"}: ${overview.economics.latest_cost_evidence_at}` : fa ? "Cost Layer قابل استفاده ثبت نشده است." : "No usable Cost Layer is recorded."}
            />
            <EvidenceCard title={fa ? "کشش قیمت" : "Price elasticity"} status={fa ? "شواهد ناکافی" : "Insufficient evidence"} tone="warning" reason={overview.evidence.elasticity.reason} />
            <EvidenceCard title={fa ? "آزمایش causal" : "Causal experimentation"} status={fa ? "غیرفعال" : "Unavailable"} tone="warning" reason={overview.evidence.experimentation.reason} />
            <Card className="md:col-span-2 xl:col-span-3">
                <CardContent className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
                    <RuntimeRow label={fa ? "Economics state" : "Economics state"} value={overview.economics.status} />
                    <RuntimeRow label={fa ? "Simulation core" : "Simulation core"} value={overview.runtime.simulation_engine} />
                    <RuntimeRow label={fa ? "Serving promotion" : "Serving promotion"} value={overview.runtime.promotion_engine} />
                    <RuntimeRow label={fa ? "Causal claims" : "Causal claims"} value={fa ? "بدون شواهد: ممنوع" : "Forbidden without evidence"} />
                </CardContent>
            </Card>
        </div>
    );
}

function MetricCard({ title, value, detail, icon, help, progress }: { title: string; value: string; detail: string; icon: ReactNode; help: string; progress?: number }) {
    const width = Math.min(100, Math.max(0, progress ?? 0));
    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    {icon}
                    <span>{title}</span>
                    <HelperTooltip>{help}</HelperTooltip>
                </div>
                <div className="mt-4 font-semibold text-2xl tabular-nums">{value}</div>
                <div className="mt-1 text-muted-foreground text-xs">{detail}</div>
                {progress !== undefined ? <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${width}%` }} /></div> : null}
            </CardContent>
        </Card>
    );
}

function FlowStep({ index, title, detail }: { index: string; title: string; detail: string }) {
    return (
        <div className="rounded-xl border bg-background p-4">
            <div className="font-semibold text-primary text-xs tabular-nums">{index}</div>
            <div className="mt-2 font-medium text-sm">{title}</div>
            <div className="mt-1 text-muted-foreground text-xs leading-5">{detail}</div>
        </div>
    );
}

function Field({ name, label, help, required, defaultValue }: { name: string; label: string; help: string; required?: boolean; defaultValue?: string }) {
    return (
        <div className="flex flex-col gap-2">
            <Label htmlFor={`simulation-${name}`} className="flex items-center gap-1">
                {label}
                <HelperTooltip>{help}</HelperTooltip>
            </Label>
            <Input id={`simulation-${name}`} name={name} inputMode="decimal" required={required} defaultValue={defaultValue} dir="ltr" className="text-end" />
        </div>
    );
}

function EvidenceCard({ title, status, reason, tone }: { title: string; status: string; reason: string; tone: "success" | "warning" }) {
    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-sm">{title}</div>
                    <Badge variant="outline" tone={tone}>{status}</Badge>
                </div>
                <p className="mt-3 text-muted-foreground text-xs leading-5">{reason}</p>
            </CardContent>
        </Card>
    );
}

function RuntimeRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-xs sm:text-sm" dir="auto">{value}</span>
        </div>
    );
}

function SimulationResult({ data, fa }: { data: NonNullable<import("./actions").PricingSimulationState["data"]>; fa: boolean }) {
    const decision = data.decision;
    return (
        <div className="mt-5 rounded-xl border bg-muted/20 p-4" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{fa ? "نتیجه شبیه‌سازی" : "Simulation result"}</div>
                <div className="flex gap-2">
                    <Badge variant="outline" tone={decision.accepted ? "success" : "danger"}>{decision.accepted ? (fa ? "قابل قبول" : "Accepted") : fa ? "رد شده" : "Rejected"}</Badge>
                    <Badge variant="outline" tone={data.economics.value === null ? "warning" : "info"}>{economicsLabel(data.economics.source, fa)}</Badge>
                </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ResultMetric label={fa ? "قیمت مؤثر" : "Effective price"} value={decision.effectivePrice} />
                <ResultMetric label={fa ? "تخفیف" : "Discount"} value={`${decision.discountPercent}%`} />
                <ResultMetric label={fa ? "درآمد ناخالص" : "Gross revenue"} value={decision.grossRevenue} />
                <ResultMetric label="Margin" value={decision.marginPercent === null ? (fa ? "ناموجود" : "Unavailable") : `${decision.marginPercent}%`} />
            </div>
            {decision.violations.length > 0 ? (
                <div className="mt-4 flex flex-col gap-2">
                    {decision.violations.map((item) => (
                        <div key={item.code} className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm">
                            <div className="font-medium text-danger" dir="ltr">{item.code}</div>
                            <div className="mt-1 text-muted-foreground text-xs">{item.message}</div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="mt-4 rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-success text-sm">{fa ? "Candidate از Guardrailهای واردشده عبور کرد." : "The candidate passed the supplied guardrails."}</div>
            )}
        </div>
    );
}

function ResultMetric({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg border bg-background px-3 py-3">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className="mt-1 font-semibold tabular-nums" dir="ltr">{typeof value === "number" ? value.toLocaleString() : value}</div>
        </div>
    );
}

function economicsLabel(source: NonNullable<import("./actions").PricingSimulationState["data"]>["economics"]["source"], fa: boolean) {
    if (source === "explicit") return fa ? "COGS دستی" : "Manual COGS";
    if (source === "realized_snapshot") return fa ? "Cost Snapshot" : "Cost snapshot";
    if (source === "cost_layer") return "Cost Layer";
    return fa ? "Economics ناموجود" : "Economics unavailable";
}

function workspaceCopy(fa: boolean) {
    return fa
        ? {
              title: "مغز قیمت‌گذاری و پروموشن",
              description: "مرکز تصمیم، حاکمیت و شبیه‌سازی قیمت روی Price Resolver، Discounter و Economics موجود Calibra؛ با Policy نسخه‌پذیر، Approval مستقل، Freeze/Rollback و ردپای Checkout، بدون موتور قیمت موازی.",
              economics: "مرکز اقتصاد",
              promotions: "پروموشن‌ها",
              tabOverview: "نمای کلی",
              tabPolicies: "Policy و Approval",
              tabProposals: "Proposalها",
              tabSimulation: "Simulation و Guardrails",
              tabEvidence: "Evidence و Runtime",
              freezePresent: "Freeze فعال",
              governanceReady: "Governed",
          }
        : {
              title: "Pricing & Promotion Brain",
              description: "Decision, governance, and simulation on top of Calibra's existing Price Resolver, Discounter, and Economics, with versioned policies, independent approval, freeze/rollback, and checkout trace—without a parallel pricing engine.",
              economics: "Economics center",
              promotions: "Promotions",
              tabOverview: "Overview",
              tabPolicies: "Policies & approvals",
              tabProposals: "Proposals",
              tabSimulation: "Simulation & guardrails",
              tabEvidence: "Evidence & runtime",
              freezePresent: "Freeze active",
              governanceReady: "Governed",
          };
}
