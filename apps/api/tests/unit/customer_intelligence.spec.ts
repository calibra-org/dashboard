import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "@japa/runner";

import { deriveLifecycle, deriveRiskBand, deriveValueBand } from "#services/customer_intelligence_service";

test.group("customer intelligence lifecycle", () => {
    test("keeps lifecycle, risk, and value as independent axes", ({ assert }) => {
        assert.deepEqual(deriveLifecycle(0, null), { state: "never_purchased", reason: "no_counted_orders" });
        assert.deepEqual(deriveLifecycle(1, 12), { state: "first_purchase", reason: "single_recent_order" });
        assert.deepEqual(deriveLifecycle(4, 20), { state: "active_repeat", reason: "repeat_recent_orders" });
        assert.deepEqual(deriveLifecycle(4, 80), { state: "at_risk", reason: "last_order_61_to_120_days" });
        assert.deepEqual(deriveLifecycle(4, 150), { state: "lapsed", reason: "last_order_over_120_days" });
        assert.deepEqual(deriveLifecycle(4, 20, "lapsed"), { state: "reactivated", reason: "purchase_after_lapse" });

        assert.equal(deriveRiskBand("never_purchased"), "unknown");
        assert.equal(deriveRiskBand("active_repeat"), "low");
        assert.equal(deriveRiskBand("at_risk"), "medium");
        assert.equal(deriveRiskBand("lapsed"), "high");

        assert.equal(deriveValueBand(null), "unknown");
        assert.equal(deriveValueBand(8), "developing");
        assert.equal(deriveValueBand(9), "core");
        assert.equal(deriveValueBand(13), "high_value");
    });

    test("does not publish an uncalibrated churn probability under a misleading field name", ({ assert }) => {
        const specPath = resolve(
            import.meta.dirname,
            "../../../../docs/api/reference/openapi/admin.customer-intelligence.v1.yaml",
        );
        const contract = readFileSync(specPath, "utf8");
        assert.include(contract, "nba_candidates");
        assert.notInclude(contract, "next_best_actions");
        assert.include(contract, "historical_contribution_ltv_minor");
    });
});
