import clsx from "clsx";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  detail: string;
  trend: number;
  tone?: "success" | "warning" | "danger" | "neutral";
}

export function StatCard({ title, value, detail, trend, tone = "neutral" }: StatCardProps) {
  const toneClasses = {
    success: "border-emerald-200 bg-emerald-50/70",
    warning: "border-amber-200 bg-amber-50/70",
    danger: "border-rose-200 bg-rose-50/70",
    neutral: "border-slate-200 bg-white",
  };

  const isPositive = trend >= 0;

  return (
    <div className={clsx("rounded-2xl border p-5 shadow-sm", toneClasses[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        <div className={clsx("rounded-full p-2", isPositive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
          {isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-600">{detail}</p>
      <div className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
        <span>{trend > 0 ? `+${trend}` : trend}%</span>
        <span className="text-slate-400">در ۳۰ روز</span>
      </div>
    </div>
  );
}
