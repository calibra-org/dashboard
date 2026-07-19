"use client";

import { Eye, SearchCheck, Sparkles } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { schemaData } from "@/src/data/seo";

export default function SchemaPreviewPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">اسکیما و پیش‌نمایش</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">پیش‌نمایش داده‌های ساختاری</h2>
          </div>
          <StatusBadge tone="success" label="پیش‌نمایش فعال" />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {schemaData.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{item.type}</p>
                <StatusBadge tone={item.status} label={item.status === "success" ? "سالم" : item.status === "warning" ? "هشدار" : "بحرانی"} />
              </div>
              <p className="mt-3 text-sm text-slate-600">{item.detail}</p>
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <Eye size={16} />
                {item.suggestion}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">پیش‌نمایش Rich Result</p>
            <h3 className="text-xl font-semibold text-slate-900">نسخه قابل اجرا</h3>
          </div>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">ذخیره نسخه</button>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-violet-700">
            <Sparkles size={16} />
            <p className="font-medium">Product + FAQ + Review</p>
          </div>
          <p className="mt-3 text-sm text-slate-600">پیش‌نمایش ساختار داده برای ۶ محصول پرتقاضا و ۳ محصول دارای فرصت SERP</p>
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <SearchCheck size={16} />
            این نسخه با کمترین ریسک قابل اجرا است.
          </div>
        </div>
      </section>
    </div>
  );
}
