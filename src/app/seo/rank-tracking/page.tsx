"use client";

import { ArrowUpRight, TrendingUp } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { rankingData } from "@/src/data/seo";

export default function RankTrackingPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">ردیاب رتبه</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">نوسانات رتبه کلمات</h2>
          </div>
          <StatusBadge tone="success" label="بهبود" />
        </div>
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-right text-slate-600">
              <tr>
                <th className="px-4 py-3">کلمه</th>
                <th className="px-4 py-3">رتبه فعلی</th>
                <th className="px-4 py-3">رتبه قبل</th>
                <th className="px-4 py-3">حجم</th>
                <th className="px-4 py-3">روند</th>
              </tr>
            </thead>
            <tbody>
              {rankingData.map((item) => (
                <tr key={item.id} className="border-t border-slate-200 bg-white">
                  <td className="px-4 py-3 font-medium text-slate-900">{item.keyword}</td>
                  <td className="px-4 py-3">{item.current}</td>
                  <td className="px-4 py-3">{item.previous}</td>
                  <td className="px-4 py-3">{item.volume.toLocaleString("fa-IR")}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <ArrowUpRight size={16} />
                      {item.trend}%
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">گزارش روزانه</p>
            <h3 className="text-xl font-semibold text-slate-900">روند کلمات کلیدی</h3>
          </div>
          <StatusBadge tone="warning" label="نوسان سبک" />
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-violet-700">
            <TrendingUp size={16} />
            <p className="font-medium">روند کلی ۶٪ بهتر نسبت به هفته گذشته</p>
          </div>
          <p className="mt-3 text-sm text-slate-600">این بخش برای نمایش نمودار‌های ریتینگ و فرصت‌های رتبه‌بندی در نسخه UX آماده شده است.</p>
        </div>
      </section>
    </div>
  );
}
