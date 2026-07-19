"use client";

import { Bell, CalendarDays, ChevronDown, UserCircle2 } from "lucide-react";
import { SearchField } from "@/src/components/ui/SearchField";
import { useState } from "react";

interface TopHeaderProps {
  title: string;
  subtitle?: string;
}

export function TopHeader({ title, subtitle }: TopHeaderProps) {
  const [search, setSearch] = useState("");

  return (
    <header className="border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-violet-600">Lolit SEO V2</p>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="w-full md:w-72">
            <SearchField value={search} onChange={setSearch} placeholder="جستجوی محصولات و مشکلات" />
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
              <CalendarDays size={16} />
              ۳۰ روز اخیر
            </button>
            <button className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600">
              <Bell size={16} />
            </button>
            <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
              <UserCircle2 size={18} />
              علی رضایی
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
