"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

import type {
    FulfillmentStatus,
    InventoryOperations,
    OrderFulfillment,
    OrderOperations,
    OrderOperationsSummary,
    OrderReturn,
    ReturnStatus,
    ShipmentEvent,
    ShipmentStatus,
    ShippingMethodDefinition,
    ShippingZone,
    ShippingZoneMethod,
    TaxClass,
    TaxRate,
} from "./types";

interface Envelope<T> {
    data: T;
}

const idempotencyKeys = new Map<string, string>();

function stableMutationKey(scope: string, payload: unknown): string {
    const fingerprint = `${scope}:${JSON.stringify(payload)}`;
    const existing = idempotencyKeys.get(fingerprint);
    if (existing) return existing;
    const value = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    idempotencyKeys.set(fingerprint, value);
    while (idempotencyKeys.size > 64) {
        const oldest = idempotencyKeys.keys().next().value as string | undefined;
        if (!oldest) break;
        idempotencyKeys.delete(oldest);
    }
    return value;
}

function releaseMutationKey(scope: string, payload: unknown): void {
    idempotencyKeys.delete(`${scope}:${JSON.stringify(payload)}`);
}

function useOrderOperationsInvalidation(orderId?: number) {
    const client = useQueryClient();
    return async () => {
        await Promise.all([
            orderId ? client.invalidateQueries({ queryKey: ["admin", "order-operations", orderId] }) : Promise.resolve(),
            client.invalidateQueries({ queryKey: ["admin", "order-operations", "summary"] }),
            client.invalidateQueries({ queryKey: ["admin", "orders"] }),
            client.invalidateQueries({ queryKey: ["analytics", "stock"] }),
            client.invalidateQueries({ queryKey: ["admin", "transactions"] }),
        ]);
    };
}

export function useOrderOperations(orderId: number) {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "order-operations", orderId, { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<OrderOperations>>(`orders/${orderId}/operations`, { locale, signal }),
        select: (payload) => payload.data,
        enabled: orderId > 0,
        staleTime: 0,
    });
}

export function useOrderOperationsSummary() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "order-operations", "summary", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<OrderOperationsSummary>>("orders/operations/summary", { locale, signal }),
        select: (payload) => payload.data,
        staleTime: 0,
        refetchInterval: 30_000,
    });
}

export function useCreateFulfillment(orderId: number) {
    const locale = useLocale();
    const invalidate = useOrderOperationsInvalidation(orderId);
    const scope = `fulfillment:${orderId}`;
    return useMutation({
        mutationFn: (body: { items: Array<{ order_line_item_id: number; quantity: number }>; note?: string | null }) =>
            apiMutate<Envelope<OrderFulfillment>>("POST", `orders/${orderId}/fulfillments`, {
                locale,
                body,
                idempotencyKey: stableMutationKey(scope, body),
            }),
        onSuccess: async (_result, body) => {
            releaseMutationKey(scope, body);
            await invalidate();
        },
    });
}

export function useTransitionFulfillment(orderId: number, fulfillmentId: number) {
    const locale = useLocale();
    const invalidate = useOrderOperationsInvalidation(orderId);
    return useMutation({
        mutationFn: (body: { status: FulfillmentStatus; expected_version: number }) =>
            apiMutate<Envelope<OrderFulfillment>>("POST", `fulfillments/${fulfillmentId}/transition`, { locale, body }),
        onSuccess: invalidate,
    });
}

export function useCreateShipment(orderId: number, fulfillmentId: number) {
    const locale = useLocale();
    const invalidate = useOrderOperationsInvalidation(orderId);
    return useMutation({
        mutationFn: (body: { carrier?: string | null; service?: string | null; tracking_number?: string | null; tracking_url?: string | null }) =>
            apiMutate<Envelope<unknown>>("POST", `fulfillments/${fulfillmentId}/shipments`, { locale, body }),
        onSuccess: invalidate,
    });
}

export function useAppendShipmentEvent(orderId: number, shipmentId: number) {
    const locale = useLocale();
    const invalidate = useOrderOperationsInvalidation(orderId);
    return useMutation({
        mutationFn: (body: {
            status: ShipmentStatus;
            expected_version: number;
            occurred_at?: string;
            location?: string | null;
            message?: string | null;
            evidence?: Record<string, unknown>;
        }) => apiMutate<Envelope<ShipmentEvent>>("POST", `shipments/${shipmentId}/events`, { locale, body }),
        onSuccess: invalidate,
    });
}

export function useCreateReturn(orderId: number) {
    const locale = useLocale();
    const invalidate = useOrderOperationsInvalidation(orderId);
    const scope = `return:${orderId}`;
    return useMutation({
        mutationFn: (body: {
            items: Array<{ order_line_item_id: number; quantity: number; reason?: string | null; refund_amount_minor?: number | null }>;
            reason?: string | null;
            customer_note?: string | null;
            internal_note?: string | null;
            carrier?: string | null;
            tracking_number?: string | null;
        }) =>
            apiMutate<Envelope<OrderReturn>>("POST", `orders/${orderId}/returns`, {
                locale,
                body,
                idempotencyKey: stableMutationKey(scope, body),
            }),
        onSuccess: async (_result, body) => {
            releaseMutationKey(scope, body);
            await invalidate();
        },
    });
}

export function useApproveReturn(orderId: number, returnId: number) {
    const locale = useLocale();
    const invalidate = useOrderOperationsInvalidation(orderId);
    return useMutation({
        mutationFn: (body: { expected_version: number; items: Array<{ order_line_item_id: number; approved_quantity: number }> }) =>
            apiMutate<Envelope<OrderReturn>>("POST", `returns/${returnId}/approve`, { locale, body }),
        onSuccess: invalidate,
    });
}

export function useReceiveReturn(orderId: number, returnId: number) {
    const locale = useLocale();
    const invalidate = useOrderOperationsInvalidation(orderId);
    return useMutation({
        mutationFn: (body: {
            expected_version: number;
            items: Array<{
                order_line_item_id: number;
                received_quantity: number;
                damaged_quantity: number;
                restock_quantity: number;
            }>;
        }) => apiMutate<Envelope<OrderReturn>>("POST", `returns/${returnId}/receive`, { locale, body }),
        onSuccess: invalidate,
    });
}

export function useTransitionReturn(orderId: number, returnId: number) {
    const locale = useLocale();
    const invalidate = useOrderOperationsInvalidation(orderId);
    return useMutation({
        mutationFn: (body: { status: ReturnStatus; expected_version: number }) =>
            apiMutate<Envelope<OrderReturn>>("POST", `returns/${returnId}/transition`, { locale, body }),
        onSuccess: invalidate,
    });
}

export function useRefundReturn(orderId: number, returnId: number) {
    const locale = useLocale();
    const invalidate = useOrderOperationsInvalidation(orderId);
    return useMutation({
        mutationFn: (body: { expected_version: number; reason?: string | null }) =>
            apiMutate<Envelope<OrderReturn>>("POST", `returns/${returnId}/refund`, { locale, body }),
        onSuccess: invalidate,
    });
}

export function useShippingZones() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "shipping", "zones", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<ShippingZone[]>>("shipping/zones", { locale, signal }),
        select: (payload) => payload.data,
    });
}

export function useShippingMethodDefinitions() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "shipping", "methods", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<ShippingMethodDefinition[]>>("shipping/methods", { locale, signal }),
        select: (payload) => payload.data,
    });
}

function useShippingInvalidation() {
    const client = useQueryClient();
    return async () => {
        await Promise.all([
            client.invalidateQueries({ queryKey: ["admin", "shipping", "zones"] }),
            client.invalidateQueries({ queryKey: ["admin", "shipping", "methods"] }),
        ]);
    };
}

export function useCreateShippingZone() {
    const locale = useLocale();
    const invalidate = useShippingInvalidation();
    return useMutation({
        mutationFn: (body: { name: string; is_fallback?: boolean; locations?: Array<{ type: "continent" | "country" | "state" | "postcode"; code: string }> }) =>
            apiMutate<Envelope<ShippingZone>>("POST", "shipping/zones", { locale, body }),
        onSuccess: invalidate,
    });
}

export function useUpdateShippingZone(id: number) {
    const locale = useLocale();
    const invalidate = useShippingInvalidation();
    return useMutation({
        mutationFn: (body: { name?: string; is_fallback?: boolean }) =>
            apiMutate<Envelope<ShippingZone>>("PATCH", `shipping/zones/${id}`, { locale, body }),
        onSuccess: invalidate,
    });
}

export function useReplaceShippingZoneLocations(id: number) {
    const locale = useLocale();
    const invalidate = useShippingInvalidation();
    return useMutation({
        mutationFn: (locations: Array<{ type: "continent" | "country" | "state" | "postcode"; code: string }>) =>
            apiMutate<Envelope<ShippingZone>>("PUT", `shipping/zones/${id}/locations`, { locale, body: { locations } }),
        onSuccess: invalidate,
    });
}

export function useDeleteShippingZone() {
    const locale = useLocale();
    const invalidate = useShippingInvalidation();
    return useMutation({
        mutationFn: (id: number) => apiMutate<void>("DELETE", `shipping/zones/${id}`, { locale }),
        onSuccess: invalidate,
    });
}

export function useAddShippingZoneMethod(zoneId: number) {
    const locale = useLocale();
    const invalidate = useShippingInvalidation();
    return useMutation({
        mutationFn: (body: { method_id: number; title_override?: string | null; enabled?: boolean; ordering?: number; settings?: Record<string, unknown> }) =>
            apiMutate<Envelope<ShippingZoneMethod>>("POST", `shipping/zones/${zoneId}/methods`, { locale, body }),
        onSuccess: invalidate,
    });
}

export function useUpdateShippingZoneMethod(zoneId: number, id: number) {
    const locale = useLocale();
    const invalidate = useShippingInvalidation();
    return useMutation({
        mutationFn: (body: { title_override?: string | null; enabled?: boolean; ordering?: number; settings?: Record<string, unknown> }) =>
            apiMutate<Envelope<ShippingZoneMethod>>("PATCH", `shipping/zones/${zoneId}/methods/${id}`, { locale, body }),
        onSuccess: invalidate,
    });
}

export function useDeleteShippingZoneMethod(zoneId: number) {
    const locale = useLocale();
    const invalidate = useShippingInvalidation();
    return useMutation({
        mutationFn: (id: number) => apiMutate<void>("DELETE", `shipping/zones/${zoneId}/methods/${id}`, { locale }),
        onSuccess: invalidate,
    });
}

export function useTaxClasses() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tax", "classes", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<TaxClass[]>>("tax-classes", { locale, query: { limit: 500 }, signal }),
        select: (payload) => payload.data,
    });
}

export function useTaxRates() {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "tax", "rates", { locale }],
        queryFn: ({ signal }) => apiGet<Envelope<TaxRate[]>>("tax/rates", { locale, signal }),
        select: (payload) => payload.data,
    });
}

function useTaxInvalidation() {
    const client = useQueryClient();
    return async () => {
        await Promise.all([
            client.invalidateQueries({ queryKey: ["admin", "tax", "classes"] }),
            client.invalidateQueries({ queryKey: ["admin", "tax", "rates"] }),
            client.invalidateQueries({ queryKey: ["analytics", "taxes"] }),
        ]);
    };
}

export function useCreateTaxClass() {
    const locale = useLocale();
    const invalidate = useTaxInvalidation();
    return useMutation({
        mutationFn: (body: { name: string; slug: string }) => apiMutate<Envelope<TaxClass>>("POST", "tax-classes", { locale, body }),
        onSuccess: invalidate,
    });
}

export function useUpdateTaxClass(id: number) {
    const locale = useLocale();
    const invalidate = useTaxInvalidation();
    return useMutation({
        mutationFn: (body: { name?: string; slug?: string }) =>
            apiMutate<Envelope<TaxClass>>("PATCH", `tax-classes/${id}`, { locale, body }),
        onSuccess: invalidate,
    });
}

export function useDeleteTaxClass() {
    const locale = useLocale();
    const invalidate = useTaxInvalidation();
    return useMutation({
        mutationFn: (id: number) => apiMutate<void>("DELETE", `tax-classes/${id}`, { locale }),
        onSuccess: invalidate,
    });
}

export function useCreateTaxRate() {
    const locale = useLocale();
    const invalidate = useTaxInvalidation();
    return useMutation({
        mutationFn: (body: {
            tax_class_id: number;
            country?: string | null;
            region_id?: number | null;
            postcodes?: string[];
            cities?: string[];
            rate: number;
            label: string;
            priority?: number;
            compound?: boolean;
            applies_to_shipping?: boolean;
            ordering?: number;
        }) => apiMutate<Envelope<TaxRate>>("POST", "tax/rates", { locale, body }),
        onSuccess: invalidate,
    });
}

export function useUpdateTaxRate(id: number) {
    const locale = useLocale();
    const invalidate = useTaxInvalidation();
    return useMutation({
        mutationFn: (body: Partial<Omit<TaxRate, "id" | "tax_class_slug" | "tax_class_name">>) =>
            apiMutate<Envelope<TaxRate>>("PATCH", `tax/rates/${id}`, { locale, body }),
        onSuccess: invalidate,
    });
}

export function useDeleteTaxRate() {
    const locale = useLocale();
    const invalidate = useTaxInvalidation();
    return useMutation({
        mutationFn: (id: number) => apiMutate<void>("DELETE", `tax/rates/${id}`, { locale }),
        onSuccess: invalidate,
    });
}

export function useInventoryOperations(inventoryItemId: number | null) {
    const locale = useLocale();
    return useQuery({
        queryKey: ["admin", "inventory", "movements", inventoryItemId, { locale }],
        queryFn: ({ signal }) =>
            apiGet<Envelope<InventoryOperations>>("inventory/movements", {
                locale,
                query: { inventory_item_id: inventoryItemId, limit: 100 },
                signal,
            }),
        select: (payload) => payload.data,
        enabled: Boolean(inventoryItemId && inventoryItemId > 0),
        staleTime: 0,
    });
}

export function useAdjustInventory() {
    const locale = useLocale();
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: { inventory_item_id: number; quantity_delta: number; reason: string }) =>
            apiMutate<Envelope<InventoryOperations>>("POST", "inventory/adjustments", { locale, body }),
        onSuccess: async (_result, body) => {
            await Promise.all([
                client.invalidateQueries({ queryKey: ["admin", "inventory", "movements", body.inventory_item_id] }),
                client.invalidateQueries({ queryKey: ["analytics", "stock"] }),
            ]);
        },
    });
}
