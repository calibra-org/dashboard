import clsx from "clsx";
import type { StatusTone } from "@/src/types/seo";

interface StatusBadgeProps {
  tone: StatusTone;
  label: string;
}

export function StatusBadge({ tone, label }: StatusBadgeProps) {
  const classes = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warning: "bg-amber-50 text-amber-700 ring-amber-200",
    danger: "bg-rose-50 text-rose-700 ring-rose-200",
    neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  };

  return (
    <span className={clsx("inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1", classes[tone])}>
      {label}
    </span>
  );
}
