import assert from "node:assert/strict";
import { computeReplenishment, forecastDemand } from "../apps/api/app/services/planning_forecast_engine.ts";

const start = new Date("2026-05-01T00:00:00Z");
const history = Array.from({ length: 56 }, (_, index) => {
    const date = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10);
    const weekday = index % 7;
    const observedDemand = weekday === 4 || weekday === 5 ? 12 : 5;
    const stockout = index === 31 || index === 32;
    return { date, observedDemand: stockout ? 0 : observedDemand, availability: stockout ? "stockout" : "available" };
});

const forecast = forecastDemand(history, 14);
assert.equal(forecast.points.length, 14);
assert.ok(forecast.points.every((point) => point.p10 <= point.p50 && point.p50 <= point.p90));
assert.ok(forecast.diagnostics.censoredDays >= 2);
assert.ok(forecast.diagnostics.imputedDemand > 0);
assert.ok(forecast.diagnostics.wape === null || forecast.diagnostics.wape >= 0);
assert.ok(forecast.diagnostics.intervalCoverage === null || (forecast.diagnostics.intervalCoverage >= 0 && forecast.diagnostics.intervalCoverage <= 1));

const blocked = computeReplenishment({ onHand: 10, dailyP50: 5, dailyP90: 8, leadTimeDays: null, reviewPeriodDays: 7 });
assert.equal(blocked.status, "needs_input");
assert.equal(blocked.suggestedQuantity, null);

const ready = computeReplenishment({ onHand: 10, dailyP50: 5, dailyP90: 8, leadTimeDays: 4, reviewPeriodDays: 7 });
assert.equal(ready.status, "ready");
assert.ok((ready.safetyStock ?? 0) >= 0);
assert.ok((ready.reorderPoint ?? 0) >= 0);
assert.ok((ready.targetStock ?? 0) >= (ready.reorderPoint ?? 0));
console.log("Phase 13 forecast smoke passed.");
