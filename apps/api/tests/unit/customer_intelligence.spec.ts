import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "@japa/runner";

import { deriveLifecycle, deriveQualityStatus, deriveRiskBand, deriveValueBand } from "#services/customer_intelligence_service";

const rootPath = (...parts: string[]) => resolve(import.meta.dirname, "../../../..", ...parts);

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

    test("locks lifecycle and value boundary conditions", ({ assert }) => {
        assert.equal(deriveLifecycle(2, 60).state, "active_repeat");
        assert.equal(deriveLifecycle(2, 61).state, "at_risk");
        assert.equal(deriveLifecycle(2, 120).state, "at_risk");
        assert.equal(deriveLifecycle(2, 121).state, "lapsed");
        assert.equal(deriveLifecycle(2, 60, "lapsed").state, "reactivated");
        assert.equal(deriveLifecycle(2, 61, "lapsed").state, "at_risk");

        assert.equal(deriveValueBand(0), "developing");
        assert.equal(deriveValueBand(8), "developing");
        assert.equal(deriveValueBand(9), "core");
        assert.equal(deriveValueBand(12), "core");
        assert.equal(deriveValueBand(13), "high_value");
        assert.equal(deriveValueBand(15), "high_value");

        assert.equal(deriveQualityStatus(0, 0, "unavailable"), "limited_history");
        assert.equal(deriveQualityStatus(1, 0, "unavailable"), "limited_history");
        assert.equal(deriveQualityStatus(2, 2, "available"), "ready");
        assert.equal(deriveQualityStatus(2, 2, "partial"), "partial_economic_coverage");
        assert.equal(deriveQualityStatus(2, 2, "unavailable"), "missing_economic_coverage");
    });

    test("keeps prediction and contribution contracts explicit", ({ assert }) => {
        const contract = readFileSync(rootPath("docs/api/reference/openapi/admin.customer-intelligence.v1.yaml"), "utf8");

        assert.include(contract, "nba_candidates");
        assert.notInclude(contract, "next_best_actions");
        assert.include(contract, "historical_contribution_ltv_minor");
        assert.include(contract, "contribution_coverage_ratio");
        assert.include(contract, "economics.historical_contribution_ltv_minor");
        assert.include(contract, "enum: [not_calibrated]");
        assert.include(contract, "enum: [available, partial, unavailable]");
        assert.include(contract, 'contribution_ltv_minor: { type: [integer, "null"], format: int64 }');
    });

    test("keeps the Phase 15 projection tenant-isolated and deletion-aware", ({ assert }) => {
        const migration = readFileSync(
            rootPath("apps/api/database/migrations/1768000000000_create_phase15_customer_intelligence.ts"),
            "utf8",
        );
        const eligibility = readFileSync(rootPath("apps/api/app/services/customer_intelligence_eligibility_service.ts"), "utf8");
        const refreshJob = readFileSync(rootPath("apps/api/app/jobs/refresh_customer_intelligence_job.ts"), "utf8");

        assert.include(migration, 'createTable("customer_intelligence_profiles"');
        assert.include(migration, 'createTable("customer_segment_definitions"');
        assert.include(migration, 'createTable("customer_segment_memberships"');
        assert.include(migration, 'createTable("customer_lifecycle_history"');
        assert.include(migration, "ENABLE ROW LEVEL SECURITY");
        assert.include(migration, "FORCE ROW LEVEL SECURITY");
        assert.include(migration, "CREATE POLICY tenant_isolation");
        assert.include(migration, 'table.unique(["tenant_id", "customer_id"]');

        assert.include(eligibility, '["customer_intelligence_profiles", "cip"]');
        assert.include(eligibility, '["customer_segment_memberships", "csm"]');
        assert.include(eligibility, '["customer_lifecycle_history", "clh"]');
        assert.include(eligibility, 'from("customer_lifecycle_history").whereIn("customer_id", customerIds).delete()');
        assert.include(refreshJob, 'from("customer_lifecycle_history").where("customer_id", customerId).delete()');
    });
});
