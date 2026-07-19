"use client";

import { Activity, ServerCog } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { crawlResults } from "@/src/data/seo";

export default function CrawlMonitoringPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">پایش Crawl</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">وضعیت جدیدترین crawlها</h2>
          </div>
          <StatusBadge tone="success" label="امنیت بالا" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {crawlResults.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-900">
                  <Activity size={16} />
                  <p className="font-medium">{item.url}</p>
                </div>
                <span className="text-sm font-medium text-slate-700">{item.status}</span>
              </div>
              <p className="mt-3 text-sm text-slate-600">{item.issue}</p>
              <p className="mt-2 text-xs text-slate-400">{item.ts}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">سرویس‌های پایش</p>
            <h3 className="text-xl font-semibold text-slate-900">موتورهای داخلی</h3>
          </div>
          <StatusBadge tone="warning" label="۲ سرویس نیازمند بازبینی" />
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-violet-700">
            <ServerCog size={16} />
            <p className="font-medium">Crawler و GSC در حال همگام‌سازی</p>
          </div>
          <p className="mt-3 text-sm text-slate-600">این ماژول برای مشاهده‌ی وضعیت پشتیبان و خطاها در حالت شبیه‌سازی آماده شده است.</p>
        </div>
      </section>
    </div>
  );
}
