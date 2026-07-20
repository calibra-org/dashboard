"use client";

import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  CircleCheckBig,
  CircleGauge,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import clsx from "clsx";
import type { OverviewKpi, OverviewQueue, OverviewTone } from "@/src/types/overview";

const toneStyles: Record<OverviewTone, { text: string; icon: string; ring: string; border: string; bg: string; dot: string }> = {
  violet: {
    text: "text-violet-700",
    icon: "bg-violet-50 text-violet-600",
    ring: "stroke-violet-600",
    border: "border-violet-200",
    bg: "bg-violet-50/50",
    dot: "bg-violet-600",
  },
  green: {
    text: "text-emerald-700",
    icon: "bg-emerald-50 text-emerald-600",
    ring: "stroke-emerald-500",
    border: "border-emerald-200",
    bg: "bg-emerald-50/45",
    dot: "bg-emerald-500",
  },
  orange: {
    text: "text-amber-700",
    icon: "bg-amber-50 text-amber-500",
    ring: "stroke-amber-500",
    border: "border-amber-200",
    bg: "bg-amber-50/50",
    dot: "bg-amber-500",
  },
  red: {
    text: "text-rose-700",
    icon: "bg-rose-50 text-rose-500",
    ring: "stroke-rose-500",
    border: "border-rose-200",
    bg: "bg-rose-50/45",
    dot: "bg-rose-500",
  },
  slate: {
    text: "text-slate-700",
    icon: "bg-slate-100 text-slate-600",
    ring: "stroke-slate-500",
    border: "border-slate-200",
    bg: "bg-slate-50",
    dot: "bg-slate-500",
  },
};

const kpiIcons: Record<OverviewKpi["icon"], LucideIcon> = {
  health: ShieldCheck,
  warning: TriangleAlert,
  growth: TrendingUp,
  decline: TrendingDown,
  error: AlertCircle,
  complete: CircleCheckBig,
};

function ScoreGauge({ score }: { score: number }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;

  return (
    <div className="relative grid h-24 w-24 place-items-center" aria-label={`امتیاز سلامت سئو ${score} از ۱۰۰`}>
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 88 88" aria-hidden="true">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="#ecfdf5" strokeWidth="7" />
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          stroke="#16a34a"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-3xl font-extrabold tabular-nums text-slate-950">{score}</span>
        <span className="mt-1 text-[11px] text-slate-500">از ۱۰۰</span>
      </div>
    </div>
  );
}

export function OverviewKpiCard({ item, onClick }: { item: OverviewKpi; onClick: (item: OverviewKpi) => void }) {
  const Icon = kpiIcons[item.icon];
  const styles = toneStyles[item.tone];

  if (item.score !== undefined) {
    return (
      <button
        type="button"
        onClick={() => onClick(item)}
        className="group min-h-[176px] rounded-2xl border border-slate-200 bg-white px-4 py-4 text-right shadow-[0_7px_24px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_12px_30px_rgba(15,23,42,0.07)] focus:outline-none focus:ring-2 focus:ring-violet-400"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-900">{item.title}</p>
          <Icon className="text-emerald-600" size={26} strokeWidth={1.8} />
        </div>
        <div className="mt-1 flex justify-center">
          <ScoreGauge score={item.score} />
        </div>
        <p className="text-center text-sm font-bold text-emerald-600">{item.status}</p>
      </button>
    );
  }

  const TrendIcon = item.trendDirection === "up" ? ArrowUpLeft : ArrowDownLeft;
  const trendPositive = item.id === "execution" || item.id === "growth";

  return (
    <button
      type="button"
      onClick={() => onClick(item)}
      className="group min-h-[176px] rounded-2xl border border-slate-200 bg-white px-4 py-4 text-right shadow-[0_7px_24px_rgba(15,23,42,0.035)] transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_12px_30px_rgba(15,23,42,0.07)] focus:outline-none focus:ring-2 focus:ring-violet-400"
    >
      <p className="text-center text-sm font-bold text-slate-900">{item.title}</p>
      <div className="mt-5 flex items-center justify-center gap-4">
        <span className={clsx("grid h-14 w-14 shrink-0 place-items-center rounded-full", styles.icon)}>
          <Icon size={34} strokeWidth={1.8} />
        </span>
        <div className="text-right">
          <p className="text-4xl font-extrabold tabular-nums tracking-tight text-slate-950">{item.value}</p>
          {item.trend ? (
            <span className={clsx("mt-1 inline-flex items-center gap-1 text-sm font-bold", trendPositive ? "text-emerald-600" : "text-rose-500")}>
              <TrendIcon size={16} />
              {item.trend}
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">{item.detail}</p>
    </button>
  );
}

const queueTone = {
  violet: {
    border: "border-violet-200",
    bg: "bg-violet-50/50",
    text: "text-violet-700",
    dot: "bg-violet-600",
    row: "border-violet-100",
  },
  green: {
    border: "border-emerald-200",
    bg: "bg-emerald-50/45",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    row: "border-emerald-100",
  },
  orange: {
    border: "border-amber-200",
    bg: "bg-amber-50/50",
    text: "text-amber-700",
    dot: "bg-amber-500",
    row: "border-amber-100",
  },
  red: {
    border: "border-rose-200",
    bg: "bg-rose-50/45",
    text: "text-rose-600",
    dot: "bg-rose-500",
    row: "border-rose-100",
  },
} as const;

export function OverviewQueueCard({ queue, onOpen }: { queue: OverviewQueue; onOpen: (queue: OverviewQueue) => void }) {
  const styles = queueTone[queue.tone];
  return (
    <article className={clsx("rounded-2xl border p-3.5 shadow-[0_5px_18px_rgba(15,23,42,0.025)]", styles.border, styles.bg)}>
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <span className={clsx("h-2.5 w-2.5 rounded-full", styles.dot)} />
          <h3 className={clsx("text-base font-extrabold", styles.text)}>{queue.title}</h3>
        </div>
        <span className={clsx("text-2xl font-extrabold tabular-nums", styles.text)}>{queue.count.toLocaleString("fa-IR")}</span>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-white/70 bg-white/70">
        {queue.items.map((item) => (
          <div key={item.label} className={clsx("flex items-center justify-between border-b px-3 py-2.5 text-sm last:border-b-0", styles.row)}>
            <span className="font-medium text-slate-700">{item.label}</span>
            <span className="font-extrabold tabular-nums text-slate-900">{item.count.toLocaleString("fa-IR")}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onOpen(queue)}
        className={clsx("mt-3 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-extrabold transition hover:gap-2.5 focus:outline-none focus:ring-2 focus:ring-violet-300", styles.text)}
      >
        مشاهده همه
        <ChevronLeft size={17} />
      </button>
    </article>
  );
}

export function SectionTitle({ title, icon: Icon = BadgeCheck, trailing }: { title: string; icon?: LucideIcon; trailing?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Icon size={19} className="text-slate-500" />
        <h2 className="text-lg font-extrabold tracking-tight text-slate-950">{title}</h2>
      </div>
      {trailing}
    </div>
  );
}

export function LivePill({ label = "فعال" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      {label}
    </span>
  );
}

export function MiniStatusIcon({ status }: { status: "valid" | "warning" | "invalid" }) {
  if (status === "valid") return <CheckCircle2 size={19} className="text-emerald-600" aria-label="معتبر" />;
  if (status === "warning") return <AlertCircle size={19} className="text-amber-500" aria-label="نیازمند بررسی" />;
  return <AlertCircle size={19} className="text-rose-500" aria-label="نامعتبر" />;
}

export function EmptyGaugeIcon() {
  return <CircleGauge size={19} className="text-violet-600" />;
}
