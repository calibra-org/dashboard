import { test } from "@japa/runner";

import { assertRiskWithinCeiling, evaluateControlDecision } from "#services/objective_autonomy/objective_autonomy_service";

test.group("Phase 28 objective autonomy controls", () => {
    test("halts when a hard constraint is breached", ({ assert }) => {
        const result = evaluateControlDecision({
            budgetMinor: 1000,
            budgetSpentMinor: 500,
            confidence: 0.9,
            minimumConfidence: 0.6,
            unexpectedHarm: false,
            constraintBreaches: ["stockout_rate"],
            stopLoss: {},
            observedValue: 10,
        });
        assert.equal(result.decision, "halt");
    });

    test("reduces autonomy when confidence drops", ({ assert }) => {
        const result = evaluateControlDecision({
            budgetMinor: 1000,
            budgetSpentMinor: 500,
            confidence: 0.4,
            minimumConfidence: 0.6,
            unexpectedHarm: false,
            constraintBreaches: [],
            stopLoss: {},
            observedValue: 10,
        });
        assert.equal(result.decision, "reduce_autonomy");
        assert.equal(result.nextAutonomy, "propose");
    });

    test("forbids high risk bounded auto execution", ({ assert }) => {
        assert.throws(() => assertRiskWithinCeiling("high", "high", "bounded_auto"), /High and critical actions cannot be auto-executed/);
    });
});
