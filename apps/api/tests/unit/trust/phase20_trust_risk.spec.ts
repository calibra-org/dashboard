import { test } from "@japa/runner";

import { calculateRiskDecision } from "#services/phase20_trust_risk_service";

test.group("Phase20 trust risk invariants", () => {
    test("no evidence defaults to allow", ({ assert }) => {
        const result = calculateRiskDecision([]);
        assert.equal(result.score, 0);
        assert.equal(result.band, "low");
        assert.equal(result.decision, "allow");
    });

    test("critical ATO signal blocks with explainable reason", ({ assert }) => {
        const result = calculateRiskDecision([{ code: "auth.ato_suspected", severity: "critical", value: 1 }]);
        assert.isAtLeast(result.score, 750);
        assert.equal(result.band, "critical");
        assert.equal(result.decision, "block");
        assert.include(result.reasons, "auth.ato_suspected");
    });

    test("active block control fails closed", ({ assert }) => {
        const result = calculateRiskDecision([], "block");
        assert.equal(result.score, 1000);
        assert.equal(result.decision, "block");
        assert.deepEqual(result.reasons, ["control.block"]);
    });

    test("allow override remains explicit and auditable", ({ assert }) => {
        const result = calculateRiskDecision([{ code: "refund.burst", severity: "critical", value: 2 }], "allow_override");
        assert.equal(result.score, 0);
        assert.equal(result.decision, "allow");
        assert.deepEqual(result.reasons, ["control.allow_override"]);
    });

    test("risk score is capped at 1000", ({ assert }) => {
        const result = calculateRiskDecision(
            Array.from({ length: 20 }, () => ({ code: "geo.impossible_travel", severity: "critical" as const, value: 4 })),
        );
        assert.equal(result.score, 1000);
    });
});
