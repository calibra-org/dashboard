"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Info,
  Settings,
  X,
} from "lucide-react";
import { CategoryKpiCard, TaxonomyHealthCardView } from "@/src/components/dashboard/categories-links/CategoryOverviewCards";
import { KeywordMatrix, LinkOpportunitiesTable } from "@/src/components/dashboard/categories-links/CategoryTables";
import { AgentsPanel, RecommendationsPanel, RulesPanel } from "@/src/components/dashboard/categories-links/CategoryBottomPanels";
import {
  categoryKpis,
  categoryTabs,
  initialLinkingRules,
  keywordMatrixRows,
  linkingAgents,
  linkOpportunities,
  matrixKeywords,
  smartRecommendations,
  taxonomyHealthCards,
} from "@/src/data/seo/categories-links";
import type { LinkOpportunity, LinkingAgent, TaxonomyHealthCard } from "@/src/types/categories-links";

interface DetailState {
  title: string;
  description: string;
  bullets?: string[];
}

const dateRanges = ["۳۰ روز گذشته", "۷ روز گذشته", "۹۰ روز گذشته", "سال جاری"];

export default function CategoriesLinksPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [dateRange, setDateRange] = useState(dateRanges[0]);
  const [dateOpen, setDateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rules, setRules] = useState(initialLinkingRules);
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

  const filteredHealthCards = useMemo(() => {
    if (["categories", "brands", "tags", "variants", "attributes", "related"].includes(activeTab)) {
      return taxonomyHealthCards.filter((item) => item.id === activeTab);
    }
    return taxonomyHealthCards;
  }, [activeTab]);

  const scrollToSection = (id: string) => {
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  };

  const handleTab = (id: string) => {
    setActiveTab(id);
    if (id === "matrix") scrollToSection("keyword-matrix");
    if (id === "links") scrollToSection("internal-links");
    if (id === "rules") scrollToSection("linking-rules");
  };

  const openHealth = (item: TaxonomyHealthCard) => {
    setDetail({
      title: `سلامت ${item.title}`,
      description: `${item.title} در حال حاضر امتیاز سلامت ${item.score.toLocaleString("fa-IR")}٪ دارد. این نتیجه از بررسی عنوان، توضیحات، تصویر، ALT، Canonical، لینک داخلی و تطابق کلمه کلیدی ساخته شده است.`,
      bullets: item.checks.map((check) => `${check.label}: ${check.status === "success" ? "سالم" : check.status === "warning" ? "نیازمند بهبود" : "بحرانی"}`),
    });
  };

  const openOpportunity = (row: LinkOpportunity) => {
    setDetail({
      title: row.source,
      description: `پیشنهاد لینک داخلی از «${row.source}» به «${row.target}» با انکرتکست «${row.anchor}».`,
      bullets: [`تأثیر: ${row.impact}`, `اولویت: ${row.priority}`, row.recommendation],
    });
  };

  const openAgent = (agent: LinkingAgent) => {
    setDetail({ title: agent.name, description: agent.description, bullets: ["وضعیت: فعال", "آخرین پایش: همین حالا", "منبع داده: Mock محلی"] });
  };

  const toggleRule = (id: string) => {
    setRules((current) => current.map((rule) => rule.id === id ? { ...rule, enabled: !rule.enabled } : rule));
    setToast("وضعیت قانون در نسخه نمایشی تغییر کرد");
  };

  return (
    <div className="space-y-5 pb-8">
      <section className="rounded-3xl border border-slate-200 bg-white px-4 py-5 shadow-[0_8px_28px_rgba(15,23,42,0.03)] sm:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-violet-600 text-white shadow-[0_8px_22px_rgba(124,58,237,0.24)]"><Activity size={27} strokeWidth={2.3} /></span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-[29px]">دسته‌بندی‌ها، برندها، ویژگی‌ها و لینک‌سازی داخلی</h1>
              <p className="mt-2 text-sm leading-7 text-slate-500 sm:text-base">مدیریت سلامت طبقه‌بندی‌ها و تقویت لینک‌سازی داخلی در سراسر فروشگاه</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <button type="button" onClick={() => setSettingsOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3.5 py-2.5 text-sm font-extrabold text-violet-700 transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-300"><Settings size={17} />تنظیمات پیشرفته</button>
              {settingsOpen ? (
                <div className="absolute left-0 top-12 z-30 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  {["تحلیل پوشش معنایی", "کنترل انکرتکست", "هشدار لینک شکسته"].map((item) => (
                    <button key={item} type="button" onClick={() => { setSettingsOpen(false); setToast(`${item} در نسخه نمایشی فعال شد`); }} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-slate-600 hover:bg-violet-50 hover:text-violet-700">{item}<CheckCircle2 size={16} className="text-emerald-500" /></button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="relative">
              <button type="button" onClick={() => setDateOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-300"><CalendarDays size={17} />{dateRange}<ChevronDown size={16} /></button>
              {dateOpen ? (
                <div className="absolute left-0 top-12 z-30 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  {dateRanges.map((range) => <button key={range} type="button" onClick={() => { setDateRange(range); setDateOpen(false); setToast(`بازه گزارش روی ${range} تنظیم شد`); }} className="w-full rounded-xl px-3 py-2.5 text-right text-sm text-slate-600 hover:bg-violet-50 hover:text-violet-700">{range}</button>)}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {categoryKpis.map((item) => <CategoryKpiCard key={item.id} item={item} onClick={() => setDetail({ title: item.title, description: `شاخص ${item.title} با مقدار ${item.value} در بازه ${dateRange} محاسبه شده است.`, bullets: [`روند: ${item.trend}`, `وضعیت: ${item.status ?? item.unit}`, "داده‌ها در نسخه نمایشی محلی هستند"] })} />)}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.03)]">
        <div className="overflow-x-auto border-b border-slate-200 px-4 sm:px-6">
          <div className="flex min-w-max items-center gap-1">
            {categoryTabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => handleTab(tab.id)} className={`relative px-4 py-4 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300 ${activeTab === tab.id ? "text-violet-700" : "text-slate-600 hover:text-violet-700"}`}>
                {tab.label}
                {activeTab === tab.id ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-violet-600" /> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2"><h2 className="text-lg font-black text-slate-950">سلامت اجزای طبقه‌بندی</h2><Info size={17} className="text-slate-400" /></div>
          <div className={`grid gap-3 ${filteredHealthCards.length === 1 ? "max-w-sm" : "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"}`}>
            {filteredHealthCards.map((item) => <TaxonomyHealthCardView key={item.id} item={item} onOpen={() => openHealth(item)} />)}
          </div>
        </div>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[1.25fr_1fr]">
        <LinkOpportunitiesTable rows={linkOpportunities} onOpen={openOpportunity} />
        <KeywordMatrix keywords={matrixKeywords} rows={keywordMatrixRows} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <RecommendationsPanel items={smartRecommendations} onOpen={() => setDetail({ title: "گزارش کامل پیشنهادها", description: "جمع‌بندی پیشنهادهای هوشمند برای تقویت معماری اطلاعات و لینک‌سازی داخلی.", bullets: smartRecommendations.map((item) => item.text) })} />
        <AgentsPanel agents={linkingAgents} onOpen={openAgent} onAdd={() => setToast("فرآیند افزودن Agent در محیط نمایشی باز شد")} />
        <RulesPanel rules={rules} onToggle={toggleRule} onManage={() => setDetail({ title: "مدیریت قوانین لینک‌سازی", description: "در این بخش می‌توان اولویت، محدوده و وضعیت اجرای قوانین لینک‌سازی داخلی را مدیریت کرد.", bullets: rules.map((rule) => `${rule.enabled ? "فعال" : "غیرفعال"}: ${rule.label}`) })} />
      </div>

      {toast ? <div className="fixed bottom-5 left-5 z-[120] max-w-sm rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 shadow-xl">{toast}</div> : null}

      {detail ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="category-detail-title">
          <button type="button" aria-label="بستن پنجره" onClick={() => setDetail(null)} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <button ref={closeButtonRef} type="button" onClick={() => setDetail(null)} className="absolute left-5 top-5 rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="بستن"><X size={20} /></button>
            <h2 id="category-detail-title" className="pl-10 text-xl font-black text-slate-950">{detail.title}</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">{detail.description}</p>
            {detail.bullets ? <ul className="mt-5 space-y-3">{detail.bullets.map((bullet) => <li key={bullet} className="flex items-start gap-2 text-sm text-slate-600"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />{bullet}</li>)}</ul> : null}
            <button type="button" onClick={() => { setDetail(null); setToast("عملیات نمایشی با موفقیت ثبت شد"); }} className="mt-6 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-violet-700">ثبت در گردش کار</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
