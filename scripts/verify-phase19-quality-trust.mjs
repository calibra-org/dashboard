import { readFileSync, statSync } from "node:fs";

// Canonical Phase 19 final release verification entrypoint.
const read = (path) => readFileSync(path, "utf8");
const errors = [];
const expect = (condition, message) => {
    if (!condition) errors.push(message);
};
const migrationPath = "apps/api/database/migrations/1767500000000_create_phase19_quality_trust_os.ts";
const migration = read(migrationPath);
const service = read("apps/api/app/services/quality_trust_service.ts");
const permissions = read("apps/api/app/services/quality_permissions.ts");
const controller = read("apps/api/app/controllers/admin/quality_trust_controller.ts");
const routes = read("apps/api/start/routes/admin_quality.ts");
const centralRoutes = read("apps/api/start/routes.ts");
const workspace = read("apps/admin/src/features/quality/workspace.tsx");
const detail = read("apps/admin/src/features/quality/case-detail.tsx");
const nav = read("apps/admin/src/features/quality/quality-nav.tsx");
const openapi = read("docs/api/reference/openapi/admin.quality.v1.yaml");
const tables = [
    "quality_reason_definitions",
    "return_item_inspections",
    "quality_cases",
    "quality_case_sources",
    "quality_evidence",
    "quality_findings",
    "quality_signals",
    "feedback_classifications",
    "quality_actions",
    "quality_outcomes",
];
for (const table of tables) expect(migration.includes(`createTable("${table}"`), `missing table ${table}`);
expect(migration.includes("FORCE ROW LEVEL SECURITY") && migration.includes("const tenantTables"), "FORCE RLS loop missing");
expect(!migration.includes('createTable("suppliers"'), "duplicate supplier domain is forbidden");
expect(service.includes("QUALITY_CASE_FLOW") && service.includes("QUALITY_ACTION_FLOW"), "case/action state machine missing");
expect(service.includes("closure requires measured outcome or audited waiver"), "closure verification gate missing");
expect(
    service.includes("purchase_order_receipt_lines") && service.includes("supplier_incidents"),
    "Phase 14 receiving quality integration missing",
);
expect(
    service.includes('customer_return_supplier_attribution: "unavailable"'),
    "return-to-supplier attribution must fail closed without lot allocation",
);
expect(
    service.includes("receiving_exception_rate") && service.includes("return_rate_delivered_units"),
    "metric registry incomplete",
);
for (const permission of [
    "quality.view",
    "quality.cases.manage",
    "quality.inspections.manage",
    "quality.voc.manage",
    "quality.signals.manage",
    "quality.actions.manage",
    "quality.taxonomy.manage",
    "quality.audit.view",
])
    expect(permissions.includes(permission), `missing permission ${permission}`);
expect(controller.includes("requireQualityPermission") && controller.includes("strict: true"), "permission/audit guard missing");
expect((routes.match(/router\.(get|post|patch)/g) ?? []).length >= 24, "quality routes incomplete");
expect(centralRoutes.includes("admin_quality.js"), "central route import missing");
expect(
    workspace.includes("HelperTooltip") && detail.includes("HelperTooltip") && nav.includes("HelperTooltip"),
    "accessible information hints missing",
);
expect(!workspace.includes("Math.random") && !detail.includes("Math.random"), "mock UI data forbidden");
expect(
    workspace.includes("Receiving chain live") && workspace.includes("Return attribution unavailable"),
    "live Phase 14 supplier boundary UI missing",
);
expect((openapi.match(/^ {2}\/api\/v1\/admin\//gm) ?? []).length >= 24, "OpenAPI paths incomplete");
for (const route of [
    "overview",
    "cases",
    "signals",
    "returns",
    "voc",
    "suppliers",
    "actions",
    "taxonomy",
    "data-quality",
    "metrics",
    "governance",
])
    expect(
        statSync(`apps/admin/src/app/[locale]/(authenticated)/quality/${route}/page.tsx`).isFile(),
        `missing admin quality page ${route}`,
    );
expect(
    statSync("apps/admin/src/app/[locale]/(authenticated)/quality/cases/[id]/page.tsx").isFile(),
    "missing quality case detail route",
);
expect(
    detail.includes("closure_waiver_reason") && /\.outcomes\.length\s*===\s*0/.test(detail),
    "structured closure waiver UI missing",
);
if (errors.length) {
    console.error(`Phase 19 verifier FAIL (${errors.length})`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
}
console.log(
    `Phase 19 verifier PASS: ${tables.length} tenant RLS tables, 24+ API routes, 11 workspace sections, Phase 14 receiving integration and fail-closed return attribution.`,
);
