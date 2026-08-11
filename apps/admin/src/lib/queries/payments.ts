"use client";

import type { AdminSchemas } from "@calibra/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { apiGet, apiMutate } from "#/lib/queries/api-client";

export type PaymentGatewayImplementationStatus = "stub" | "implemented" | "live";
export type PaymentGatewayHealthStatus = "unconfigured" | "configured" | "healthy" | "error";
export type PaymentGatewayCategory = "bank" | "psp" | "bnpl" | "offline" | "legacy";

export interface PaymentGatewayCredentialField {
    key: string;
    required: boolean;
}

export interface LocalizedGatewayCopy {
    fa: string;
    en: string;
}

export interface AdminPaymentGateway {
    id: number;
    code: string;
    title: LocalizedGatewayCopy;
    description: LocalizedGatewayCopy;
    enabled: boolean;
    ordering: number;
    supportsRefunds: boolean;
    implementationStatus: PaymentGatewayImplementationStatus;
    category: PaymentGatewayCategory;
    adminVisible: boolean;
    credentialFields: PaymentGatewayCredentialField[];
    healthStatus: PaymentGatewayHealthStatus;
    lastVerifiedAt: string | null;
    lastError: string | null;
    settings: Record<string, string>;
}

type SdkAdminPaymentGateway = AdminSchemas["schemas"]["AdminPaymentGateway"];
type ExtendedWireGateway = SdkAdminPaymentGateway & {
    category?: PaymentGatewayCategory;
    admin_visible?: boolean;
    credential_fields?: PaymentGatewayCredentialField[];
    health_status?: PaymentGatewayHealthStatus;
    last_verified_at?: string | null;
    last_error?: string | null;
};

const GATEWAY_COPY: Record<string, { title: LocalizedGatewayCopy; description: LocalizedGatewayCopy }> = {
    mellat: {
        title: { fa: "به‌پرداخت ملت", en: "Behpardakht Mellat" },
        description: { fa: "درگاه مستقیم بانک ملت", en: "Direct Mellat Bank internet payment gateway" },
    },
    sadad: {
        title: { fa: "سداد بانک ملی", en: "Sadad – Bank Melli" },
        description: { fa: "درگاه مستقیم بانک ملی ایران", en: "Direct Bank Melli payment gateway" },
    },
    parsian: {
        title: { fa: "تجارت الکترونیک پارسیان", en: "Parsian E-Commerce" },
        description: { fa: "درگاه مستقیم بانک پارسیان", en: "Direct Parsian Bank payment gateway" },
    },
    zarinpal: {
        title: { fa: "زرین‌پال", en: "ZarinPal" },
        description: { fa: "پرداخت اینترنتی از طریق زرین‌پال", en: "Online payments through ZarinPal" },
    },
    bitpay: {
        title: { fa: "بیت‌پی", en: "BitPay Iran" },
        description: { fa: "پرداخت اینترنتی بیت‌پی", en: "BitPay Iran online payments" },
    },
    digipay: {
        title: { fa: "دیجی‌پی", en: "DigiPay" },
        description: { fa: "پرداخت و اعتبار دیجی‌پی", en: "DigiPay payment and credit" },
    },
    snapppay: {
        title: { fa: "اسنپ‌پی", en: "SnappPay" },
        description: { fa: "پرداخت اعتباری اسنپ‌پی", en: "SnappPay credit payment" },
    },
    azkivam: {
        title: { fa: "ازکی‌وام", en: "AzkiVam" },
        description: { fa: "خرید اعتباری ازکی‌وام", en: "AzkiVam installment payments" },
    },
    card_to_card: {
        title: { fa: "کارت به کارت", en: "Card to Card" },
        description: { fa: "نمایش اطلاعات کارت برای پرداخت دستی", en: "Manual card-to-card payment instructions" },
    },
    cod: {
        title: { fa: "پرداخت در محل", en: "Cash on Delivery" },
        description: { fa: "تسویه هنگام تحویل سفارش", en: "Collect payment when the order is delivered" },
    },
};

function copyFor(code: string) {
    return (
        GATEWAY_COPY[code] ?? {
            title: { fa: code, en: code },
            description: { fa: "", en: "" },
        }
    );
}

export function toAdminPaymentGateway(input: SdkAdminPaymentGateway): AdminPaymentGateway {
    const g = input as ExtendedWireGateway;
    const settings: Record<string, string> = {};
    for (const [key, value] of Object.entries(g.settings ?? {})) settings[key] = value == null ? "" : String(value);
    const copy = copyFor(g.code);
    return {
        id: g.id,
        code: g.code,
        title: copy.title,
        description: copy.description,
        enabled: Boolean(g.enabled),
        ordering: g.ordering ?? 0,
        supportsRefunds: Boolean((g.supports as Record<string, unknown>)?.refunds ?? false),
        implementationStatus:
            g.implementation_status === "live" || g.implementation_status === "implemented" ? g.implementation_status : "stub",
        category: g.category ?? "legacy",
        adminVisible: g.admin_visible !== false,
        credentialFields: Array.isArray(g.credential_fields) ? g.credential_fields : [],
        healthStatus: g.health_status ?? "unconfigured",
        lastVerifiedAt: g.last_verified_at ?? null,
        lastError: g.last_error ?? null,
        settings,
    };
}

interface PaymentGatewaysEnvelope {
    data: SdkAdminPaymentGateway[];
}

interface PaymentGatewayEnvelope {
    data: SdkAdminPaymentGateway;
}

const LIST_KEY = (locale: string) => ["admin", "payment-gateways", "list", { locale }] as const;

export function usePaymentGateways() {
    const locale = useLocale();
    return useQuery({
        queryKey: LIST_KEY(locale),
        queryFn: ({ signal }) => apiGet<PaymentGatewaysEnvelope>("payment-gateways", { locale, signal }),
        select: (res): AdminPaymentGateway[] =>
            (res.data ?? [])
                .map(toAdminPaymentGateway)
                .filter((gateway) => gateway.adminVisible)
                .sort((a, b) => a.ordering - b.ordering),
        staleTime: 60_000,
    });
}

export interface UpdatePaymentGatewayInput {
    id: number;
    enabled?: boolean;
    ordering?: number;
    settings?: Record<string, unknown>;
}

export function useUpdatePaymentGateway() {
    const locale = useLocale();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...body }: UpdatePaymentGatewayInput) =>
            apiMutate<PaymentGatewayEnvelope>("PATCH", `payment-gateways/${id}`, { locale, body }),
        onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY(locale) }),
    });
}

export function useVerifyPaymentGateway() {
    const locale = useLocale();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => apiMutate<PaymentGatewayEnvelope>("POST", `payment-gateways/${id}/verify`, { locale, body: {} }),
        onSettled: () => qc.invalidateQueries({ queryKey: LIST_KEY(locale) }),
    });
}

/**
 * Multi-select action deliberately reuses the same audited PATCH endpoint for every gateway. The UI
 * preflights stub/unconfigured rows before entering this mutation; a failure is surfaced and the
 * list is invalidated so the operator immediately sees the authoritative server state.
 */
export function useBulkUpdatePaymentGateways() {
    const locale = useLocale();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ ids, enabled }: { ids: number[]; enabled: boolean }) => {
            const results: PaymentGatewayEnvelope[] = [];
            for (const id of ids) {
                results.push(
                    await apiMutate<PaymentGatewayEnvelope>("PATCH", `payment-gateways/${id}`, { locale, body: { enabled } }),
                );
            }
            return results;
        },
        onSettled: () => qc.invalidateQueries({ queryKey: LIST_KEY(locale) }),
    });
}

export function usePaymentGateway(code: string) {
    const list = usePaymentGateways();
    const gateway = list.data ? (list.data.find((g) => g.code === code) ?? null) : undefined;
    return { ...list, data: gateway };
}
