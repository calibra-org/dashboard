"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Box,
  ChevronDown,
  ChevronLeft,
  Filter,
  Headphones,
  Laptop,
  MoreHorizontal,
  Package,
  Smartphone,
  Tags,
} from "lucide-react";
import clsx from "clsx";
import { MiniStatusIcon, SectionTitle } from "@/src/components/dashboard/overview/OverviewCards";
import type { PriorityEntity, PriorityStatus } from "@/src/types/overview";

interface OverviewPriorityTableProps {
  entities: PriorityEntity[];
  onOpen: (entity: PriorityEntity) => void;
  onToast: (message: string) => void;
}

type SortKey = "score" | "ctr" | "name";

type StatusFilter = "all" | PriorityStatus;

const statusMeta: Record<PriorityStatus, { label: string; dot: string; text: string; bg: string }> = {
  waiting: { label: "در انتظار", dot: "bg-slate-400", text: "text-slate-600", bg: "bg-slate-100" },
  approved: { label: "تأیید شده", dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  review: { label: "نیاز به بررسی", dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50" },
};

function Thumbnail({ type }: { type: PriorityEntity["thumbnail"] }) {
  const map = {
    headphone: { Icon: Headphones, bg: "from-slate-50 to-slate-200", fg: "text-slate-700" },
    mobile: { Icon: Smartphone, bg: "from-violet-50 to-violet-100", fg: "text-violet-700" },
    brand: { Icon: Tags, bg: "from-indigo-50 to-indigo-100", fg: "text-indigo-700" },
    earbuds: { Icon: Package, bg: "from-zinc-50 to-zinc-200", fg: "text-zinc-700" },
    laptop: { Icon: Laptop, bg: "from-sky-50 to-sky-100", fg: "text-sky-700" },
  } as const;
  const { Icon, bg, fg } = map[type];
  return (
    <span className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white bg-gradient-to-br shadow-inner", bg, fg)}>
      <Icon size={20} />
    </span>
  );
}

function Score({ value }: { value: number }) {
  const dot = value >= 85 ? "bg-emerald-500" : value >= 65 ? "bg-amber-500" : "bg-rose-500";
  return (
    <span className="inline-flex items-center gap-2 font-extrabold tabular-nums text-slate-800">
      <span className={clsx("h-2.5 w-2.5 rounded-full", dot)} />
      {value.toLocaleString("fa-IR")}
    </span>
  );
}

export function OverviewPriorityTable({ entities, onOpen, onToast }: OverviewPriorityTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [descending, setDescending] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const rows = useMemo(() => {
    const filtered = statusFilter === "all" ? entities : entities.filter((item) => item.status === statusFilter);
    return [...filtered].sort((a, b) => {
      const direction = descending ? -1 : 1;
      if (sortKey === "name") return a.name.localeCompare(b.name, "fa") * direction;
      return (a[sortKey] - b[sortKey]) * direction;
    });
  }, [descending, entities, sortKey, statusFilter]);

  const setSort = (key: SortKey) => {
    if (key === sortKey) setDescending((value) => !value);
    else {
      setSortKey(key);
      setDescending(true);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.035)] sm:p-5">
      <SectionTitle
        title="اولویت‌های اصلی در کل فروشگاه"
        icon={BadgeCheck}
        trailing={
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((value) => !value)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:border-violet-200 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              <Filter size={16} />
              فیلترها
            </button>
            {filterOpen ? (
              <div className="absolute left-0 top-12 z-30 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                {[
                  ["all", "همه وضعیت‌ها"],
                  ["waiting", "در انتظار"],
                  ["approved", "تأیید شده"],
                  ["review", "نیاز به بررسی"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(value as StatusFilter);
                      setFilterOpen(false);
                    }}
                    className={clsx(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2 text-right text-sm transition",
                      statusFilter === value ? "bg-violet-50 font-bold text-violet-700" : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {label}
                    {statusFilter === value ? <BadgeCheck size={16} /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        }
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[1120px] w-full border-collapse text-sm">
          <thead className="bg-slate-50/90 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-right font-bold">
                <button type="button" onClick={() => setSort("name")} className="inline-flex items-center gap-1 hover:text-violet-700">
                  موجودیت <ChevronDown size={14} />
                </button>
              </th>
              <th className="px-4 py-3 text-right font-bold">نوع</th>
              <th className="px-4 py-3 text-right font-bold">
                <button type="button" onClick={() => setSort("score")} className="inline-flex items-center gap-1 hover:text-violet-700">
                  امتیاز سئو <ChevronDown size={14} />
                </button>
              </th>
              <th className="px-4 py-3 text-right font-bold" dir="ltr">
                <button type="button" onClick={() => setSort("ctr")} className="inline-flex items-center gap-1 hover:text-violet-700">
                  CTR <ChevronDown size={14} />
                </button>
              </th>
              <th className="px-4 py-3 text-right font-bold">تصاویر</th>
              <th className="px-4 py-3 text-right font-bold">اسکیما</th>
              <th className="px-4 py-3 text-right font-bold">وضعیت</th>
              <th className="px-4 py-3 text-right font-bold">Agent پیشنهادی</th>
              <th className="px-4 py-3 text-right font-bold">اقدام سریع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entity) => {
              const status = statusMeta[entity.status];
              return (
                <tr key={entity.id} className="border-t border-slate-100 bg-white transition hover:bg-violet-50/25">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => onOpen(entity)} className="flex items-center gap-3 text-right focus:outline-none focus:ring-2 focus:ring-violet-300 rounded-lg">
                      <Thumbnail type={entity.thumbnail} />
                      <span className="font-bold text-slate-900">{entity.name}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      {entity.type === "محصول" ? <Box size={15} /> : entity.type === "برند" ? <Tags size={15} /> : <Smartphone size={15} />}
                      {entity.type}
                    </span>
                  </td>
                  <td className="px-4 py-3"><Score value={entity.score} /></td>
                  <td className="px-4 py-3 font-bold tabular-nums text-slate-700" dir="ltr">{entity.ctr.toLocaleString("fa-IR", { minimumFractionDigits: 1 })}%</td>
                  <td className={clsx("px-4 py-3 font-extrabold tabular-nums", entity.imageStatus === "good" ? "text-emerald-600" : "text-rose-500")} dir="ltr">{entity.images}</td>
                  <td className="px-4 py-3"><MiniStatusIcon status={entity.schema} /></td>
                  <td className="px-4 py-3">
                    <span className={clsx("inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-bold", status.bg, status.text)}>
                      <span className={clsx("h-2 w-2 rounded-full", status.dot)} />
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700" dir="ltr">{entity.agent}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpen(entity)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
                      >
                        جزئیات
                        <ChevronDown size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`اقدام بیشتر برای ${entity.name}`}
                        onClick={() => onToast(`منوی اقدامات ${entity.name} باز شد`)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <MoreHorizontal size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => onToast("نمایش همه موجودیت‌ها در نسخه نمایشی")}
        className="mx-auto mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-extrabold text-violet-700 transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-300"
      >
        مشاهده همه موجودیت‌ها
        <ChevronLeft size={17} />
      </button>
    </section>
  );
}
