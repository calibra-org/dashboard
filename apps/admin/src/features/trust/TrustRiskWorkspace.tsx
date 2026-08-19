"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TrustOverview } from "#/lib/queries/trust-risk";

type Tab = "command" | "cases" | "signals" | "models";
const fmt = (value: number) => new Intl.NumberFormat("fa-IR").format(value ?? 0);
const bandLabel: Record<string, string> = { low: "کم", medium: "متوسط", high: "بالا", critical: "بحرانی" };
const bandTone: Record<string, string> = {
    low: "bg-primary/10 text-primary",
    medium: "bg-accent text-accent-foreground",
    high: "bg-secondary text-secondary-foreground",
    critical: "bg-destructive/10 text-destructive",
};

export function TrustRiskWorkspace({
    initial,
    signals,
    models,
}: {
    initial: TrustOverview;
    signals: Array<any>;
    models: Array<any>;
}) {
    const [tab, setTab] = useState<Tab>("command");
    const data = initial.data;
    const chart = useMemo(
        () =>
            data.recent_scores
                .slice()
                .reverse()
                .map((row, index) => ({
                    index: index + 1,
                    score: Number(row.score),
                    subject: `${row.subject_type}:${row.subject_id}`,
                })),
        [data.recent_scores],
    );
    const champion = models.find((row) => row.deployment_state === "champion");
    const tabs: Array<[Tab, string]> = [
        ["command", "مرکز فرمان"],
        ["cases", "صف بررسی"],
        ["signals", "سیگنال‌ها"],
        ["models", "مدل و سیاست"],
    ];

    return (
        <main
            dir="rtl"
            className="min-h-screen bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_30%),radial-gradient(circle_at_8%_34%,color-mix(in_oklab,var(--chart-2)_12%,transparent),transparent_26%)] p-4 md:p-7"
        >
            <section className="mx-auto max-w-[1680px] space-y-5">
                <header className="relative overflow-hidden rounded-[32px] border border-border/60 bg-foreground p-6 text-background shadow-2xl md:p-8">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_24%),radial-gradient(circle_at_18%_85%,color-mix(in_oklab,var(--accent)_18%,transparent),transparent_25%)]" />
                    <div className="relative flex flex-wrap items-end justify-between gap-6">
                        <div className="max-w-4xl">
                            <p className="text-xs font-semibold tracking-[.24em] text-primary">CALIBRA · PHASE 20</p>
                            <h1 className="mt-2 text-3xl font-black md:text-5xl">Trust, Fraud & Risk Command Center</h1>
                            <p className="mt-4 max-w-3xl text-sm leading-7 text-background/70">
                                تصمیم ریسک قابل‌توضیح، صف بررسی انسانی، کنترل سوءاستفاده و اقدام حساس با احراز هویت تکمیلی؛ بدون
                                امتیاز یا وضعیت ساختگی.
                            </p>
                        </div>
                        <div className="grid min-w-[280px] grid-cols-2 gap-3">
                            <div className="rounded-2xl border border-background/20 bg-background/10 p-4">
                                <div className="text-xs text-background/70">Policy</div>
                                <div className="mt-1 font-black">
                                    {champion?.version ? `Champion ${champion.version}` : "Rule v1"}
                                </div>
                            </div>
                            <div className="rounded-2xl border border-background/20 bg-background/10 p-4">
                                <div className="text-xs text-background/70">Evidence</div>
                                <div className="mt-1 font-black">Redacted</div>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="grid gap-3 md:grid-cols-5">
                    {[
                        ["پرونده باز", data.kpis.open_cases],
                        ["سیگنال ۲۴ ساعت", data.kpis.signals_24h],
                        ["ارزیابی ۳۰ روز", data.kpis.evaluated_30d],
                        ["Challenge", data.kpis.challenged_30d],
                        ["Block", data.kpis.blocked_30d],
                    ].map(([label, value]) => (
                        <article
                            key={String(label)}
                            className="rounded-[26px] border bg-background/90 p-5 shadow-sm backdrop-blur"
                        >
                            <div className="text-xs text-muted-foreground">{label}</div>
                            <div className="mt-2 text-3xl font-black tabular-nums">{fmt(Number(value))}</div>
                        </article>
                    ))}
                </div>

                <nav className="flex gap-2 overflow-auto rounded-2xl border bg-background/80 p-2 backdrop-blur">
                    {tabs.map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === key ? "bg-foreground text-background shadow-lg" : "hover:bg-muted"}`}
                        >
                            {label}
                        </button>
                    ))}
                </nav>

                {tab === "command" ? (
                    <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
                        <section className="rounded-[30px] border bg-background/90 p-6 shadow-sm">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-black">Risk Score Pulse</h2>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        آخرین ارزیابی‌های واقعی؛ بازه امتیاز ۰ تا ۱۰۰۰
                                    </p>
                                </div>
                                <div className="rounded-xl bg-muted px-3 py-2 text-xs">۳۰ نمونه اخیر</div>
                            </div>
                            <div className="mt-6 h-[310px]">
                                {chart.length ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chart}>
                                            <defs>
                                                <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="currentColor" stopOpacity={0.32} />
                                                    <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                            <XAxis dataKey="index" />
                                            <YAxis domain={[0, 1000]} />
                                            <Tooltip />
                                            <Area
                                                type="monotone"
                                                dataKey="score"
                                                stroke="currentColor"
                                                fill="url(#riskFill)"
                                                strokeWidth={3}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="grid h-full place-items-center rounded-2xl border border-dashed text-sm text-muted-foreground">
                                        هنوز ارزیابی ریسک ثبت نشده است.
                                    </div>
                                )}
                            </div>
                        </section>
                        <section className="rounded-[30px] border bg-foreground p-6 text-background shadow-xl">
                            <h2 className="text-lg font-black">Risk Distribution</h2>
                            <p className="mt-1 text-xs text-background/50">توزیع ۳۰ روز اخیر بر اساس band</p>
                            <div className="mt-6 space-y-4">
                                {["critical", "high", "medium", "low"].map((band) => {
                                    const value = Number(data.bands[band] ?? 0);
                                    const total = Math.max(
                                        1,
                                        Object.values(data.bands).reduce((sum, item) => sum + Number(item), 0),
                                    );
                                    return (
                                        <div key={band}>
                                            <div className="mb-1.5 flex justify-between text-xs">
                                                <span>{bandLabel[band]}</span>
                                                <b>{fmt(value)}</b>
                                            </div>
                                            <div className="h-3 overflow-hidden rounded-full bg-background/10">
                                                <div
                                                    className="h-full rounded-full bg-primary"
                                                    style={{
                                                        width: `${Math.max(value ? 4 : 0, Math.round((value / total) * 100))}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-7 rounded-2xl border border-background/15 bg-background/5 p-4 text-xs leading-6 text-background/70">
                                امتیاز بدون reason code معتبر در این Workspace نمایش داده نمی‌شود. Evidence حساس پیش از ذخیره‌سازی
                                redacted می‌شود.
                            </div>
                        </section>
                    </div>
                ) : null}

                {tab === "cases" ? (
                    <section className="overflow-hidden rounded-[30px] border bg-background/90 shadow-sm">
                        <div className="border-b p-5">
                            <h2 className="font-black">Human Review Queue</h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                پرونده‌های واقعی تولیدشده از تصمیم‌های Review / Challenge / Block
                            </p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-xs">
                                    <tr>
                                        {["پرونده", "موضوع", "اولویت", "وضعیت", "خلاصه", "زمان"].map((x) => (
                                            <th key={x} className="p-4 text-start">
                                                {x}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.recent_cases.map((row) => (
                                        <tr key={row.id} className="border-t">
                                            <td className="p-4 font-bold">{row.case_number}</td>
                                            <td className="p-4 font-mono text-xs">
                                                {row.subject_type}:{row.subject_id}
                                            </td>
                                            <td className="p-4">
                                                <span
                                                    className={`rounded-full px-2 py-1 text-xs ${bandTone[row.priority] ?? "bg-muted"}`}
                                                >
                                                    {bandLabel[row.priority] ?? row.priority}
                                                </span>
                                            </td>
                                            <td className="p-4">{row.status}</td>
                                            <td className="max-w-[460px] p-4 text-muted-foreground">{row.summary ?? "—"}</td>
                                            <td className="p-4 text-xs text-muted-foreground">
                                                {new Date(row.opened_at).toLocaleString("fa-IR")}
                                            </td>
                                        </tr>
                                    ))}
                                    {!data.recent_cases.length ? (
                                        <tr>
                                            <td colSpan={6} className="p-10 text-center text-muted-foreground">
                                                صف بررسی خالی است.
                                            </td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </section>
                ) : null}

                {tab === "signals" ? (
                    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {signals.map((signal) => (
                            <article key={signal.id} className="rounded-[26px] border bg-background/90 p-5 shadow-sm">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="font-mono text-sm font-bold">{signal.code}</div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {signal.subject_type}:{signal.subject_id}
                                        </div>
                                    </div>
                                    <span
                                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${bandTone[signal.severity] ?? "bg-muted"}`}
                                    >
                                        {bandLabel[signal.severity] ?? signal.severity}
                                    </span>
                                </div>
                                <div className="mt-5 flex justify-between border-t pt-4 text-xs">
                                    <span className="text-muted-foreground">Value</span>
                                    <b>{signal.value}</b>
                                </div>
                                <div className="mt-2 text-[11px] text-muted-foreground">
                                    {new Date(signal.observed_at).toLocaleString("fa-IR")}
                                </div>
                            </article>
                        ))}
                        {!signals.length ? (
                            <div className="col-span-full rounded-[26px] border border-dashed p-12 text-center text-muted-foreground">
                                سیگنال فعالی ثبت نشده است.
                            </div>
                        ) : null}
                    </section>
                ) : null}

                {tab === "models" ? (
                    <section className="grid gap-4 lg:grid-cols-2">
                        {models.map((model, index) => (
                            <article
                                key={`${model.id}-${model.version_id ?? index}`}
                                className="rounded-[28px] border bg-background/90 p-6 shadow-sm"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <div className="text-lg font-black">{model.model_id}</div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {model.purpose} · {model.owner ?? "owner not configured"}
                                        </div>
                                    </div>
                                    <span
                                        className={`rounded-full px-3 py-1.5 text-xs font-bold ${model.deployment_state === "champion" ? "bg-primary/10 text-primary" : "bg-muted"}`}
                                    >
                                        {model.deployment_state ?? "no version"}
                                    </span>
                                </div>
                                <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
                                    <div className="rounded-2xl bg-muted/60 p-4">
                                        <span className="text-muted-foreground">Version</span>
                                        <b className="mt-1 block">{model.version ?? "—"}</b>
                                    </div>
                                    <div className="rounded-2xl bg-muted/60 p-4">
                                        <span className="text-muted-foreground">Validated</span>
                                        <b className="mt-1 block">{model.validated_at ? "بله" : "خیر"}</b>
                                    </div>
                                </div>
                                {model.known_limitations ? (
                                    <p className="mt-4 rounded-2xl border border-border bg-muted/50 p-4 text-xs leading-6">
                                        {model.known_limitations}
                                    </p>
                                ) : null}
                            </article>
                        ))}
                        {!models.length ? (
                            <div className="col-span-full rounded-[26px] border border-dashed p-12 text-center text-muted-foreground">
                                مدل اختصاصی تنظیم نشده؛ موتور deterministic داخلی Rule v1 فعال است.
                            </div>
                        ) : null}
                    </section>
                ) : null}
            </section>
        </main>
    );
}
