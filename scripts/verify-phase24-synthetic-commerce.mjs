import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("apps/api/database/migrations/1777000000000_create_synthetic_commerce_lab.ts");
const service = read("apps/api/app/services/phase24_synthetic_commerce_service.ts");
const routes = read("apps/api/start/routes/admin_synthetic_commerce.ts");
const ui = read("apps/admin/src/features/synthetic-commerce/SyntheticCommerceWorkspace.tsx");
const e2e = read("apps/admin/e2e/phase24-synthetic-commerce.spec.ts");
const openapi = read("docs/api/reference/openapi/admin.phase24.v1.yaml");

const tables = [
    "synthetic_commerce_environments",
    "synthetic_commerce_personas",
    "synthetic_commerce_seed_versions",
    "synthetic_commerce_scenarios",
    "synthetic_commerce_runs",
    "synthetic_commerce_gate_results",
    "synthetic_commerce_artifacts",
];
for (const table of tables) {
    if (!migration.includes(`createTable("${table}"`)) throw new Error(`missing Phase 24 table: ${table}`);
}
if (!migration.includes("ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY")) throw new Error("RLS enable loop missing");
if (!migration.includes("ALTER TABLE ${table} FORCE ROW LEVEL SECURITY")) throw new Error("RLS force loop missing");
if ((migration.match(/createTable\("synthetic_commerce_/g) ?? []).length !== 7)
    throw new Error("Phase 24 must own exactly seven synthetic-commerce tables");
for (const token of [
    "is_synthetic",
    "provider_mode",
    "stubbed",
    "analytics_mode",
    "isolated",
    "fixture_hash",
    "frozen",
    "journey_coverage",
    "false_alarm_gates",
]) {
    if (!migration.includes(token) && !service.includes(token)) throw new Error(`missing Phase 24 invariant: ${token}`);
}
for (const forbidden of ['table("orders")', 'table("payments")', 'table("inventory', 'table("refund']) {
    if (service.includes(forbidden)) throw new Error(`production mutation surface forbidden in Phase 24: ${forbidden}`);
}
if (!service.includes("synthetic:${tenant}:")) throw new Error("synthetic tenant namespace enforcement missing");
if (!service.includes("E_SYNTHETIC_FROZEN_SEED_REQUIRED")) throw new Error("frozen seed fail-closed guard missing");
if (!service.includes("E_SYNTHETIC_RUN_IMMUTABLE")) throw new Error("completed run immutability guard missing");
if (!service.includes("phase24/${publicId}/")) throw new Error("artifact namespace guard missing");
if (!routes.includes("adminWriteLimiter")) throw new Error("write limiter missing from Phase 24 routes");
for (const path of ["/overview", "/environments", "/personas", "/seeds", "/scenarios", "/runs"]) {
    if (!routes.includes(path)) throw new Error(`route surface missing: ${path}`);
}
for (const token of [
    "SYNTHETIC ONLY",
    "Provider Stubbed",
    "Analytics Isolated",
    "False Alarm",
    "Scenario Library",
    "Run Ledger",
    "HelperTooltip",
]) {
    if (!ui.includes(token)) throw new Error(`UI contract missing: ${token}`);
}
for (const token of ['trace: "retain-on-failure"', 'screenshot: "only-on-failure"', "آزمایشگاه پیش‌انتشار"]) {
    if (!e2e.includes(token)) throw new Error(`Playwright failure-artifact contract missing: ${token}`);
}
if (!openapi.includes("/api/v1/admin/synthetic-commerce/runs/{publicId}/report"))
    throw new Error("Phase 24 OpenAPI report endpoint missing");
console.log(
    JSON.stringify(
        {
            status: "PASS",
            phase: 24,
            tables: tables.length,
            synthetic_isolation: true,
            production_mutation: false,
            trace_contract: true,
        },
        null,
        2,
    ),
);
