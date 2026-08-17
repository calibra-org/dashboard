"use server";

import { apiServer } from "#/lib/api";

export interface PricingSimulationState {
    ok: boolean;
    error: string | null;
    data: {
        accepted: boolean;
        referencePrice: number;
        candidatePrice: number;
        effectivePrice: number;
        quantity: number;
        grossRevenue: number;
        estimatedGrossProfit: number | null;
        discountPercent: number;
        marginPercent: number | null;
        violations: Array<{ code: string; message: string; actual: number; required: number }>;
    } | null;
}

export const initialPricingSimulationState: PricingSimulationState = { ok: false, error: null, data: null };

export async function simulatePricingAction(
    _previousState: PricingSimulationState,
    formData: FormData,
): Promise<PricingSimulationState> {
    const referencePrice = numberFromForm(formData, "reference_price");
    const candidatePrice = numberFromForm(formData, "candidate_price");

    if (referencePrice === null || candidatePrice === null) {
        return { ok: false, error: "قیمت مرجع و قیمت پیشنهادی را به‌صورت عدد معتبر وارد کنید.", data: null };
    }

    const api = await apiServer();
    try {
        const result = await api.http.post<{ data: PricingSimulationState["data"] }>("/admin/pricing-brain/simulate", {
            reference_price: referencePrice,
            candidate_price: candidatePrice,
            quantity: numberFromForm(formData, "quantity") ?? 1,
            floor_price: numberFromForm(formData, "floor_price"),
            cogs: numberFromForm(formData, "cogs"),
            minimum_margin_percent: numberFromForm(formData, "minimum_margin_percent"),
            maximum_discount_percent: numberFromForm(formData, "maximum_discount_percent"),
        });
        return { ok: true, error: null, data: result.data };
    } catch {
        return { ok: false, error: "شبیه‌سازی در API انجام نشد. ورودی‌ها و دسترسی فروشگاه را بررسی کنید.", data: null };
    }
}

function numberFromForm(formData: FormData, key: string): number | null {
    const raw = formData.get(key);
    if (typeof raw !== "string" || raw.trim().length === 0) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}
