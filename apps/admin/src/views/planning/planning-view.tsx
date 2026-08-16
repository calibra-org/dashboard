"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { ChartNoAxesCombined, Boxes, CalendarClock, FileChartColumnIncreasing, LayoutDashboard, Sparkles, TrendingUp, WandSparkles } from "#/icons";
import { Link } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";
import { planningCopy } from "./planning-copy";
import { InfoLabel } from "./planning-shared";
import { OverviewSection } from "./overview-section";
import { ForecastSection } from "./forecast-section";
import { RisksSection } from "./risks-section";
import { ScenariosSection } from "./scenarios-section";
import { CyclesSection } from "./cycles-section";
import { OverridesSection } from "./overrides-section";
import { HealthSection } from "./health-section";

export type PlanningSection = "overview" | "forecast" | "risks" | "scenarios" | "cycles" | "overrides" | "health";
type Copy = (typeof planningCopy)["fa"];
const NAV: Array<{ section: PlanningSection; href: string; icon: typeof ChartNoAxesCombined }> = [
    { section: "overview", href: "/planning", icon: LayoutDashboard },
    { section: "forecast", href: "/planning/forecast", icon: TrendingUp },
    { section: "risks", href: "/planning/inventory", icon: Boxes },
    { section: "scenarios", href: "/planning/scenarios", icon: WandSparkles },
    { section: "cycles", href: "/planning/cycles", icon: CalendarClock },
    { section: "overrides", href: "/planning/overrides", icon: FileChartColumnIncreasing },
    { section: "health", href: "/planning/health", icon: ChartNoAxesCombined },
];
const SECTION_LABEL: Record<PlanningSection, keyof Copy> = { overview: "overview", forecast: "forecast", risks: "risks", scenarios: "scenarios", cycles: "cycles", overrides: "overrides", health: "health" };

export function PlanningView({ section }: { section: PlanningSection }) {
    const locale = useLocale() as Locale;
    const copy = planningCopy[locale === "fa" ? "fa" : "en"];
    return (
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-5">
            <header className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end lg:justify-between lg:p-6">
                    <div className="max-w-3xl">
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 font-medium text-primary text-xs"><Sparkles className="size-3.5" aria-hidden="true" />Calibra Planning OS · Phase 13</div>
                        <h1 className="font-semibold text-2xl tracking-tight">{copy.title}</h1>
                        <p className="mt-1.5 text-muted-foreground text-sm leading-6">{copy.subtitle}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-xs"><InfoLabel help="این Workspace فقط از داده‌های واقعی Orders، Inventory و داده‌های ذخیره‌شدهٔ Planning می‌خواند. Scenario و Forecast مستقیماً موجودی، قیمت یا سفارش را تغییر نمی‌دهند.">مرز ایمنی: تحلیل و برنامه‌ریزی</InfoLabel></div>
                </div>
                <nav className="flex gap-1 overflow-x-auto border-border border-t px-3 py-2" aria-label="بخش‌های برنامه‌ریزی">
                    {NAV.map((item) => { const Icon = item.icon; const active = item.section === section; return <Link key={item.section} href={item.href as never} className={cn("inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors", active ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}><Icon className="size-3.5" aria-hidden="true" />{copy[SECTION_LABEL[item.section]]}</Link>; })}
                </nav>
            </header>
            {section === "overview" ? <OverviewSection locale={locale} /> : null}
            {section === "forecast" ? <ForecastSection locale={locale} /> : null}
            {section === "risks" ? <RisksSection locale={locale} /> : null}
            {section === "scenarios" ? <ScenariosSection locale={locale} /> : null}
            {section === "cycles" ? <CyclesSection locale={locale} /> : null}
            {section === "overrides" ? <OverridesSection locale={locale} /> : null}
            {section === "health" ? <HealthSection locale={locale} /> : null}
        </div>
    );
}
