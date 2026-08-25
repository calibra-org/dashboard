import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");
const must = (condition, message) => {
    if (!condition) throw new Error(message);
};

const migration = read("apps/api/database/migrations/1790000000000_create_objective_autonomy_os.ts");
const service = read("apps/api/app/services/objective_autonomy/objective_autonomy_service.ts");
const permissions = read("apps/api/app/services/objective_autonomy/permissions.ts");
const controller = read("apps/api/app/controllers/admin/objective_autonomy_controller.ts");
const validator = read("apps/api/app/validators/objective_autonomy/objective_autonomy_validator.ts");
const routes = read("apps/api/start/routes/admin_objective_autonomy.ts");
const openapi = read("docs/api/reference/openapi/admin.phase28.v1.yaml");
const apiDocsPackage = read("docs/api/package.json");
const mergeAdminSpec = read("docs/api/scripts/merge-admin-spec.js");
const generatedAdminSdk = read("packages/sdk/src/generated/admin.d.ts");

for (const marker of [
    "ENABLE ROW LEVEL SECURITY",
    "FORCE ROW LEVEL SECURITY",
    "autonomy_objectives",
    "autonomy_cycles",
    "autonomy_checkpoints",
    "autonomy_postmortems",
]) {
    must(migration.includes(marker), `Phase 28 migration contract missing: ${marker}`);
}
for (const marker of [
    "runScenario",
    "runPlan",
    "executeStep",
    "createMemory",
    "assertRiskWithinCeiling",
    "E_AUTONOMY_HIGH_RISK_AUTO_FORBIDDEN",
    "evaluateControlDecision",
    "phase22_registered_tools_only",
    "step.idempotency_key",
]) {
    must(service.includes(marker), `Phase 28 integration invariant missing: ${marker}`);
}
must(
    service.includes("manual_reviewed") && service.includes("phase28_postmortem"),
    "Phase 28 postmortem must feed Phase 26 Memory",
);
must(permissions.includes("E_AUTONOMY_SELF_LOCKOUT"), "Phase 28 access self-lockout protection missing");
must(controller.includes("dryRun: false"), "Phase 28 controller must make execution non-dry-run only");
must(!validator.includes("dry_run"), "Phase 28 external validator must not expose Phase 22 dry-run");
must(!openapi.includes("dry_run"), "Phase 28 OpenAPI must not expose Phase 22 dry-run");
for (const operation of [
    "adminObjectiveAutonomyOverview",
    "adminObjectiveAutonomyCreateObjective",
    "adminObjectiveAutonomyExecuteStep",
    "adminObjectiveAutonomyCheckpoint",
    "adminObjectiveAutonomyPostmortem",
    "adminObjectiveAutonomyAccessPreset",
]) {
    must(openapi.includes(operation), `Phase 28 OpenAPI operation missing: ${operation}`);
    must(generatedAdminSdk.includes(operation), `Phase 28 generated Admin SDK operation missing: ${operation}`);
}
must(apiDocsPackage.includes("build:json:admin-phase28"), "Phase 28 OpenAPI overlay is not registered in API docs build");
must(mergeAdminSpec.includes("Phase28ObjectiveAutonomyOverlay"), "Phase 28 OpenAPI overlay is not merged into admin spec");
for (const action of [
    "objective_autonomy.objective.create",
    "objective_autonomy.objective.activate",
    "objective_autonomy.objective.halt",
    "objective_autonomy.cycle.start",
    "objective_autonomy.step.execute",
    "objective_autonomy.checkpoint.record",
    "objective_autonomy.postmortem.create",
    "objective_autonomy.access.preset.apply",
]) {
    must(controller.includes(action), `strict audit action missing: ${action}`);
}
const postCount = (routes.match(/\.post\(/g) ?? []).length;
const limitedCount = (routes.match(/\.use\(adminWriteLimiter\)/g) ?? []).length;
must(postCount === limitedCount, "every Phase 28 mutation must use adminWriteLimiter");
console.log("PASS Phase 28 Objective-Driven Autonomous Commerce OS integrity gate");
