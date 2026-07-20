"use client";

import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Braces,
  BrainCircuit,
  ChartNoAxesCombined,
  ChevronLeft,
  CircleUserRound,
  Code2,
  Database,
  FileImage,
  Gavel,
  Globe2,
  Image as ImageIcon,
  Layers3,
  Lightbulb,
  Link2,
  ListChecks,
  RadioTower,
  RefreshCcw,
  Rocket,
  Send,
  Settings2,
  UserRoundSearch,
  WandSparkles,
} from "lucide-react";
import clsx from "clsx";
import { SectionTitle } from "@/src/components/dashboard/overview/OverviewCards";
import type {
  ArchitectureLayer,
  CrawlMetric,
  OverviewAgent,
  OverviewTone,
  SerpBar,
  SystemEngine,
} from "@/src/types/overview";

interface OverviewOperationsProps {
  crawlMetrics: CrawlMetric[];
  serpBars: SerpBar[];
  agents: OverviewAgent[];
  layers: ArchitectureLayer[];
  engines: SystemEngine[];
  onToast: (message: string) => void;
  onOpen: (title: string, description: string) => void;
}

const toneText: Record<OverviewTone, string> = {
  violet: "text-violet-600",
  green: "text-emerald-600",
  orange: "text-amber-500",
  red: "text-rose-500",
  slate: "text-slate-500",
};

const agentIcons: Record<OverviewAgent["icon"], LucideIcon> = {
  search: UserRoundSearch,
  audit: Settings2,
  content: FileImage,
  image: ImageIcon,
  schema: Code2,
  link: Link2,
  competitor: CircleUserRound,
};

const layerIcons: Record<ArchitectureLayer["icon"], LucideIcon> = {
  database: Database,
  rules: Gavel,
  idea: Lightbulb,
  execute: ListChecks,
};

const layerStyles: Record<OverviewTone, string> = {
  violet: "border-violet-200 bg-violet-50/55",
  green: "border-emerald-200 bg-emerald-50/50",
  orange: "border-amber-200 bg-amber-50/55",
  red: "border-rose-200 bg-rose-50/50",
  slate: "border-slate-200 bg-slate-50",
};

const engineIcons: Record<SystemEngine["icon"], LucideIcon> = {
  crawl: RadioTower,
  competitor: UserRoundSearch,
  google: Globe2,
  rules: Braces,
  agents: BrainCircuit,
  image: ImageIcon,
  content: CircleUserRound,
};

function ModuleCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.04)] sm:p-5", className)}>
      {children}
    </section>
  );
}

export function OverviewOperations({ crawlMetrics, serpBars, agents, layers, engines, onToast, onOpen }: OverviewOperationsProps) {
  const maxSerpValue = Math.max(...serpBars.map((item) => item.value));

  return (
    <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-[1.16fr_1.28fr_1.03fr_1.04fr_1.18fr]">
      <ModuleCard>
        <SectionTitle title="وضعیت کرال زنده" icon={RadioTower} />
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          {crawlMetrics.map((metric) => (
            <div key={metric.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0">
              <span className="text-[13px] font-semibold leading-5 text-slate-600" dir="auto">{metric.label}</span>
              <span className="text-xl font-extrabold tabular-nums text-slate-900" dir="ltr">{metric.value}</span>
              <span className={clsx("text-xs font-extrabold", toneText[metric.tone])}>
                {metric.trendDirection === "up" ? "↑" : "↓"} {metric.trend}
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onOpen("گزارش کامل خزش", "خلاصه وضعیت خزش، خطاها، هشدارها، Canonical، Noindex و Redirectها در نمای تفصیلی.")}
          className="mt-4 inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-extrabold text-violet-700 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-300"
        >
          مشاهده گزارش کامل خزش
          <ChevronLeft size={17} />
        </button>
      </ModuleCard>

      <ModuleCard>
        <SectionTitle title="شکاف رقابتی و SERP (کلیدی)" icon={ChartNoAxesCombined} />
        <div className="grid grid-cols-3 gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs font-medium text-slate-500">شکاف رتبه</p>
            <div className="mt-1 flex items-end gap-2"><strong className="text-2xl text-slate-950">۳۱۲</strong><span className="text-xs font-bold text-rose-500">↓ ۸٪</span></div>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">فرصت کلمات کلیدی</p>
            <div className="mt-1 flex items-end gap-2"><strong className="text-2xl text-slate-950">۲٬۴۱۸</strong><span className="text-xs font-bold text-emerald-600">↑ ۱۸٪</span></div>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">SERP Feature</p>
            <div className="mt-1 flex items-end gap-2"><strong className="text-2xl text-slate-950">۱۸</strong><span className="text-xs font-bold text-emerald-600">+۳</span></div>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {serpBars.map((bar) => (
            <div key={bar.id} className="grid grid-cols-[54px_1fr_54px] items-center gap-3 text-sm">
              <span className="font-medium text-slate-600">{bar.label}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${Math.max(14, (bar.value / maxSerpValue) * 100)}%` }} />
              </div>
              <span className="text-left text-xs tabular-nums text-slate-500" dir="ltr">{bar.displayValue}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onOpen("تحلیل کامل رقبا", "مقایسه سهم دید، شکاف رتبه، فرصت‌های کلمات کلیدی و SERP Feature میان فروشگاه و رقبا.")}
          className="mt-5 inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-extrabold text-violet-700 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-300"
        >
          تحلیل کامل رقبا
          <ChevronLeft size={17} />
        </button>
      </ModuleCard>

      <ModuleCard>
        <SectionTitle title="دیویژن‌های فعال" icon={Bot} />
        <div className="grid grid-cols-2 gap-3">
          {agents.slice(0, 6).map((agent) => {
            const Icon = agentIcons[agent.icon];
            return (
              <button
                type="button"
                key={agent.id}
                onClick={() => onOpen(agent.name, `${agent.name} فعال است و آخرین پایش را با موفقیت تکمیل کرده است.`)}
                className="relative flex min-h-24 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center transition hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/30 focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <span className="absolute left-3 top-3 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <Icon size={25} className="text-violet-600" strokeWidth={1.8} />
                <span className="mt-2 text-xs font-bold text-slate-700" dir="ltr">{agent.name}</span>
              </button>
            );
          })}
        </div>
        {agents[6] ? (
          <button
            type="button"
            onClick={() => onOpen(agents[6].name, "Agent تحلیل هوش رقابتی فعال است و داده‌های رقبا را پایش می‌کند.")}
            className="relative mt-3 flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 transition hover:border-violet-200 hover:bg-violet-50/30 focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            <span className="absolute left-3 top-3 h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <UserRoundSearch size={23} className="text-violet-600" />
            <span className="text-sm font-bold text-slate-700" dir="ltr">{agents[6].name}</span>
          </button>
        ) : null}
      </ModuleCard>

      <ModuleCard>
        <SectionTitle title="معماری چهارلایه" icon={Layers3} />
        <div className="space-y-2.5">
          {layers.map((layer) => {
            const Icon = layerIcons[layer.icon];
            return (
              <button
                type="button"
                key={layer.id}
                onClick={() => onOpen(layer.title, layer.description)}
                className={clsx("flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-right transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-300", layerStyles[layer.tone])}
              >
                <span className={clsx("grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80", toneText[layer.tone])}><Icon size={20} /></span>
                <span>
                  <strong className="block text-sm text-slate-900">{layer.title}</strong>
                  <small className="mt-0.5 block text-[13px] leading-5 text-slate-500">{layer.description}</small>
                </span>
              </button>
            );
          })}
        </div>
      </ModuleCard>

      <ModuleCard>
        <SectionTitle title="موتورهای اصلی سیستم" icon={BrainCircuit} />
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          {engines.map((engine) => {
            const Icon = engineIcons[engine.icon];
            return (
              <button
                type="button"
                key={engine.id}
                onClick={() => onOpen(engine.name, engine.description ?? "موتور فعال سیستم")}
                className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-right transition last:border-b-0 hover:bg-violet-50/30 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>
                  <strong className="block text-sm font-bold text-slate-800">{engine.name}</strong>
                  {engine.description ? <small className="mt-0.5 hidden text-xs leading-5 text-slate-500 xl:block">{engine.description}</small> : null}
                </span>
                <Icon size={20} className="text-violet-600" strokeWidth={1.8} />
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-center text-[13px] leading-5 text-slate-500">اعمال تغییرات هوشمند روی چندین موجودیت</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => onToast("پیشنهادات بصری آماده نمایش هستند")} className="rounded-xl border border-violet-200 bg-violet-50 px-2 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-100"><WandSparkles className="mx-auto mb-1" size={17} />پیشنهادات بصری</button>
          <button type="button" onClick={() => onToast("موارد منتخب برای تأیید ارسال شدند")} className="rounded-xl bg-violet-600 px-2 py-2 text-xs font-bold text-white transition hover:bg-violet-700"><Send className="mx-auto mb-1" size={17} />ارسال برای تأیید</button>
          <button type="button" onClick={() => onToast("اجرای فوری در محیط نمایشی شبیه‌سازی شد")} className="rounded-xl bg-violet-600 px-2 py-2 text-xs font-bold text-white transition hover:bg-violet-700"><Rocket className="mx-auto mb-1" size={17} />اجرای فوری</button>
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-[11px] font-medium text-slate-500" dir="ltr">
          <span>Workflow</span><span>/</span><span>Approval</span><span>/</span><span>Rollback</span><RefreshCcw size={14} />
        </div>
      </ModuleCard>
    </div>
  );
}
