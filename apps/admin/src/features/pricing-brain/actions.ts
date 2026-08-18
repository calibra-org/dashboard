"use server";

import { revalidatePath } from "next/cache";

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
            promotionDiscount: number;
            candidateGrossRevenue: number;
            netRevenue: number;
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

export interface PricingMutationState {
    ok: boolean;
    error: string | null;
    message: string | null;
}

export const initialPricingSimulationState: PricingSimulationState = { ok: false, error: null, data: null };
export const initialPricingMutationState: PricingMutationState = { ok: false, error: null, message: null };

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
        const result = await api.http.post<{ data: NonNullable<PricingSimulationState["data"]> }>(
            "/admin/pricing-brain/simulate",
            {
                reference_price: referencePrice,
                candidate_price: candidatePrice,
                quantity: integerFromForm(formData, "quantity") ?? 1,
                promotion_discount: integerFromForm(formData, "promotion_discount") ?? 0,
                product_id: integerFromForm(formData, "product_id"),
                variation_id: integerFromForm(formData, "variation_id"),
                floor_price: integerFromForm(formData, "floor_price"),
                cogs: integerFromForm(formData, "cogs"),
                minimum_margin_percent: numberFromForm(formData, "minimum_margin_percent"),
                maximum_discount_percent: numberFromForm(formData, "maximum_discount_percent"),
            },
        );
        return { ok: true, error: null, data: result.data };
    } catch {
        return { ok: false, error: "شبیه‌سازی در API انجام نشد. ورودی‌ها، دسترسی و وضعیت Economics را بررسی کنید.", data: null };
    }
}

export async function mutatePricingGovernanceAction(
    _previousState: PricingMutationState,
    formData: FormData,
): Promise<PricingMutationState> {
    const operation = stringFromForm(formData, "operation");
    const locale = stringFromForm(formData, "locale") || "fa";
    const isFa = locale.toLowerCase().startsWith("fa");
    if (!operation) return mutationError(isFa, "عملیات مشخص نشده است.", "No pricing operation was specified.");

    const api = await apiServer();
    try {
        if (operation === "create_policy") {
            const policyKey = stringFromForm(formData, "policy_key");
            const name = stringFromForm(formData, "name");
            if (!policyKey || !name) return mutationError(isFa, "کلید و نام سیاست الزامی است.", "Policy key and name are required.");
            await api.http.post("/admin/pricing-brain/policies", {
                policy_key: policyKey,
                name,
                objective: nullableStringFromForm(formData, "objective"),
                currency: (stringFromForm(formData, "currency") || "IRR").toUpperCase(),
                product_id: integerFromForm(formData, "product_id"),
                variation_id: integerFromForm(formData, "variation_id"),
                guardrails: guardrailsFromForm(formData),
                evidence: { source: "admin_pricing_brain" },
                reason: nullableStringFromForm(formData, "reason"),
            });
        } else if (operation === "create_version") {
            const policyId = requiredPositiveInteger(formData, "policy_id");
            await api.http.post(`/admin/pricing-brain/policies/${policyId}/versions`, {
                guardrails: guardrailsFromForm(formData),
                evidence: { source: "admin_pricing_brain" },
                reason: nullableStringFromForm(formData, "reason") ?? "new pricing policy version",
            });
        } else if (operation === "create_proposal") {
            const policyId = requiredPositiveInteger(formData, "policy_id");
            const productId = requiredPositiveInteger(formData, "product_id");
            const referencePrice = requiredNonNegativeInteger(formData, "reference_price_minor");
            const candidatePrice = requiredNonNegativeInteger(formData, "candidate_price_minor");
            await api.http.post("/admin/pricing-brain/proposals", {
                policy_id: policyId,
                policy_version_id: integerFromForm(formData, "policy_version_id"),
                product_id: productId,
                variation_id: integerFromForm(formData, "variation_id"),
                reference_price_minor: referencePrice,
                candidate_price_minor: candidatePrice,
                currency: (stringFromForm(formData, "currency") || "IRR").toUpperCase(),
                objective: nullableStringFromForm(formData, "objective"),
                rationale: nullableStringFromForm(formData, "rationale"),
                evidence: { source: "admin_pricing_brain" },
            });
        } else if (operation === "transition") {
            const policyId = requiredPositiveInteger(formData, "policy_id");
            const expectedVersion = requiredPositiveInteger(formData, "expected_version");
            const action = stringFromForm(formData, "action");
            const reason = stringFromForm(formData, "reason");
            if (!action || !reason) return mutationError(isFa, "نوع اقدام و دلیل آن الزامی است.", "Lifecycle action and reason are required.");
            await api.http.post(`/admin/pricing-brain/policies/${policyId}/actions/${action}`, {
                expected_version: expectedVersion,
                reason,
                evidence: { source: "admin_pricing_brain" },
                correlation_id: nullableStringFromForm(formData, "correlation_id"),
                idempotency_key: nullableStringFromForm(formData, "idempotency_key") ?? crypto.randomUUID(),
                scheduled_at: nullableStringFromForm(formData, "scheduled_at"),
                rollback_to_version: integerFromForm(formData, "rollback_to_version"),
            });
        } else if (operation === "freeze") {
            const policyId = requiredPositiveInteger(formData, "policy_id");
            const reason = stringFromForm(formData, "reason");
            if (!reason) return mutationError(isFa, "ثبت دلیل Freeze/Unfreeze الزامی است.", "A freeze/unfreeze reason is required.");
            await api.http.post(`/admin/pricing-brain/policies/${policyId}/freeze`, {
                frozen: stringFromForm(formData, "frozen") === "true",
                reason,
                idempotency_key: nullableStringFromForm(formData, "idempotency_key") ?? crypto.randomUUID(),
            });
        } else {
            return mutationError(isFa, "عملیات ناشناخته است.", "Unknown pricing operation.");
        }

        revalidatePath(`/${locale}/pricing-brain`);
        return {
            ok: true,
            error: null,
            message: isFa ? "عملیات با موفقیت ثبت شد و وضعیت جدید از API خوانده می‌شود." : "The operation was recorded and the refreshed state is read from the API.",
        };
    } catch {
        return mutationError(
            isFa,
            "عملیات انجام نشد. دسترسی، نسخه مورد انتظار، وضعیت lifecycle و شواهد موردنیاز را بررسی کنید.",
            "The operation failed. Check permissions, expected version, lifecycle state, and required evidence.",
        );
    }
}

function guardrailsFromForm(formData: FormData): Record<string, number> {
    const guardrails: Record<string, number> = {};
    const floorPrice = integerFromForm(formData, "floor_price_minor");
    const minimumMarginPercent = numberFromForm(formData, "minimum_margin_percent");
    const maximumDiscountPercent = numberFromForm(formData, "maximum_discount_percent");
    if (floorPrice !== null) guardrails.floor_price_minor = floorPrice;
    if (minimumMarginPercent !== null) guardrails.minimum_margin_percent = minimumMarginPercent;
    if (maximumDiscountPercent !== null) guardrails.maximum_discount_percent = maximumDiscountPercent;
    return guardrails;
}

function mutationError(isFa: boolean, fa: string, en: string): PricingMutationState {
    return { ok: false, error: isFa ? fa : en, message: null };
}

function requiredPositiveInteger(formData: FormData, key: string): number {
    const value = integerFromForm(formData, key);
    if (value === null || value <= 0) throw new Error(`${key} must be a positive integer`);
    return value;
}

function requiredNonNegativeInteger(formData: FormData, key: string): number {
    const value = integerFromForm(formData, key);
    if (value === null || value < 0) throw new Error(`${key} must be a non-negative integer`);
    return value;
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

function stringFromForm(formData: FormData, key: string): string {
    const raw = formData.get(key);
    return typeof raw === "string" ? raw.trim() : "";
}

function nullableStringFromForm(formData: FormData, key: string): string | null {
    const value = stringFromForm(formData, key);
    return value.length > 0 ? value : null;
}
