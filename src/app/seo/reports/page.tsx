"use client";

import { FileText, Download } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { reportData, auditEvents } from "@/src/data/seo";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">گزارش‌ها</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">تولید و مدیریت گزارش</h2>
          </div>
          <StatusBadge tone="success" label="آماده" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {reportData.map((report) => (
            <div key={report.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-900">
                  <FileText size={16} />
                  <p className="font-medium">{report.name}</p>
                </div>
                <button className="rounded-xl border border-slate-200 p-2 text-slate-600">
                  <Download size={16} />
                </button>
              </div>
              <p className="mt-3 text-sm text-slate-600">{report.description}</p>
              <p className="mt-2 text-sm text-slate-500">آخرین به‌روزرسانی: {report.updatedAt}</p>
              <div className="mt-4">
                <StatusBadge tone="neutral" label={report.format} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Audit log</p>
            <h3 className="text-xl font-semibold text-slate-900">تاریخچه تغییرات</h3>
          </div>
          <StatusBadge tone="warning" label="۲ مورد اخیر" />
        </div>
        <div className="mt-6 space-y-3">
          {auditEvents.map((event) => (
            <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>{event.action}</span>
                <StatusBadge tone={event.status} label={event.status === "success" ? "موفق" : event.status === "warning" ? "هشدار" : "بحرانی"} />
              </div>
              <p className="mt-2">{event.actor} • {event.time}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
