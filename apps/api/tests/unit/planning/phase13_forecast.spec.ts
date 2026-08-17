import { test } from "@japa/runner";

import { computeReplenishment, forecastDemand } from "#services/planning_forecast_engine";

function history(days: number, options?: { stockoutEvery?: number }) {
    const start = new Date("2026-01-01T00:00:00.000Z");
    return Array.from({ length: days }, (_, index) => {
        const date = new Date(start);
        date.setUTCDate(date.getUTCDate() + index);
        const stockout = options?.stockoutEvery ? index % options.stockoutEvery === 0 : false;
        const weekday = date.getUTCDay();
        return {
            date: date.toISOString().slice(0, 10),
            observedDemand: stockout ? 0 : weekday === 5 ? 8 : 3,
            availability: stockout ? ("stockout" as const) : ("available" as const),
        };
    });
}

test.group("Phase 13 probabilistic demand forecast", () => {
    test("emits ordered P10/P50/P90 intervals and backtest metrics", ({ assert }) => {
        const result = forecastDemand(history(70), 14);
        assert.lengthOf(result.points, 14);
        assert.equal(result.diagnostics.quality, "ready");
        assert.isAtLeast(result.diagnostics.evaluatedDays, 4);
        assert.isNotNull(result.diagnostics.wape);
        assert.isNotNull(result.diagnostics.bias);
        assert.isNotNull(result.diagnostics.intervalCoverage);
        for (const point of result.points) {
            assert.isAtMost(point.p10, point.p50);
            assert.isAtMost(point.p50, point.p90);
            assert.isAtLeast(point.p10, 0);
        }
    });

    test("censors observed zero demand on reconstructed stockout days without hiding uncertainty", ({ assert }) => {
        const result = forecastDemand(history(70, { stockoutEvery: 9 }), 7);
        assert.isAbove(result.diagnostics.censoredDays, 0);
        assert.isAbove(result.diagnostics.imputedDemand, 0);
        assert.include(result.diagnostics.reasonCodes, "STOCKOUT_CENSORING_APPLIED");
        assert.isBelow(result.diagnostics.confidence, 0.95);
    });

    test("widens intervals instead of inventing confidence for sparse demand", ({ assert }) => {
        const sparse = history(40).map((row, index) => ({ ...row, observedDemand: index % 14 === 0 ? 1 : 0 }));
        const result = forecastDemand(sparse, 7);
        assert.equal(result.diagnostics.quality, "insufficient_data");
        assert.include(result.diagnostics.reasonCodes, "LIMITED_HISTORY_CONFIDENCE_WIDENED");
        assert.isAtMost(result.points[0]!.p10, result.points[0]!.p50);
        assert.isAtLeast(result.points[0]!.p90, result.points[0]!.p50);
    });
});

test.group("Phase 13 replenishment policy", () => {
    test("fails closed when lead time is unavailable", ({ assert }) => {
        const result = computeReplenishment({ onHand: 12, dailyP50: 3, dailyP90: 5, leadTimeDays: null, reviewPeriodDays: 7 });
        assert.equal(result.status, "needs_input");
        assert.isNull(result.suggestedQuantity);
        assert.include(result.reasonCodes, "LEAD_TIME_UNAVAILABLE");
    });

    test("explains safety stock and reorder point when lead time exists", ({ assert }) => {
        const result = computeReplenishment({ onHand: 10, dailyP50: 3, dailyP90: 5, leadTimeDays: 4, reviewPeriodDays: 7 });
        assert.equal(result.status, "ready");
        assert.equal(result.leadTimeDemandP50, 12);
        assert.equal(result.leadTimeDemandP90, 20);
        assert.equal(result.safetyStock, 8);
        assert.equal(result.reorderPoint, 20);
        assert.equal(result.targetStock, 55);
        assert.equal(result.suggestedQuantity, 45);
    });
});
