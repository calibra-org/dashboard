"use client";

import { useState } from "react";
import { PencilLine, Send, Sparkles } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { BeforeAfterPreview } from "@/src/components/ui/BeforeAfterPreview";
import { Tabs } from "@/src/components/ui/Tabs";

export default function LiveEditorPage() {
  const [activeTab, setActiveTab] = useState("title");
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">ویرایش زنده</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">پیش‌نمایش قبل از اجرای تغییرات</h2>
          </div>
          <StatusBadge tone="warning" label="پیش‌نمایش فعال" />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-900">
                <PencilLine size={16} />
                <p className="font-medium">متن پیشنهادی</p>
              </div>
              <Tabs items={[{ id: "title", label: "عنوان" }, { id: "meta", label: "متا" }]} activeId={activeTab} onChange={setActiveTab} />
            </div>
            {activeTab === "title" ? (
              <p className="mt-4 text-sm leading-8 text-slate-700">
                خرید سیستم آبیاری قطره‌ای حرفه‌ای | قیمت، ارسال سریع و ضمانت
              </p>
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-500">متا دیسکریپشن</p>
                <p className="mt-2 text-sm text-slate-700">سیستم آبیاری قطره‌ای مناسب باغ، گلخانه و زمین کشاورزی با نصب آسان و مصرف آب کمتر</p>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-violet-700">
              <Sparkles size={16} />
              <p className="font-medium">پیش‌نمایش After</p>
            </div>
            <div className="mt-4">
              <BeforeAfterPreview />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">ارسال برای اجرا</p>
            <h3 className="text-xl font-semibold text-slate-900">ایجاد درخواست مجوز</h3>
          </div>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">ارسال</button>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-violet-700">
            <Send size={16} />
            <p className="font-medium">ارسال برای مدیر سئو با برچسب کم‌ریسک</p>
          </div>
          <p className="mt-3 text-sm text-slate-600">این بخش مربوط به مسیر Execute & Govern است و در حالت شبیه‌سازی با تأیید و rollback امکان‌پذیر است.</p>
        </div>
      </section>
    </div>
  );
}
