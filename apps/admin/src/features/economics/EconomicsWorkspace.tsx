"use client";

import { useMemo, useState } from "react";

import { Link } from "#/lib/i18n/navigation";
import {
    useBackfillEconomics,
    useCreateCostLayer,
    useCreateCostPolicy,
    useEconomicsCube,
    useEconomicsOverview,
    useReconcileSettlement,
    useWorkingCapital,
} from "#/lib/queries/economics";

const tabs = ["overview", "cube", "cash", "capital", "costs", "exceptions", "simulator"] as const;
type Tab = (typeof tabs)[number];

function money(value: unknown, currency = "IRR") {
    const n = Number(value ?? 0);
    return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(n) + ` ${currency}`;
}

function Card({
    title,
    value,
    hint,
    tone = "default",
}: {
    title: string;
    value: string;
    hint: string;
    tone?: "default" | "good" | "warn";
}) {
    const bg =
        tone === "good"
            ? "from-success/15 to-success/5"
            : tone === "warn"
              ? "from-warning/15 to-warning/5"
              : "from-info/15 to-primary/5";
    return (
        <div className={`rounded-3xl border border-border/70 bg-gradient-to-br ${bg} p-5 shadow-sm`}>
            <div className="font-semibold text-muted-foreground text-xs">{title}</div>
            <div className="mt-2 font-black text-2xl tracking-tight">{value}</div>
            <div className="mt-2 text-muted-foreground text-xs leading-5">{hint}</div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid gap-1.5 font-semibold text-muted-foreground text-xs">
            <span>{label}</span>
            {children}
        </div>
    );
}
const inputClass =
    "h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring";

export function EconomicsWorkspace() {
    const [tab, setTab] = useState<Tab>("overview");
    const overview = useEconomicsOverview();
    const cube = useEconomicsCube("product");
    const capital = useWorkingCapital();
    const policy = useCreateCostPolicy();
    const layer = useCreateCostLayer();
    const settlement = useReconcileSettlement();
    const backfill = useBackfillEconomics();
    const primary = overview.data?.currencies?.[0];
    const maxAbs = useMemo(
        () => Math.max(1, ...(cube.data ?? []).map((r) => Math.abs(Number(r.contribution_minor ?? 0)))),
        [cube.data],
    );

    return (
        <div className="mx-auto max-w-[1540px] space-y-6 p-4 md:p-7" dir="rtl">
            <section className="overflow-hidden rounded-[32px] border border-border/70 bg-gradient-to-br from-sidebar via-sidebar to-primary p-6 text-white shadow-2xl md:p-8">
                <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
                    <div>
                        <div className="mb-2 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 font-bold text-xs">
                            Phase 12 · Economic Truth OS
                        </div>
                        <h1 className="font-black text-3xl tracking-tight md:text-5xl">سودآوری، نقدینگی و سرمایه در گردش</h1>
                        <p className="mt-3 max-w-3xl text-slate-300 text-sm leading-7">
                            درآمد، COGS، هزینه‌های مشارکتی، بازپرداخت و تسویه را با lineage قابل حسابرسی و وضعیت‌های Estimated /
                            Realized / Forecast / Incomplete جدا ببینید.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => backfill.mutate({ offset: 0, limit: 500 })}
                        disabled={backfill.isPending}
                        className="rounded-2xl bg-white px-5 py-3 font-black text-slate-950 text-sm transition hover:scale-[1.02] disabled:opacity-50"
                    >
                        {backfill.isPending ? "در حال بازسازی…" : "بازسازی projection"}
                    </button>
                </div>
            </section>

            <div className="flex gap-2 overflow-x-auto pb-1">
                {tabs.map((item) => (
                    <button
                        type="button"
                        key={item}
                        onClick={() => setTab(item)}
                        className={`whitespace-nowrap rounded-2xl px-4 py-2.5 font-bold text-sm transition ${tab === item ? "bg-foreground text-background shadow-lg" : "border border-border bg-card hover:bg-muted"}`}
                    >
                        {
                            (
                                {
                                    overview: "نمای کلی",
                                    cube: "Profitability Cube",
                                    cash: "نقد و تسویه",
                                    capital: "سرمایه در گردش",
                                    costs: "حاکمیت هزینه",
                                    exceptions: "نشتی و استثنا",
                                    simulator: "شبیه‌ساز سرمایه",
                                } as const
                            )[item]
                        }
                    </button>
                ))}
            </div>

            {tab === "overview" && (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <Card
                            title="درآمد شناسایی‌شده"
                            value={money(primary?.revenue_minor, primary?.currency)}
                            hint="فقط factهای ثبت‌شده در Economic Ledger"
                        />
                        <Card
                            title="Contribution"
                            value={money(primary?.contribution_minor, primary?.currency)}
                            hint="پس از COGS، refund و هزینه‌های قابل تخصیص"
                            tone={Number(primary?.contribution_minor ?? 0) >= 0 ? "good" : "warn"}
                        />
                        <Card
                            title="COGS و اصلاحات"
                            value={money(primary?.cogs_minor, primary?.currency)}
                            hint="بر مبنای snapshot تاریخی؛ نه cost امروز محصول"
                        />
                        <Card
                            title="داده ناقص"
                            value={String(primary?.incomplete_entries ?? 0)}
                            hint="Unknown cost هرگز به صفر تبدیل نمی‌شود"
                            tone={Number(primary?.incomplete_entries ?? 0) > 0 ? "warn" : "good"}
                        />
                    </div>
                    <section className="grid gap-4 xl:grid-cols-[1.4fr_.6fr]">
                        <div className="rounded-3xl border border-border bg-card p-5">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <h2 className="font-black text-lg">Top economics by product</h2>
                                    <p className="text-muted-foreground text-xs">Drill-down مستقیم تا محصول و ledger</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {(cube.data ?? []).slice(0, 8).map((row) => (
                                    <Link
                                        key={`${row.id}-${row.currency}`}
                                        href={`/economics/products/${row.id}`}
                                        className="grid grid-cols-[minmax(120px,1fr)_2fr_auto] items-center gap-3 rounded-2xl border border-border/60 p-3 hover:bg-muted/50"
                                    >
                                        <div className="truncate font-bold text-sm">{row.label || `#${row.id}`}</div>
                                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-l from-info to-primary"
                                                style={{
                                                    width: `${Math.max(3, (Math.abs(Number(row.contribution_minor)) / maxAbs) * 100)}%`,
                                                }}
                                            />
                                        </div>
                                        <div className="font-black text-xs tabular-nums">
                                            {money(row.contribution_minor, row.currency)}
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-3xl border border-border bg-card p-5">
                            <h2 className="font-black text-lg">Settlement pulse</h2>
                            <div className="mt-4 space-y-3">
                                {(overview.data?.settlements ?? []).map((s) => (
                                    <div key={`${s.currency}-${s.status}`} className="rounded-2xl bg-muted/50 p-4">
                                        <div className="flex justify-between text-xs">
                                            <span className="font-bold">{s.status}</span>
                                            <span>{s.currency}</span>
                                        </div>
                                        <div className="mt-2 font-black text-xl">{money(s.net_minor, s.currency)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                </>
            )}

            {tab === "cube" && (
                <section className="rounded-3xl border border-border bg-card p-5">
                    <h2 className="font-black text-xl">Profitability Cube</h2>
                    <p className="mt-1 text-muted-foreground text-xs">
                        Projection قابل rebuild از ledger؛ رتبه‌بندی محصول بر اساس contribution واقعی/ثبت‌شده.
                    </p>
                    <div className="mt-5 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-right text-muted-foreground text-xs">
                                    <th className="p-3">محصول</th>
                                    <th className="p-3">Contribution</th>
                                    <th className="p-3">Incomplete</th>
                                    <th className="p-3">Drill-down</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(cube.data ?? []).map((row) => (
                                    <tr key={`${row.id}-${row.currency}`} className="border-border/50 border-b">
                                        <td className="p-3 font-bold">{row.label || `#${row.id}`}</td>
                                        <td className="p-3 font-black">{money(row.contribution_minor, row.currency)}</td>
                                        <td className="p-3">{row.incomplete_entries}</td>
                                        <td className="p-3">
                                            <Link className="font-bold text-primary" href={`/economics/products/${row.id}`}>
                                                باز کردن
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {tab === "cash" && (
                <div className="grid gap-4 xl:grid-cols-2">
                    <section className="rounded-3xl border border-border bg-card p-5">
                        <h2 className="font-black text-xl">Cash & Reconciliation</h2>
                        <p className="mt-1 text-muted-foreground text-xs">
                            Payment verified با Cash Available یکی نیست؛ settlement جدا reconcile می‌شود.
                        </p>
                        <div className="mt-4 space-y-3">
                            {(overview.data?.settlements ?? []).map((s) => (
                                <div
                                    key={`${s.currency}-${s.status}`}
                                    className="flex items-center justify-between rounded-2xl border p-4"
                                >
                                    <span className="font-bold">{s.status}</span>
                                    <span className="font-black">{money(s.net_minor, s.currency)}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                    <SettlementForm onSubmit={(body) => settlement.mutate(body)} pending={settlement.isPending} />
                </div>
            )}

            {tab === "capital" && (
                <div className="grid gap-4 md:grid-cols-3">
                    <Card
                        title="Inventory capital"
                        value={money(capital.data?.inventory_capital_minor, capital.data?.currency)}
                        hint="فقط cost layerهای هم‌ارز base currency"
                    />
                    <Card
                        title="Expected cash"
                        value={money(capital.data?.expected_cash_minor, capital.data?.currency)}
                        hint="Forecast + pending settlements"
                        tone="good"
                    />
                    <Card
                        title="Unvalued units"
                        value={String(capital.data?.unvalued_units ?? 0)}
                        hint="واحدهایی که landed cost معتبر ندارند"
                        tone={(capital.data?.unvalued_units ?? 0) > 0 ? "warn" : "good"}
                    />
                </div>
            )}

            {tab === "costs" && (
                <div className="grid gap-4 xl:grid-cols-2">
                    <PolicyForm onSubmit={(body) => policy.mutate(body)} pending={policy.isPending} />
                    <LayerForm onSubmit={(body) => layer.mutate(body)} pending={layer.isPending} />
                </div>
            )}

            {tab === "exceptions" && (
                <section className="rounded-3xl border border-border bg-card p-5">
                    <h2 className="font-black text-xl">Leakage & Exceptions</h2>
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                        <Card
                            title="Incomplete economics"
                            value={String(primary?.incomplete_entries ?? 0)}
                            hint="هزینه نامشخص یا policy ناقص"
                            tone="warn"
                        />
                        <Card
                            title="Refund impact"
                            value={money(primary?.refunds_minor, primary?.currency)}
                            hint="Revenue reversal و COGS recovery جدا"
                        />
                        <Card
                            title="Unvalued inventory"
                            value={String(capital.data?.unvalued_units ?? 0)}
                            hint="برای تکمیل Cost Layers اقدام کنید"
                            tone="warn"
                        />
                    </div>
                </section>
            )}

            {tab === "simulator" && <CapitalSimulator currency={capital.data?.currency ?? primary?.currency ?? "IRR"} />}
        </div>
    );
}

function PolicyForm({ onSubmit, pending }: { onSubmit: (b: Record<string, unknown>) => void; pending: boolean }) {
    const [state, setState] = useState({
        inventory_method: "fifo",
        currency: "IRR",
        effective_from: new Date().toISOString().slice(0, 16),
        packaging_minor: "",
        fulfillment_minor: "",
        payment_fee_bps: "",
        channel_fee_bps: "",
        promotion_minor: "",
        affiliate_minor: "",
    });
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit(
                    Object.fromEntries(
                        Object.entries(state).map(([k, v]) => [
                            k,
                            ["inventory_method", "currency", "effective_from"].includes(k) ? v : v === "" ? null : Number(v),
                        ]),
                    ),
                );
            }}
            className="rounded-3xl border border-border bg-card p-5"
        >
            <h2 className="font-black text-xl">Cost Policy</h2>
            <p className="mt-1 text-muted-foreground text-xs">نسخه جدید بسازید؛ نسخه تاریخی هرگز overwrite نمی‌شود.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Field label="روش موجودی">
                    <select
                        className={inputClass}
                        value={state.inventory_method}
                        onChange={(e) => setState({ ...state, inventory_method: e.target.value })}
                    >
                        <option value="fifo">FIFO</option>
                        <option value="weighted_average">Weighted average</option>
                        <option value="manual">Manual</option>
                    </select>
                </Field>
                <Field label="ارز">
                    <input
                        className={inputClass}
                        value={state.currency}
                        onChange={(e) => setState({ ...state, currency: e.target.value.toUpperCase() })}
                    />
                </Field>
                <Field label="Packaging">
                    <input
                        className={inputClass}
                        inputMode="numeric"
                        value={state.packaging_minor}
                        onChange={(e) => setState({ ...state, packaging_minor: e.target.value })}
                    />
                </Field>
                <Field label="Fulfillment">
                    <input
                        className={inputClass}
                        inputMode="numeric"
                        value={state.fulfillment_minor}
                        onChange={(e) => setState({ ...state, fulfillment_minor: e.target.value })}
                    />
                </Field>
                <Field label="Payment fee (bps)">
                    <input
                        className={inputClass}
                        inputMode="numeric"
                        value={state.payment_fee_bps}
                        onChange={(e) => setState({ ...state, payment_fee_bps: e.target.value })}
                    />
                </Field>
                <Field label="Channel fee (bps)">
                    <input
                        className={inputClass}
                        inputMode="numeric"
                        value={state.channel_fee_bps}
                        onChange={(e) => setState({ ...state, channel_fee_bps: e.target.value })}
                    />
                </Field>
                <Field label="Effective from">
                    <input
                        type="datetime-local"
                        className={inputClass}
                        value={state.effective_from}
                        onChange={(e) => setState({ ...state, effective_from: e.target.value })}
                    />
                </Field>
            </div>
            <button
                type="button"
                disabled={pending}
                className="mt-5 rounded-2xl bg-foreground px-5 py-2.5 font-bold text-background text-sm disabled:opacity-50"
            >
                ثبت نسخه Policy
            </button>
        </form>
    );
}

function LayerForm({ onSubmit, pending }: { onSubmit: (b: Record<string, unknown>) => void; pending: boolean }) {
    const [s, setS] = useState({
        product_id: "",
        variation_id: "",
        quantity: "",
        unit_purchase_cost_minor: "",
        unit_landed_cost_minor: "",
        currency: "IRR",
        source_kind: "manual",
        source_ref: "",
        effective_at: new Date().toISOString().slice(0, 16),
    });
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit({
                    product_id: Number(s.product_id),
                    variation_id: s.variation_id ? Number(s.variation_id) : null,
                    quantity: Number(s.quantity),
                    unit_purchase_cost_minor: s.unit_purchase_cost_minor ? Number(s.unit_purchase_cost_minor) : null,
                    unit_landed_cost_minor: s.unit_landed_cost_minor ? Number(s.unit_landed_cost_minor) : null,
                    currency: s.currency,
                    source_kind: s.source_kind,
                    source_ref: s.source_ref || null,
                    effective_at: s.effective_at,
                });
            }}
            className="rounded-3xl border border-border bg-card p-5"
        >
            <h2 className="font-black text-xl">Cost Layer</h2>
            <p className="mt-1 text-muted-foreground text-xs">Unknown landed cost را خالی بگذارید؛ صفر یعنی هزینه واقعی صفر.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Field label="Product ID">
                    <input
                        className={inputClass}
                        value={s.product_id}
                        onChange={(e) => setS({ ...s, product_id: e.target.value })}
                    />
                </Field>
                <Field label="Variation ID">
                    <input
                        className={inputClass}
                        value={s.variation_id}
                        onChange={(e) => setS({ ...s, variation_id: e.target.value })}
                    />
                </Field>
                <Field label="Quantity">
                    <input className={inputClass} value={s.quantity} onChange={(e) => setS({ ...s, quantity: e.target.value })} />
                </Field>
                <Field label="Purchase cost / unit">
                    <input
                        className={inputClass}
                        value={s.unit_purchase_cost_minor}
                        onChange={(e) => setS({ ...s, unit_purchase_cost_minor: e.target.value })}
                    />
                </Field>
                <Field label="Landed cost / unit">
                    <input
                        className={inputClass}
                        value={s.unit_landed_cost_minor}
                        onChange={(e) => setS({ ...s, unit_landed_cost_minor: e.target.value })}
                    />
                </Field>
                <Field label="Currency">
                    <input
                        className={inputClass}
                        value={s.currency}
                        onChange={(e) => setS({ ...s, currency: e.target.value.toUpperCase() })}
                    />
                </Field>
                <Field label="Effective at">
                    <input
                        type="datetime-local"
                        className={inputClass}
                        value={s.effective_at}
                        onChange={(e) => setS({ ...s, effective_at: e.target.value })}
                    />
                </Field>
            </div>
            <button
                type="button"
                disabled={pending}
                className="mt-5 rounded-2xl bg-foreground px-5 py-2.5 font-bold text-background text-sm disabled:opacity-50"
            >
                ثبت Cost Layer
            </button>
        </form>
    );
}

function SettlementForm({ onSubmit, pending }: { onSubmit: (b: Record<string, unknown>) => void; pending: boolean }) {
    const [s, setS] = useState({
        provider: "",
        settlement_key: "",
        status: "settled",
        currency: "IRR",
        gross_minor: "",
        fee_minor: "0",
        refund_minor: "0",
        expected_at: "",
        settled_at: "",
    });
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit({
                    ...s,
                    gross_minor: Number(s.gross_minor),
                    fee_minor: Number(s.fee_minor),
                    refund_minor: Number(s.refund_minor),
                    expected_at: s.expected_at || null,
                    settled_at: s.settled_at || null,
                    evidence: { source: "admin" },
                });
            }}
            className="rounded-3xl border border-border bg-card p-5"
        >
            <h2 className="font-black text-xl">Reconcile settlement</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Field label="Provider">
                    <input className={inputClass} value={s.provider} onChange={(e) => setS({ ...s, provider: e.target.value })} />
                </Field>
                <Field label="Settlement key">
                    <input
                        className={inputClass}
                        value={s.settlement_key}
                        onChange={(e) => setS({ ...s, settlement_key: e.target.value })}
                    />
                </Field>
                <Field label="Status">
                    <select className={inputClass} value={s.status} onChange={(e) => setS({ ...s, status: e.target.value })}>
                        <option>forecast</option>
                        <option>pending</option>
                        <option>settled</option>
                        <option>reversed</option>
                    </select>
                </Field>
                <Field label="Gross">
                    <input
                        className={inputClass}
                        value={s.gross_minor}
                        onChange={(e) => setS({ ...s, gross_minor: e.target.value })}
                    />
                </Field>
                <Field label="Fee">
                    <input
                        className={inputClass}
                        value={s.fee_minor}
                        onChange={(e) => setS({ ...s, fee_minor: e.target.value })}
                    />
                </Field>
                <Field label="Refund">
                    <input
                        className={inputClass}
                        value={s.refund_minor}
                        onChange={(e) => setS({ ...s, refund_minor: e.target.value })}
                    />
                </Field>
            </div>
            <button
                type="button"
                disabled={pending}
                className="mt-5 rounded-2xl bg-foreground px-5 py-2.5 font-bold text-background text-sm disabled:opacity-50"
            >
                ثبت reconciliation
            </button>
        </form>
    );
}

function CapitalSimulator({ currency }: { currency: string }) {
    const [inventory, setInventory] = useState(1000000);
    const [days, setDays] = useState(30);
    const [margin, setMargin] = useState(20);
    const release = Math.round(inventory * (Math.min(days, 90) / 365));
    const gain = Math.round((release * margin) / 100);
    return (
        <section className="rounded-3xl border border-border bg-card p-5">
            <h2 className="font-black text-xl">Capital Simulator</h2>
            <p className="mt-1 text-muted-foreground text-xs">سناریوی تصمیم‌یار؛ fact مالی یا ledger entry ایجاد نمی‌کند.</p>
            <div className="mt-6 grid gap-5 md:grid-cols-3">
                <Field label="Inventory capital">
                    <input
                        type="range"
                        min="0"
                        max="100000000"
                        step="100000"
                        value={inventory}
                        onChange={(e) => setInventory(Number(e.target.value))}
                    />
                    <b>{money(inventory, currency)}</b>
                </Field>
                <Field label="کاهش DIO (روز)">
                    <input type="range" min="0" max="90" value={days} onChange={(e) => setDays(Number(e.target.value))} />
                    <b>{days} روز</b>
                </Field>
                <Field label="Contribution margin %">
                    <input type="range" min="0" max="80" value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
                    <b>{margin}%</b>
                </Field>
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
                <Card title="سرمایه بالقوه آزادشده" value={money(release, currency)} hint="Scenario only" tone="good" />
                <Card title="ظرفیت contribution تقریبی" value={money(gain, currency)} hint="بر اساس فرض margin واردشده" />
            </div>
        </section>
    );
}
