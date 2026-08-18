"use client";

import { useOrderEconomics, useProductEconomics } from "#/lib/queries/economics";

function money(v: unknown, c: string) {
    return new Intl.NumberFormat("fa-IR").format(Number(v ?? 0)) + ` ${c}`;
}
export function EconomicsOrderDrilldown({ orderId }: { orderId: number }) {
    const q = useOrderEconomics(orderId);
    const d = q.data;
    return (
        <div className="mx-auto max-w-6xl space-y-5 p-6" dir="rtl">
            <h1 className="font-black text-3xl">اقتصاد سفارش #{d?.order?.order_number ?? orderId}</h1>
            <div className="rounded-3xl border bg-card p-5">
                <div className="space-y-2">
                    {(d?.ledger ?? []).map((e: any) => (
                        <div key={e.id} className="grid grid-cols-4 gap-3 rounded-xl border p-3 text-sm">
                            <b>{e.entry_kind}</b>
                            <span>{e.quality}</span>
                            <span>{money(e.amount_minor, e.currency)}</span>
                            <span className="truncate text-muted-foreground">
                                {e.source_kind}:{e.source_id}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
export function EconomicsProductDrilldown({ productId }: { productId: number }) {
    const q = useProductEconomics(productId);
    const d = q.data;
    return (
        <div className="mx-auto max-w-6xl space-y-5 p-6" dir="rtl">
            <h1 className="font-black text-3xl">اقتصاد محصول {d?.product?.name ?? `#${productId}`}</h1>
            <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-3xl border bg-card p-5">
                    <h2 className="font-black">Ledger</h2>
                    <div className="mt-3 space-y-2">
                        {(d?.ledger ?? []).slice(0, 50).map((e: any) => (
                            <div key={e.id} className="rounded-xl border p-3 text-sm">
                                <div className="flex justify-between">
                                    <b>{e.entry_kind}</b>
                                    <b>{money(e.amount_minor, e.currency)}</b>
                                </div>
                                <div className="mt-1 text-muted-foreground text-xs">{e.quality}</div>
                            </div>
                        ))}
                    </div>
                </section>
                <section className="rounded-3xl border bg-card p-5">
                    <h2 className="font-black">Cost Layers</h2>
                    <div className="mt-3 space-y-2">
                        {(d?.layers ?? []).map((l: any) => (
                            <div key={l.id} className="rounded-xl border p-3 text-sm">
                                <div className="flex justify-between">
                                    <b>Layer #{l.id}</b>
                                    <span>{l.quantity_initial} واحد</span>
                                </div>
                                <div className="mt-1 text-muted-foreground text-xs">
                                    Landed:{" "}
                                    {l.unit_landed_cost_minor === null ? "نامشخص" : money(l.unit_landed_cost_minor, l.currency)}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
