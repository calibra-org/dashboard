"use client";

import { Bot, Check, ChevronLeft, Lightbulb, Plus, ShieldCheck } from "lucide-react";
import type { LinkingAgent, LinkingRule, SmartRecommendation } from "@/src/types/categories-links";

export function RecommendationsPanel({ items, onOpen }: { items: SmartRecommendation[]; onOpen: () => void }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_8px_26px_rgba(15,23,42,0.035)]">
      <div className="flex items-center justify-between"><h2 className="text-lg font-black text-slate-950">خلاصه پیشنهادهای هوشمند</h2><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-700"><Lightbulb size={20} /></span></div>
      <div className="mt-5 space-y-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 text-sm leading-7 text-slate-600">
            <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-600"><Check size={15} strokeWidth={2.7} /></span>
            {item.text}
          </div>
        ))}
      </div>
      <button type="button" onClick={onOpen} className="mt-5 inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-extrabold text-violet-700 hover:bg-violet-50">مشاهده گزارش کامل پیشنهادها<ChevronLeft size={17} /></button>
    </section>
  );
}

export function AgentsPanel({ agents, onOpen, onAdd }: { agents: LinkingAgent[]; onOpen: (agent: LinkingAgent) => void; onAdd: () => void }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_8px_26px_rgba(15,23,42,0.035)]">
      <div className="flex items-center justify-between"><h2 className="text-lg font-black text-slate-950">عامل‌های فعال</h2><Bot size={21} className="text-violet-700" /></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {agents.map((agent) => (
          <button type="button" key={agent.id} onClick={() => onOpen(agent)} className="relative rounded-2xl border border-slate-200 p-4 text-center transition hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/30 focus:outline-none focus:ring-2 focus:ring-violet-300">
            <span className="absolute left-4 top-4 h-3 w-3 rounded-full bg-emerald-500" />
            <strong className="block text-sm text-slate-900" dir="ltr">{agent.name}</strong>
            <p className="mt-4 text-sm leading-7 text-slate-600">{agent.description}</p>
          </button>
        ))}
      </div>
      <button type="button" onClick={onAdd} className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-400 px-4 py-4 text-base font-black text-slate-700 transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700"><Plus size={21} />افزودن عامل</button>
    </section>
  );
}

export function RulesPanel({ rules, onToggle, onManage }: { rules: LinkingRule[]; onToggle: (id: string) => void; onManage: () => void }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_8px_26px_rgba(15,23,42,0.035)]" id="linking-rules">
      <div className="flex items-center justify-between"><h2 className="text-lg font-black text-slate-950">قوانین لینک‌سازی داخلی</h2><ShieldCheck size={21} className="text-violet-700" /></div>
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        {rules.map((rule) => (
          <button type="button" key={rule.id} onClick={() => onToggle(rule.id)} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-right transition last:border-b-0 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300">
            <span className="flex items-center gap-2 text-[13px] font-medium leading-6 text-slate-600"><ChevronLeft size={16} className="text-slate-500" />{rule.label}</span>
            <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${rule.enabled ? "bg-emerald-500" : "bg-slate-300"}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${rule.enabled ? "left-1" : "left-6"}`} />
            </span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onManage} className="mt-4 inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-extrabold text-violet-700 hover:bg-violet-50">مدیریت همه قوانین<ChevronLeft size={17} /></button>
    </section>
  );
}
