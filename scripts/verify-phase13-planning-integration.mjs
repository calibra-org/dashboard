import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];
const expect = (condition, message) => {
    if (!condition) failures.push(message);
};

const migration = read("apps/api/database/migrations/1766000000000_create_phase13_planning_os.ts");
const engine = read("apps/api/app/services/planning_forecast_engine.ts");
const service = read("apps/api/app/services/phase13_planning_service.ts");
const route = read("apps/api/start/routes/admin_planning.ts");
const routes = read("apps/api/start/routes.ts");

for (const table of [
    "planning_forecast_runs",
    "planning_forecast_points",
    "planning_replenishment_recommendations",
    "planning_cycles",
    "planning_scenarios",
    "planning_overrides",
    "planning_approvals",
]) {
    expect(
        migration.includes(`FORCE ROW LEVEL SECURITY`) && migration.includes(table),
        `${table} must participate in tenant RLS`,
    );
}
expect(
    migration.includes("p10_quantity >= 0 AND p50_quantity >= p10_quantity AND p90_quantity >= p50_quantity"),
    "forecast quantile ordering must be database-constrained",
);
expect(
    migration.includes('table.bigInteger("location_id").unsigned().nullable()'),
    "planning must retain the current advisory location dimension",
);
expect(migration.includes('defaultTo("phase14_procurement_only")'), "replenishment must not execute procurement before Phase 14");
expect(
    migration.includes('defaultTo("available_not_applied")'),
    "Phase 13 must record that landed Phase 12 economics is available but not yet applied to planning optimization",
);
expect(migration.includes('table.boolean("actual_censored")'), "actual evaluation must retain stockout censoring evidence");
expect(migration.includes('table.integer("accuracy_censored_points")'), "run diagnostics must count censored evaluation points");

for (const token of ["p10", "p50", "p90", "wape", "bias", "intervalCoverage", "stockout", "imputedDemand"]) {
    expect(engine.includes(token), `forecast engine missing ${token}`);
}
expect(
    service.includes('"li.sku_snapshot"') && service.includes('"li.name_snapshot"'),
    "planning demand must use authoritative historical line snapshots",
);
expect(service.includes('"li.price_snapshot"'), "planning must preserve observed historical price input");
expect(service.includes("stableTuples"), "source hashing must be deterministic across query row ordering");
expect(!service.includes("cutoff: cutoff.toISO()"), "source hash must not change only because execution time changed");
expect(
    service.includes("product_category_links") && service.includes("same_versioned_forecast_points"),
    "category forecast must derive from the same versioned point truth",
);
expect(service.includes('const ECONOMICS_STATUS = "available_not_applied"'), "Phase 12 planning status must be explicit");
expect(service.includes('phase12_economics: "landed"'), "Phase 12 dependency state must reflect the landed Economics OS");
expect(service.includes('const EXECUTION_BOUNDARY = "phase14_procurement_only"'), "Phase 14 execution boundary must be explicit");
expect(
    route.includes('middleware.auth({ guards: ["api"] })') && route.includes("middleware.admin()"),
    "planning routes must enforce API auth and admin RBAC",
);
expect(route.includes("adminWriteLimiter"), "planning mutations must use the existing write limiter");
expect(routes.includes('await import("./routes/admin_planning.js")'), "root route registry must load Phase 13 planning routes");
expect(
    service.includes("actual_censored: actualCensored"),
    "accuracy refresh must persist censoring state instead of treating stockout zeros as full demand",
);
const openapi = read("docs/api/reference/openapi/admin.phase13.v1.yaml");
expect(openapi.includes("/api/v1/admin/planning/forecast/categories:"), "OpenAPI must publish category forecast");
expect(openapi.includes("actual_censored"), "OpenAPI must expose censor-aware actual evaluation");
const workspace = read("apps/admin/src/features/planning/PlanningWorkspace.tsx");
expect(
    workspace.includes("P10") && workspace.includes("P50") && workspace.includes("P90"),
    "control tower must visualize probabilistic forecast bands",
);
expect(
    workspace.includes("Phase 12") && workspace.includes("Phase 14"),
    "control tower must disclose hard dependency and execution boundaries",
);

if (failures.length) {
    console.error("Phase 13 planning integration verification failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}
console.log("Phase 13 planning integration verification passed.");
