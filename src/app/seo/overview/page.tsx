"use client";

import { Activity, ArrowUpRight, Bot, CheckCircle2, SearchCheck, ShieldCheck, Sparkles } from "lucide-react";
import { StatCard } from "@/src/components/ui/StatCard";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { seoScoreData, storeHealthData, productData, opportunityData, issueData } from "@/src/data/seo";

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-violet-600">عملکرد هفته جاری</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">جمع‌آوری و تشخیص داده‌های سئو</h2>
            </div>
            <StatusBadge tone="success" label="در حال اجرا" />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Activity size={16} />
                مشاهده و تحلیل
              </div>
              <p className="mt-3 text-3xl font-semibold text-slate-900">۱۷۲</p>
              <p className="mt-2 text-sm text-slate-500">پروسه‌های پایش فعال</p>
            </div>
            <div className="rounded-2xl bg-violet-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
                <Sparkles size={16} />
                پیشنهادهای AI
              </div>
              <p className="mt-3 text-3xl font-semibold text-slate-900">۳۴</p>
              <p className="mt-2 text-sm text-slate-500">پیشنهاد آماده اجرا</p>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
          <div className="flex items-center gap-2 text-sm text-violet-300">
            <Bot size={16} />
            وضعیت عامل‌های سئو
          </div>
          <div className="mt-6 space-y-4">
            {[
              { name: "AI Title Agent", detail: "۳۲ محصول در حال تحلیل", tone: "success" },
              { name: "FAQ Agent", detail: "۱۲ پیشنهاد جدید", tone: "warning" },
              { name: "Schema Agent", detail: "۶ اسکیما موفق", tone: "success" },
            ].map((item) => (
              <div key={item.name} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{item.name}</p>
                  <StatusBadge tone={item.tone as "success" | "warning"} label="فعال" />
                </div>
                <p className="mt-2 text-sm text-slate-400">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {seoScoreData.map((item) => (
          <StatCard key={item.id} title={item.title} value={`${item.value}`} detail={`هدف ${item.target}`} trend={item.change} tone={item.status === "success" ? "success" : "warning"} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">سلامت فروشگاه</p>
              <h3 className="text-xl font-semibold text-slate-900">وضعیت کلی پایش</h3>
            </div>
            <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">مشاهده جزئیات</button>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {storeHealthData.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800">{item.name}</p>
                  <StatusBadge tone={item.status} label={`${item.score}/100`} />
                </div>
                <p className="mt-3 text-sm text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">ارزش پیشنهادی</p>
              <h3 className="text-xl font-semibold text-slate-900">فرصت‌های برتر</h3>
            </div>
            <StatusBadge tone="warning" label="نسبتاً بالا" />
          </div>
          <div className="mt-6 space-y-3">
            {opportunityData.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-800">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.owner} • {item.effort}</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-sm font-medium text-violet-700">
                    <ArrowUpRight size={14} />
                    {item.score}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">محصولات با بیشترین نیاز</p>
            <h3 className="text-xl font-semibold text-slate-900">پروفایل محصول</h3>
          </div>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">مشاهده همه</button>
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
              <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                <span className="flex items-center gap-2"><SearchCheck size={16} />{product.opportunity}</span>
                <span className="flex items-center gap-2 text-emerald-600"><CheckCircle2 size={16} />{product.trend}%</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">مسائل بحرانی</p>
            <h3 className="text-xl font-semibold text-slate-900">لیست مشکلات فعال</h3>
          </div>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">دسترسی سریع</button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {issueData.map((issue) => (
            <div key={issue.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{issue.title}</p>
                <StatusBadge tone={issue.severity === "critical" ? "danger" : issue.severity === "warning" ? "warning" : "neutral"} label={issue.tag} />
              </div>
              <p className="mt-3 text-sm text-slate-600">{issue.detail}</p>
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <ShieldCheck size={16} />
                {issue.product}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
