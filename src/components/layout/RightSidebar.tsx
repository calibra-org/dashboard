"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Compass, FileText, LayoutGrid, Settings, Sparkles, Workflow } from "lucide-react";
import clsx from "clsx";
import { navItems } from "@/src/lib/navigation";

const iconMap = {
  overview: LayoutGrid,
  control: Workflow,
  products: BarChart3,
  categories: Compass,
  keywords: Sparkles,
  images: FileText,
  schema: FileText,
  technical: BarChart3,
  crawl: LayoutGrid,
  rank: BarChart3,
  competitors: Compass,
  editor: Sparkles,
  refresh: Workflow,
  market: Compass,
  reports: FileText,
  settings: Settings,
};

export function RightSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 flex-col border-l border-slate-200 bg-slate-950 px-4 py-6 text-slate-100 lg:flex">
      <div className="mb-8 px-2">
        <p className="text-sm font-semibold text-violet-300">Lolit SEO</p>
        <h2 className="mt-2 text-2xl font-semibold">کنترل‌تاور سئو</h2>
        <p className="mt-2 text-sm text-slate-400">پلتفرم عملیاتی رشد ارگانیک</p>
      </div>
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = iconMap[item.section as keyof typeof iconMap] ?? LayoutGrid;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition",
                active ? "bg-violet-600/20 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <span className="flex items-center gap-2">
                <Icon size={16} />
                {item.label}
              </span>
              {active ? <span className="h-2.5 w-2.5 rounded-full bg-violet-400" /> : null}
            </Link>
          );
        })}
      </nav>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
        <p className="font-medium text-white">وضعیت ۴ لایه</p>
        <p className="mt-2 text-slate-400">Observe • Diagnose • Recommend • Execute</p>
      </div>
    </aside>
  );
}
