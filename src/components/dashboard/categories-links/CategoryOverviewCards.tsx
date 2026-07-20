import clsx from "clsx";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import type { CategoryKpi, CategoryTone, TaxonomyHealthCard } from "@/src/types/categories-links";

const toneMap: Record<CategoryTone, { stroke: string; text: string; soft: string }> = {
  violet: { stroke: "#7c3aed", text: "text-violet-700", soft: "bg-violet-50" },
  green: { stroke: "#16a34a", text: "text-emerald-700", soft: "bg-emerald-50" },
  orange: { stroke: "#f59e0b", text: "text-amber-700", soft: "bg-amber-50" },
  red: { stroke: "#ef4444", text: "text-rose-700", soft: "bg-rose-50" },
  slate: { stroke: "#64748b", text: "text-slate-700", soft: "bg-slate-50" },
};

function Gauge({ gauge, tone, icon: Icon }: Pick<CategoryKpi, "gauge" | "tone" | "icon">) {
  const color = toneMap[tone].stroke;
  return (
    <div className="relative h-[74px] w-[74px] shrink-0">
      <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="21" cy="21" r="16" fill="none" stroke="#eef1f5" strokeWidth="3.5" />
        <circle
          cx="21"
          cy="21"
          r="16"
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${Math.min(100, Math.max(8, gauge))} ${100 - Math.min(100, Math.max(8, gauge))}`}
          pathLength="100"
        />
      </svg>
      <span className={clsx("absolute inset-0 grid place-items-center", toneMap[tone].text)}><Icon size={25} strokeWidth={1.8} /></span>
    </div>
  );
}

export function CategoryKpiCard({ item, onClick }: { item: CategoryKpi; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-[0_8px_24px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_12px_30px_rgba(124,58,237,0.08)] focus:outline-none focus:ring-2 focus:ring-violet-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-slate-700">{item.title}</p>
          <p className="mt-3 text-[30px] font-black leading-none text-slate-950" dir="auto">{item.value}</p>
          <p className="mt-2 text-sm font-extrabold text-emerald-600" dir="ltr">{item.trend}</p>
          <p className={clsx("mt-2 text-sm font-bold", item.status ? toneMap[item.tone].text : "text-slate-500")}>{item.status ?? item.unit}</p>
        </div>
        <Gauge gauge={item.gauge} tone={item.tone} icon={item.icon} />
      </div>
    </button>
  );
}

const checkIcons = {
  success: <CheckCircle2 size={16} className="text-emerald-600" strokeWidth={2.4} />,
  warning: <AlertCircle size={16} className="text-amber-500" strokeWidth={2.4} />,
  danger: <XCircle size={16} className="text-rose-500" strokeWidth={2.4} />,
};

export function TaxonomyHealthCardView({ item, onOpen }: { item: TaxonomyHealthCard; onOpen: () => void }) {
  const Icon = item.icon;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_6px_20px_rgba(15,23,42,0.03)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-900">{item.title}</h3>
          <p className="mt-1 text-sm font-medium text-slate-500">{item.count}</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-900"><Icon size={22} strokeWidth={1.8} /></span>
      </div>
      <div className="mt-4 space-y-2.5">
        {item.checks.map((check) => (
          <div key={check.label} className="flex items-center justify-between border-b border-slate-100 pb-2 text-[13px] last:border-b-0 last:pb-0">
            <span className="font-medium text-slate-600" dir="auto">{check.label}</span>
            {checkIcons[check.status]}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm text-slate-600">سلامت: <strong className={clsx(item.score >= 84 ? "text-emerald-600" : "text-amber-600")}>{item.score.toLocaleString("fa-IR")}٪</strong></span>
        <button type="button" onClick={onOpen} className="rounded-lg px-2 py-1 text-sm font-extrabold text-violet-700 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-300">مشاهده جزئیات</button>
      </div>
    </article>
  );
}
