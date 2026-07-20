"use client";

import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { RightSidebar } from "@/src/components/layout/RightSidebar";
import { TopHeader } from "@/src/components/layout/TopHeader";

interface AppShellProps {
  children: React.ReactNode;
}

const titleMap: Record<string, string> = {
  "/seo/overview": "نمای کلی سئو",
  "/seo/control-tower": "مرکز فرمان Agentها",
  "/seo/products": "برج کنترل محصولات",
  "/seo/categories-links": "دسته‌بندی‌ها و لینک‌سازی",
  "/seo/keywords-content": "کلمات کلیدی و محتوا",
  "/seo/images-alt": "تصاویر و ALT",
  "/seo/schema-preview": "اسکیما و پیش‌نمایش",
  "/seo/technical-health": "سلامت فنی و کرال",
  "/seo/crawl-monitoring": "پایش خزش",
  "/seo/rank-tracking": "ردیابی رتبه",
  "/seo/competitors-serp": "تحلیل رقبا و SERP",
  "/seo/live-editor": "ویرایشگر و دستیار زنده",
  "/seo/content-refresh": "به‌روزرسانی محتوا",
  "/seo/market-radar": "رادار بازار",
  "/seo/reports": "گزارش‌ها",
  "/seo/settings": "قوانین و تنظیمات",
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = useMemo(() => titleMap[pathname] ?? "Lolit SEO V2", [pathname]);

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-900" dir="rtl">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[282px_minmax(0,1fr)]">
        <RightSidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <div className="min-w-0">
          <TopHeader title={title} onOpenMenu={() => setMobileOpen(true)} />
          <main className="mx-auto w-full max-w-[1680px] p-3 sm:p-5 lg:p-6 xl:p-7">{children}</main>
        </div>
      </div>
    </div>
  );
}
