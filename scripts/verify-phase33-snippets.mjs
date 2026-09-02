import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const must = (condition, message) => {
    if (!condition) throw new Error(message);
};

const migration = read("apps/api/database/migrations/1804000000000_create_snippets_os.ts");
const service = read("apps/api/app/services/snippets/snippets_service.ts");
const permissions = read("apps/api/app/services/snippets/permissions.ts");
const controller = read("apps/api/app/controllers/admin/snippets_controller.ts");
const validators = read("apps/api/app/validators/snippets/snippets_validator.ts");
const routes = read("apps/api/start/routes/admin_snippets.ts");
const routeRegistry = read("apps/api/start/routes.ts");
const workspace = read("apps/admin/src/features/snippets/SnippetsWorkspace.tsx");
const page = read("apps/admin/src/app/[locale]/(authenticated)/snippets/page.tsx");
const sidebar = read("apps/admin/src/components/Sidebar.tsx");
const query = read("apps/admin/src/lib/queries/snippets.ts");
const openapi = read("docs/api/reference/openapi/admin.phase33.v1.yaml");
const docsPackage = read("docs/api/package.json");
const mergeAdmin = read("docs/api/scripts/merge-admin-spec.js");
const prompt = read("docs/calibra/phase33-snippets-master-prompt.md");
const posture = read("docs/calibra/phase33-snippets-conformance-posture.md");
const workflow = read(".github/workflows/phase33-snippets-check.yml");

for (const table of ["snippets", "snippet_revisions", "snippet_deployments", "snippet_executions", "snippet_settings"]) {
    must(migration.includes(`createTable("${table}"`), `Phase33 migration missing ${table}`);
}
must((migration.match(/FORCE ROW LEVEL SECURITY/g) ?? []).length >= 1, "Phase33 must force tenant RLS");
must(migration.includes("source_sha256"), "Phase33 revision checksum evidence is missing");
must(migration.includes("idempotency_key"), "Phase33 deployment idempotency is missing");
must(migration.includes("safe_mode"), "Phase33 Safe Mode persistence is missing");
must(migration.includes("auto_quarantine_threshold"), "Phase33 auto-quarantine threshold is missing");
must(migration.includes("snippet_deployments_rollout_check"), "Phase33 rollout boundary is missing");
must(migration.includes("snippet_revisions_checksum_check"), "Phase33 SHA-256 persistence constraint is missing");

for (const marker of [
    'createHash("sha256")',
    "simulateConditions",
    "source_executed: false",
    'boundary: "managed_artifact_no_eval"',
    'code: "source.dynamic_eval"',
    'code: "source.process_spawn"',
    'code: "source.filesystem_mutation"',
    'code: "source.registry_required"',
    'throw new Exception("Safe Mode blocks publishing"',
    "success_rate: executions.length === 0 ? null",
    "auto_quarantine_threshold",
    'status: shouldQuarantine ? "quarantined" : snippet.status',
    "source_sha256",
    "idempotency_key",
]) {
    must(service.includes(marker), `Phase33 service boundary missing ${marker}`);
}
must(!service.includes("child_process\""), "Phase33 service must not import child_process");
must(!service.includes("node:vm"), "Phase33 service must not import node:vm");
must(!service.includes("node:fs"), "Phase33 service must not import filesystem execution helpers");
must(!service.includes("execFile("), "Phase33 service must not execute child processes");
must(!service.includes("source_executed: true"), "Phase33 simulation must never claim source execution");

for (const permission of [
    "snippets.view",
    "snippets.create",
    "snippets.edit",
    "snippets.validate",
    "snippets.publish",
    "snippets.rollback",
    "snippets.settings.manage",
    "snippets.safe_mode.manage",
    "snippets.execution.observe",
]) {
    must(permissions.includes(permission), `Phase33 permission missing ${permission}`);
}

for (const marker of ["snippetCreateValidator", "snippetUpdateValidator", "snippetPublishValidator", "snippetRollbackValidator", "snippetSettingsValidator"]) {
    must(validators.includes(marker), `Phase33 validator missing ${marker}`);
}
must(controller.includes("recordAudit"), "Phase33 mutations must be strictly audited");
must(controller.includes("requireRecentIdentityStepUp"), "Phase33 sensitive operations require identity step-up");
must(controller.includes('"snippets.safe_mode.manage"'), "Phase33 Safe Mode must have dedicated permission");
const mutations = (routes.match(/\.(?:post|patch)\(/g) ?? []).length;
const limiters = (routes.match(/\.use\(adminWriteLimiter\)/g) ?? []).length;
must(mutations > 0 && mutations === limiters, "Every Phase33 admin mutation must use adminWriteLimiter");
must(routeRegistry.includes('await import("./routes/admin_snippets.js")'), "Phase33 routes are not registered");

must(workspace.includes('dir="rtl"'), "Phase33 workspace must be RTL");
must(workspace.includes('title="Snippets"'), "Phase33 visible workspace title must be exactly Snippets");
must(workspace.includes("Safe Mode"), "Phase33 workspace must expose Safe Mode");
must(workspace.includes("Revision"), "Phase33 workspace must expose immutable revision workflow");
must(workspace.includes("Auto Quarantine"), "Phase33 workspace must surface automatic quarantine");
must(workspace.includes("No eval"), "Phase33 workspace must explain the execution boundary");
must(!/Calibra Snippets|Code Snippets/.test(workspace), "Phase33 must use the product name Snippets only");
must(!/#[0-9a-fA-F]{3,8}/.test(workspace), "Raw hex color found in Phase33 workspace");
must(
    !/\b(?:bg|text|border)-(?:red|green|blue|yellow|purple|slate|gray)-\d/.test(workspace),
    "Raw Tailwind palette found in Phase33 workspace",
);
must(page.includes("<SnippetsWorkspace />"), "Phase33 page route is not wired to the workspace");
must(sidebar.includes('href: "/snippets"') && sidebar.includes('label: "Snippets"'), "Phase33 main navigation is missing exact Snippets label");
must(query.includes('const base = "snippets"'), "Phase33 admin query boundary missing");
must(query.includes("apiMutate"), "Phase33 client mutations must use the same-origin admin proxy helper");

for (const operationId of [
    "adminSnippetsOverview",
    "adminSnippetsList",
    "adminSnippetsCreate",
    "adminSnippetsShow",
    "adminSnippetsUpdate",
    "adminSnippetsValidate",
    "adminSnippetsSimulate",
    "adminSnippetsPublish",
    "adminSnippetsPause",
    "adminSnippetsResume",
    "adminSnippetsRollback",
    "adminSnippetsRevisions",
    "adminSnippetsDeployments",
    "adminSnippetsExecutions",
    "adminSnippetsExecutionObserve",
    "adminSnippetsSettings",
    "adminSnippetsSettingsUpdate",
    "adminSnippetsSafeModeEnable",
    "adminSnippetsSafeModeDisable",
    "adminSnippetsLibrary",
]) {
    must(openapi.includes(operationId), `Phase33 OpenAPI missing ${operationId}`);
}
must(docsPackage.includes('"build:json:admin-phase33"'), "Phase33 docs build script is missing");
must(
    docsPackage.includes("pnpm build:json:admin-phase33 && pnpm build:json:admin-merge"),
    "Phase33 overlay is not in canonical admin build order",
);
must(
    mergeAdmin.includes("dist/admin.phase33.v1.json") && mergeAdmin.includes("Phase33SnippetsOverlay"),
    "Phase33 overlay is not merged into canonical admin OpenAPI",
);
must(prompt.includes("Visible product name") || prompt.includes("visible product name"), "Phase33 master prompt must lock product naming");
must(prompt.includes("Definition of done"), "Phase33 master prompt must contain a definition of done");
must(prompt.includes("Never use `eval`"), "Phase33 master prompt must forbid arbitrary evaluation");
must(posture.includes("Missing observations produce **no execution evidence**"), "Phase33 posture must forbid invented health evidence");
must(posture.includes("forced tenant RLS"), "Phase33 posture must state tenant isolation");
must(workflow.includes("contents: read"), "Phase33 integrity workflow must be read-only");
must(!workflow.includes("git push"), "Phase33 integrity workflow must not mutate the PR branch");
must(workflow.includes("codegen:check"), "Phase33 integrity workflow must enforce SDK drift detection");
must(workflow.includes("Clean-tree drift check"), "Phase33 workflow must detect generated drift");

console.log("PASS Phase 33 Snippets contract integrity gate");
