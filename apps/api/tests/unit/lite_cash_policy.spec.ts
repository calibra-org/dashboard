import { test } from "@japa/runner";

import {
    computeObservationSummary,
    resolvePurgeScope,
    stableFingerprint,
    validateLiteCashImport,
    validateLiteCashPolicy,
} from "#services/lite_cash/policy";

const settings = { max_policy_ttl_seconds: 86_400 };
const safePolicy = {
    name: "Catalog products",
    description: "Cache public product listing responses.",
    kind: "api" as const,
    route_pattern: "/api/v1/products",
    status: "enabled" as const,
    risk_tier: "medium" as const,
    ttl_seconds: 300,
    grace_seconds: 600,
    stale_if_error_seconds: 60,
    soft_timeout_ms: 200,
    hard_timeout_ms: 2_000,
    tags: ["catalog_products"],
    vary: ["tenant", "locale"],
    conditions: {},
};

test.group("lite cash purge registry", () => {
    test("resolves product and customer purges inside the tenant namespace", ({ assert }) => {
        assert.deepEqual(resolvePurgeScope(42, "product", "9"), {
            tags: ["t42:catalog:product:9"],
            blastRadius: "narrow",
        });
        assert.deepEqual(resolvePurgeScope(42, "customer", "12"), {
            tags: ["t42:admin:customer:12"],
            blastRadius: "narrow",
        });
    });

    test("rejects non-numeric product and customer targets", ({ assert }) => {
        assert.throws(() => resolvePurgeScope(42, "product", "all"), /positive numeric target id/);
        assert.throws(() => resolvePurgeScope(42, "customer", "0"), /positive numeric target id/);
    });

    test("full tenant purge never includes the global tenant registry tag", ({ assert }) => {
        const resolved = resolvePurgeScope(42, "full_tenant");
        assert.equal(resolved.blastRadius, "broad");
        assert.notInclude(resolved.tags, "tenant:registry");
        assert.isTrue(resolved.tags.every((tag) => tag.startsWith("t42:")));
    });
});

test.group("lite cash policy validation", () => {
    test("accepts a safe catalog policy", ({ assert }) => {
        const result = validateLiteCashPolicy(safePolicy, settings);
        assert.isTrue(result.valid);
        assert.isTrue(result.publishable);
        assert.isEmpty(result.errors);
        assert.match(result.fingerprint, /^[0-9a-f]{64}$/);
    });

    test("rejects correctness-sensitive routes", ({ assert }) => {
        for (const route_pattern of [
            "/cart",
            "/checkout/payment",
            "/api/v1/orders",
            "/account/history",
            "/inventory/stock-status",
        ]) {
            const result = validateLiteCashPolicy({ ...safePolicy, route_pattern }, settings);
            assert.include(
                result.errors.map((finding) => finding.code),
                "route.correctness_sensitive",
            );
        }
    });

    test("rejects excessive TTL and inverted timeouts", ({ assert }) => {
        const ttl = validateLiteCashPolicy({ ...safePolicy, ttl_seconds: 86_401 }, settings);
        assert.include(
            ttl.errors.map((finding) => finding.code),
            "ttl.out_of_range",
        );

        const timeout = validateLiteCashPolicy({ ...safePolicy, soft_timeout_ms: 2_000, hard_timeout_ms: 1_000 }, settings);
        assert.include(
            timeout.errors.map((finding) => finding.code),
            "timeout.invalid",
        );
    });

    test("normalizes duplicate tags and vary dimensions deterministically", ({ assert }) => {
        const first = validateLiteCashPolicy(
            { ...safePolicy, tags: ["catalog_products", "catalog_products"], vary: ["locale", "tenant", "tenant"] },
            settings,
        );
        const second = validateLiteCashPolicy(
            { ...safePolicy, tags: ["catalog_products"], vary: ["tenant", "locale"] },
            settings,
        );
        assert.deepEqual(first.normalized.tags, ["catalog_products"]);
        assert.deepEqual(first.normalized.vary, ["locale", "tenant"]);
        assert.equal(first.fingerprint, second.fingerprint);
    });
});

test.group("lite cash fingerprints and import", () => {
    test("fingerprint is stable across equivalent object key order", ({ assert }) => {
        assert.equal(
            stableFingerprint({ css: { minify: true, unused: false }, edge: { hints: true } }),
            stableFingerprint({ edge: { hints: true }, css: { unused: false, minify: true } }),
        );
    });

    test("rejects an unknown import schema and unsafe policies", ({ assert }) => {
        const result = validateLiteCashImport(
            {
                schema: "unknown",
                policies: [{ policy_key: "unsafe", ...safePolicy, route_pattern: "/checkout" }],
                profiles: [],
            },
            settings,
        );
        assert.isFalse(result.valid);
        assert.includeMembers(
            result.errors.map((finding) => finding.code),
            ["schema.unsupported", "policy.0.route.correctness_sensitive"],
        );
    });
});

test.group("lite cash observation summary", () => {
    test("returns null ratios without cache evidence", ({ assert }) => {
        const summary = computeObservationSummary([]);
        assert.isNull(summary.hit_rate);
        assert.isNull(summary.miss_rate);
        assert.isNull(summary.stale_rate);
        assert.isNull(summary.p95_origin_latency_ms);
    });

    test("computes ratios and p95 only from trusted values supplied", ({ assert }) => {
        const summary = computeObservationSummary([
            { metric_key: "cache_hit", value: 80 },
            { metric_key: "cache_miss", value: 15 },
            { metric_key: "cache_stale", value: 5 },
            { metric_key: "origin_latency_ms", value: 100 },
            { metric_key: "origin_latency_ms", value: 400 },
            { metric_key: "origin_latency_ms", value: 250 },
        ]);
        assert.equal(summary.hit_rate, 0.8);
        assert.equal(summary.miss_rate, 0.15);
        assert.equal(summary.stale_rate, 0.05);
        assert.equal(summary.p95_origin_latency_ms, 400);
    });
});
