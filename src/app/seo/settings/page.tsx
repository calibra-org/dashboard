"use client";

import { Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { automationData, permissionData } from "@/src/data/seo";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">تنظیمات</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">دسترسی و خودکارسازی</h2>
          </div>
          <StatusBadge tone="success" label="سالم" />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-slate-900">
              <ShieldCheck size={16} />
              <p className="font-medium">سطوح دسترسی</p>
            </div>
            <div className="mt-4 space-y-3">
              {permissionData.map((permission) => (
                <div key={permission.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">{permission.role}</p>
                  <p className="mt-2">{permission.scope}</p>
                  <p className="mt-1">دسترسی: {permission.access}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-slate-900">
              <Settings2 size={16} />
              <p className="font-medium">خودکارسازی‌ها</p>
            </div>
            <div className="mt-4 space-y-3">
              {automationData.map((automation) => (
                <div key={automation.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-900">{automation.title}</p>
                    <StatusBadge tone={automation.status} label={automation.status === "success" ? "فعال" : automation.status === "warning" ? "هشدار" : "غیرفعال"} />
                  </div>
                  <p className="mt-2">برنامه: {automation.schedule}</p>
                  <p className="mt-1">بعدی: {automation.nextRun}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">پیکربندی</p>
            <h3 className="text-xl font-semibold text-slate-900">تنظیمات عملیات</h3>
          </div>
          <StatusBadge tone="warning" label="تغییرات شبیه‌سازی" />
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-violet-700">
            <Sparkles size={16} />
            <p className="font-medium">تنظیم گزارش، تکرار schedule و سطح دسترسی</p>
          </div>
          <p className="mt-3 text-sm text-slate-600">این صفحه برای نمایش ماژول Governance و تنظیمات عبرت‌آموز و آنالوگ با این نسخه ساخته شده است.</p>
        </div>
      </section>
    </div>
  );
}
