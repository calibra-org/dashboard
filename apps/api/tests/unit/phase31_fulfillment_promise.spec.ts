import { test } from "@japa/runner";

import {
    comparePromiseOptions,
    isCalibratedServiceProfile,
    isInventoryFreshAt,
} from "#services/fulfillment_promise/policy";

test.group("Phase 31 fulfillment promise safety boundaries", () => {
    test("rejects stale, future and unknown inventory observations", ({ assert }) => {
        const now = "2026-08-26T12:00:00.000Z";
        assert.isTrue(isInventoryFreshAt("2026-08-26T11:50:00.000Z", 15, now));
        assert.isFalse(isInventoryFreshAt("2026-08-26T11:40:00.000Z", 15, now));
        assert.isFalse(isInventoryFreshAt("2026-08-26T12:01:00.000Z", 15, now));
        assert.isFalse(isInventoryFreshAt(null, 15, now));
    });

    test("requires enough calibration evidence and a non-expired profile", ({ assert }) => {
        const now = "2026-08-26T12:00:00.000Z";
        assert.isTrue(
            isCalibratedServiceProfile(
                {
                    calibrationSampleCount: 40,
                    minimumSampleCount: 20,
                    confidenceBps: 8600,
                    lastCalibratedAt: "2026-08-25T12:00:00.000Z",
                    maxCalibrationAgeHours: 168,
                },
                now,
            ),
        );
        assert.isFalse(
            isCalibratedServiceProfile(
                {
                    calibrationSampleCount: 4,
                    minimumSampleCount: 20,
                    confidenceBps: 9000,
                    lastCalibratedAt: "2026-08-25T12:00:00.000Z",
                    maxCalibrationAgeHours: 168,
                },
                now,
            ),
        );
        assert.isFalse(
            isCalibratedServiceProfile(
                {
                    calibrationSampleCount: 40,
                    minimumSampleCount: 20,
                    confidenceBps: 9000,
                    lastCalibratedAt: "2026-08-01T12:00:00.000Z",
                    maxCalibrationAgeHours: 168,
                },
                now,
            ),
        );
    });

    test("ranks reliability before speed and cost", ({ assert }) => {
        const options = [
            { id: "cheap-fast-low-confidence", confidenceBps: 7000, windowEndMs: 100, costMinor: 0 },
            { id: "reliable", confidenceBps: 9200, windowEndMs: 300, costMinor: 1000 },
            { id: "same-confidence-faster", confidenceBps: 9200, windowEndMs: 200, costMinor: 2000 },
        ];
        options.sort(comparePromiseOptions);
        assert.deepEqual(options.map((item) => item.id), ["same-confidence-faster", "reliable", "cheap-fast-low-confidence"]);
    });
});
