import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "apps/api/app/services/fulfillment_promise/promise_service.ts");
let source = fs.readFileSync(file, "utf8");
function replaceOnce(oldText, nextText, marker) {
    if (source.includes(marker)) return;
    const count = source.split(oldText).length - 1;
    if (count !== 1) throw new Error(`Phase31 policy materializer anchor mismatch: ${marker} (${count})`);
    source = source.replace(oldText, nextText);
}
replaceOnce(
    'import type Order from "#models/order";',
    'import type Order from "#models/order";\nimport { comparePromiseOptions, isCalibratedServiceProfile, isInventoryFreshAt } from "#services/fulfillment_promise/policy";',
    'from "#services/fulfillment_promise/policy"',
);
replaceOnce(
`function calibratedProfile(profile: DbRow, now: DateTime): boolean {
    const sampleCount = numberValue(profile.calibration_sample_count);
    const minimum = Math.max(1, numberValue(profile.minimum_sample_count));
    const calibratedAt = asDateTime(profile.last_calibrated_at);
    if (sampleCount < minimum || !calibratedAt) return false;
    const maxAgeHours = Math.max(1, numberValue(profile.max_calibration_age_hours));
    if (calibratedAt.plus({ hours: maxAgeHours }) < now) return false;
    return numberValue(profile.confidence_bps) > 0;
}`,
`function calibratedProfile(profile: DbRow, now: DateTime): boolean {
    return isCalibratedServiceProfile(
        {
            calibrationSampleCount: numberValue(profile.calibration_sample_count),
            minimumSampleCount: Math.max(1, numberValue(profile.minimum_sample_count)),
            confidenceBps: numberValue(profile.confidence_bps),
            lastCalibratedAt: asDateTime(profile.last_calibrated_at)?.toISO() ?? null,
            maxCalibrationAgeHours: Math.max(1, numberValue(profile.max_calibration_age_hours)),
        },
        now.toISO()!,
    );
}`,
    'return isCalibratedServiceProfile(',
);
replaceOnce(
    '        if (!observed.isValid || observed.plus({ minutes: staleMinutes }) < now) return null;',
    '        if (!observed.isValid || !isInventoryFreshAt(observed.toISO(), staleMinutes, now.toISO()!)) return null;',
    '!isInventoryFreshAt(observed.toISO(), staleMinutes, now.toISO()!)',
);
replaceOnce(
    '        if (observed.plus({ minutes: Math.max(1, numberValue(sourceNode.inventory_stale_after_minutes)) }) < now) {',
    '        if (!isInventoryFreshAt(observed.toISO(), Math.max(1, numberValue(sourceNode.inventory_stale_after_minutes)), now.toISO()!)) {',
    '!isInventoryFreshAt(observed.toISO(), Math.max(1, numberValue(sourceNode.inventory_stale_after_minutes))',
);
replaceOnce(
    '    options.sort((a, b) => b.confidence_bps - a.confidence_bps || a.window_end_at.localeCompare(b.window_end_at) || a.cost_minor - b.cost_minor);',
    '    options.sort((a, b) => comparePromiseOptions(\n        { confidenceBps: a.confidence_bps, windowEndMs: new Date(a.window_end_at).getTime(), costMinor: a.cost_minor },\n        { confidenceBps: b.confidence_bps, windowEndMs: new Date(b.window_end_at).getTime(), costMinor: b.cost_minor },\n    ));',
    'comparePromiseOptions(',
);
fs.writeFileSync(file, source, "utf8");
console.log("Phase 31 promise policy materialized");
