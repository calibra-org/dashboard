import { test } from "@japa/runner";

import { evaluatePricingCandidate } from "#services/pricing_decision_engine";

test.group("Phase 18 pricing decision engine", () => {
    test("accepts a deterministic candidate inside every guardrail", ({ assert }) => {
        const result = evaluatePricingCandidate({
            referencePrice: 1_000_000,
            candidatePrice: 900_000,
            quantity: 2,
            guardrails: { floorPrice: 850_000, cogs: 600_000, minimumMarginPercent: 30, maximumDiscountPercent: 15 },
        });
        assert.isTrue(result.accepted);
        assert.equal(result.effectivePrice, 900_000);
        assert.equal(result.grossRevenue, 1_800_000);
        assert.equal(result.estimatedGrossProfit, 600_000);
        assert.deepEqual(result.violations, []);
    });

    test("rejects a candidate below the hard floor", ({ assert }) => {
        const result = evaluatePricingCandidate({
            referencePrice: 1_000,
            candidatePrice: 700,
            guardrails: { floorPrice: 800, cogs: null, minimumMarginPercent: null, maximumDiscountPercent: null },
        });
        assert.isFalse(result.accepted);
        assert.equal(result.effectivePrice, 1_000);
        assert.include(result.violations.map((item) => item.code), "below_floor");
    });

    test("rejects a discount deeper than policy allows", ({ assert }) => {
        const result = evaluatePricingCandidate({
            referencePrice: 1_000,
            candidatePrice: 700,
            guardrails: { floorPrice: null, cogs: null, minimumMarginPercent: null, maximumDiscountPercent: 20 },
        });
        assert.include(result.violations.map((item) => item.code), "discount_too_deep");
    });

    test("fails closed when minimum margin is requested without COGS evidence", ({ assert }) => {
        const result = evaluatePricingCandidate({
            referencePrice: 1_000,
            candidatePrice: 900,
            guardrails: { floorPrice: null, cogs: null, minimumMarginPercent: 25, maximumDiscountPercent: null },
        });
        assert.isFalse(result.accepted);
        assert.equal(result.economicsState, "unavailable");
        assert.include(result.violations.map((item) => item.code), "missing_economics");
    });

    test("rejects a candidate that breaches the minimum gross margin", ({ assert }) => {
        const result = evaluatePricingCandidate({
            referencePrice: 1_000,
            candidatePrice: 800,
            guardrails: { floorPrice: null, cogs: 700, minimumMarginPercent: 20, maximumDiscountPercent: null },
        });
        assert.isFalse(result.accepted);
        assert.include(result.violations.map((item) => item.code), "below_margin");
    });

    test("same context returns exactly the same result", ({ assert }) => {
        const input = {
            referencePrice: 1_000,
            candidatePrice: 950,
            quantity: 3,
            guardrails: { floorPrice: 900, cogs: 600, minimumMarginPercent: 20, maximumDiscountPercent: 10 },
        };
        assert.deepEqual(evaluatePricingCandidate(input), evaluatePricingCandidate(input));
    });
});
