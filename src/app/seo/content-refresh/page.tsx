"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { contentOpportunityData, trendData } from "@/src/data/seo";

export default function ContentRefreshPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">به‌روزرسانی محتوا</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">پیشنهادهای به‌روزرسانی</h2>
          </div>
          <StatusBadge tone="warning" label="۸ پیشنهاد باز" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {contentOpportunityData.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-900">
                <RefreshCw size={16} />
                <p className="font-medium">{item.title}</p>
              </div>
              <p className="mt-3 text-sm text-slate-600">منبع: {item.source}</p>
              <p className="mt-2 text-sm text-slate-600">تأثیر: {item.impact}</p>
              <p className="mt-2 text-sm text-slate-600">تلاش: {item.effort}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">روند بازار</p>
            <h3 className="text-xl font-semibold text-slate-900">اخبار و ترندها</h3>
          </div>
          <StatusBadge tone="success" label="در حال رشد" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {trendData.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-violet-700">
                <Sparkles size={16} />
                <p className="font-medium">{item.title}</p>
              </div>
              <p className="mt-3 text-sm text-slate-600">منبع: {item.source}</p>
              <p className="mt-2 text-sm text-slate-600">سیگنال: {item.signal}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
