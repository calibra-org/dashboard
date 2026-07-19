"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

export function BeforeAfterPreview() {
  const [mode, setMode] = useState<"before" | "after">("after");

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-violet-700">
          <Eye size={16} />
          <p className="font-medium">پیش‌نمایش قبل/بعد</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode("before")} className={`rounded-full px-3 py-1.5 text-sm ${mode === "before" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>
            قبل
          </button>
          <button type="button" onClick={() => setMode("after")} className={`rounded-full px-3 py-1.5 text-sm ${mode === "after" ? "bg-violet-600 text-white" : "bg-white text-slate-600"}`}>
            بعد
          </button>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        {mode === "before" ? "Before: عنوان کوتاه و بدون مزیت فروش" : "After: عنوان با کلمه هدف، مزیت فروش و FAQ"}
      </div>
    </div>
  );
}
