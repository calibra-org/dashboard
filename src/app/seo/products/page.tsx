"use client";

import { ArrowLeftRight, Sparkles } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { productData, opportunityData } from "@/src/data/seo";

export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">محصولات</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">تراز سئو محصولات</h2>
          </div>
          <StatusBadge tone="success" label="در حال رشد" />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {productData.map((product) => (
            <div key={product.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">{product.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{product.category}</p>
                </div>
                <StatusBadge tone={product.score > 85 ? "success" : "warning"} label={`${product.score}/100`} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-slate-500">Impressions</p>
                  <p className="mt-1 font-semibold text-slate-800">{product.impressions.toLocaleString("fa-IR")}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">CTR</p>
                  <p className="mt-1 font-semibold text-slate-800">{product.ctr}%</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">رتبه</p>
                  <p className="mt-1 font-semibold text-slate-800">{product.position}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">فرصت‌های محصول</p>
            <h3 className="text-xl font-semibold text-slate-900">پیشنهادهای عملی</h3>
          </div>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">ذخیره لیست</button>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {opportunityData.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-500">مالک: {item.owner}</p>
                </div>
                <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-medium text-violet-700">{item.impact}</span>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                <span className="flex items-center gap-2"><Sparkles size={16} />{item.effort}</span>
                <span className="flex items-center gap-2"><ArrowLeftRight size={16} />{item.score}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
