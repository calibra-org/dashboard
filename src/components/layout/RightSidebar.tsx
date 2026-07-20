"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  Check,
  FileText,
  Gauge,
  Home,
  Image as ImageIcon,
  Link2,
  PencilLine,
  RefreshCcw,
  SearchCheck,
  Settings,
  SlidersHorizontal,
  Tags,
  X,
} from "lucide-react";
import clsx from "clsx";
import { LolitBrand } from "@/src/components/layout/LolitBrand";
import { navItems } from "@/src/lib/navigation";

interface RightSidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

const iconMap: Record<(typeof navItems)[number]["section"], LucideIcon> = {
  overview: Home,
  products: SlidersHorizontal,
  competitors: SearchCheck,
  editor: PencilLine,
  keywords: Tags,
  images: ImageIcon,
  schema: FileText,
  categories: Link2,
  technical: Gauge,
  rank: BarChart3,
  agents: Bot,
  settings: Settings,
  reports: FileText,
  approval: RefreshCcw,
};

const differentiators = [
  "تحلیل زنده و هوشمند",
  "خوانایی و تجربه کاربر",
  "کشف فرصت‌های پنهان",
  "اولویت‌بندی Audit",
  "ردیابی رتبه و رقبا",
  "خزش عمیق و مانیتورینگ",
];

export function RightSidebar({ mobileOpen = false, onClose }: RightSidebarProps) {
  const pathname = usePathname();

  const content = (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5">
        <LolitBrand />
        {onClose ? (
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="بستن منو">
            <X size={20} />
          </button>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = iconMap[item.section];
            const route = item.href.split("#")[0];
            const active = item.section !== "approval" && pathname === route;
            return (
              <Link
                key={`${item.href}-${item.section}`}
                href={item.href}
                onClick={onClose}
                className={clsx(
                  "group flex min-h-10 items-center justify-between rounded-xl border px-3 py-2 text-[13.5px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-300",
                  active
                    ? "border-violet-200 bg-violet-50 text-violet-700 shadow-[0_5px_16px_rgba(124,58,237,0.06)]"
                    : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-violet-700"
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon size={20} strokeWidth={1.8} className={active ? "text-violet-600" : "text-slate-600 group-hover:text-violet-600"} />
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="sticky bottom-0 bg-white px-4 pb-4 pt-2">
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50/70 to-white p-3.5 shadow-[0_8px_24px_rgba(124,58,237,0.055)]">
          <h3 className="text-center text-base font-extrabold text-violet-700">چرا این سیستم متفاوت است؟</h3>
          <ul className="mt-3 space-y-2">
            {differentiators.map((item) => (
              <li key={item} className="flex items-center gap-2 text-[13px] font-medium text-slate-600">
                <span className="grid h-5 w-5 place-items-center rounded-full border border-violet-200 bg-white text-violet-600">
                  <Check size={13} strokeWidth={2.5} />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <button type="button" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-extrabold text-violet-700 transition hover:bg-violet-50">
            اطلاعات بیشتر
            <span aria-hidden="true">‹</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[282px] shrink-0 border-l border-slate-200 lg:block">{content}</aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <button type="button" aria-label="بستن منوی موبایل" onClick={onClose} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" />
          <aside className="absolute inset-y-0 right-0 w-[min(88vw,330px)] border-l border-slate-200 bg-white shadow-2xl">{content}</aside>
        </div>
      ) : null}
    </>
  );
}
