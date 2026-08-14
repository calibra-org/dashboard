"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { useAdjustInventory, useInventoryOperations } from "#/features/operations/queries";
import { formatDateTime, formatNumber } from "#/lib/format";

export function InventoryOperationsPanel({ inventoryItemId, locale, onClose }: { inventoryItemId: number; locale: Locale; onClose: () => void }) {
    const t = useTranslations("InventoryOperations");
    const operations = useInventoryOperations(inventoryItemId);
    const adjust = useAdjustInventory();
    const [delta, setDelta] = useState("");
    const [reason, setReason] = useState("");
    const parsedDelta = Number(delta);
    const canAdjust = Number.isInteger(parsedDelta) && parsedDelta !== 0 && reason.trim().length >= 3;

    return (
        <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle className="text-base">{t("title")}</CardTitle>
                    <p className="mt-1 text-muted-foreground text-xs">{t("subtitle")}</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={onClose}>{t("closeLedger")}</Button>
            </CardHeader>
            <CardContent className="grid gap-5">
                {operations.isError ? (
                    <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                        <span>{t("loadError")}</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => void operations.refetch()}>{t("retry")}</Button>
                    </div>
                ) : null}
                {operations.data ? (
                    <>
                        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-3">
                            <span className="text-muted-foreground text-xs">{t("currentStock")}</span>
                            <span className="font-semibold text-lg">{formatNumber(operations.data.item.stock_quantity, locale)}</span>
                            <StatusBadge tone={operations.data.item.stock_status === "instock" ? "success" : operations.data.item.stock_status === "onbackorder" ? "warning" : "danger"}>
                                {operations.data.item.stock_status}
                            </StatusBadge>
                            <span className="ms-auto font-mono text-muted-foreground text-xs">inventory #{operations.data.item.id}</span>
                        </div>
                        <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-[160px_minmax(0,1fr)_auto] md:items-end">
                            <label className="grid gap-1.5 text-xs font-medium">
                                <span>{t("adjustmentDelta")}</span>
                                <Input value={delta} onChange={(event) => setDelta(event.target.value)} inputMode="numeric" dir="ltr" placeholder="+5 / -2" />
                            </label>
                            <label className="grid gap-1.5 text-xs font-medium">
                                <span>{t("adjustmentReason")}</span>
                                <Input value={reason} onChange={(event) => setReason(event.target.value)} />
                            </label>
                            <Button
                                type="button"
                                disabled={!canAdjust || adjust.isPending}
                                onClick={() => adjust.mutate({ inventory_item_id: inventoryItemId, quantity_delta: parsedDelta, reason: reason.trim() }, { onSuccess: () => { setDelta(""); setReason(""); } })}
                            >
                                {adjust.isPending ? t("saving") : t("applyAdjustment")}
                            </Button>
                        </div>
                        {adjust.isError ? <p className="text-destructive text-xs">{t("loadError")}</p> : null}
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full min-w-[680px] text-sm">
                                <thead className="bg-muted/50 text-muted-foreground text-xs">
                                    <tr>
                                        <th className="px-3 py-2 text-start font-medium">{t("movement")}</th>
                                        <th className="px-3 py-2 text-end font-medium">{t("delta")}</th>
                                        <th className="px-3 py-2 text-start font-medium">{t("reference")}</th>
                                        <th className="px-3 py-2 text-start font-medium">{t("notes")}</th>
                                        <th className="px-3 py-2 text-end font-medium">{t("occurredAt")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {operations.data.movements.map((movement) => (
                                        <tr key={movement.id}>
                                            <td className="px-3 py-2">{t(`movementKinds.${movement.kind}` as never)}</td>
                                            <td className="px-3 py-2 text-end font-mono" dir="ltr">
                                                {movement.quantity_delta > 0 ? "+" : ""}{formatNumber(movement.quantity_delta, locale)}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-muted-foreground text-xs">
                                                {movement.ref_kind ? `${movement.ref_kind}:${movement.ref_id ?? "—"}` : "—"}
                                            </td>
                                            <td className="max-w-xs truncate px-3 py-2 text-muted-foreground">{movement.notes || "—"}</td>
                                            <td className="px-3 py-2 text-end text-muted-foreground text-xs">{formatDateTime(movement.occurred_at, locale)}</td>
                                        </tr>
                                    ))}
                                    {operations.data.movements.length === 0 ? (
                                        <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">{t("noMovements")}</td></tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : operations.isPending ? <p className="text-muted-foreground text-sm">{t("loading")}</p> : null}
            </CardContent>
        </Card>
    );
}
