import { test } from "@japa/runner";

import { chiSquareStatistic, deterministicBucket, srmDetected, subjectHash, variantEffect } from "#services/phase17_statistics";

test.group("Phase 17 statistics", () => {
    test("deterministic assignment bucket is stable", ({ assert }) => {
        const first = deterministicBucket([17, "search", "visitor", "abc"]);
        const second = deterministicBucket([17, "search", "visitor", "abc"]);
        assert.equal(first, second);
        assert.isAtLeast(first, 0);
        assert.isBelow(first, 10000);
    });

    test("subject hash never exposes raw identifier", ({ assert }) => {
        const hash = subjectHash(17, "visitor", "raw-user-key");
        assert.lengthOf(hash, 64);
        assert.notInclude(hash, "raw-user-key");
    });

    test("balanced allocation does not trigger SRM", ({ assert }) => {
        const statistic = chiSquareStatistic([500, 500], [0.5, 0.5]);
        assert.equal(statistic, 0);
        assert.isFalse(srmDetected(statistic, 1));
    });

    test("severe allocation mismatch triggers SRM", ({ assert }) => {
        const statistic = chiSquareStatistic([900, 100], [0.5, 0.5]);
        assert.isTrue(srmDetected(statistic, 1));
    });

    test("effect estimator reports lift against control", ({ assert }) => {
        const control = { variantId: 1, variantKey: "control", isControl: true, expectedShare: 0.5, assignments: 100, exposedSubjects: 100, observations: 100, sum: 10, sumSquares: 10 };
        const treatment = { variantId: 2, variantKey: "treatment", isControl: false, expectedShare: 0.5, assignments: 100, exposedSubjects: 100, observations: 100, sum: 15, sumSquares: 15 };
        const result = variantEffect(treatment, control);
        assert.closeTo(result.mean ?? 0, 0.15, 0.000001);
        assert.closeTo(result.absoluteLift ?? 0, 0.05, 0.000001);
        assert.closeTo(result.relativeLift ?? 0, 0.5, 0.000001);
    });
});
