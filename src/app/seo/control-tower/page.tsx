"use client";

import { useState } from "react";
import { CheckCircle2, PlayCircle, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { Tabs } from "@/src/components/ui/Tabs";
import { FilterBar } from "@/src/components/ui/FilterBar";
import { ApprovalQueue } from "@/src/components/ui/ApprovalQueue";
import { approvalData, agentData, engineStatusData, recommendationData } from "@/src/data/seo";

export default function ControlTowerPage() {
  const [activeTab, setActiveTab] = useState("recommendations");
  const [filter, setFilter] = useState("همه");
  const filteredRecommendations = recommendationData.filter((item) => filter === "همه" || item.impact === filter);
  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-violet-600">کنترل‌تاور محصول</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">۴ لایه عملیاتی</h2>
            </div>
            <StatusBadge tone="success" label="آماده اجرا" />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              { title: "Observe", detail: "جمع‌آوری داده از crawler، GSC، GA4 و بازار" },
              { title: "Diagnose", detail: "تشخیص مشکلات فنی، محتوا، اسکیما و رقبا" },
              { title: "Recommend", detail: "پیشنهاد عنوان، FAQ، ALT، لینک داخلی و اسکیما" },
              { title: "Execute & Govern", detail: "تأیید، اجرا، audit و rollback" },
            ].map((layer) => (
              <div key={layer.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Workflow size={16} />
                  {layer.title}
                </div>
                <p className="mt-3 text-sm text-slate-600">{layer.detail}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
          <div className="flex items-center gap-2 text-violet-300">
            <Sparkles size={16} />
            موتورهای پیشنهادی
          </div>
          <div className="mt-6 space-y-3">
            {agentData.map((agent) => (
              <div key={agent.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{agent.name}</p>
                    <p className="mt-1 text-sm text-slate-400">{agent.role}</p>
                  </div>
                  <StatusBadge tone={agent.status} label={agent.coverage} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">پیشنهادهای آماده</p>
              <h3 className="text-xl font-semibold text-slate-900">توصیه‌های AI</h3>
            </div>
            <Tabs items={[{ id: "recommendations", label: "پیشنهادها" }, { id: "queue", label: "صف تأیید" }]} activeId={activeTab} onChange={setActiveTab} />
          </div>
          {activeTab === "recommendations" ? (
            <>
              <div className="mt-4">
                <FilterBar activeFilter={filter} onChange={setFilter} options={["همه", "بالا", "متوسط"]} />
              </div>
              <div className="mt-6 space-y-3">
                {filteredRecommendations.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">{item.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.summary}</p>
                      </div>
                      <StatusBadge tone={item.status} label={item.impact} />
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                      <PlayCircle size={16} />
                      تلاش: {item.effort}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-6">
              <ApprovalQueue />
            </div>
          )}
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">تأیید و اجرا</p>
              <h3 className="text-xl font-semibold text-slate-900">صف تحویل</h3>
            </div>
            <StatusBadge tone="warning" label="در انتظار تایید" />
          </div>
          <div className="mt-6 space-y-3">
            {approvalData.slice(0, 2).map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{item.product}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.action}</p>
                  </div>
                  <StatusBadge tone={item.risk === "کم" ? "success" : item.risk === "متوسط" ? "warning" : "danger"} label={item.risk} />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                  <span className="flex items-center gap-2"><ShieldCheck size={16} />{item.owner}</span>
                  <span className="flex items-center gap-2"><CheckCircle2 size={16} />{item.eta}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">وضعیت موتور</p>
            <h3 className="text-xl font-semibold text-slate-900">انجین‌ها و سرویس‌ها</h3>
          </div>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">به‌روزرسانی</button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {engineStatusData.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{item.name}</p>
                <StatusBadge tone={item.status} label={item.status === "success" ? "سالم" : item.status === "warning" ? "هشدار" : "بحرانی"} />
              </div>
              <p className="mt-3 text-sm text-slate-600">تاخیر: {item.latency}</p>
              <p className="mt-2 text-sm text-slate-500">آخرین اجرا: {item.lastRun}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
