"use client";
import type { Locale } from "@calibra/shared/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { StatusBadge } from "#/components/StatusBadge";
import { TrendingUp } from "#/icons";
import { formatDateTime, formatNumber } from "#/lib/format";
import { usePlanningOverview } from "#/lib/queries/planning";
import { AsyncState, InfoLabel, MetricCard, statusFa, statusTone } from "./planning-shared";

export function OverviewSection({ locale }: { locale: Locale }) {
    const query = usePlanningOverview();
    if (query.isPending || query.isError) return <AsyncState pending={query.isPending} error={query.isError} onRetry={() => void query.refetch()} />;
    const data = query.data.data;
    const run = data.latest_run;
    const nextAction = {
        RUN_FORECAST: "اولین Forecast را اجرا کنید تا ریسک موجودی قابل محاسبه شود.",
        REVIEW_ACTIVE_CYCLE: "چرخه فعال را بررسی کنید و اگر آماده است به مرحله بعد منتقل کنید.",
        CREATE_PLANNING_CYCLE: "Forecast آماده است؛ یک چرخه برنامه‌ریزی برای بازبینی و انتشار بسازید.",
    }[data.next_action] ?? "وضعیت برنامه‌ریزی را بررسی کنید.";
    return (
        <div className="flex flex-col gap-5">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="سری‌های Forecast" help="تعداد SKU/Product series که در آخرین Run از فروش واقعی ساخته شده‌اند. Series با تاریخچه ناکافی جداگانه گزارش می‌شوند." value={formatNumber(run?.series_count ?? 0, locale)} note={run ? `Run #${formatNumber(run.id, locale)} · ${run.model_code}` : "هنوز Run معتبری وجود ندارد"} tone="info" />
                <MetricCard title="ریسک کمبود بالا" help="تعداد اقلامی که موجودی فعلی آن‌ها از مجموع تقاضای Forecast در افق Run کمتر یا مساوی است. این مقدار احتمال کالیبره‌شده نیست." value={formatNumber(data.risk_counts.high, locale)} note="برچسب ریسک rule-based، نه درصد احتمال" tone={data.risk_counts.high > 0 ? "danger" : "success"} />
                <MetricCard title="ریسک متوسط" help="موجودی بیشتر از Forecast افق است اما حاشیه پوشش محدود دارد. آستانه فعلی بخشی از policy baseline این فاز است." value={formatNumber(data.risk_counts.medium, locale)} note="نیازمند بررسی پوشش و lead time" tone={data.risk_counts.medium > 0 ? "warning" : "neutral"} />
                <MetricCard title="سری‌های داده ناکافی" help="Seriesهایی که روزهای فروش فعال کافی برای اتکا به الگوی هفتگی ندارند. سیستم به‌جای جعل دقت، quality را پایین گزارش می‌کند." value={formatNumber(run?.insufficient_series_count ?? 0, locale)} note="در Forecast با quality مشخص می‌شود" />
            </section>
            <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
                <Card><CardHeader><CardTitle className="text-base"><InfoLabel help="این کارت فقط یک اقدام پیشنهادی بر اساس state فعلی است؛ هیچ action خودکاری روی موجودی یا سفارش اجرا نمی‌کند.">اقدام پیشنهادی بعدی</InfoLabel></CardTitle></CardHeader><CardContent className="flex items-start gap-4"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><TrendingUp className="size-5" aria-hidden="true" /></div><div><div className="font-medium">{nextAction}</div><p className="mt-1 text-muted-foreground text-sm leading-6">Planning OS تصمیم را توضیح می‌دهد، ولی اجرای خرید، تغییر قیمت یا stock mutation در دامنه‌های canonical خودشان انجام می‌شود.</p></div></CardContent></Card>
                <Card><CardHeader><CardTitle className="text-base"><InfoLabel help="چرخه برنامه‌ریزی ظرف حاکمیتی Forecast، بازبینی، تأیید و انتشار است. تغییر status نسخه و Audit دارد.">چرخه فعال</InfoLabel></CardTitle></CardHeader><CardContent>{data.active_cycle ? <div className="flex items-center justify-between gap-3"><div><div className="font-medium">{data.active_cycle.title}</div><div className="mt-1 text-muted-foreground text-xs">آخرین تغییر: {formatDateTime(data.active_cycle.updated_at, locale)}</div></div><StatusBadge tone={statusTone(data.active_cycle.status)}>{statusFa(data.active_cycle.status)}</StatusBadge></div> : <p className="text-muted-foreground text-sm">چرخه فعالی ثبت نشده است.</p>}</CardContent></Card>
            </section>
        </div>
    );
}
