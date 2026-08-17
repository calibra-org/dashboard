import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
    "apps/api/database/migrations/1764000000000_create_decision_intelligence_kernel.ts",
    "apps/api/app/services/decision_intelligence_service.ts",
    "apps/api/app/controllers/admin/decision_intelligence_controller.ts",
    "apps/api/app/validators/admin/intelligence_validator.ts",
    "apps/api/start/routes/admin_decision_intelligence.ts",
    "apps/admin/src/features/intelligence/DecisionIntelligenceWorkspace.tsx",
    "apps/admin/src/lib/queries/intelligence.ts",
    "apps/admin/src/app/[locale]/(authenticated)/analytics/decision-intelligence/page.tsx",
    "docs/api/reference/openapi/admin.phase10.v1.yaml",
    "apps/api/tests/functional/admin/decision_intelligence.spec.ts",
    "apps/api/tests/unit/intelligence/decision_scoring.spec.ts",
];

const failures = [];
for (const file of requiredFiles) if (!existsSync(file)) failures.push(`missing ${file}`);

function source(path) {
    return readFileSync(path, "utf8");
}

if (failures.length === 0) {
    const migration = source(requiredFiles[0]);
    const service = source(requiredFiles[1]);
    const controller = source(requiredFiles[2]);
    const routes = source(requiredFiles[4]);
    const ui = source(requiredFiles[5]);
    const api = source(requiredFiles[8]);

    for (const table of ["intelligence_cases", "intelligence_evidence_links", "intelligence_decisions", "intelligence_action_records", "intelligence_outcome_records"]) {
        if (!migration.includes(`"${table}"`)) failures.push(`migration missing ${table}`);
    }
    for (const invariant of ["ENABLE ROW LEVEL SECURITY", "FORCE ROW LEVEL SECURITY", "tenant_isolation", "missing_components", "ranking_policy_version"]) {
        if (!migration.includes(invariant)) failures.push(`migration missing invariant ${invariant}`);
    }
    for (const sourceDomain of ["payment_attempts", "order_shipments", "support_tickets", "inventory_items", "seo_crawl_runs"]) {
        if (!service.includes(sourceDomain)) failures.push(`service missing landed source ${sourceDomain}`);
    }
    if (!service.includes('status: "dependency_not_landed"')) failures.push("source coverage must disclose unlanded dependencies");
    if (!service.includes('executionBoundary: "human_navigation_only"')) failures.push("Phase 10 must not bypass Phase 11 execution governance");
    if (!service.includes("scoreAvailableComponents")) failures.push("transparent scoring contract missing");
    if (!controller.includes("INTELLIGENCE_CASE_VERSION_CONFLICT")) failures.push("optimistic conflict contract missing");
    if (!routes.includes("/api/v1/admin/intelligence")) failures.push("admin intelligence route prefix missing");
    for (const surface of ["Action Inbox", "Evidence lineage", "Decision Memory", "Outcome Ledger", "تشریح امتیاز"]) {
        if (!ui.includes(surface)) failures.push(`workspace missing ${surface}`);
    }
    for (const path of ["/api/v1/admin/intelligence/inbox", "/api/v1/admin/intelligence/summary", "/api/v1/admin/intelligence/cases/{id}/decisions", "/api/v1/admin/intelligence/cases/{id}/outcomes"]) {
        if (!api.includes(path)) failures.push(`OpenAPI missing ${path}`);
    }
}

const forbiddenRoots = [".phase10/bootstrap"];
for (const root of forbiddenRoots) if (existsSync(root)) failures.push(`temporary artifact must be removed before release: ${root}`);

if (failures.length) {
    console.error("Phase 10 Decision Intelligence verifier failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("Phase 10 Decision Intelligence integration invariants verified.");
