"use client";

import { Link2, Sparkles } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";

const links = [
  { name: "راهنمای آبیاری قطره‌ای", state: "قوی", detail: "۶ لینک ورودی فعال" },
  { name: "مقایسه انواع کود", state: "نیازمند بازبینی", detail: "۲ لینک دچار شکاف" },
  { name: "پیشنهادات مرتبط", state: "خوب", detail: "۳۵٪ از صفحات مرتبط" },
];

export default function CategoriesLinksPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">دسته‌بندی و لینک داخلی</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">ساختار موضوعی و پیوندها</h2>
          </div>
          <StatusBadge tone="success" label="بهینه" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {links.map((link) => (
            <div key={link.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-900">
                <Link2 size={16} />
                <p className="font-medium">{link.name}</p>
              </div>
              <p className="mt-3 text-sm text-slate-600">{link.detail}</p>
              <div className="mt-4">
                <StatusBadge tone={link.state === "قوی" ? "success" : link.state === "نیازمند بازبینی" ? "warning" : "neutral"} label={link.state} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">پیشنهادهای موضوعی</p>
            <h3 className="text-xl font-semibold text-slate-900">خروجی محتوا و لینک</h3>
          </div>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">تولید پیشنهاد</button>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-violet-700">
            <Sparkles size={16} />
            <p className="font-medium">محورهای پیشنهادی</p>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li>• اضافه کردن صفحه مقایسه میان محصول و روش سنتی</li>
            <li>• پیوند به صفحه «راهنمای نصب» از همه صفحات دسته‌بندی</li>
            <li>• انتشار طبقه‌بندی بر اساس intent</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
