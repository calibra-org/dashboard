import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const service = read("apps/api/app/services/phase23_digital_twin_service.ts");
const migration = read("apps/api/database/migrations/1776000000000_create_commerce_digital_twin.ts");
const routes = read("apps/api/start/routes/admin_digital_twin.ts");
const rootRoutes = read("apps/api/start/routes.ts");
const validator = read("apps/api/app/validators/admin/phase23_digital_twin_validator.ts");
const ui = read("apps/admin/src/features/digital-twin/DigitalTwinWorkspace.tsx");
const openapi = read("docs/api/reference/openapi/admin.phase23.v1.yaml");
const docsPackage = read("docs/api/package.json");
const mergeSpec = read("docs/api/scripts/merge-admin-spec.js");

const required = (source, tokens, label) => {
    for (const token of tokens) {
        if (!source.includes(token)) throw new Error(`${label} missing contract token: ${token}`);
    }
};

required(service, [
    "commerce-twin-v1.1.0",
    "currentTenantId",
    "currentTrx",
    "planning_forecast_runs",
    "planning_source_hash",
    "seededUncertaintyAdjustment",
    "service_level_target",
    "service_level_gap",
    "recommendation_only_no_operational_mutation",
    "inputHash",
], "service");
required(migration, [
    "commerce_twin_scenarios",
    "commerce_twin_runs",
    "commerce_twin_results",
    "ENABLE ROW LEVEL SECURITY",
    "FORCE ROW LEVEL SECURITY",
    "app.current_tenant",
    "commerce_twin_runs_repro_unique",
    "commerce_twin_results_quantiles_check",
], "migration");
required(routes, ["/overview", "/scenarios", "/compare", "/sensitivity", "/decision-brief", "adminWriteLimiter"], "routes");
required(rootRoutes, ["./routes/admin_digital_twin.js"], "root routes");
required(validator, ["demand_multiplier", "price_multiplier", "cost_multiplier", "lead_time_multiplier", "capacity_multiplier", "service_level_target"], "validator");
required(ui, ["اتاق جنگ سناریو", "P10", "P90", "deterministic", "non-mutating"], "admin UI");
required(openapi, ["/api/v1/admin/digital-twin/overview", "/api/v1/admin/digital-twin/scenarios", "/decision-brief", "DigitalTwinAssumptions"], "OpenAPI");
required(docsPackage, ["build:json:admin-phase23", "admin.phase23.v1.yaml"], "docs package");
required(mergeSpec, ["admin.phase23.v1.json", "Phase23DigitalTwinOverlay"], "OpenAPI merge");

for (const forbidden of [
    '.update({ status: "completed" })',
    'from("orders").update',
    'from("inventory_items").update',
    'from("payments").update',
    'from("products").update',
]) {
    if (service.includes(forbidden)) throw new Error(`Phase 23 execution boundary violated: ${forbidden}`);
}

console.log("Phase 23 digital twin integration verified");
