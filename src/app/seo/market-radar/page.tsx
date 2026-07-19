"use client";

import { Compass, TrendingUp } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { trendData } from "@/src/data/seo";

export default function MarketRadarPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">رادار بازار</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">ترندهای نوظهور</h2>
          </div>
          <StatusBadge tone="success" label="فعال" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {trendData.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-900">
                <Compass size={16} />
                <p className="font-medium">{item.title}</p>
              </div>
              <p className="mt-3 text-sm text-slate-600">منبع: {item.source}</p>
              <p className="mt-2 text-sm text-slate-600">سیگنال: {item.signal}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">تغییرات بازار</p>
            <h3 className="text-xl font-semibold text-slate-900">مقایسه و تحلیل</h3>
          </div>
          <StatusBadge tone="warning" label="در حال پایش" />
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-violet-700">
            <TrendingUp size={16} />
            <p className="font-medium">نرخ رشد کلیدی نسبت به هفت روز قبل</p>
          </div>
          <p className="mt-3 text-sm text-slate-600">جست‌وجوی «آبیاری قطره‌ای» و «کود ارگانیک» در حال افزایش است و این مسیر برای تولید محتوا و به‌روزرسانی صفحات قابل بهره‌برداری است.</p>
        </div>
      </section>
    </div>
  );
}
