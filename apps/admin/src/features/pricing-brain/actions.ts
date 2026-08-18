"use server";

import { apiServer } from "#/lib/api";

export interface PricingSimulationState {
    ok: boolean;
    error: string | null;
    data: {
        decision: {
            accepted: boolean;
            referencePrice: number;
            candidatePrice: number;
            effectivePrice: number;
            quantity: number;
            grossRevenue: number;
            estimatedGrossProfit: number | null;
            discountPercent: number;
            marginPercent: number | null;
            economicsState: "available" | "not_required" | "unavailable";
            violations: Array<{ code: string; message: string; actual: number | null; required: number }>;
        };
        economics: {
            value: number | null;
            source: "explicit" | "realized_snapshot" | "cost_layer" | "unavailable";
            quality: "operator_input" | "realized" | "inventory_evidence" | "unavailable";
            observedAt: string | null;
        };
    } | null;
}

export const initialPricingSimulationState: PricingSimulationState = { ok: false, error: null, data: null };

export async function simulatePricingAction(
    _previousState: PricingSimulationState,
    formData: FormData,
): Promise<PricingSimulationState> {
    const referencePrice = integerFromForm(formData, "reference_price");
    const candidatePrice = integerFromForm(formData, "candidate_price");
    if (referencePrice === null || referencePrice <= 0 || candidatePrice === null || candidatePrice < 0) {
        return { ok: false, error: "قیمت مرجع باید مثبت و قیمت پیشنهادی باید یک عدد صحیح نامنفی باشد.", data: null };
    }

    const api = await apiServer();
    try {
        const result = await api.http.post<{ data: NonNullable<PricingSimulationState["data"]> }>("/admin/pricing-brain/simulate", {
            reference_price: referencePrice,
            candidate_price: candidatePrice,
            quantity: integerFromForm(formData, "quantity") ?? 1,
            product_id: integerFromForm(formData, "product_id"),
            variation_id: integerFromForm(formData, "variation_id"),
            floor_price: integerFromForm(formData, "floor_price"),
            cogs: integerFromForm(formData, "cogs"),
            minimum_margin_percent: numberFromForm(formData, "minimum_margin_percent"),
            maximum_discount_percent: numberFromForm(formData, "maximum_discount_percent"),
        });
        return { ok: true, error: null, data: result.data };
    } catch {
        return { ok: false, error: "شبیه‌سازی در API انجام نشد. ورودی‌ها، دسترسی و وضعیت Economics را بررسی کنید.", data: null };
    }
}

function integerFromForm(formData: FormData, key: string): number | null {
    const value = numberFromForm(formData, key);
    return value !== null && Number.isSafeInteger(value) ? value : null;
}

function numberFromForm(formData: FormData, key: string): number | null {
    const raw = formData.get(key);
    if (typeof raw !== "string" || raw.trim().length === 0) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}
