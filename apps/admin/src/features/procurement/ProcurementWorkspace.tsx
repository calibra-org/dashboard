"use client";
import { useMemo, useState } from "react";
import type { ProcurementOverview } from "#/lib/queries/procurement";
const money = (v: number) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(v);
export function ProcurementWorkspace({
    initial,
    recommendations,
}: {
    initial: ProcurementOverview;
    recommendations: Array<any>;
}) {
    const [tab, setTab] = useState<"command" | "suppliers" | "orders" | "recommendations">("command");
    const d = initial.data;
    const bars = useMemo(
        () => d.suppliers.slice(0, 8).map((s) => ({ name: s.display_name, value: Number(s.score?.composite || 0) })),
        [d.suppliers],
    );
    return (
        <main
            dir="rtl"
            className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,.14),transparent_28%),radial-gradient(circle_at_10%_35%,rgba(168,85,247,.12),transparent_24%)] p-4 md:p-7"
        >
            <section className="mx-auto max-w-[1600px] space-y-5">
                <header className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 p-6 text-white shadow-2xl md:p-8">
                    <div className="flex flex-wrap items-end justify-between gap-5">
                        <div>
                            <p className="text-xs font-semibold tracking-[.25em] text-cyan-300">CALIBRA · PHASE 14</p>
                            <h1 className="mt-2 text-3xl font-black md:text-5xl">Procurement & Supplier Intelligence OS</h1>
                            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                                از پیش‌بینی تقاضا تا خرید، دریافت، کیفیت و امتیاز تأمین‌کننده؛ یک زنجیره اجرایی قابل ممیزی با ریسک و
                                اثر نقدینگی شفاف.
                            </p>
                        </div>
                        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-emerald-200">
                            <div className="text-xs">Supplier Health</div>
                            <div className="text-2xl font-black">{d.kpis.average_supplier_score}%</div>
                        </div>
                    </div>
                </header>
                <div className="grid gap-3 md:grid-cols-5">
                    {[
                        ["تأمین‌کننده فعال", d.kpis.active_suppliers],
                        ["PO باز", d.kpis.open_purchase_orders],
                        ["تعهد نقدی", money(d.kpis.open_commitment_minor)],
                        ["Incident باز", d.kpis.open_incidents],
                        ["امتیاز شبکه", `${d.kpis.average_supplier_score}%`],
                    ].map(([l, v]) => (
                        <div key={String(l)} className="rounded-3xl border bg-background/90 p-5 shadow-sm backdrop-blur">
                            <div className="text-xs text-muted-foreground">{l}</div>
                            <div className="mt-2 text-2xl font-black tabular-nums">{v}</div>
                        </div>
                    ))}
                </div>
                <nav className="flex gap-2 overflow-auto rounded-2xl border bg-background/80 p-2 backdrop-blur">
                    {[
                        ["command", "فرماندهی"],
                        ["suppliers", "Supplier 360"],
                        ["orders", "Purchase Orders"],
                        ["recommendations", "Smart PO"],
                    ].map(([k, l]) => (
                        <button
                            key={k}
                            onClick={() => setTab(k as any)}
                            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${tab === k ? "bg-slate-950 text-white shadow-lg" : "hover:bg-muted"}`}
                        >
                            {l}
                        </button>
                    ))}
                </nav>
                {tab === "command" && (
                    <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
                        <section className="rounded-[28px] border bg-background/90 p-6 shadow-sm">
                            <h2 className="text-lg font-black">Supplier Score Landscape</h2>
                            <p className="text-xs text-muted-foreground">امتیاز مرکب قابل توضیح؛ نه یک عدد مبهم.</p>
                            <div className="mt-6 space-y-4">
                                {bars.map((b) => (
                                    <div key={b.name}>
                                        <div className="mb-1 flex justify-between text-xs">
                                            <span>{b.name}</span>
                                            <b>{b.value}%</b>
                                        </div>
                                        <div className="h-3 overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-l from-cyan-500 via-blue-500 to-violet-500"
                                                style={{ width: `${Math.max(3, b.value)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                        <section className="rounded-[28px] border bg-slate-950 p-6 text-white shadow-xl">
                            <h2 className="text-lg font-black">Control Signals</h2>
                            <div className="mt-5 space-y-3">
                                {d.purchase_orders.slice(0, 6).map((po) => (
                                    <div key={po.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <div className="flex justify-between">
                                            <b>{po.number}</b>
                                            <span className="text-xs text-cyan-300">{po.status}</span>
                                        </div>
                                        <div className="mt-2 text-xs text-slate-400">
                                            {po.supplier_name} · {money(Number(po.total_minor || 0))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                )}
                {tab === "suppliers" && (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {d.suppliers.map((s) => (
                            <article key={s.id} className="rounded-[28px] border bg-background/90 p-5 shadow-sm">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="font-black">{s.display_name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {s.code} · {s.criticality}
                                        </div>
                                    </div>
                                    <div className="rounded-xl bg-emerald-500/10 px-3 py-2 font-black text-emerald-600">
                                        {s.score?.composite}%
                                    </div>
                                </div>
                                <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                                    {Object.entries(s.score?.components || {})
                                        .slice(0, 6)
                                        .map(([k, v]) => (
                                            <div key={k} className="rounded-xl bg-muted/60 p-2">
                                                <b className="block">{String(v)}%</b>
                                                <span className="text-[10px] text-muted-foreground">{k}</span>
                                            </div>
                                        ))}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
                {tab === "orders" && (
                    <div className="overflow-hidden rounded-[28px] border bg-background/90 shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-xs">
                                    <tr>
                                        {["PO", "تأمین‌کننده", "وضعیت", "تاریخ انتظار", "مبلغ"].map((x) => (
                                            <th key={x} className="p-4 text-right">
                                                {x}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {d.purchase_orders.map((po) => (
                                        <tr key={po.id} className="border-t">
                                            <td className="p-4 font-bold">{po.number}</td>
                                            <td className="p-4">{po.supplier_name}</td>
                                            <td className="p-4">
                                                <span className="rounded-full bg-blue-500/10 px-2 py-1 text-xs text-blue-600">
                                                    {po.status}
                                                </span>
                                            </td>
                                            <td className="p-4">{po.expected_date || "—"}</td>
                                            <td className="p-4 font-mono">{money(Number(po.total_minor || 0))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                {tab === "recommendations" && (
                    <div className="grid gap-4 lg:grid-cols-2">
                        {recommendations.map((r, i) => (
                            <article key={`${r.id}-${i}`} className="rounded-[28px] border bg-background/90 p-5 shadow-sm">
                                <div className="flex justify-between gap-4">
                                    <div>
                                        <div className="font-black">{r.product_name_snapshot}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {r.supplier_name || "تأمین‌کننده هنوز تخصیص نیافته"}
                                        </div>
                                    </div>
                                    <div className="text-left">
                                        <div className="text-2xl font-black">{r.proposed_quantity}</div>
                                        <div className="text-[10px] text-muted-foreground">Proposed Qty</div>
                                    </div>
                                </div>
                                <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                                    <div className="rounded-xl bg-muted p-3">
                                        <b>{r.supplier_reliability}%</b>
                                        <span className="block text-[10px]">Reliability</span>
                                    </div>
                                    <div className="rounded-xl bg-muted p-3">
                                        <b>{r.expected_arrival_days}d</b>
                                        <span className="block text-[10px]">ETA</span>
                                    </div>
                                    <div className="rounded-xl bg-muted p-3">
                                        <b>{money(r.cash_need_minor)}</b>
                                        <span className="block text-[10px]">Cash Need</span>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}
