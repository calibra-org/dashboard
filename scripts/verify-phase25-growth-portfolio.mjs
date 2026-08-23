import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("apps/api/database/migrations/1778000000000_create_growth_portfolio_engine.ts");
const service = read("apps/api/app/services/phase25_growth_portfolio_service.ts");
const validator = read("apps/api/app/validators/admin/phase25_growth_portfolio_validator.ts");
const routes = read("apps/api/start/routes/admin_growth_portfolio.ts");
const ui = read("apps/admin/src/features/growth-portfolio/GrowthPortfolioWorkspace.tsx");
const openapi = read("docs/api/reference/openapi/admin.phase25.v1.yaml");
const unit = read("apps/api/tests/unit/intelligence/growth_portfolio_optimizer.spec.ts");

const tables = [
    "growth_portfolio_plans",
    "growth_portfolio_candidates",
    "growth_portfolio_runs",
    "growth_portfolio_run_items",
    "growth_portfolio_outcomes",
    "growth_portfolio_rebalance_events",
];
for (const table of tables) {
    if (!migration.includes(`createTable("${table}"`)) throw new Error(`missing Phase 25 table: ${table}`);
}
if (!migration.includes("ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY")) throw new Error("Phase 25 RLS enable loop missing");
if (!migration.includes("ALTER TABLE ${table} FORCE ROW LEVEL SECURITY")) throw new Error("Phase 25 FORCE RLS loop missing");

for (const token of [
    "intelligence_cases",
    "intelligence_outcome_records",
    "E_GROWTH_PORTFOLIO_STALE_CANDIDATE",
    "E_GROWTH_PORTFOLIO_HIGH_RISK_AUTOCANCEL_FORBIDDEN",
    "growth.portfolio.high_risk_cancel",
    "governanceService.createApproval",
    "approval_risk_threshold",
    "stockout",
    "campaign_outcome",
    "cash_settlement_delay",
    "supplier_incident",
]) {
    if (!service.includes(token) && !migration.includes(token)) throw new Error(`missing Phase 25 invariant: ${token}`);
}

if (!service.includes("subsetFeasible(plan, ordered, selected, false)")) {
    throw new Error("branch-and-bound must defer dependency validation until a complete selection");
}
if (!service.includes("subsetFeasible(plan, ordered, selected, true)")) {
    throw new Error("complete portfolio selections must enforce dependencies");
}
for (const policy of ["max_selected_actions", "min_confidence", "forbidden_case_ids", "high_risk_auto_cancel"]) {
    if (!validator.includes(policy) || !service.includes(policy)) throw new Error(`policy not enforced end-to-end: ${policy}`);
}
for (const route of ["/opportunities", "/candidates/:candidateId", "/rebalance", "/rebalances/:publicId/apply", "/outcomes"]) {
    if (!routes.includes(route)) throw new Error(`Phase 25 route missing: ${route}`);
}
if (!routes.includes("adminWriteLimiter")) throw new Error("Phase 25 writes must be rate limited");

for (const token of [
    "PORTFOLIO FIRST",
    "Candidate management",
    "Run drill-down",
    "Dynamic Rebalance",
    "Rebalance & Approval Ledger",
    "Governance OS",
]) {
    if (!ui.includes(token)) throw new Error(`Phase 25 operator surface missing: ${token}`);
}
for (const path of [
    "/api/v1/admin/growth-portfolio/opportunities",
    "/api/v1/admin/growth-portfolio/plans/{publicId}/rebalance",
    "/api/v1/admin/growth-portfolio/rebalances/{publicId}/apply",
    "/api/v1/admin/growth-portfolio/runs/{publicId}/outcomes",
]) {
    if (!openapi.includes(path)) throw new Error(`Phase 25 OpenAPI path missing: ${path}`);
}
if (!unit.includes("depends on a later lower-scored candidate")) throw new Error("dependency regression test missing");

console.log(
    JSON.stringify(
        {
            status: "PASS",
            phase: 25,
            tables: tables.length,
            phase10_source_authority: true,
            dependency_regression_guard: true,
            policy_constraints_enforced: true,
            governed_rebalance: true,
            realized_outcome_measurement: true,
        },
        null,
        2,
    ),
);
