"use client";

import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { crawlResults, indexationData } from "@/src/data/seo";

export default function TechnicalHealthPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">سلامت فنی</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">وضعیت crawl و ایندکس</h2>
          </div>
          <StatusBadge tone="warning" label="هشدارهای فنی" />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-slate-900">
              <AlertTriangle size={16} />
              <p className="font-medium">آخرین crawlها</p>
            </div>
            <div className="mt-4 space-y-3">
              {crawlResults.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>{item.url}</span>
                    <span className="font-medium text-slate-900">{item.status}</span>
                  </div>
                  <p className="mt-2">{item.issue}</p>
                  <p className="mt-1 text-xs text-slate-400">{item.ts}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-slate-900">
              <ShieldCheck size={16} />
              <p className="font-medium">وضعیت ایندکس</p>
            </div>
            <div className="mt-4 space-y-3">
              {indexationData.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>{item.page}</span>
                    <StatusBadge tone={item.status === "indexed" ? "success" : item.status === "pending" ? "warning" : "danger"} label={item.status} />
                  </div>
                  <p className="mt-2">{item.notes}</p>
                  <p className="mt-1 text-xs text-slate-400">آخرین crawl: {item.lastCrawl}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">توصیه‌های فنی</p>
            <h3 className="text-xl font-semibold text-slate-900">اقدامات ضروری</h3>
          </div>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">تأیید اجرا</button>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 size={16} />
            <p className="font-medium">رفع redirect و بهینه‌سازی canonical</p>
          </div>
          <p className="mt-3 text-sm text-slate-600">برای جلوگیری از افت ایندکس و کاهش ریسک در اجرای bulk changes، این موارد در اولویتند.</p>
        </div>
      </section>
    </div>
  );
}
