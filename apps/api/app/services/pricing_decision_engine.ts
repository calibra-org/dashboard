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
    grossRevenue: number;
    estimatedGrossProfit: number | null;
    discountPercent: number;
    marginPercent: number | null;
    economicsState: "available" | "not_required" | "unavailable";
    violations: PricingGuardrailViolation[];
}

/**
 * Phase 18's deterministic decision layer. It does not replace `resolvePrice()` or the shared
 * Discounter. Both preview and any future activation adapter must call this same evaluator before
 * a candidate can reach the canonical price path.
 */
export function evaluatePricingCandidate(input: PricingCandidateInput): PricingDecision {
    const quantity = normalizeQuantity(input.quantity);
    const referencePrice = normalizeMoney(input.referencePrice);
    const candidatePrice = normalizeMoney(input.candidatePrice);
    const violations: PricingGuardrailViolation[] = [];

    if (referencePrice <= 0 || candidatePrice < 0) {
        violations.push({
            code: "invalid_price",
            message: "Reference price must be positive and candidate price must be zero or greater.",
            actual: candidatePrice,
            required: 0,
        });
    }

    const discountPercent = referencePrice > 0 ? ((referencePrice - candidatePrice) / referencePrice) * 100 : 0;
    const floorPrice = nullableMoney(input.guardrails.floorPrice);
    if (floorPrice !== null && candidatePrice < floorPrice) {
        violations.push({
            code: "below_floor",
            message: "Candidate price is below the configured floor price.",
            actual: candidatePrice,
            required: floorPrice,
        });
    }

    const maximumDiscountPercent = nullablePercent(input.guardrails.maximumDiscountPercent);
    if (maximumDiscountPercent !== null && discountPercent > maximumDiscountPercent) {
        violations.push({
            code: "discount_too_deep",
            message: "Candidate discount is deeper than the configured maximum.",
            actual: roundMetric(discountPercent),
            required: maximumDiscountPercent,
        });
    }

    const cogs = nullableMoney(input.guardrails.cogs);
    const minimumMarginPercent = nullablePercent(input.guardrails.minimumMarginPercent);
    const marginPercent = cogs !== null && candidatePrice > 0 ? ((candidatePrice - cogs) / candidatePrice) * 100 : null;
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
            message: "Candidate price would breach the minimum gross-margin guardrail.",
            actual: roundMetric(marginPercent),
            required: minimumMarginPercent,
        });
    }

    const accepted = violations.length === 0;
    const effectivePrice = accepted ? candidatePrice : referencePrice;
    const grossRevenue = effectivePrice * quantity;
    const estimatedGrossProfit = cogs === null ? null : (effectivePrice - cogs) * quantity;
    const economicsState = cogs !== null ? "available" : minimumMarginPercent === null ? "not_required" : "unavailable";

    return {
        accepted,
        referencePrice,
        candidatePrice,
        effectivePrice,
        quantity,
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

function roundMetric(value: number): number {
    return Math.round(value * 100) / 100;
}
