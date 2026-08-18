"use client";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, HelperTooltip, Input, Label } from "@calibra/panel-kit";
import { useActionState, type ReactNode } from "react";

import { BadgePercent, BarChart3, Package, ShieldCheck, Sparkles, TrendingUp, Wallet } from "#/icons";
import { Link } from "#/lib/i18n/navigation";

import { initialPricingSimulationState, simulatePricingAction } from "./actions";

export interface PricingBrainOverview {
    catalog: { products: number; priced_products: number; sale_products: number; pricing_coverage_percent: number };
    promotions: { coupons: number; active_coupons: number; authority: string };
    economics: {
        covered_products: number;
        coverage_percent: number;
        latest_cost_evidence_at: string | null;
        status: "available" | "unavailable";
        authority: string;
    };
    evidence: {
        elasticity: { status: string; reason: string };
        experimentation: { status: string; reason: string };
    };
    runtime: {
        base_price_resolver: string;
        promotion_engine: string;
        economics_source: string;
        simulation_engine: string;
        autonomy_level: number;
        activation_enabled: boolean;
    };
}

export function PricingBrainDashboard({ overview }: { overview: PricingBrainOverview }) {
    const [state, formAction, pending] = useActionState(simulatePricingAction, initialPricingSimulationState);

    return (
        <div className="flex flex-col gap-6" dir="rtl">
            <header className="overflow-hidden rounded-2xl border bg-gradient-to-bl from-primary/10 via-background to-background p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-5">
                    <div className="flex items-start gap-4">
                        <div className="grid size-12 shrink-0 place-items-center rounded-2xl border bg-background/80 text-primary shadow-sm">
                            <Sparkles className="size-5" aria-hidden="true" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="font-semibold text-2xl tracking-tight">مغز قیمت‌گذاری و پروموشن</h1>
                                <Badge variant="outline" tone="info">Phase 18</Badge>
                                <Badge variant="outline" tone="success">Autonomy L{overview.runtime.autonomy_level}</Badge>
                            </div>
                            <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-7">
                                تصمیم‌یار اقتصادی قیمت و تخفیف روی Price Resolver، Discounter و Economics موجود Calibra؛ بدون موتور موازی و بدون ادعای causal یا Margin ساختگی.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button asChild variant="outline" size="sm"><Link href="/economics">مرکز اقتصاد</Link></Button>
                        <Button asChild variant="outline" size="sm"><Link href="/coupons">پروموشن‌ها</Link></Button>
                    </div>
                </div>
            </header>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="نمای کلیدی قیمت‌گذاری">
                <MetricCard title="پوشش قیمت" value={`${overview.catalog.pricing_coverage_percent}%`} detail={`${overview.catalog.priced_products} از ${overview.catalog.products} محصول`} icon={<Package className="size-4" aria-hidden="true" />} help="از regular_price کاتالوگ tenant فعلی محاسبه می‌شود." progress={overview.catalog.pricing_coverage_percent} />
                <MetricCard title="پوشش COGS" value={`${overview.economics.coverage_percent}%`} detail={`${overview.economics.covered_products} محصول با Cost Layer`} icon={<Wallet className="size-4" aria-hidden="true" />} help="پوشش واقعی Phase 12 Economics؛ نبود داده با صفر یا unavailable نمایش داده می‌شود." progress={overview.economics.coverage_percent} />
                <MetricCard title="کوپن فعال" value={`${overview.promotions.active_coupons}`} detail={`از ${overview.promotions.coupons} کوپن`} icon={<BadgePercent className="size-4" aria-hidden="true" />} help="از domain فعلی Coupons و Discounter مشترک خوانده می‌شود." />
                <MetricCard title="فروش ویژه" value={`${overview.catalog.sale_products}`} detail="محصول دارای sale_price" icon={<TrendingUp className="size-4" aria-hidden="true" />} help="فعال‌شدن زمانی sale همچنان توسط Price Resolver canonical تعیین می‌شود." />
            </section>

            <div className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
                <Card className="overflow-hidden">
                    <CardHeader className="border-b bg-muted/20">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <BarChart3 className="size-4" aria-hidden="true" />
                            آزمایشگاه تصمیم قیمت
                            <HelperTooltip side="bottom">Simulation و production candidate validation از یک هسته deterministic استفاده می‌کنند. این صفحه هیچ قیمت محصولی را فعال یا ذخیره نمی‌کند.</HelperTooltip>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-5">
                        <form action={formAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <Field name="reference_price" label="قیمت مرجع" required help="قیمت فعلی در integer minor units." />
                            <Field name="candidate_price" label="قیمت پیشنهادی" required help="Candidate برای ارزیابی؛ صفر یا بیشتر." />
                            <Field name="quantity" label="تعداد" defaultValue="1" help="برای درآمد و سود سناریو." />
                            <Field name="product_id" label="شناسه محصول" help="اختیاری؛ برای بازیابی COGS از Phase 12 وقتی COGS دستی وارد نشده است." />
                            <Field name="variation_id" label="شناسه واریانت" help="اگر Cost Evidence مربوط به واریانت است وارد شود." />
                            <Field name="floor_price" label="کف قیمت" help="Candidate پایین‌تر از این مقدار رد می‌شود." />
                            <Field name="cogs" label="COGS دستی" help="اختیاری؛ اگر خالی باشد ابتدا Cost Snapshot و سپس Cost Layer واقعی بررسی می‌شود." />
                            <Field name="minimum_margin_percent" label="حداقل Margin (%)" help="۰ تا ۱۰۰. بدون COGS، این Guardrail با missing_economics رد می‌شود." />
                            <Field name="maximum_discount_percent" label="حداکثر تخفیف (%)" help="حداکثر افت مجاز نسبت به قیمت مرجع، بین ۰ تا ۱۰۰." />
                            <div className="flex items-end md:col-span-2 xl:col-span-3">
                                <Button type="submit" className="w-full" disabled={pending}>{pending ? "در حال شبیه‌سازی…" : "شبیه‌سازی و کنترل Guardrail"}</Button>
                            </div>
                        </form>
                        {state.error ? <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm" role="alert">{state.error}</div> : null}
                        {state.data ? <SimulationResult data={state.data} /> : null}
                    </CardContent>
                </Card>

                <div className="flex flex-col gap-4">
                    <EvidenceCard title="اقتصاد Phase 12" status={overview.economics.status === "available" ? "متصل" : "بدون پوشش"} tone={overview.economics.status === "available" ? "success" : "warning"} reason={overview.economics.latest_cost_evidence_at ? `آخرین شواهد هزینه: ${overview.economics.latest_cost_evidence_at}` : "Cost Layer قابل استفاده ثبت نشده است."} />
                    <EvidenceCard title="کشش قیمت" status="شواهد ناکافی" tone="warning" reason={overview.evidence.elasticity.reason} />
                    <EvidenceCard title="آزمایش causal" status="غیرفعال" tone="warning" reason={overview.evidence.experimentation.reason} />
                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4" aria-hidden="true" />مسیر مرجع<HelperTooltip>Phase 18 این authorityها را مصرف می‌کند و جایگزینشان نمی‌شود.</HelperTooltip></CardTitle></CardHeader>
                        <CardContent className="flex flex-col gap-2 text-sm">
                            <RuntimeRow label="Base price" value="Price Resolver" />
                            <RuntimeRow label="Promotion" value="Discounter" />
                            <RuntimeRow label="COGS" value="Phase 12" />
                            <RuntimeRow label="Activation" value={overview.runtime.activation_enabled ? "فعال" : "قفل‌شده"} />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function MetricCard({ title, value, detail, icon, help, progress }: { title: string; value: string; detail: string; icon: ReactNode; help: string; progress?: number }) {
    const width = Math.min(100, Math.max(0, progress ?? 0));
    return <Card><CardContent className="p-5"><div className="flex items-center gap-2 text-muted-foreground text-sm">{icon}<span>{title}</span><HelperTooltip>{help}</HelperTooltip></div><div className="mt-4 font-semibold text-2xl tabular-nums">{value}</div><div className="mt-1 text-muted-foreground text-xs">{detail}</div>{progress !== undefined ? <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${width}%` }} /></div> : null}</CardContent></Card>;
}

function Field({ name, label, help, required, defaultValue }: { name: string; label: string; help: string; required?: boolean; defaultValue?: string }) {
    return <div className="flex flex-col gap-2"><Label htmlFor={name} className="flex items-center gap-1">{label}<HelperTooltip>{help}</HelperTooltip></Label><Input id={name} name={name} inputMode="decimal" required={required} defaultValue={defaultValue} dir="ltr" className="text-end" /></div>;
}

function EvidenceCard({ title, status, reason, tone }: { title: string; status: string; reason: string; tone: "success" | "warning" }) {
    return <Card><CardContent className="p-5"><div className="flex items-center justify-between gap-3"><div className="font-medium text-sm">{title}</div><Badge variant="outline" tone={tone}>{status}</Badge></div><p className="mt-3 text-muted-foreground text-xs leading-5">{reason}</p></CardContent></Card>;
}

function RuntimeRow({ label, value }: { label: string; value: string }) {
    return <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}

function SimulationResult({ data }: { data: NonNullable<import("./actions").PricingSimulationState["data"]> }) {
    const decision = data.decision;
    return <div className="mt-5 rounded-xl border bg-muted/20 p-4" aria-live="polite"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium">نتیجه شبیه‌سازی</div><div className="flex gap-2"><Badge variant="outline" tone={decision.accepted ? "success" : "danger"}>{decision.accepted ? "قابل قبول" : "رد شده"}</Badge><Badge variant="outline" tone={data.economics.value === null ? "warning" : "info"}>{economicsLabel(data.economics.source)}</Badge></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><ResultMetric label="قیمت مؤثر" value={decision.effectivePrice} /><ResultMetric label="تخفیف" value={`${decision.discountPercent}%`} /><ResultMetric label="درآمد ناخالص" value={decision.grossRevenue} /><ResultMetric label="Margin" value={decision.marginPercent === null ? "ناموجود" : `${decision.marginPercent}%`} /></div>{decision.violations.length > 0 ? <div className="mt-4 flex flex-col gap-2">{decision.violations.map((item) => <div key={item.code} className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm"><div className="font-medium">{violationLabel(item.code)}</div><div className="mt-1 text-muted-foreground text-xs">{item.message} · مقدار فعلی: {item.actual ?? "ناموجود"} · حد: {item.required}</div></div>)}</div> : null}</div>;
}

function ResultMetric({ label, value }: { label: string; value: string | number }) {
    return <div className="rounded-lg border bg-background p-3"><div className="text-muted-foreground text-xs">{label}</div><div className="mt-2 font-semibold tabular-nums">{value}</div></div>;
}

function economicsLabel(source: string): string {
    if (source === "realized_snapshot") return "COGS تحقق‌یافته";
    if (source === "cost_layer") return "Cost Layer";
    if (source === "explicit") return "COGS دستی";
    return "Economics ناموجود";
}

function violationLabel(code: string): string {
    if (code === "below_floor") return "پایین‌تر از کف قیمت";
    if (code === "below_margin") return "Margin کمتر از حد مجاز";
    if (code === "discount_too_deep") return "تخفیف بیش از حد مجاز";
    if (code === "missing_economics") return "شواهد اقتصادی موجود نیست";
    if (code === "invalid_price") return "قیمت نامعتبر";
    return "Guardrail نقض شده";
}
