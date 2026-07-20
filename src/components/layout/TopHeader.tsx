"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Menu,
  Search,
  Settings,
  Store,
  UserRound,
  X,
} from "lucide-react";

interface TopHeaderProps {
  title: string;
  subtitle?: string;
  onOpenMenu?: () => void;
}

type OpenMenu = "store" | "notifications" | "user" | null;

export function TopHeader({ title, onOpenMenu }: TopHeaderProps) {
  const [search, setSearch] = useState("");
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") setOpenMenu(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/95 backdrop-blur-xl">
      <span className="sr-only">{title}</span>
      <div className="mx-auto flex min-h-[76px] max-w-[1680px] items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 lg:hidden"
          aria-label="باز کردن منو"
        >
          <Menu size={21} />
        </button>


        <div className="relative hidden xl:block">
          <button
            type="button"
            onClick={() => setOpenMenu((value) => (value === "store" ? null : "store"))}
            className="flex min-w-[232px] items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-right shadow-[0_5px_16px_rgba(15,23,42,0.035)] transition hover:border-violet-200"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={19} /></span>
              <span>
                <strong className="block text-sm font-extrabold text-slate-900">فروشگاه لولیت</strong>
                <small className="mt-0.5 block text-xs text-slate-500" dir="ltr">lolit-store.com</small>
              </span>
            </span>
            <ChevronDown size={17} className="text-slate-500" />
          </button>
          {openMenu === "store" ? (
            <div className="absolute right-0 top-[58px] z-40 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              {["فروشگاه لولیت", "فروشگاه موبایل", "فروشگاه آزمایشی"].map((store, index) => (
                <button key={store} type="button" onClick={() => setOpenMenu(null)} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700">
                  <span className="flex items-center gap-2"><Store size={16} />{store}</span>
                  {index === 0 ? <CheckCircle2 size={16} className="text-emerald-600" /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <label className="mx-auto flex min-w-0 max-w-[900px] flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-slate-500 transition focus-within:border-violet-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100">
          <Search size={20} className="shrink-0" />
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جستجوی محصولات، دسته‌ها، کلمات کلیدی..."
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            aria-label="جستجوی سراسری"
          />
          {search ? (
            <button type="button" onClick={() => setSearch("")} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="پاک‌کردن جستجو"><X size={16} /></button>
          ) : (
            <kbd className="hidden rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-400 sm:inline-flex" dir="ltr">⌘ K</kbd>
          )}
        </label>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button type="button" className="hidden rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-violet-700 sm:block" aria-label="راهنما">
            <CircleHelp size={22} />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((value) => (value === "notifications" ? null : "notifications"))}
              className="relative rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-violet-700"
              aria-label="اعلان‌ها"
            >
              <Bell size={22} />
              <span className="absolute right-0 top-0 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-extrabold text-white">۳</span>
            </button>
            {openMenu === "notifications" ? (
              <div className="absolute left-0 top-[52px] z-40 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                <div className="flex items-center justify-between px-1 pb-2"><strong className="text-sm text-slate-900">اعلان‌های جدید</strong><span className="text-xs text-violet-600">۳ مورد</span></div>
                {["۱۲ خطای بحرانی نیازمند بررسی است", "۷ تغییر محتوا در انتظار تأیید است", "گزارش خزش امروز آماده شد"].map((item) => (
                  <button key={item} type="button" onClick={() => setOpenMenu(null)} className="flex w-full items-start gap-2 rounded-xl px-2 py-2.5 text-right text-sm text-slate-600 hover:bg-slate-50"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500" />{item}</button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((value) => (value === "user" ? null : "user"))}
              className="flex items-center gap-2 rounded-2xl px-1.5 py-1.5 text-right transition hover:bg-slate-50"
            >
              <Image src="/avatar-arash.svg" alt="آرش محمدی" width={44} height={44} className="h-11 w-11 rounded-full border border-slate-200" />
              <span className="hidden min-w-[90px] lg:block">
                <strong className="block text-sm font-extrabold text-slate-900">آرش محمدی</strong>
                <small className="mt-0.5 block text-xs text-slate-500">مدیر سئو</small>
              </span>
              <ChevronDown size={16} className="hidden text-slate-500 lg:block" />
            </button>
            {openMenu === "user" ? (
              <div className="absolute left-0 top-[58px] z-40 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"><UserRound size={16} />پروفایل کاربری</button>
                <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"><Settings size={16} />تنظیمات حساب</button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
