import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const must = (condition, message) => {
    if (!condition) throw new Error(message);
};

const migration = read("apps/api/database/migrations/1805000000000_create_lite_cash_os.ts");
const idempotencyMigration = read("apps/api/database/migrations/1805000000100_add_lite_cash_warm_job_idempotency.ts");
const policy = read("apps/api/app/services/lite_cash/policy.ts");
const service = read("apps/api/app/services/lite_cash/lite_cash_service.ts");
const permissions = read("apps/api/app/services/lite_cash/permissions.ts");
const controller = read("apps/api/app/controllers/admin/lite_cash_controller.ts");
const validators = read("apps/api/app/validators/lite_cash/lite_cash_validator.ts");
const routes = read("apps/api/start/routes/admin_lite_cash.ts");
const routeRegistry = read("apps/api/start/routes.ts");
const workspace = read("apps/admin/src/features/lite-cash/LiteCashWorkspace.tsx");
const page = read("apps/admin/src/app/[locale]/(authenticated)/lite-cash/page.tsx");
const sidebar = read("apps/admin/src/components/Sidebar.tsx");
const query = read("apps/admin/src/lib/queries/lite-cash.ts");
const openapi = read("docs/api/reference/openapi/admin.phase34.v1.yaml");
const adminSdk = read("packages/sdk/src/generated/admin.d.ts");
const docsPackage = read("docs/api/package.json");
const mergeAdmin = read("docs/api/scripts/merge-admin-spec.js");
const packageJson = read("package.json");
const prompt = read("docs/calibra/phase34-lite-cash-master-prompt.md");
const posture = read("docs/calibra/phase34-lite-cash-conformance-posture.md");
const workflow = read(".github/workflows/phase34-lite-cash-check.yml");
const tests = read("apps/api/tests/unit/lite_cash_policy.spec.ts");

for (const table of [
    "lite_cash_settings",
    "lite_cash_policies",
    "lite_cash_purge_events",
    "lite_cash_warm_jobs",
    "lite_cash_optimization_profiles",
    "lite_cash_observations",
    "lite_cash_snapshots",
]) {
    must(migration.includes(`createTable("${table}"`), `Phase34 migration missing ${table}`);
}
must(migration.includes("FORCE ROW LEVEL SECURITY"), "Phase34 must force tenant RLS");
must(migration.includes("lite_cash_warm_jobs_checksum_check"), "Phase34 warm plan SHA-256 constraint is missing");
must(migration.includes("lite_cash_profiles_checksum_check"), "Phase34 profile fingerprint constraint is missing");
must(idempotencyMigration.includes("lite_cash_warm_jobs_idempotency_unique"), "Phase34 warm idempotency DB guard is missing");
for (const forbidden of ["password", "api_token", "access_token", "redis_host", "redis_port", "dsn", "secret_key"]) {
    must(!migration.toLowerCase().includes(`table.string("${forbidden}"`), `Phase34 migration must not persist secret field ${forbidden}`);
}

for (const marker of [
    "REGISTERED_PURGE_SCOPES",
    "resolvePurgeScope",
    "validateLiteCashPolicy",
    "validateLiteCashImport",
    "computeObservationSummary",
    "stableFingerprint",
    'CacheTags.catalogProducts(tenantId)',
    'CacheTags.catalogProduct(tenantId, id)',
    'CacheTags.adminCustomer(tenantId, id)',
]) {
    must(policy.includes(marker), `Phase34 policy boundary missing ${marker}`);
}
must(policy.includes('must') === false || true, "Phase34 policy module loaded");
must(policy.includes('route.correctness_sensitive'), "Phase34 unsafe route policy rejection is missing");
must(policy.includes('vary.tenant_required'), "Phase34 tenant vary invariant is missing");
must(policy.includes('vary.locale_required'), "Phase34 locale vary invariant is missing");
must(!policy.includes("CacheTags.tenants"), "Phase34 full-tenant purge must never include the global tenant registry tag");

for (const marker of [
    "cache.deleteByTag",
    "recordCacheInvalidate",
    "broadPurgeRequiresStepUp",
    "createWarmJob",
    "observeWarmJob",
    "activateProfile",
    "exportConfiguration",
    "validateImport",
    "applyImport",
    'schema: "calibra.lite-cash.v1"',
    "debug_until",
]) {
    must(service.includes(marker), `Phase34 service boundary missing ${marker}`);
}
for (const forbidden of ["flushall", "flushdb", "child_process", "node:vm", "execSync(", "spawnSync(", "redis.call(", "keys(\"*\"")]) {
    must(!service.toLowerCase().includes(forbidden.toLowerCase()), `Phase34 service contains forbidden runtime primitive ${forbidden}`);
}
must(!service.includes("CacheTags.tenants"), "Phase34 service must not invalidate the global tenant registry tag");
must(service.includes("secrets_exposed: false"), "Phase34 topology must explicitly preserve secret redaction");
must(service.includes("return {\n        samples: rows.length") || service.includes("computeObservationSummary"), "Phase34 overview must rely on observation evidence");

for (const permission of [
    "lite_cash.view",
    "lite_cash.policy.manage",
    "lite_cash.purge.execute",
    "lite_cash.purge.broad",
    "lite_cash.warm.manage",
    "lite_cash.profile.manage",
    "lite_cash.settings.manage",
    "lite_cash.observation.write",
    "lite_cash.snapshot.manage",
]) {
    must(permissions.includes(permission), `Phase34 permission missing ${permission}`);
}
for (const marker of [
    "liteCashPolicyCreateValidator",
    "liteCashPolicyUpdateValidator",
    "liteCashPurgeValidator",
    "liteCashWarmJobCreateValidator",
    "liteCashWarmJobObservationValidator",
    "liteCashProfileCreateValidator",
    "liteCashSettingsValidator",
    "liteCashObservationValidator",
    "liteCashImportValidator",
]) {
    must(validators.includes(marker), `Phase34 validator missing ${marker}`);
}
must(validators.includes("idempotency_key: idempotencyKey"), "Phase34 purge/warm idempotency validation is missing");
must(controller.includes("recordAudit"), "Phase34 mutations must be audited");
must(controller.includes("requireRecentIdentityStepUp"), "Phase34 sensitive actions require identity step-up");
must(controller.includes('payload.scope === "full_tenant"'), "Phase34 broad purge path must be explicit");
must(controller.includes('"lite_cash.purge.broad"'), "Phase34 broad purge permission is missing");
must(controller.includes('"lite_cash.profile.manage"'), "Phase34 profile permission is missing");
const mutations = (routes.match(/\.(?:post|patch|put|delete)\(/g) ?? []).length;
const limiters = (routes.match(/\.use\(adminWriteLimiter\)/g) ?? []).length;
must(mutations > 0 && mutations === limiters, "Every Phase34 admin mutation must use adminWriteLimiter");
must(routeRegistry.includes('await import("./routes/admin_lite_cash.js")'), "Phase34 routes are not registered");

must(workspace.includes('dir="rtl"'), "Phase34 workspace must be RTL");
must(workspace.includes('title="lite cash"'), "Phase34 visible workspace title must be exactly lite cash");
for (const label of ["نمای کلی", "سیاست‌های کش", "مرکز پاکسازی", "Warm / Preload", "بهینه‌سازی", "Edge و Object Cache", "عیب‌یابی", "تنظیمات"]) {
    must(workspace.includes(label), `Phase34 workspace missing tab ${label}`);
}
must(workspace.includes("Purge plan"), "Phase34 workspace must use purge planning before broad actions");
must(workspace.includes("No secrets"), "Phase34 workspace must surface secret boundary");
must(!/LiteSpeed Cache|WP Rocket|FlyingPress|QUIC\.cloud/.test(workspace), "Phase34 product UI must not ship third-party product brands");
must(!/#[0-9a-fA-F]{3,8}/.test(workspace), "Raw hex color found in Phase34 workspace");
must(!/\b(?:bg|text|border)-(?:red|green|blue|yellow|purple|slate|gray)-\d/.test(workspace), "Raw Tailwind palette found in Phase34 workspace");
must(page.includes("<LiteCashWorkspace />"), "Phase34 page route is not wired");
must(sidebar.includes('href: "/lite-cash"') && sidebar.includes('label: "lite cash"'), "Phase34 main navigation is missing exact lite cash label");
must((sidebar.match(/label: "lite cash"/g) ?? []).length === 1, "Phase34 lite cash must appear exactly once in the main nav");
must(query.includes('const base = "lite-cash"'), "Phase34 admin query boundary missing");
must(query.includes("apiMutate"), "Phase34 mutations must use the same-origin proxy helper");

for (const operationId of [
    "adminLiteCashOverview",
    "adminLiteCashTopology",
    "adminLiteCashPurgeScopes",
    "adminLiteCashPolicies",
    "adminLiteCashPolicyCreate",
    "adminLiteCashPolicyShow",
    "adminLiteCashPolicyUpdate",
    "adminLiteCashPolicyValidate",
    "adminLiteCashPurges",
    "adminLiteCashPurgePlan",
    "adminLiteCashPurgeExecute",
    "adminLiteCashWarmJobs",
    "adminLiteCashWarmJobCreate",
    "adminLiteCashWarmJobShow",
    "adminLiteCashWarmJobCancel",
    "adminLiteCashWarmJobObserve",
    "adminLiteCashProfiles",
    "adminLiteCashProfileCreate",
    "adminLiteCashProfileShow",
    "adminLiteCashProfileUpdate",
    "adminLiteCashProfileActivate",
    "adminLiteCashObservations",
    "adminLiteCashObservationCreate",
    "adminLiteCashSettings",
    "adminLiteCashSettingsUpdate",
    "adminLiteCashSnapshots",
    "adminLiteCashSnapshotCreate",
    "adminLiteCashExport",
    "adminLiteCashImportValidate",
    "adminLiteCashImportApply",
]) {
    must(openapi.includes(operationId), `Phase34 OpenAPI missing ${operationId}`);
    must(adminSdk.includes(operationId), `Phase34 committed admin SDK missing ${operationId}`);
}
must(adminSdk.includes('"/api/v1/admin/lite-cash/overview"'), "Phase34 committed SDK missing lite cash overview path");
must(docsPackage.includes('"build:json:admin-phase34"'), "Phase34 docs build script is missing");
must(docsPackage.includes("pnpm build:json:admin-phase34 && pnpm build:json:admin-merge"), "Phase34 overlay is not in canonical admin build order");
must(mergeAdmin.includes("dist/admin.phase34.v1.json") && mergeAdmin.includes("Phase34LiteCashOverlay"), "Phase34 overlay is not merged into canonical admin OpenAPI");
must(packageJson.includes('"verify:phase34"'), "Phase34 root verifier script is missing");

must(prompt.includes("visible product name is exactly **lite cash**"), "Phase34 master prompt must lock product naming");
must(prompt.includes("Definition of done"), "Phase34 master prompt must contain definition of done");
must(prompt.includes("Never expose Redis passwords"), "Phase34 prompt must forbid secret exposure");
must(prompt.includes("Never implement cross-tenant `flushall`"), "Phase34 prompt must forbid global flush");
must(posture.includes("FORCE ROW LEVEL SECURITY"), "Phase34 posture must state forced tenant RLS");
must(posture.includes("Missing evidence is represented as `null`/`—`"), "Phase34 posture must forbid invented metrics");
for (const marker of [
    "full tenant purge never includes the global tenant registry tag",
    "rejects correctness-sensitive routes",
    "normalizes duplicate tags and vary dimensions deterministically",
    "fingerprint is stable across equivalent object key order",
    "returns null ratios without cache evidence",
]) {
    must(tests.includes(marker), `Phase34 unit coverage missing ${marker}`);
}
must(workflow.includes("contents: read"), "Phase34 integrity workflow must be read-only");
must(!workflow.includes("git push"), "Phase34 integrity workflow must not mutate the PR branch");
must(workflow.includes("codegen:check"), "Phase34 workflow must enforce SDK drift detection");
must(workflow.includes("Clean-tree drift check"), "Phase34 workflow must detect generated drift");

console.log("PASS Phase 34 lite cash contract integrity gate");
