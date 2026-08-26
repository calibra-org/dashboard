import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const must = (condition, message) => {
    if (!condition) throw new Error(message);
};

const migration = read("apps/api/database/migrations/1803000000000_create_reliability_guardian_os.ts");
const service = read("apps/api/app/services/reliability_guardian/reliability_guardian_service.ts");
const permissions = read("apps/api/app/services/reliability_guardian/permissions.ts");
const controller = read("apps/api/app/controllers/admin/reliability_guardian_controller.ts");
const routes = read("apps/api/start/routes/admin_reliability_guardian.ts");
const routeRegistry = read("apps/api/start/routes.ts");
const workspace = read("apps/admin/src/features/reliability-guardian/ReliabilityGuardianWorkspace.tsx");
const query = read("apps/admin/src/lib/queries/reliability-guardian.ts");

for (const table of [
    "reliability_remediation_policies",
    "reliability_invariants",
    "reliability_incidents",
    "reliability_evaluations",
    "reliability_remediation_runs",
    "reliability_scorecards",
]) {
    must(migration.includes(`createTable(\"${table}\"`), `Phase32 migration missing ${table}`);
}
must(migration.includes("FORCE ROW LEVEL SECURITY"), "Phase32 tenant RLS must be forced");
must(migration.includes("NOT auto_execute OR risk_level = 'low'"), "Database must forbid medium/high/critical auto-remediation");
must(migration.includes("idempotency_key"), "Remediation idempotency evidence is missing");
must(migration.includes("cooldown_seconds") && migration.includes("max_executions_per_hour"), "Remediation execution budgets are missing");

for (const marker of [
    "phase24_synthetic_commerce",
    "phase31_fulfillment_promise",
    "ConfigurationRevisionService",
    "Phase17ExperimentationService",
    "pg_advisory_xact_lock",
    "approval_required",
    "auto_execute && policy.risk_level === \"low\"",
    "assertExecutionBudget",
    "rollbackRemediation",
    "next_invariant_cycle",
    "no_evidence",
]) {
    must(service.includes(marker), `Phase32 service boundary missing ${marker}`);
}
must(!service.includes("Math.random"), "Reliability Guardian may not synthesize evidence");
must(service.includes('from("synthetic_commerce_runs as run")'), "Phase32 must reuse Phase24 synthetic run evidence");
must(service.includes('from("fulfillment_promise_outcomes as outcome")'), "Phase32 must reuse Phase31 measured outcomes");
must(!/createTable\(["'](?:synthetic_commerce_runs|fulfillment_promise_outcomes|configuration_revisions|experiments)/.test(migration), "Phase32 must not create a parallel canonical truth store");

for (const permission of [
    "reliability_guardian.view",
    "reliability_guardian.invariant.manage",
    "reliability_guardian.policy.manage",
    "reliability_guardian.cycle.run",
    "reliability_guardian.remediation.execute",
    "reliability_guardian.remediation.rollback",
]) {
    must(permissions.includes(permission), `Phase32 permission missing ${permission}`);
}
must(controller.includes("requireRecentIdentityStepUp"), "Sensitive remediation requires identity step-up");
must(controller.includes("recordAudit"), "Phase32 mutations must be audited");
const mutations = (routes.match(/\.post\(/g) ?? []).length;
const limiters = (routes.match(/\.use\(adminWriteLimiter\)/g) ?? []).length;
must(mutations === limiters, "Every Phase32 admin mutation must use adminWriteLimiter");
must(routeRegistry.includes('await import("./routes/admin_reliability_guardian.js")'), "Phase32 routes are not registered");

must(workspace.includes('dir="rtl"'), "Phase32 workspace must be RTL");
must(workspace.includes("Auto فقط Low-risk"), "Phase32 workspace must explain automation risk boundary");
must(!/#[0-9a-fA-F]{3,8}/.test(workspace), "Raw hex color found in Phase32 workspace");
must(!/\b(?:bg|text|border)-(?:red|green|blue|yellow|purple|slate|gray)-\d/.test(workspace), "Raw Tailwind palette found in Phase32 workspace");
must(query.includes('const base = "reliability-guardian"'), "Phase32 admin query boundary missing");

console.log("PASS Phase 32 Reliability Guardian & Self-Healing contract integrity gate");
