export interface PricingGuardrails {
    /** Lowest customer-facing unit price allowed by policy, in minor currency units. */
    floorPrice: number | null;
    /** Optional cost-of-goods snapshot used to enforce a minimum gross-margin percentage. */
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

export interface PricingGuardrailViolation {
    code: "below_floor" | "below_margin" | "discount_too_deep" | "invalid_price";
    message: string;
    actual: number;
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
    violations: PricingGuardrailViolation[];
}

/**
 * Pure decision layer for Phase 18. It does not replace `resolvePrice()` or the shared `Discounter`:
 * it only evaluates a proposed price before an operator or future policy adapter is allowed to
 * activate it. Simulation and production activation are expected to call this same function so
 * guardrails cannot drift between preview and runtime.
 */
export function evaluatePricingCandidate(input: PricingCandidateInput): PricingDecision {
    const quantity = normalizeQuantity(input.quantity);
    const referencePrice = normalizeMoney(input.referencePrice);
    const candidatePrice = normalizeMoney(input.candidatePrice);
    const violations: PricingGuardrailViolation[] = [];

    if (candidatePrice < 0 || referencePrice < 0) {
        violations.push({
            code: "invalid_price",
            message: "Price values must be zero or greater.",
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
    const marginPercent = cogs !== null && candidatePrice > 0 ? ((candidatePrice - cogs) / candidatePrice) * 100 : null;
    const minimumMarginPercent = nullablePercent(input.guardrails.minimumMarginPercent);
    if (minimumMarginPercent !== null && marginPercent !== null && marginPercent < minimumMarginPercent) {
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
        violations,
    };
}

function normalizeMoney(value: number): number {
    if (!Number.isFinite(value)) return -1;
    return Math.round(value);
}

function nullableMoney(value: number | null): number | null {
    if (value === null || !Number.isFinite(value)) return null;
    return Math.max(0, Math.round(value));
}

function nullablePercent(value: number | null): number | null {
    if (value === null || !Number.isFinite(value)) return null;
    return Math.min(100, Math.max(0, roundMetric(value)));
}

function normalizeQuantity(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value)) return 1;
    return Math.max(1, Math.floor(value));
}

function roundMetric(value: number): number {
    return Math.round(value * 100) / 100;
}
