import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const sourcePath = "apps/api/app/services/fulfillment_promise/policy.ts";
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
        strict: true,
    },
    fileName: sourcePath,
    reportDiagnostics: true,
});

const errors = (compiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, `Phase 31 policy transpilation failed: ${errors.map((item) => item.messageText).join(" | ")}`);

const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(compiled.outputText)}`;
const { comparePromiseOptions, isCalibratedServiceProfile, isInventoryFreshAt } = await import(moduleUrl);

const now = "2026-08-26T12:00:00.000Z";
assert.equal(isInventoryFreshAt("2026-08-26T11:50:00.000Z", 15, now), true);
assert.equal(isInventoryFreshAt("2026-08-26T11:40:00.000Z", 15, now), false);
assert.equal(isInventoryFreshAt("2026-08-26T12:01:00.000Z", 15, now), false);
assert.equal(isInventoryFreshAt(null, 15, now), false);

assert.equal(
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
    true,
);
assert.equal(
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
    false,
);
assert.equal(
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
    false,
);

const options = [
    { id: "cheap-fast-low-confidence", confidenceBps: 7000, windowEndMs: 100, costMinor: 0 },
    { id: "reliable", confidenceBps: 9200, windowEndMs: 300, costMinor: 1000 },
    { id: "same-confidence-faster", confidenceBps: 9200, windowEndMs: 200, costMinor: 2000 },
];
options.sort(comparePromiseOptions);
assert.deepEqual(
    options.map((item) => item.id),
    ["same-confidence-faster", "reliable", "cheap-fast-low-confidence"],
);

console.log("Phase 31 runtime policy controls passed");
