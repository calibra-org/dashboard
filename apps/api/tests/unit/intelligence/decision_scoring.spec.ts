import { test } from "@japa/runner";

import { scoreAvailableComponents } from "#services/decision_intelligence_service";

test.group("Decision intelligence scoring", () => {
    test("does not manufacture expected value or confidence when only urgency is available", ({ assert }) => {
        const result = scoreAvailableComponents({ urgency: 0.78 });
        assert.equal(result.mode, "provisional");
        assert.equal(result.score, 78);
        assert.includeMembers(result.missing, ["expectedValue", "confidence", "reversibility", "strategicAlignment"]);
        assert.equal(result.components.urgency.effectiveWeight, 1);
        assert.equal(result.components.expectedValue.raw, null);
        assert.equal(result.components.confidence.raw, null);
    });

    test("renormalizes available positive factors and applies customer-harm penalty only when present", ({ assert }) => {
        const result = scoreAvailableComponents({ urgency: 0.8, strategicAlignment: 0.6, customerHarmPenalty: 0.5 });
        assert.equal(result.mode, "provisional");
        assert.isAbove(result.components.urgency.effectiveWeight, 0);
        assert.isBelow(result.score, 80);
        assert.equal(result.components.customerHarmPenalty.contribution, -0.025);
    });

    test("marks a score calibrated only when real expected value and confidence are both supplied", ({ assert }) => {
        const result = scoreAvailableComponents({ expectedValue: 0.7, confidence: 0.8, urgency: 0.9 });
        assert.equal(result.mode, "calibrated");
        assert.notInclude(result.missing, "expectedValue");
        assert.notInclude(result.missing, "confidence");
    });
});
