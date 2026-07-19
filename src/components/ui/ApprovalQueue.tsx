"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { approvalData } from "@/src/data/seo";
import { Toast } from "@/src/components/ui/Toast";

export function ApprovalQueue() {
  const [items, setItems] = useState(approvalData);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleDecision = (id: string, decision: "approve" | "reject") => {
    setItems((current) => current.filter((item) => item.id !== id));
    setFeedback(decision === "approve" ? "درخواست تأیید شد." : "درخواست بازگردانده شد.");
  };

  return (
    <div className="space-y-3">
      {feedback ? <Toast message={feedback} tone="success" /> : null}
      {items.map((item) => (
        <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium text-slate-900">{item.product}</p>
              <p className="mt-1 text-sm text-slate-600">{item.action}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => handleDecision(item.id, "reject")} className="rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-700">
                <span className="flex items-center gap-2"><XCircle size={16} />رد</span>
              </button>
              <button type="button" onClick={() => handleDecision(item.id, "approve")} className="rounded-xl border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
                <span className="flex items-center gap-2"><CheckCircle2 size={16} />تأیید</span>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
