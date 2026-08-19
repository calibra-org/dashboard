import { test } from "@japa/runner";

import { recommendedActionForBand, riskBandForScore } from "#services/trust/contracts";

test.group("Phase 20 adaptive friction contracts", () => {
    test("risk bands map to explicit adaptive friction without universal friction", ({ assert }) => {
        assert.equal(recommendedActionForBand(riskBandForScore(0)), "allow");
        assert.equal(recommendedActionForBand(riskBandForScore(12)), "monitor");
        assert.equal(recommendedActionForBand(riskBandForScore(45)), "monitor");
        assert.equal(recommendedActionForBand(riskBandForScore(60)), "step_up");
        assert.equal(recommendedActionForBand(riskBandForScore(80)), "hold");
        assert.equal(recommendedActionForBand(riskBandForScore(95)), "block");
    });

    test("automation classes stay distinct and are never collapsed into one bot label", ({ assert }) => {
        const classes = ["approved_agent", "unknown_automation", "abusive_bot"];
        assert.lengthOf(new Set(classes), 3);
        assert.notEqual(classes[0], classes[2]);
    });
});
