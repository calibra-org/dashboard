import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");
const must = (condition, message) => {
    if (!condition) throw new Error(message);
};

const migration = read("apps/api/database/migrations/1780000000000_create_network_intelligence_os.ts");
const service = read("apps/api/app/services/network_intelligence/network_service.ts");
const controller = read("apps/api/app/controllers/admin/network_intelligence_controller.ts");
const routes = read("apps/api/start/routes/admin_network_intelligence.ts");
const permissions = read("apps/api/app/services/network_intelligence/permissions.ts");
const locks = read("apps/api/app/services/network_intelligence/locks.ts");
const aggregate = read("scripts/aggregate-network-benchmarks.mjs");
const aggregationTests = read("scripts/test-phase27-network-aggregation.mjs");
const ui = read("apps/admin/src/features/network-intelligence/NetworkIntelligenceWorkspace.tsx");
const dock = read("apps/admin/src/features/network-intelligence/DecisionIntelligenceDock.tsx");
const queries = read("apps/admin/src/lib/queries/network-intelligence.ts");
const i18n = read("apps/admin/src/lib/i18n/request.ts");
const routesIndex = read("apps/api/start/routes.ts");
const docsPackage = read("docs/api/package.json");
const mergeSpec = read("docs/api/scripts/merge-admin-spec.js");
const openapi = read("docs/api/reference/openapi/admin.phase27.v1.yaml");

for (const marker of ["ENABLE ROW LEVEL SECURITY", "FORCE ROW LEVEL SECURITY", "minimum_cohort_size >= 5", "network_metric_bounds_check"]) {
    must(migration.includes(marker), `migration contract missing: ${marker}`);
}
must(service.includes("contains_peer_raw_records: false"), "peer raw export guard missing");
must(service.includes("assertAggregateOnlyNetworkPayload"), "aggregate-only request guard missing");
must(service.includes("definition_digest"), "metric semantic digest missing");
must(service.includes("E_NETWORK_CONTRIBUTION_OUT_OF_BOUNDS"), "contribution bound enforcement missing");
must(permissions.includes("E_NETWORK_SELF_LOCKOUT"), "access self-lockout protection missing");
must(locks.includes("pg_advisory_xact_lock"), "versioned policy/metric transaction lock missing");
must(controller.includes("findings: payload.findings ?? []"), "security review aggregate-only findings guard missing");
for (const action of [
    "network_intelligence.participation.set",
    "network_intelligence.metric_definition.create",
    "network_intelligence.contribution.upsert",
    "network_intelligence.export.create",
    "network_intelligence.security_review.record",
    "network_intelligence.access.preset.apply",
]) {
    must(controller.includes(action), `strict audit action missing: ${action}`);
}
const postCount = (routes.match(/\.post\(/g) ?? []).length;
const limitedCount = (routes.match(/\.use\(adminWriteLimiter\)/g) ?? []).length;
must(postCount === limitedCount, "every Phase 27 mutation must use adminWriteLimiter");
for (const marker of ["raw/identity field forbidden", "metric_bounds", "privacy budget exceeded", "randomBytes", "contains_peer_raw_records: false"]) {
    must(aggregate.includes(marker), `offline aggregate guard missing: ${marker}`);
}
must(!aggregate.includes("cfg.seed"), "deterministic public DP seed is forbidden");
must(aggregationTests.includes("PASS Phase 27 network aggregation privacy tests"), "aggregation regression suite missing");
must(ui.includes("HelperTooltip"), "UI help contract missing");
must(ui.includes("NetworkTabs"), "contextual Phase 27 navigation missing");
must(queries.includes("apiMutate") && queries.includes("apiGet"), "same-origin authenticated query wiring missing");
must(dock.includes("/decision-intelligence/network-intelligence/benchmarks"), "Decision Intelligence contextual Phase 27 entry missing");
must(i18n.includes("network_intelligence"), "Phase 27 i18n catalog wiring missing");
must(routesIndex.includes("admin_network_intelligence"), "Phase 27 route registry missing");
must(docsPackage.includes("build:json:admin-phase27"), "Phase 27 OpenAPI build wiring missing");
must(mergeSpec.includes("Phase27NetworkIntelligenceOverlay"), "Phase 27 OpenAPI merge wiring missing");
for (const path of [
    "/api/v1/admin/network-intelligence/overview",
    "/api/v1/admin/network-intelligence/metrics",
    "/api/v1/admin/network-intelligence/participation",
    "/api/v1/admin/network-intelligence/contributions",
    "/api/v1/admin/network-intelligence/benchmarks",
    "/api/v1/admin/network-intelligence/exports",
    "/api/v1/admin/network-intelligence/security-reviews",
    "/api/v1/admin/network-intelligence/access",
    "/api/v1/admin/network-intelligence/access/preset",
]) {
    must(openapi.includes(path), `Phase 27 OpenAPI route missing: ${path}`);
}

console.log("PASS Phase 27 Network Intelligence integrity gate");
