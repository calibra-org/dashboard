"use client";

import { BarChart3, Search, Sparkles } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { competitorData, serpFeatureData } from "@/src/data/seo";

export default function CompetitorsSerpPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">رقبا و SERP</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">گپ‌های رقابتی و Rich Results</h2>
          </div>
          <StatusBadge tone="warning" label="شناسایی شده" />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {competitorData.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{item.name}</p>
                <StatusBadge tone={item.status} label={`${item.share}%`} />
              </div>
              <p className="mt-3 text-sm text-slate-600">کلمه: {item.keyword}</p>
              <p className="mt-2 text-sm text-slate-600">گپ: {item.gap}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">SERP Feature</p>
            <h3 className="text-xl font-semibold text-slate-900">نقشه رقابتی</h3>
          </div>
          <StatusBadge tone="success" label="در حال رشد" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {serpFeatureData.map((feature) => (
            <div key={feature.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-violet-700">
                <BarChart3 size={16} />
                <p className="font-medium">{feature.feature}</p>
              </div>
              <p className="mt-3 text-sm text-slate-600">قابلیت دیده‌شدن: {feature.visibility}%</p>
              <p className="mt-2 text-sm text-slate-600">برد: {feature.wins} • باخت: {feature.losses}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">اقدامات رقابتی</p>
            <h3 className="text-xl font-semibold text-slate-900">پیشنهادهای فوری</h3>
          </div>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">ارسال به لیست</button>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-violet-700">
            <Search size={16} />
            <p className="font-medium">افزودن FAQ و جدول مقایسه برای پوشش بهتر Rich Result</p>
          </div>
          <p className="mt-3 text-sm text-slate-600">این پیشنهاد با توجه به داده‌های رقبا و تغییرات SERP در نسخه شبیه‌سازی گردآوری شده است.</p>
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <Sparkles size={16} />
            متن پیشنهادی آماده است.
          </div>
        </div>
      </section>
    </div>
  );
}
