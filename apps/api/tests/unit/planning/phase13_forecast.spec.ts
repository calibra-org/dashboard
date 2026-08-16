import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { phase13PlanningInternals } from "#services/phase13_planning_service";

test.group("Phase 13 planning forecast baseline", () => {
    test("seasonal baseline is deterministic and intervals never go negative", ({ assert }) => {
        const cutoff = DateTime.fromISO("2026-08-16T00:00:00Z", { zone: "utc" });
        const byDay = new Map<string, number>();
        for (let offset = 0; offset < 56; offset += 1) {
            const day = cutoff.minus({ days: offset });
            byDay.set(day.toISODate()!, day.weekday === 7 ? 14 : 7);
        }
        const input = { productId: 10, variationId: null, sku: "SKU-10", name: "Test", byDay };
        const first = phase13PlanningInternals.forecastSeries(input, cutoff, 56, 14);
        const second = phase13PlanningInternals.forecastSeries(input, cutoff, 56, 14);
        assert.deepEqual(first, second);
        assert.equal(first.points.length, 14);
        assert.isTrue(first.points.every((point) => point.lower >= 0 && point.upper >= point.point));
        assert.equal(first.quality, "observed_sales");
    });

    test("sparse demand is truthfully marked insufficient instead of fabricating confidence", ({ assert }) => {
        const cutoff = DateTime.fromISO("2026-08-16T00:00:00Z", { zone: "utc" });
        const byDay = new Map<string, number>([[cutoff.minus({ days: 3 }).toISODate()!, 2]]);
        const result = phase13PlanningInternals.forecastSeries(
            { productId: 11, variationId: null, sku: "SKU-11", name: "Sparse", byDay },
            cutoff,
            56,
            7,
        );
        assert.equal(result.quality, "insufficient_data");
        assert.include(result.points[0]!.reasons, "LIMITED_HISTORY");
    });
});
