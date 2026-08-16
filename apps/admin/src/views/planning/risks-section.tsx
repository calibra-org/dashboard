"use client";
import type { Locale } from "@calibra/shared/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { StatusBadge } from "#/components/StatusBadge";
import { formatNumber } from "#/lib/format";
import { type InventoryRisk, usePlanningRisks } from "#/lib/queries/planning";
import { AsyncState, InfoLabel, statusFa, statusTone } from "./planning-shared";

export function RisksSection({ locale }: { locale: Locale }) {
    const query = usePlanningRisks();
    if (query.isPending || query.isError) return <AsyncState pending={query.isPending} error={query.isError} onRetry={() => void query.refetch()} />;
    const items = query.data.data.items;
    if (items.length === 0) return <AsyncState pending={false} error={false} empty />;
    return (
        <Card>
            <CardHeader><CardTitle className="text-base"><InfoLabel help="ریسک از مقایسه stock فعلی canonical با مجموع Forecast افق ساخته می‌شود. این صفحه stock را تغییر نمی‌دهد و درصد احتمال جعلی نمایش نمی‌دهد.">صف ریسک موجودی</InfoLabel></CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[760px] text-sm"><thead className="border-border border-y bg-muted/40 text-muted-foreground text-xs"><tr><th className="px-4 py-3 text-start"><InfoLabel help="نام snapshot‌شده از آخرین Forecast series؛ برای عملیات واقعی از Product/Inventory canonical استفاده می‌شود.">کالا</InfoLabel></th><th className="px-4 py-3 text-end"><InfoLabel help="موجودی فعلی از inventory_items؛ این مقدار cache نمی‌شود چون stale stock می‌تواند باعث تصمیم غلط شود.">موجودی</InfoLabel></th><th className="px-4 py-3 text-end"><InfoLabel help="مجموع point forecast در افق آخرین Run، نه سفارش خرید پیشنهادی.">تقاضای افق</InfoLabel></th><th className="px-4 py-3 text-end"><InfoLabel help="تقریب تعداد روز پوشش موجودی بر اساس متوسط روزانه Forecast. در داده ناموجود «—» نمایش داده می‌شود.">پوشش</InfoLabel></th><th className="px-4 py-3 text-start"><InfoLabel help="High/Medium/Low rule-based است؛ اگر احتمال کالیبره‌شده وجود نداشته باشد درصد نمایش داده نمی‌شود.">ریسک</InfoLabel></th><th className="px-4 py-3 text-start">دلیل</th></tr></thead><tbody className="divide-y divide-border">{items.slice(0, 100).map((item) => <RiskRow key={`${item.product_id}:${item.variation_id}:${item.sku ?? ""}`} item={item} locale={locale} />)}</tbody></table></CardContent>
        </Card>
    );
}
function RiskRow({ item, locale }: { item: InventoryRisk; locale: Locale }) {
    const reason: Record<string, string> = { PROJECTED_STOCKOUT: "Forecast از موجودی فعلی عبور می‌کند", LOW_COVERAGE: "حاشیه پوشش محدود است", OVERSTOCK_CANDIDATE: "موجودی نسبت به Forecast بسیار بالاست", SUFFICIENT_COVERAGE: "پوشش فعلی کافی است", INVENTORY_NOT_MANAGED: "موجودی قابل اتکا برای این series نیست" };
    return <tr className="hover:bg-muted/25"><td className="px-4 py-3"><div className="font-medium">{item.name}</div><div className="mt-0.5 text-muted-foreground text-xs">{item.sku ?? "بدون SKU"}</div></td><td className="px-4 py-3 text-end tabular-nums">{item.stock === null ? "—" : formatNumber(item.stock, locale)}</td><td className="px-4 py-3 text-end tabular-nums">{formatNumber(Math.round(item.forecast_quantity), locale)}</td><td className="px-4 py-3 text-end tabular-nums">{item.coverage_days === null ? "—" : `${formatNumber(Math.round(item.coverage_days), locale)} روز`}</td><td className="px-4 py-3"><StatusBadge tone={statusTone(item.risk)}>{statusFa(item.risk)}</StatusBadge></td><td className="px-4 py-3 text-muted-foreground text-xs">{reason[item.reason_code] ?? item.reason_code}</td></tr>;
}
