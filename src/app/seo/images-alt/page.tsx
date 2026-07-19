"use client";

import { ImageIcon, SearchCheck, ShieldAlert } from "lucide-react";
import { StatusBadge } from "@/src/components/ui/StatusBadge";
import { imageData, schemaData } from "@/src/data/seo";

export default function ImagesAltPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">تصاویر و ALT</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">بهبود دسترسی و SEO تصاویر</h2>
          </div>
          <StatusBadge tone="warning" label="در انتظار بازبینی" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {imageData.map((image) => (
            <div key={image.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-900">
                <ImageIcon size={16} />
                <p className="font-medium">{image.name}</p>
              </div>
              <p className="mt-3 text-sm text-slate-600">استفاده: {image.usage}</p>
              <p className="mt-2 text-sm text-slate-600">اندازه: {image.size}</p>
              <div className="mt-4">
                <StatusBadge tone={image.altStatus === "good" ? "success" : image.altStatus === "missing" ? "danger" : "warning"} label={image.altStatus === "good" ? "ALT خوب" : image.altStatus === "missing" ? "ALT وجود ندارد" : "نیاز به بازبینی"} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">اسکیما و ساختار داده</p>
            <h3 className="text-xl font-semibold text-slate-900">وضعیت اسکیما</h3>
          </div>
          <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">تکمیل خودکار</button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {schemaData.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{item.type}</p>
                <StatusBadge tone={item.status} label={item.status === "success" ? "سالم" : item.status === "warning" ? "هشدار" : "بحرانی"} />
              </div>
              <p className="mt-3 text-sm text-slate-600">{item.detail}</p>
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <SearchCheck size={16} />
                {item.suggestion}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">اقدامات پیشنهادی</p>
            <h3 className="text-xl font-semibold text-slate-900">چک‌لیست بازبینی</h3>
          </div>
          <StatusBadge tone="danger" label="۳ مورد نیاز" />
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-amber-700">
            <ShieldAlert size={16} />
            <p className="font-medium">۳ تصویر بدون ALT و ۲ اسکیما ناقص</p>
          </div>
          <p className="mt-3 text-sm text-slate-600">به‌روزرسانی با رویکرد کم‌ریسک و پیش‌نمایش قبل از اجرا</p>
        </div>
      </section>
    </div>
  );
}
