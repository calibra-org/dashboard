import assert from "node:assert/strict";

import { aggregateNetworkBenchmarks } from "./aggregate-network-benchmarks.mjs";

const contribution = (tenant, value = 10) => ({
    tenant_pseudonym: `tenant_${String(tenant).padStart(4, "0")}`,
    metric_key: "conversion.rate",
    metric_version: 1,
    definition_digest: "a".repeat(64),
    period_key: "2026-08",
    segment_key: "all",
    aggregate_value: value,
    record_count: 100,
});

const baseConfig = {
    minimum_cohort_size: 5,
    privacy_method: "aggregate_threshold",
    source_batch_ref: "batch:phase27:test-001",
    metric_bounds: { "conversion.rate@1": { lower: 0, upper: 100 } },
};

assert.equal(aggregateNetworkBenchmarks({ config: baseConfig, contributions: [1, 2, 3, 4].map(contribution) }).publications.length, 0);
const thresholded = aggregateNetworkBenchmarks({ config: baseConfig, contributions: [1, 2, 3, 4, 5].map(contribution) });
assert.equal(thresholded.publications.length, 1);
assert.equal(thresholded.publications[0].cohort_size, 5);
assert.equal(thresholded.publications[0].distribution_summary.suppressed, true);
assert.equal(thresholded.contains_peer_raw_records, false);

assert.throws(
    () => aggregateNetworkBenchmarks({ config: baseConfig, contributions: [{ ...contribution(1), email: "peer@example.com" }] }),
    /raw\/identity field forbidden|PII-shaped value forbidden/,
);
assert.throws(
    () => aggregateNetworkBenchmarks({ config: baseConfig, contributions: [contribution(1), contribution(1), contribution(2), contribution(3), contribution(4)] }),
    /duplicate tenant contribution/,
);
assert.throws(
    () =>
        aggregateNetworkBenchmarks({
            config: baseConfig,
            contributions: [1, 2, 3, 4, 5].map((tenant) => ({ ...contribution(tenant), definition_digest: tenant === 5 ? "b".repeat(64) : "a".repeat(64) })),
        }),
    /metric definition mismatch/,
);
assert.throws(
    () => aggregateNetworkBenchmarks({ config: baseConfig, contributions: [1, 2, 3, 4, 5].map((tenant) => contribution(tenant, tenant === 5 ? 101 : 10)) }),
    /outside approved bounds/,
);

const dp = aggregateNetworkBenchmarks({
    config: {
        ...baseConfig,
        privacy_method: "laplace_dp",
        epsilon: 1,
        privacy_budget: { max_cumulative_epsilon: 3, prior_epsilon_by_group: { "conversion.rate|1|2026-08|all": 1 } },
    },
    contributions: [1, 2, 3, 4, 5].map((tenant) => contribution(tenant, tenant * 10)),
});
assert.equal(dp.publications.length, 1);
assert.equal(dp.publications[0].privacy_parameters.epsilon, 1);
assert.equal(dp.publications[0].privacy_parameters.epsilon_cumulative, 2);
assert.equal(dp.publications[0].distribution_summary.suppressed, true);
assert.ok(dp.publications[0].benchmark_value >= 0 && dp.publications[0].benchmark_value <= 100);

assert.throws(
    () =>
        aggregateNetworkBenchmarks({
            config: {
                ...baseConfig,
                privacy_method: "laplace_dp",
                epsilon: 1,
                privacy_budget: { max_cumulative_epsilon: 2, prior_epsilon_by_group: { "conversion.rate|1|2026-08|all": 2 } },
            },
            contributions: [1, 2, 3, 4, 5].map(contribution),
        }),
    /privacy budget exceeded/,
);

process.stdout.write("PASS Phase 27 network aggregation privacy tests\n");
