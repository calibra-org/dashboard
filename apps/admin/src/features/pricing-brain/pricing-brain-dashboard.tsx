"use client";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, HelperTooltip, Input, Label } from "@calibra/panel-kit";
import { useActionState, type ReactNode } from "react";

import { BadgePercent, BarChart3, Package, ShieldCheck, Sparkles, TrendingUp, Wallet } from "#/icons";
import { Link } from "#/lib/i18n/navigation";

import { initialPricingSimulationState, simulatePricingAction } from "./actions";

export interface PricingBrainOverview {
    catalog: {
        products: number;
        priced_products: number;
        sale_products: number;
        pricing_coverage_percent: number;
    };
    promotions: {
        coupons: number;
        active_coupons: number;
    };
    intelligence: {
        elasticity: { status: string; reason: string };
        economics: { status: string; reason: string };
    };
    runtime: {
        base_price_resolver: string;
        promotion_engine: string;
        simulation_engine: string;
    };
}

export function PricingBrainDashboard({ overview }: { overview: PricingBrainOverview }) {
    const [state, formAction, pending] = useActionState(simulatePricingAction, initialPricingSimulationState);

    return (
        <div className="flex flex-col gap-6" dir="rtl">
            <header className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Sparkles className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                        <h1 className="font-semibold text-2xl tracking-tight">مغز قیمت‌گذاری و پروموشن</h1>
                        <p className="mt-1 max-w-3xl text-muted-foreground text-sm leading-6">
                            مرکز کنترل تصمیم‌های قیمت و تخفیف؛ بدون ساخت موتور موازی. قیمت پایه از Price Resolver موجود و تخفیف‌ها از Discounter مشترک Calibra خوانده می‌شوند.
                        </p>
                    </div>
                </div>
            </header>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="نمای کلی قیمت‌گذاری">
                <MetricCard
                    title="محصولات قیمت‌دار"
                    value={`${overview.catalog.priced_products} از ${overview.catalog.products}`}
                    detail={`${overview.catalog.pricing_coverage_percent}% پوشش قیمت مرجع`}
                    icon={<Package className="size-4" aria-hidden="true" />}
                    help="تعداد محصولاتی که regular_price معتبر دارند. این عدد مستقیماً از کاتالوگ tenant فعلی خوانده می‌شود و دادهٔ نمایشی نیست."
                />
                <MetricCard
                    title="فروش ویژه تعریف‌شده"
                    value={String(overview.catalog.sale_products)}
                    detail="محصول دارای sale_price"
                    icon={<TrendingUp className="size-4" aria-hidden="true" />}
                    help="محصولاتی که sale_price برای آن‌ها ثبت شده است. فعال‌بودن زمانی همچنان توسط Price Resolver موجود کنترل می‌شود."
                />
                <MetricCard
                    title="کوپن‌های فعال"
                    value={`${overview.promotions.active_coupons} از ${overview.promotions.coupons}`}
                    detail="موتور تخفیف موجود"
                    icon={<BadgePercent className="size-4" aria-hidden="true" />}
                    help="تعداد کوپن‌های فعال از domain فعلی Coupons. Phase 18 موتور تخفیف دوم نمی‌سازد و همان Discounter را مصرف می‌کند."
                />
                <MetricCard
                    title="وضعیت شواهد اقتصادی"
                    value="نیازمند داده"
                    detail="Margin ساختگی نمایش داده نمی‌شود"
                    icon={<Wallet className="size-4" aria-hidden="true" />}
                    help="تا وقتی پوشش COGS برای کاتالوگ اثبات نشود، سیستم سود و پیشنهاد اقتصادی جعلی تولید نمی‌کند."
                />
            </section>

            <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <BarChart3 className="size-4" aria-hidden="true" />
                            شبیه‌ساز قیمت با Guardrail واقعی
                            <HelperTooltip side="bottom">
                                این فرم همان هستهٔ تصمیم Phase 18 را در API اجرا می‌کند. اگر کف قیمت، حد تخفیف یا حداقل Margin نقض شود، قیمت پیشنهادی رد می‌شود و قیمت مرجع به‌عنوان effective price باقی می‌ماند.
                            </HelperTooltip>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form action={formAction} className="grid gap-4 md:grid-cols-2">
                            <Field name="reference_price" label="قیمت مرجع" required help="قیمت پایه قبل از پیشنهاد جدید، در واحد خرد ارز فروشگاه." />
                            <Field name="candidate_price" label="قیمت پیشنهادی" required help="قیمتی که می‌خواهید قبل از فعال‌سازی از نظر Guardrail بررسی شود." />
                            <Field name="quantity" label="تعداد" defaultValue="1" help="برای محاسبه درآمد و سود ناخالص سناریو استفاده می‌شود." />
                            <Field name="floor_price" label="کف قیمت" help="اگر قیمت پیشنهادی پایین‌تر از این مقدار باشد، تصمیم رد می‌شود." />
                            <Field name="cogs" label="COGS" help="هزینه کالای فروش‌رفته برای یک واحد. اختیاری است؛ اگر خالی باشد Margin محاسبه نمی‌شود." />
                            <Field name="minimum_margin_percent" label="حداقل Margin (%)" help="حداقل حاشیه سود ناخالص مجاز. فقط وقتی COGS وارد شده باشد قابل ارزیابی است." />
                            <Field name="maximum_discount_percent" label="حداکثر تخفیف (%)" help="حداکثر افت مجاز نسبت به قیمت مرجع؛ از ۰ تا ۱۰۰." />
                            <div className="flex items-end">
                                <Button type="submit" className="w-full" disabled={pending}>
                                    {pending ? "در حال شبیه‌سازی…" : "اجرای شبیه‌سازی"}
                                </Button>
                            </div>
                        </form>

                        {state.error ? (
                            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm" role="alert">
                                {state.error}
                            </div>
                        ) : null}
                        {state.data ? <SimulationResult data={state.data} /> : null}
                    </CardContent>
                </Card>

                <div className="flex flex-col gap-4">
                    <EvidenceCard title="کشش قیمت" status="شواهد ناکافی" reason={overview.intelligence.elasticity.reason} />
                    <EvidenceCard title="اقتصاد و COGS" status="شواهد ناکافی" reason={overview.intelligence.economics.reason} />
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <ShieldCheck className="size-4" aria-hidden="true" />
                                مسیرهای مرجع
                                <HelperTooltip>این بخش نشان می‌دهد Phase 18 به کدام اجزای canonical متصل است تا از ایجاد سیستم موازی جلوگیری شود.</HelperTooltip>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2 text-sm">
                            <RuntimeRow label="قیمت پایه" value="Price Resolver موجود" />
                            <RuntimeRow label="پروموشن" value="Discounter موجود" />
                            <RuntimeRow label="شبیه‌سازی" value="Pricing Decision Engine" />
                            <div className="mt-2 flex flex-wrap gap-2">
                                <Button asChild variant="outline" size="sm"><Link href="/products">مدیریت محصولات</Link></Button>
                                <Button asChild variant="outline" size="sm"><Link href="/coupons">مدیریت کوپن‌ها</Link></Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function MetricCard({ title, value, detail, icon, help }: { title: string; value: string; detail: string; icon: ReactNode; help: string }) {
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
            </CardContent>
        </Card>
    );
}

function Field({ name, label, help, required, defaultValue }: { name: string; label: string; help: string; required?: boolean; defaultValue?: string }) {
    return (
        <div className="flex flex-col gap-2">
            <Label htmlFor={name} className="flex items-center gap-1">
                {label}
                <HelperTooltip>{help}</HelperTooltip>
            </Label>
            <Input id={name} name={name} inputMode="decimal" required={required} defaultValue={defaultValue} dir="ltr" className="text-end" />
        </div>
    );
}

function EvidenceCard({ title, status, reason }: { title: string; status: string; reason: string }) {
    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-medium text-sm">
                        {title}
                        <HelperTooltip>{reason}</HelperTooltip>
                    </div>
                    <Badge variant="outline" tone="warning">{status}</Badge>
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
            <span className="font-medium">{value}</span>
        </div>
    );
}

function SimulationResult({ data }: { data: NonNullable<import("./actions").PricingSimulationState["data"]> }) {
    return (
        <div className="mt-5 rounded-xl border bg-muted/20 p-4" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">نتیجه شبیه‌سازی</div>
                <Badge variant="outline" tone={data.accepted ? "success" : "danger"}>{data.accepted ? "قابل قبول" : "رد شده"}</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ResultMetric label="قیمت مؤثر" value={data.effectivePrice} help="اگر Guardrail نقض شود، قیمت مرجع حفظ می‌شود." />
                <ResultMetric label="درصد تخفیف" value={`${data.discountPercent}%`} help="اختلاف قیمت پیشنهادی با قیمت مرجع." />
                <ResultMetric label="درآمد ناخالص" value={data.grossRevenue} help="قیمت مؤثر ضربدر تعداد سناریو." />
                <ResultMetric label="Margin" value={data.marginPercent === null ? "داده موجود نیست" : `${data.marginPercent}%`} help="فقط با COGS واقعی محاسبه می‌شود." />
            </div>
            {data.violations.length > 0 ? (
                <div className="mt-4 flex flex-col gap-2">
                    {data.violations.map((violation) => (
                        <div key={violation.code} className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm">
                            <div className="font-medium">{violationLabel(violation.code)}</div>
                            <div className="mt-1 text-muted-foreground text-xs">مقدار فعلی: {violation.actual} — حد لازم: {violation.required}</div>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function ResultMetric({ label, value, help }: { label: string; value: string | number; help: string }) {
    return (
        <div className="rounded-lg border bg-background p-3">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">{label}<HelperTooltip>{help}</HelperTooltip></div>
            <div className="mt-2 font-semibold tabular-nums">{value}</div>
        </div>
    );
}

function violationLabel(code: string): string {
    switch (code) {
        case "below_floor": return "پایین‌تر از کف قیمت";
        case "below_margin": return "Margin کمتر از حد مجاز";
        case "discount_too_deep": return "تخفیف بیش از حد مجاز";
        case "invalid_price": return "قیمت نامعتبر";
        default: return "Guardrail نقض شده";
    }
}
