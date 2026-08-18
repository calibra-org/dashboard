export interface PricingGuardrails {
    /** Lowest customer-facing unit price allowed by policy, in integer minor currency units. */
    floorPrice: number | null;
    /** Cost-of-goods snapshot used to evaluate gross-margin constraints. */
    cogs: number | null;
    /** Minimum gross margin expressed as a percentage from 0 to 100. */
    minimumMarginPercent: number | null;
    /** Maximum allowed drop from the reference price, expressed as a percentage from 0 to 100. */
    maximumDiscountPercent: number | null;
}

export interface PricingCandidateInput {
    referencePrice: number;
    candidatePrice: number;
    quantity?: number;
    /** Exact line-level promotion allocation from the canonical Discounter, in minor units. */
    promotionDiscount?: number;
    guardrails: PricingGuardrails;
}

export type PricingGuardrailViolationCode =
    | "below_floor"
    | "below_margin"
    | "discount_too_deep"
    | "invalid_price"
    | "missing_economics";

export interface PricingGuardrailViolation {
    code: PricingGuardrailViolationCode;
    message: string;
    actual: number | null;
    required: number;
}

export interface PricingDecision {
    accepted: boolean;
    referencePrice: number;
    candidatePrice: number;
    effectivePrice: number;
    quantity: number;
    promotionDiscount: number;
    candidateGrossRevenue: number;
    candidateNetRevenue: number;
    /** Alias of candidateNetRevenue kept explicit for API/UI readability. */
    netRevenue: number;
    /** Revenue of the effective fallback path; rejected candidates fall back to reference revenue. */
    grossRevenue: number;
    estimatedGrossProfit: number | null;
    discountPercent: number;
    marginPercent: number | null;
    economicsState: "available" | "not_required" | "unavailable";
    violations: PricingGuardrailViolation[];
}

/**
 * Phase 18's deterministic decision layer. It does not replace `resolvePrice()` or the shared
 * Discounter. The caller may pass the Discounter's exact line allocation so floor, maximum
 * discount and margin guardrails evaluate the customer-facing economics after promotions without
 * reimplementing any promotion rules here.
 */
export function evaluatePricingCandidate(input: PricingCandidateInput): PricingDecision {
    const quantity = normalizeQuantity(input.quantity);
    const referencePrice = normalizeMoney(input.referencePrice);
    const candidatePrice = normalizeMoney(input.candidatePrice);
    const promotionDiscount = normalizeMoney(input.promotionDiscount ?? 0);
    const violations: PricingGuardrailViolation[] = [];

    const referenceGrossRevenue = safeMultiply(referencePrice, quantity);
    const candidateGrossRevenue = safeMultiply(candidatePrice, quantity);
    const promotionValid = promotionDiscount >= 0 && candidateGrossRevenue >= 0 && promotionDiscount <= candidateGrossRevenue;

    if (referencePrice <= 0 || candidatePrice < 0 || referenceGrossRevenue < 0 || !promotionValid) {
        violations.push({
            code: "invalid_price",
            message: "Reference, candidate, quantity, and promotion allocation must remain valid integer minor-unit money values.",
            actual: promotionValid ? candidatePrice : promotionDiscount,
            required: 0,
        });
    }

    const candidateNetRevenue = promotionValid ? candidateGrossRevenue - promotionDiscount : 0;
    const discountPercent =
        referenceGrossRevenue > 0 ? ((referenceGrossRevenue - candidateNetRevenue) / referenceGrossRevenue) * 100 : 0;

    const floorPrice = nullableMoney(input.guardrails.floorPrice);
    const floorRevenue = floorPrice === null ? null : safeMultiply(floorPrice, quantity);
    if (floorRevenue !== null && floorRevenue >= 0 && candidateNetRevenue < floorRevenue) {
        violations.push({
            code: "below_floor",
            message: "Customer-facing line revenue after promotions is below the configured floor.",
            actual: candidateNetRevenue,
            required: floorRevenue,
        });
    }

    const maximumDiscountPercent = nullablePercent(input.guardrails.maximumDiscountPercent);
    if (maximumDiscountPercent !== null && discountPercent > maximumDiscountPercent) {
        violations.push({
            code: "discount_too_deep",
            message: "Combined base-price and promotion discount is deeper than the configured maximum.",
            actual: roundMetric(discountPercent),
            required: maximumDiscountPercent,
        });
    }

    const cogs = nullableMoney(input.guardrails.cogs);
    const minimumMarginPercent = nullablePercent(input.guardrails.minimumMarginPercent);
    const totalCogs = cogs === null ? null : safeMultiply(cogs, quantity);
    const marginPercent =
        totalCogs !== null && totalCogs >= 0 && candidateNetRevenue > 0
            ? ((candidateNetRevenue - totalCogs) / candidateNetRevenue) * 100
            : null;
    if (minimumMarginPercent !== null && cogs === null) {
        violations.push({
            code: "missing_economics",
            message: "A minimum-margin guardrail requires an available COGS snapshot.",
            actual: null,
            required: minimumMarginPercent,
        });
    } else if (minimumMarginPercent !== null && marginPercent !== null && marginPercent < minimumMarginPercent) {
        violations.push({
            code: "below_margin",
            message: "Customer-facing revenue after promotions would breach the minimum gross-margin guardrail.",
            actual: roundMetric(marginPercent),
            required: minimumMarginPercent,
        });
    }

    const accepted = violations.length === 0;
    const effectivePrice = accepted ? candidatePrice : referencePrice;
    const grossRevenue = accepted ? candidateNetRevenue : referenceGrossRevenue;
    const estimatedGrossProfit = totalCogs === null || totalCogs < 0 ? null : grossRevenue - totalCogs;
    const economicsState = cogs !== null ? "available" : minimumMarginPercent === null ? "not_required" : "unavailable";

    return {
        accepted,
        referencePrice,
        candidatePrice,
        effectivePrice,
        quantity,
        promotionDiscount,
        candidateGrossRevenue,
        candidateNetRevenue,
        netRevenue: candidateNetRevenue,
        grossRevenue,
        estimatedGrossProfit,
        discountPercent: roundMetric(discountPercent),
        marginPercent: marginPercent === null ? null : roundMetric(marginPercent),
        economicsState,
        violations,
    };
}

function normalizeMoney(value: number): number {
    if (!Number.isSafeInteger(value)) return -1;
    return value;
}

function nullableMoney(value: number | null): number | null {
    if (value === null || !Number.isSafeInteger(value) || value < 0) return null;
    return value;
}

function nullablePercent(value: number | null): number | null {
    if (value === null || !Number.isFinite(value)) return null;
    return Math.min(100, Math.max(0, roundMetric(value)));
}

function normalizeQuantity(value: number | undefined): number {
    if (value === undefined || !Number.isSafeInteger(value)) return 1;
    return Math.max(1, value);
}

function safeMultiply(left: number, right: number): number {
    const result = left * right;
    return Number.isSafeInteger(result) ? result : -1;
}

function roundMetric(value: number): number {
    return Math.round(value * 100) / 100;
}
