"use client";

import clsx from "clsx";
import { ChevronLeft, Circle, Info, SlidersHorizontal } from "lucide-react";
import type { KeywordMatrixRow, LinkOpportunity, MatchStatus } from "@/src/types/categories-links";

const impactStyles = {
  بالا: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  متوسط: "bg-amber-50 text-amber-700 ring-amber-200",
};

const priorityStyles = {
  "خیلی زیاد": "bg-rose-50 text-rose-700 ring-rose-200",
  زیاد: "bg-rose-50 text-rose-600 ring-rose-200",
  متوسط: "bg-amber-50 text-amber-700 ring-amber-200",
};

export function LinkOpportunitiesTable({ rows, onOpen }: { rows: LinkOpportunity[]; onOpen: (row: LinkOpportunity) => void }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.035)] sm:p-5" id="internal-links">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-black text-slate-950">فرصت‌های لینک‌سازی داخلی</h2>
          <Info size={17} className="text-slate-400" />
        </div>
        <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:border-violet-200 hover:text-violet-700"><SlidersHorizontal size={16} />فیلترها</button>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[980px] w-full border-collapse text-right text-[13px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-3 font-extrabold">صفحه مبدأ</th>
              <th className="px-3 py-3 font-extrabold">صفحه مقصد</th>
              <th className="px-3 py-3 font-extrabold">انکرتکست پیشنهادی</th>
              <th className="px-3 py-3 font-extrabold">تأثیر</th>
              <th className="px-3 py-3 font-extrabold">اولویت</th>
              <th className="px-3 py-3 font-extrabold">توصیه هوش مصنوعی</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} onClick={() => onOpen(row)} className="cursor-pointer border-t border-slate-100 transition hover:bg-violet-50/25">
                <td className="px-3 py-3 font-bold text-slate-800">{row.source}</td>
                <td className="px-3 py-3 text-slate-700">{row.target}</td>
                <td className="px-3 py-3 text-slate-700">{row.anchor}</td>
                <td className="px-3 py-3"><span className={clsx("inline-flex rounded-lg px-2 py-1 text-xs font-bold ring-1", impactStyles[row.impact])}>{row.impact}</span></td>
                <td className="px-3 py-3"><span className={clsx("inline-flex rounded-lg px-2 py-1 text-xs font-bold ring-1", priorityStyles[row.priority])}>{row.priority}</span></td>
                <td className="max-w-[260px] px-3 py-3 leading-6 text-slate-600">{row.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="mt-4 inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-extrabold text-violet-700 hover:bg-violet-50">مشاهده همه فرصت‌ها<ChevronLeft size={17} /></button>
    </section>
  );
}

const matchStyles: Record<MatchStatus, string> = {
  strong: "border-emerald-600 bg-emerald-600",
  medium: "border-emerald-500 bg-white",
  weak: "border-amber-500 bg-white",
  none: "border-rose-500 bg-white ring-1 ring-rose-200",
};

function MatchDot({ status }: { status: MatchStatus }) {
  if (status === "none") {
    return <span className="relative inline-grid h-4 w-4 place-items-center rounded-full border-2 border-rose-500"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" /></span>;
  }
  return <Circle size={15} className={clsx("mx-auto rounded-full", matchStyles[status])} fill={status === "strong" ? "currentColor" : "transparent"} />;
}

export function KeywordMatrix({ keywords, rows }: { keywords: string[]; rows: KeywordMatrixRow[] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.035)] sm:p-5" id="keyword-matrix">
      <div className="flex items-center gap-2"><Info size={17} className="text-slate-400" /><h2 className="text-lg font-black text-slate-950">ماتریس کلمات کلیدی (دسته‌ها ← کلمات هدف)</h2></div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[720px] w-full border-collapse text-center text-[13px]">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-3 text-right font-extrabold">دسته‌بندی</th>
              {keywords.map((keyword) => <th key={keyword} className="px-3 py-3 font-extrabold">{keyword}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-3 py-3 text-right font-bold text-slate-800">{row.category}</td>
                {row.matches.map((status, index) => <td key={`${row.id}-${keywords[index]}`} className="px-3 py-3"><MatchDot status={status} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-5 text-xs font-medium text-slate-600">
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-600" />تطابق عالی</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-amber-500" />تطابق متوسط</span>
        <span className="inline-flex items-center gap-2"><span className="relative h-3 w-3 rounded-full border-2 border-rose-500"><span className="absolute inset-[2px] rounded-full bg-rose-500" /></span>تطابق ضعیف</span>
        <span className="inline-flex items-center gap-2"><span>—</span>بدون هدف</span>
      </div>
      <button type="button" className="mt-3 inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-extrabold text-violet-700 hover:bg-violet-50">مشاهده ماتریس کامل<ChevronLeft size={17} /></button>
    </section>
  );
}
