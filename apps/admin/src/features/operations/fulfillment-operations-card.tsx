"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
    useAppendShipmentEvent,
    useApproveReturn,
    useCreateFulfillment,
    useCreateReturn,
    useCreateShipment,
    useOrderOperations,
    useReceiveReturn,
    useRefundReturn,
    useTransitionFulfillment,
    useTransitionReturn,
} from "#/features/operations/queries";
import type {
    FulfillmentStatus,
    OrderFulfillment,
    OrderOperationsLine,
    OrderReturn,
    OrderShipment,
    ShipmentStatus,
} from "#/features/operations/types";

const SHIPMENT_NEXT: Record<ShipmentStatus, ShipmentStatus[]> = {
    label_created: ["in_transit", "exception", "returned"],
    in_transit: ["out_for_delivery", "delivered", "exception", "returned"],
    out_for_delivery: ["delivered", "exception", "returned"],
    exception: ["in_transit", "out_for_delivery", "delivered", "returned"],
    delivered: [],
    returned: [],
};

function toneForStatus(value: string): "neutral" | "success" | "warning" | "danger" | "info" {
    if (["delivered", "completed"].includes(value)) return "success";
    if (value === "exception") return "danger";
    if (["pending", "requested", "returned"].includes(value)) return "warning";
    if (["packed", "shipped", "approved", "received", "in_transit", "out_for_delivery"].includes(value)) return "info";
    return "neutral";
}

function OperationStatus({ value }: { value: string }) {
    const t = useTranslations("OrderOperations");
    const key = value === "received" ? "status.received_return" : `status.${value}`;
    return <StatusBadge tone={toneForStatus(value)}>{t(key as never)}</StatusBadge>;
}

function MutationError({ visible }: { visible: boolean }) {
    const t = useTranslations("OrderOperations");
    return visible ? <p className="text-destructive text-xs">{t("loadError")}</p> : null;
}

function ShipmentPanel({ orderId, shipment }: { orderId: number; shipment: OrderShipment }) {
    const t = useTranslations("OrderOperations");
    const append = useAppendShipmentEvent(orderId, shipment.id);
    const nextStatuses = SHIPMENT_NEXT[shipment.status];
    const [status, setStatus] = useState<ShipmentStatus>(nextStatuses[0] ?? shipment.status);
    const [location, setLocation] = useState("");
    const [message, setMessage] = useState("");

    useEffect(() => {
        setStatus(SHIPMENT_NEXT[shipment.status][0] ?? shipment.status);
    }, [shipment.status]);

    return (
        <div className="grid gap-3 rounded-lg border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="font-medium text-sm">{t("shipment", { id: shipment.id })}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                        <OperationStatus value={shipment.status} />
                        {shipment.carrier ? <span>{shipment.carrier}</span> : null}
                        {shipment.tracking_number ? (
                            <span dir="ltr" className="font-mono">
                                {shipment.tracking_number}
                            </span>
                        ) : null}
                    </div>
                </div>
                {shipment.tracking_url ? (
                    <a
                        href={shipment.tracking_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary text-xs hover:underline"
                    >
                        {t("trackingUrl")}
                    </a>
                ) : null}
            </div>
            {nextStatuses.length > 0 ? (
                <div className="grid gap-2 lg:grid-cols-[170px_1fr_1fr_auto] lg:items-end">
                    <label className="grid gap-1 text-xs font-medium">
                        <span>{t("statusLabel")}</span>
                        <select
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                            value={status}
                            onChange={(event) => setStatus(event.target.value as ShipmentStatus)}
                        >
                            {nextStatuses.map((value) => (
                                <option key={value} value={value}>
                                    {t(`status.${value}` as never)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="grid gap-1 text-xs font-medium">
                        <span>{t("eventLocation")}</span>
                        <Input value={location} onChange={(event) => setLocation(event.target.value)} />
                    </label>
                    <label className="grid gap-1 text-xs font-medium">
                        <span>{t("eventMessage")}</span>
                        <Input value={message} onChange={(event) => setMessage(event.target.value)} />
                    </label>
                    <Button
                        type="button"
                        size="sm"
                        disabled={append.isPending}
                        onClick={() =>
                            append.mutate(
                                {
                                    status,
                                    expected_version: shipment.version,
                                    location: location.trim() || null,
                                    message: message.trim() || null,
                                },
                                {
                                    onSuccess: () => {
                                        setLocation("");
                                        setMessage("");
                                    },
                                },
                            )
                        }
                    >
                        {append.isPending ? t("saving") : t("addTrackingEvent")}
                    </Button>
                </div>
            ) : null}
            <MutationError visible={append.isError} />
            {shipment.events.length > 0 ? (
                <div className="grid gap-2 border-s ps-3">
                    {shipment.events
                        .slice()
                        .reverse()
                        .map((event) => (
                            <div key={event.id} className="grid gap-0.5 text-xs">
                                <div className="flex flex-wrap items-center gap-2">
                                    <OperationStatus value={event.status} />
                                    <span className="text-muted-foreground" dir="ltr">
                                        {event.occurred_at}
                                    </span>
                                </div>
                                {event.location || event.message ? (
                                    <span className="text-muted-foreground">
                                        {[event.location, event.message].filter(Boolean).join(" · ")}
                                    </span>
                                ) : null}
                            </div>
                        ))}
                </div>
            ) : null}
        </div>
    );
}

function ShipmentCreator({ orderId, fulfillmentId }: { orderId: number; fulfillmentId: number }) {
    const t = useTranslations("OrderOperations");
    const create = useCreateShipment(orderId, fulfillmentId);
    const [carrier, setCarrier] = useState("");
    const [service, setService] = useState("");
    const [trackingNumber, setTrackingNumber] = useState("");
    const [trackingUrl, setTrackingUrl] = useState("");
    return (
        <div className="grid gap-2 rounded-lg border border-dashed p-3 md:grid-cols-2 xl:grid-cols-4">
            <Input value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder={t("carrier")} />
            <Input value={service} onChange={(event) => setService(event.target.value)} placeholder={t("service")} />
            <Input
                value={trackingNumber}
                onChange={(event) => setTrackingNumber(event.target.value)}
                placeholder={t("trackingNumber")}
                dir="ltr"
            />
            <Input
                value={trackingUrl}
                onChange={(event) => setTrackingUrl(event.target.value)}
                placeholder={t("trackingUrl")}
                dir="ltr"
            />
            <div className="flex justify-end md:col-span-2 xl:col-span-4">
                <Button
                    type="button"
                    size="sm"
                    disabled={create.isPending}
                    onClick={() =>
                        create.mutate(
                            {
                                carrier: carrier.trim() || null,
                                service: service.trim() || null,
                                tracking_number: trackingNumber.trim() || null,
                                tracking_url: trackingUrl.trim() || null,
                            },
                            {
                                onSuccess: () => {
                                    setCarrier("");
                                    setService("");
                                    setTrackingNumber("");
                                    setTrackingUrl("");
                                },
                            },
                        )
                    }
                >
                    {create.isPending ? t("saving") : t("addShipment")}
                </Button>
            </div>
            <MutationError visible={create.isError} />
        </div>
    );
}

function FulfillmentPanel({
    orderId,
    fulfillment,
    lines,
}: {
    orderId: number;
    fulfillment: OrderFulfillment;
    lines: OrderOperationsLine[];
}) {
    const t = useTranslations("OrderOperations");
    const transition = useTransitionFulfillment(orderId, fulfillment.id);
    const lineName = (id: number) => lines.find((line) => line.id === id)?.name ?? `#${id}`;
    const run = (status: FulfillmentStatus) => transition.mutate({ status, expected_version: fulfillment.version });
    return (
        <div className="grid gap-3 rounded-xl border bg-muted/15 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="font-semibold text-sm">{t("fulfillment", { id: fulfillment.id })}</div>
                    <div className="mt-1">
                        <OperationStatus value={fulfillment.status} />
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {fulfillment.status === "pending" ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={transition.isPending}
                            onClick={() => run("packed")}
                        >
                            {t("markPacked")}
                        </Button>
                    ) : null}
                    {fulfillment.status === "packed" ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={transition.isPending || fulfillment.shipments.length === 0}
                            onClick={() => run("shipped")}
                        >
                            {t("markShipped")}
                        </Button>
                    ) : null}
                    {fulfillment.status === "shipped" ? (
                        <Button
                            type="button"
                            size="sm"
                            disabled={
                                transition.isPending ||
                                fulfillment.shipments.length === 0 ||
                                fulfillment.shipments.some((shipment) => shipment.status !== "delivered")
                            }
                            onClick={() => run("delivered")}
                        >
                            {t("markDelivered")}
                        </Button>
                    ) : null}
                    {["pending", "packed"].includes(fulfillment.status) ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={transition.isPending}
                            onClick={() => run("cancelled")}
                        >
                            {t("cancelFulfillment")}
                        </Button>
                    ) : null}
                </div>
            </div>
            <MutationError visible={transition.isError} />
            <div className="grid gap-1">
                {fulfillment.items.map((item) => (
                    <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-md bg-background px-3 py-2 text-sm"
                    >
                        <span className="truncate">{lineName(item.order_line_item_id)}</span>
                        <span className="font-mono text-xs">× {item.quantity}</span>
                    </div>
                ))}
            </div>
            {!(["cancelled", "delivered"] as string[]).includes(fulfillment.status) ? (
                <ShipmentCreator orderId={orderId} fulfillmentId={fulfillment.id} />
            ) : null}
            <div className="grid gap-2">
                {fulfillment.shipments.map((shipment) => (
                    <ShipmentPanel key={shipment.id} orderId={orderId} shipment={shipment} />
                ))}
            </div>
        </div>
    );
}

function ReturnPanel({ orderId, item, lines }: { orderId: number; item: OrderReturn; lines: OrderOperationsLine[] }) {
    const t = useTranslations("OrderOperations");
    const approve = useApproveReturn(orderId, item.id);
    const receive = useReceiveReturn(orderId, item.id);
    const transition = useTransitionReturn(orderId, item.id);
    const refund = useRefundReturn(orderId, item.id);
    const [inspection, setInspection] = useState<Record<number, { damaged: number; restock: number }>>(() =>
        Object.fromEntries(
            item.items.map((line) => [
                line.order_line_item_id,
                {
                    damaged: line.damaged_quantity,
                    restock: line.restock_quantity || line.approved_quantity || line.requested_quantity,
                },
            ]),
        ),
    );
    const lineName = (id: number) => lines.find((line) => line.id === id)?.name ?? `#${id}`;
    return (
        <div className="grid gap-3 rounded-xl border bg-muted/15 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="font-semibold text-sm">{t("return", { id: item.id })}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                        <OperationStatus value={item.status} />
                        {item.refund_id ? (
                            <span className="font-mono text-muted-foreground text-xs">refund:{item.refund_id}</span>
                        ) : null}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {item.status === "requested" ? (
                        <Button
                            type="button"
                            size="sm"
                            disabled={approve.isPending}
                            onClick={() =>
                                approve.mutate({
                                    expected_version: item.version,
                                    items: item.items.map((line) => ({
                                        order_line_item_id: line.order_line_item_id,
                                        approved_quantity: line.requested_quantity,
                                    })),
                                })
                            }
                        >
                            {t("approveReturn")}
                        </Button>
                    ) : null}
                    {["requested", "approved", "in_transit"].includes(item.status) ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={transition.isPending}
                            onClick={() => transition.mutate({ status: "cancelled", expected_version: item.version })}
                        >
                            {t("cancelReturn")}
                        </Button>
                    ) : null}
                    {item.status === "received" && !item.refund_id ? (
                        <Button
                            type="button"
                            size="sm"
                            disabled={refund.isPending}
                            onClick={() => refund.mutate({ expected_version: item.version, reason: item.reason })}
                        >
                            {t("refundReturn")}
                        </Button>
                    ) : null}
                </div>
            </div>
            {item.reason ? <p className="text-muted-foreground text-xs">{item.reason}</p> : null}
            <MutationError visible={approve.isError || receive.isError || transition.isError || refund.isError} />
            <div className="grid gap-2">
                {item.items.map((line) => {
                    const state = inspection[line.order_line_item_id] ?? { damaged: 0, restock: line.approved_quantity };
                    const editable = ["approved", "in_transit"].includes(item.status);
                    return (
                        <div
                            key={line.id}
                            className="grid gap-2 rounded-md bg-background p-3 md:grid-cols-[minmax(0,1fr)_100px_100px] md:items-end"
                        >
                            <div>
                                <div className="text-sm">{lineName(line.order_line_item_id)}</div>
                                <div className="text-muted-foreground text-xs">
                                    {t("ordered")}: {line.requested_quantity} · {t("received")}: {line.received_quantity}
                                </div>
                            </div>
                            {editable ? (
                                <>
                                    <label className="grid gap-1 text-xs">
                                        <span>{t("damaged")}</span>
                                        <Input
                                            inputMode="numeric"
                                            value={String(state.damaged)}
                                            onChange={(event) => {
                                                const damaged = Math.max(
                                                    0,
                                                    Math.min(line.approved_quantity, Number(event.target.value) || 0),
                                                );
                                                setInspection((old) => ({
                                                    ...old,
                                                    [line.order_line_item_id]: {
                                                        damaged,
                                                        restock: Math.min(
                                                            old[line.order_line_item_id]?.restock ?? line.approved_quantity,
                                                            line.approved_quantity - damaged,
                                                        ),
                                                    },
                                                }));
                                            }}
                                        />
                                    </label>
                                    <label className="grid gap-1 text-xs">
                                        <span>{t("restock")}</span>
                                        <Input
                                            inputMode="numeric"
                                            value={String(state.restock)}
                                            onChange={(event) =>
                                                setInspection((old) => ({
                                                    ...old,
                                                    [line.order_line_item_id]: {
                                                        ...state,
                                                        restock: Math.max(
                                                            0,
                                                            Math.min(
                                                                line.approved_quantity - state.damaged,
                                                                Number(event.target.value) || 0,
                                                            ),
                                                        ),
                                                    },
                                                }))
                                            }
                                        />
                                    </label>
                                </>
                            ) : (
                                <div className="md:col-span-2 text-end text-muted-foreground text-xs">
                                    {t("damaged")}: {line.damaged_quantity} · {t("restock")}: {line.restock_quantity}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {["approved", "in_transit"].includes(item.status) ? (
                <div className="flex justify-end">
                    <Button
                        type="button"
                        size="sm"
                        disabled={receive.isPending}
                        onClick={() =>
                            receive.mutate({
                                expected_version: item.version,
                                items: item.items.map((line) => {
                                    const state = inspection[line.order_line_item_id] ?? {
                                        damaged: 0,
                                        restock: line.approved_quantity,
                                    };
                                    return {
                                        order_line_item_id: line.order_line_item_id,
                                        received_quantity: line.approved_quantity,
                                        damaged_quantity: state.damaged,
                                        restock_quantity: Math.min(
                                            state.restock,
                                            Math.max(0, line.approved_quantity - state.damaged),
                                        ),
                                    };
                                }),
                            })
                        }
                    >
                        {receive.isPending ? t("saving") : t("receiveReturn")}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

function ReturnCreator({ orderId, lines }: { orderId: number; lines: OrderOperationsLine[] }) {
    const t = useTranslations("OrderOperations");
    const create = useCreateReturn(orderId);
    const [reason, setReason] = useState("");
    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const returnableLines = lines.filter((line) => line.returnable_quantity > 0);
    const requestedItems = returnableLines
        .filter((line) => (quantities[line.id] ?? 0) > 0)
        .map((line) => ({
            order_line_item_id: line.id,
            quantity: Math.min(line.returnable_quantity, quantities[line.id] ?? 0),
        }));

    if (returnableLines.length === 0) {
        return <p className="rounded-xl border border-dashed p-4 text-muted-foreground text-sm">{t("noReturnable")}</p>;
    }

    return (
        <div className="grid gap-3 rounded-xl border border-dashed p-4">
            <div className="font-medium text-sm">{t("createReturn")}</div>
            <div className="grid gap-2 sm:grid-cols-2">
                {returnableLines.map((line) => (
                    <label
                        key={line.id}
                        className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm"
                    >
                        <span className="min-w-0">
                            <span className="block truncate">{line.name}</span>
                            <span className="text-muted-foreground text-xs">
                                {t("returnable")}: {line.returnable_quantity}
                            </span>
                        </span>
                        <Input
                            inputMode="numeric"
                            value={String(quantities[line.id] ?? 0)}
                            onChange={(event) =>
                                setQuantities((old) => ({
                                    ...old,
                                    [line.id]: Math.max(0, Math.min(line.returnable_quantity, Number(event.target.value) || 0)),
                                }))
                            }
                            dir="ltr"
                        />
                    </label>
                ))}
            </div>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("reason")} />
            <MutationError visible={create.isError} />
            <div className="flex justify-end">
                <Button
                    type="button"
                    size="sm"
                    disabled={create.isPending || requestedItems.length === 0}
                    onClick={() =>
                        create.mutate(
                            { items: requestedItems, reason: reason.trim() || null },
                            {
                                onSuccess: () => {
                                    setQuantities({});
                                    setReason("");
                                },
                            },
                        )
                    }
                >
                    {create.isPending ? t("saving") : t("createReturn")}
                </Button>
            </div>
        </div>
    );
}

export function FulfillmentOperationsCard({ orderId }: { orderId: number }) {
    const t = useTranslations("OrderOperations");
    const operations = useOrderOperations(orderId);
    const create = useCreateFulfillment(orderId);
    const [note, setNote] = useState("");
    const remainingItems = useMemo(
        () =>
            (operations.data?.lines ?? [])
                .filter((line) => line.remaining_quantity > 0)
                .map((line) => ({ order_line_item_id: line.id, quantity: line.remaining_quantity })),
        [operations.data?.lines],
    );
    if (operations.isPending) return <p className="text-muted-foreground text-sm">{t("loading")}</p>;
    if (operations.isError || !operations.data) {
        return (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <span>{t("loadError")}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => void operations.refetch()}>
                    {t("retry")}
                </Button>
            </div>
        );
    }
    return (
        <div className="grid gap-5" data-detail-action="fulfillment">
            <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {operations.data.lines.map((line) => (
                    <div key={line.id} className="rounded-lg border bg-background p-3">
                        <div className="truncate font-medium text-sm">{line.name}</div>
                        <div className="mt-1 flex flex-wrap gap-3 text-muted-foreground text-xs">
                            <span>
                                {t("ordered")}: {line.quantity}
                            </span>
                            <span>
                                {t("fulfilled")}: {line.fulfilled_quantity}
                            </span>
                            <span>
                                {t("deliveredQuantity")}: {line.delivered_quantity}
                            </span>
                            <span>
                                {t("returnable")}: {line.returnable_quantity}
                            </span>
                            <span className={line.remaining_quantity > 0 ? "font-medium text-foreground" : ""}>
                                {t("remaining")}: {line.remaining_quantity}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
            {operations.data.order_status === "processing" ? (
                <div className="grid gap-2 rounded-xl border border-dashed p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label className="grid gap-1 text-xs font-medium">
                        <span>{t("createFulfillment")}</span>
                        <Input
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder={t("notePlaceholder")}
                        />
                    </label>
                    <Button
                        type="button"
                        disabled={create.isPending || remainingItems.length === 0}
                        onClick={() =>
                            create.mutate({ items: remainingItems, note: note.trim() || null }, { onSuccess: () => setNote("") })
                        }
                    >
                        {create.isPending ? t("saving") : remainingItems.length === 0 ? t("noRemaining") : t("createRemaining")}
                    </Button>
                    <MutationError visible={create.isError} />
                </div>
            ) : null}
            <div className="grid gap-3">
                <h3 className="font-semibold text-sm">{t("fulfillments")}</h3>
                {operations.data.fulfillments.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t("noFulfillments")}</p>
                ) : null}
                {operations.data.fulfillments.map((fulfillment) => (
                    <FulfillmentPanel
                        key={fulfillment.id}
                        orderId={orderId}
                        fulfillment={fulfillment}
                        lines={operations.data.lines}
                    />
                ))}
            </div>
            <div className="grid gap-3">
                <h3 className="font-semibold text-sm">{t("returns")}</h3>
                {operations.data.returns.length === 0 ? <p className="text-muted-foreground text-sm">{t("noReturns")}</p> : null}
                {operations.data.returns.map((item) => (
                    <ReturnPanel key={item.id} orderId={orderId} item={item} lines={operations.data.lines} />
                ))}
                <ReturnCreator orderId={orderId} lines={operations.data.lines} />
            </div>
        </div>
    );
}
