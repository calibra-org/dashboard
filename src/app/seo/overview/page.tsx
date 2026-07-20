"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { OverviewKpiCard, OverviewQueueCard, SectionTitle } from "@/src/components/dashboard/overview/OverviewCards";
import { OverviewPriorityTable } from "@/src/components/dashboard/overview/OverviewPriorityTable";
import { OverviewOperations } from "@/src/components/dashboard/overview/OverviewOperations";
import { Toast } from "@/src/components/ui/Toast";
import {
  activeAgents,
  architectureLayers,
  crawlMetrics,
  overviewKpis,
  overviewQueues,
  priorityEntities,
  serpBars,
  systemEngines,
} from "@/src/data/seo/overview";
import type { OverviewKpi, OverviewQueue, PriorityEntity } from "@/src/types/overview";

interface DetailState {
  title: string;
  description: string;
  bullets?: string[];
  accent?: "violet" | "green" | "orange" | "red";
}

const dateRanges = ["۳۰ روز گذشته", "۷ روز گذشته", "۹۰ روز گذشته", "سال جاری"];

export default function OverviewPage() {
  const [dateRange, setDateRange] = useState(dateRanges[0]);
  const [dateOpen, setDateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!detail) return;
    closeButtonRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetail(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [detail]);

  const showToast = (message: string) => setToast(message);

  const handleRefresh = () => {
    setRefreshing(true);
    window.setTimeout(() => {
      setRefreshing(false);
      setToast("داده‌های داشبورد با موفقیت به‌روزرسانی شد");
    }, 850);
  };

  const openKpi = (item: OverviewKpi) => {
    setDetail({
      title: item.title,
      description: `مقدار فعلی این شاخص ${item.value} است. این بخش در نسخه نمایشی با داده‌های Mock به‌روزرسانی می‌شود.`,
      bullets: [item.detail, item.trend ? `تغییر دوره: ${item.trend}` : "وضعیت: عالی", "آخرین محاسبه: همین حالا"],
      accent: item.tone === "violet" ? "violet" : item.tone === "green" ? "green" : item.tone === "orange" ? "orange" : "red",
    });
  };

  const openQueue = (queue: OverviewQueue) => {
    setDetail({
      title: `${queue.title} — ${queue.count.toLocaleString("fa-IR")} مورد`,
      description: "خلاصه صف اقدامات هوشمند برای این وضعیت. در نسخه نهایی هر ردیف به موجودیت و گردش کار مرتبط متصل می‌شود.",
      bullets: queue.items.map((item) => `${item.label}: ${item.count.toLocaleString("fa-IR")} مورد`),
      accent: queue.tone,
    });
  };

  const openEntity = (entity: PriorityEntity) => {
    setDetail({
      title: entity.name,
      description: `این ${entity.type} با امتیاز سئو ${entity.score.toLocaleString("fa-IR")} و CTR برابر ${entity.ctr.toLocaleString("fa-IR", { minimumFractionDigits: 1 })}٪ در صف بررسی قرار دارد.`,
      bullets: [
        `وضعیت تصاویر: ${entity.images}`,
        `Agent پیشنهادی: ${entity.agent}`,
        `وضعیت اسکیما: ${entity.schema === "valid" ? "معتبر" : entity.schema === "warning" ? "نیازمند بررسی" : "نامعتبر"}`,
      ],
      accent: entity.score >= 85 ? "green" : entity.score >= 65 ? "orange" : "red",
    });
  };

  const accentStyles = {
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    orange: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
  } as const;

  return (
    <div className="space-y-5 pb-8">
      <section className="rounded-3xl border border-slate-200 bg-white px-4 py-5 shadow-[0_8px_28px_rgba(15,23,42,0.03)] sm:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-violet-600 text-white shadow-[0_8px_22px_rgba(124,58,237,0.24)]">
              <Activity size={27} strokeWidth={2.3} />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-[30px]">داشبورد سئو فروشگاه</h1>
              <p className="mt-2 text-sm leading-7 text-slate-500 sm:text-base">مدیریت و بهینه‌سازی سئوی کل فروشگاه؛ شامل محصولات، دسته‌بندی‌ها، برندها، ویژگی‌ها و تصاویر</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <button
                type="button"
                onClick={() => setSettingsOpen((value) => !value)}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3.5 py-2.5 text-sm font-extrabold text-violet-700 transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <Settings size={17} />
                تنظیمات داشبورد
              </button>
              {settingsOpen ? (
                <div className="absolute left-0 top-12 z-30 w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  {["چیدمان فشرده", "نمایش روندها", "هشدارهای زنده"].map((item) => (
                    <button key={item} type="button" onClick={() => { setSettingsOpen(false); setToast(`${item} برای نسخه نمایشی اعمال شد`); }} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-slate-600 hover:bg-violet-50 hover:text-violet-700">
                      {item}<CheckCircle2 size={16} className="text-emerald-500" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-600 transition hover:border-violet-200 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              به‌روزرسانی: اکنون
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setDateOpen((value) => !value)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <CalendarDays size={17} />
                {dateRange}
                <ChevronDown size={16} />
              </button>
              {dateOpen ? (
                <div className="absolute left-0 top-12 z-30 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  {dateRanges.map((range) => (
                    <button key={range} type="button" onClick={() => { setDateRange(range); setDateOpen(false); setToast(`بازه گزارش روی «${range}» تنظیم شد`); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm ${range === dateRange ? "bg-violet-50 font-extrabold text-violet-700" : "text-slate-600 hover:bg-slate-50"}`}>
                      {range}{range === dateRange ? <CheckCircle2 size={16} /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.035)] sm:p-5">
        <SectionTitle title="برج کنترل هوشمند سئوی محصولات" icon={Sparkles} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {overviewKpis.map((item) => <OverviewKpiCard key={item.id} item={item} onClick={openKpi} />)}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.035)] sm:p-5">
        <SectionTitle title="صف اول اقدامات هوشمند" icon={CircleHelp} />
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          {overviewQueues.map((queue) => <OverviewQueueCard key={queue.id} queue={queue} onOpen={openQueue} />)}
        </div>
      </section>

      <OverviewPriorityTable entities={priorityEntities} onOpen={openEntity} onToast={showToast} />

      <OverviewOperations
        crawlMetrics={crawlMetrics}
        serpBars={serpBars}
        agents={activeAgents}
        layers={architectureLayers}
        engines={systemEngines}
        onToast={showToast}
        onOpen={(title, description) => setDetail({ title, description, accent: "violet" })}
      />

      {detail ? (
        <div className="fixed inset-0 z-[100] flex items-stretch justify-start" role="dialog" aria-modal="true" aria-labelledby="overview-detail-title">
          <button type="button" onClick={() => setDetail(null)} className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]" aria-label="بستن جزئیات" />
          <aside className="relative mr-auto flex h-full w-full max-w-lg flex-col border-r border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-5">
              <div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-extrabold ${accentStyles[detail.accent ?? "violet"]}`}>جزئیات عملیاتی</span>
                <h2 id="overview-detail-title" className="mt-3 text-2xl font-black text-slate-950">{detail.title}</h2>
              </div>
              <button ref={closeButtonRef} type="button" onClick={() => setDetail(null)} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-300" aria-label="بستن">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm leading-8 text-slate-600">{detail.description}</p>
                {detail.bullets?.length ? (
                  <ul className="mt-4 space-y-2.5">
                    {detail.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2 text-sm text-slate-700"><CheckCircle2 className="mt-0.5 shrink-0 text-violet-600" size={17} />{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/55 p-4">
                <div className="flex items-center gap-2 font-extrabold text-violet-800"><SlidersHorizontal size={18} />کنترل نسخه نمایشی</div>
                <p className="mt-2 text-sm leading-7 text-violet-700/80">این عملیات فقط وضعیت محلی رابط کاربری را تغییر می‌دهد و به بک‌اند یا داده واقعی متصل نیست.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-slate-200 p-5">
              <button type="button" onClick={() => { setToast("مورد برای تأیید ارسال شد"); setDetail(null); }} className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-300">ارسال برای تأیید</button>
              <button type="button" onClick={() => { setToast("تغییر در نسخه نمایشی اجرا شد"); setDetail(null); }} className="rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm font-extrabold text-violet-700 transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-300">اجرای آزمایشی</button>
            </div>
          </aside>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[120] -translate-x-1/2">
          <Toast message={toast} tone="success" />
        </div>
      ) : null}
    </div>
  );
}
