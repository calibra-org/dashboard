"use client";

import { Search, Sparkles } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { keywordData } from "@/src/data/seo";

export default function KeywordsContentPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">کلمات کلیدی و محتوا</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">پرتوهای فرصت‌محور</h2>
          </div>
          <StatusBadge tone="warning" label="نیازمند به‌روزرسانی" />
        </div>
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-right text-slate-600">
              <tr>
                <th className="px-4 py-3">کلمه</th>
                <th className="px-4 py-3">حجم</th>
                <th className="px-4 py-3">رتبه</th>
                <th className="px-4 py-3">Intent</th>
                <th className="px-4 py-3">فرصت</th>
              </tr>
            </thead>
            <tbody>
              {keywordData.map((keyword) => (
                <tr key={keyword.id} className="border-t border-slate-200 bg-white">
                  <td className="px-4 py-3 font-medium text-slate-900">{keyword.keyword}</td>
                  <td className="px-4 py-3">{keyword.volume.toLocaleString("fa-IR")}</td>
                  <td className="px-4 py-3">{keyword.position}</td>
                  <td className="px-4 py-3">{keyword.intent}</td>
                  <td className="px-4 py-3">{keyword.opportunity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">پیشنهاد تولید محتوا</p>
            <h3 className="text-xl font-semibold text-slate-900">برنامه محتوایی</h3>
          </div>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">افزودن برگه</button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-violet-700">
              <Search size={16} />
              <p className="font-medium">برگه آموزشی</p>
            </div>
            <p className="mt-3 text-sm text-slate-600">مجموعه سوالات پرتکرار و پاسخ‌های کوتاه برای افزایش Rich Result</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-violet-700">
              <Sparkles size={16} />
              <p className="font-medium">پیشنهاد AI</p>
            </div>
            <p className="mt-3 text-sm text-slate-600">عنوان جدید، متا، چک‌لیست هدر و بخش مزایا از روی داده‌های رقبا</p>
          </div>
        </div>
      </section>
    </div>
  );
}
