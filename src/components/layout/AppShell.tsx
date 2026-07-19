"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { RightSidebar } from "@/src/components/layout/RightSidebar";
import { TopHeader } from "@/src/components/layout/TopHeader";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [title, setTitle] = useState("نمای کلی");

  useEffect(() => {
    const map: Record<string, string> = {
      "/seo/overview": "نمای کلی سئو",
      "/seo/control-tower": "کنترل‌تاور محصول",
      "/seo/products": "محصولات و فرصت‌ها",
      "/seo/categories-links": "دسته‌بندی و لینک داخلی",
      "/seo/keywords-content": "کلمات کلیدی و محتوا",
      "/seo/images-alt": "تصاویر و ALT",
      "/seo/schema-preview": "اسکیما و پیش‌نمایش",
      "/seo/technical-health": "سلامت فنی",
      "/seo/crawl-monitoring": "پایش crawl",
      "/seo/rank-tracking": "ردیاب رتبه",
      "/seo/competitors-serp": "رقبا و SERP",
      "/seo/live-editor": "ویرایش زنده",
      "/seo/content-refresh": "به‌روزرسانی محتوا",
      "/seo/market-radar": "رادار بازار",
      "/seo/reports": "گزارش‌ها",
      "/seo/settings": "تنظیمات",
    };
    setTitle(map[pathname] ?? "نمای کلی");
  }, [pathname]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" dir="rtl">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <div className="flex-1">
          <TopHeader title={title} subtitle="نسخه V2 • داشبورد عملیاتی" />
          <main className="p-4 md:p-6 lg:p-8">{children}</main>
        </div>
        <RightSidebar />
      </div>
    </div>
  );
}
