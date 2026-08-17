import { test } from "@japa/runner";

import { evaluatePricingCandidate } from "#services/pricing_decision_engine";

const noGuardrails = {
    floorPrice: null,
    cogs: null,
    minimumMarginPercent: null,
    maximumDiscountPercent: null,
};

test.group("pricing decision engine", () => {
    test("accepts a valid candidate and uses it as the effective price", ({ assert }) => {
        const result = evaluatePricingCandidate({
            referencePrice: 100_000,
            candidatePrice: 90_000,
            quantity: 2,
            guardrails: noGuardrails,
        });

        assert.isTrue(result.accepted);
        assert.equal(result.effectivePrice, 90_000);
        assert.equal(result.grossRevenue, 180_000);
        assert.equal(result.discountPercent, 10);
        assert.lengthOf(result.violations, 0);
    });

    test("fails closed to the reference price when the floor is breached", ({ assert }) => {
        const result = evaluatePricingCandidate({
            referencePrice: 100_000,
            candidatePrice: 70_000,
            guardrails: { ...noGuardrails, floorPrice: 80_000 },
        });

        assert.isFalse(result.accepted);
        assert.equal(result.effectivePrice, 100_000);
        assert.equal(result.violations[0]?.code, "below_floor");
    });

    test("rejects a discount deeper than the configured maximum", ({ assert }) => {
        const result = evaluatePricingCandidate({
            referencePrice: 200_000,
            candidatePrice: 140_000,
            guardrails: { ...noGuardrails, maximumDiscountPercent: 20 },
        });

        assert.isFalse(result.accepted);
        assert.equal(result.discountPercent, 30);
        assert.equal(result.violations[0]?.code, "discount_too_deep");
    });

    test("computes gross margin only when COGS evidence is present", ({ assert }) => {
        const withCogs = evaluatePricingCandidate({
            referencePrice: 100_000,
            candidatePrice: 90_000,
            guardrails: { ...noGuardrails, cogs: 60_000, minimumMarginPercent: 30 },
        });
        const withoutCogs = evaluatePricingCandidate({
            referencePrice: 100_000,
            candidatePrice: 90_000,
            guardrails: noGuardrails,
        });

        assert.isTrue(withCogs.accepted);
        assert.equal(withCogs.marginPercent, 33.33);
        assert.equal(withCogs.estimatedGrossProfit, 30_000);
        assert.isNull(withoutCogs.marginPercent);
        assert.isNull(withoutCogs.estimatedGrossProfit);
    });

    test("rejects a candidate that would breach minimum margin", ({ assert }) => {
        const result = evaluatePricingCandidate({
            referencePrice: 100_000,
            candidatePrice: 80_000,
            guardrails: { ...noGuardrails, cogs: 70_000, minimumMarginPercent: 20 },
        });

        assert.isFalse(result.accepted);
        assert.equal(result.marginPercent, 12.5);
        assert.equal(result.violations[0]?.code, "below_margin");
    });
});
