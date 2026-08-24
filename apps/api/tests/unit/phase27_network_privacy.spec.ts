import { test } from "@japa/runner";

import {
    assertAggregateOnlyNetworkPayload,
    networkMetricDefinitionDigest,
    normalizeAggregateRefs,
    normalizeNetworkPrivacyPolicy,
} from "#services/network_intelligence/network_service";

test.group("Phase 27 network privacy contracts", () => {
    test("rejects raw or identity-shaped fields", ({ assert }) => {
        assert.throws(() => assertAggregateOnlyNetworkPayload({ customer_id: 1 }), /forbidden/i);
        assert.throws(() => assertAggregateOnlyNetworkPayload({ source: "peer@example.com" }), /forbidden/i);
        assert.doesNotThrow(() => assertAggregateOnlyNetworkPayload({ record_count: 50, aggregate_value: 0.42 }));
    });

    test("only accepts aggregate artifact references", ({ assert }) => {
        assert.deepEqual(normalizeAggregateRefs(["report:monthly/2026-08", "aggregate:orders:2026-08"]), [
            "aggregate:orders:2026-08",
            "report:monthly/2026-08",
        ]);
        assert.throws(() => normalizeAggregateRefs(["customer:123"]), /aggregate artifacts/i);
        assert.throws(() => normalizeAggregateRefs(["report:peer@example.com"]), /aggregate artifacts/i);
    });

    test("metric definition digest is deterministic and bound-sensitive", ({ assert }) => {
        const base = {
            metric_key: "conversion.rate",
            unit: "percent",
            numerator_definition: "paid orders",
            denominator_definition: "sessions",
            aggregation: "ratio",
            period_grain: "month",
            minimum_records_per_contribution: 20,
            value_min: 0,
            value_max: 100,
        };
        assert.equal(networkMetricDefinitionDigest(base), networkMetricDefinitionDigest({ ...base }));
        assert.notEqual(networkMetricDefinitionDigest(base), networkMetricDefinitionDigest({ ...base, value_max: 1 }));
    });

    test("laplace policy requires explicit bounded privacy budget", ({ assert }) => {
        assert.throws(
            () =>
                normalizeNetworkPrivacyPolicy({
                    opted_in: true,
                    minimum_cohort_size: 20,
                    privacy_method: "laplace_dp",
                    privacy_parameters: {},
                }),
            /privacy requires bounded epsilon/i,
        );
        const parameters = normalizeNetworkPrivacyPolicy({
            opted_in: true,
            minimum_cohort_size: 20,
            privacy_method: "laplace_dp",
            privacy_parameters: { epsilon: 1, max_cumulative_epsilon: 4 },
        });
        assert.equal(parameters.privacy_unit, "tenant_aggregate_value");
        assert.equal(parameters.epsilon, 1);
        assert.equal(parameters.max_cumulative_epsilon, 4);
    });
});
