import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const failures = [];
const ok = (condition, message) => {
    if (!condition) failures.push(message);
};

const initial = read("apps/api/database/migrations/1767600000000_create_phase20_trust_risk_os.ts");
const hardening = read("apps/api/database/migrations/1773000000000_harden_phase20_trust_risk_os.ts");
const legacyTables = [
    "fraud_risk_models",
    "fraud_risk_model_versions",
    "fraud_signals",
    "fraud_risk_scores",
    "fraud_decisions",
    "fraud_action_executions",
    "fraud_cases",
    "fraud_case_events",
    "fraud_subject_controls",
];
const additiveTables = ["fraud_relationship_edges", "fraud_case_evidence", "fraud_policy_versions", "fraud_outcomes"];
for (const table of legacyTables) ok(initial.includes(`"${table}"`), `initial Phase20 table missing ${table}`);
for (const table of additiveTables) ok(hardening.includes(`createTable("${table}"`), `hardening table missing ${table}`);
ok(
    initial.includes("ENABLE ROW LEVEL SECURITY") && initial.includes("FORCE ROW LEVEL SECURITY"),
    "initial RLS enable/force missing",
);
ok(
    hardening.includes("ENABLE ROW LEVEL SECURITY") && hardening.includes("FORCE ROW LEVEL SECURITY"),
    "additive RLS enable/force missing",
);
ok(
    hardening.includes("current_setting('app.current_tenant'") && hardening.includes("ALTER COLUMN tenant_id SET DEFAULT"),
    "tenant GUC/default hardening missing",
);
ok(
    !/createTable\(["'](?:orders|order_refunds|order_returns|payments|payment_attempts|trust_)/.test(hardening),
    "parallel canonical commerce/trust table introduced",
);
for (const token of [
    "correlation_id",
    "causation_id",
    "consent_context",
    "autonomy_ceiling",
    "input_snapshot",
    "verification",
    "predicted_p10_minor",
    "predicted_p50_minor",
    "predicted_p90_minor",
    "is_false_positive",
])
    ok(hardening.includes(token), `hardening contract missing ${token}`);
ok(
    hardening.includes("WITH ranked AS") && hardening.includes("rollback_ready"),
    "ambiguous Champion cleanup/rollback guard missing",
);

const routes = read("apps/api/start/routes/admin_trust_risk.ts");
const routeMatches = [...routes.matchAll(/router\s*\.\s*(get|post|patch|put|delete)\s*\(/g)];
const writeRouteChains = [
    ...routes.matchAll(/router\s*\.\s*(post|patch|put|delete)\s*\([^;]+;/gs),
].map((match) => match[0]);
ok(routeMatches.length === 20, `expected 20 Trust admin endpoints, found ${routeMatches.length}`);
ok(writeRouteChains.length === 11, `expected 11 Trust write endpoints, found ${writeRouteChains.length}`);
for (const chain of writeRouteChains)
    ok(chain.includes("adminWriteLimiter"), `write route missing limiter: ${chain.replace(/\s+/g, " ").trim()}`);
ok(
    read("apps/api/start/routes.ts").includes('await import("./routes/admin_trust_risk.js")'),
    "Trust route registry import missing",
);

const controller = read("apps/api/app/controllers/admin/trust_risk_controller.ts");
for (const scope of [
    "trust.case.enforce",
    "trust.case.override",
    "trust.policy.manage",
    "trust.model.manage",
    "trust.access.manage",
])
    ok(controller.includes(scope), `missing Phase7 step-up scope ${scope}`);
for (const permission of [
    "trust.view",
    "trust.cases.assign",
    "trust.cases.review",
    "trust.cases.override",
    "trust.sensitive.view",
    "trust.policies.manage",
    "trust.models.manage",
    "trust.outcomes.record",
    "trust.scan.run",
    "trust.access.manage",
])
    ok(read("apps/api/app/services/trust/permissions.ts").includes(permission), `permission registry missing ${permission}`);

const checkout = read("apps/api/app/controllers/checkout/submit_controller.ts");
const reviewedGuard = checkout.indexOf("await assertTrustAllowsCheckout");
const scorerGuard = checkout.indexOf("await phase20TrustRiskService.checkoutGuard");
const finalize = checkout.indexOf("orderFinalizer.finalize");
ok(
    reviewedGuard >= 0 && scorerGuard > reviewedGuard && finalize > scorerGuard,
    "checkout gates must precede finalization/payment side effects",
);
const action = read("apps/api/app/services/trust/action_service.ts");
ok(
    action.includes("orderStateMachine.transition") && action.includes("OrderStatus.OnHold"),
    "existing pending-order hold must use canonical OrderStateMachine",
);
ok(action.includes("idempotency_key") && action.includes("rollback_plan"), "action idempotency/rollback contract missing");
const caseService = read("apps/api/app/services/trust/case_service.ts");
ok(caseService.includes("replayDecision") && caseService.includes("replayed: true"), "decision replay semantics missing");
const signals = read("apps/api/app/services/trust/signal_service.ts");
for (const label of ["approved_agent", "unknown_automation", "abusive_bot"])
    ok(signals.includes(label), `automation class missing ${label}`);
ok(
    signals.includes('sourceStatus.returns = "unavailable"') && signals.includes('sourceStatus.automation = "not_configured"'),
    "single-phase capability gating is not explicit",
);
const adminService = read("apps/api/app/services/trust/admin_service.ts");
ok(adminService.includes("is_sensitive && !includeSensitive"), "permission-gated evidence redaction missing");
ok(
    adminService.includes("dry_run: true") && adminService.includes("side_effects: false"),
    "policy simulation must be side-effect free",
);
ok(
    adminService.includes("other_model.purpose") && adminService.includes("rollback_ready"),
    "Champion governance by model purpose missing",
);

const ui = read("apps/admin/src/features/trust/TrustWorkspace.tsx");
ok(ui.includes("HelperTooltip") && ui.includes("useTrustMutation"), "Trust UI explainability or mutations missing");
ok(!/#[0-9a-fA-F]{3,8}/.test(ui), "raw hex color found in Trust UI");
ok(!/\b(?:bg|text|border)-(?:red|green|blue|yellow|purple|slate|gray)-\d/.test(ui), "raw Tailwind palette found in Trust UI");
ok(!/\b(?:mr|ml|pr|pl)-\d/.test(ui), "physical RTL spacing class found in Trust UI");
ok(!/\b(?:demo|mock|fixture)[A-Z_]?/i.test(ui), "runtime mock/demo marker found in Trust UI");
const sidebar = read("apps/admin/src/components/Sidebar.tsx");
ok(
    sidebar.includes('navT("operations")') && sidebar.includes('navT("trust")'),
    "Operations → Quality & Trust parent navigation missing",
);
const pages = ["overview", "cases", "graph", "policies", "signals", "models"];
for (const page of pages)
    ok(
        existsSync(join(root, `apps/admin/src/app/[locale]/(authenticated)/quality-trust/${page}/page.tsx`)),
        `missing Trust page ${page}`,
    );
ok(
    existsSync(join(root, "apps/admin/src/app/[locale]/(authenticated)/quality-trust/cases/[publicId]/page.tsx")),
    "missing contextual case detail page",
);
for (const locale of ["fa", "en"]) {
    try {
        JSON.parse(read(`apps/admin/messages/trust/${locale}.json`));
    } catch {
        failures.push(`invalid ${locale} trust JSON`);
    }
}
const loader = read("apps/admin/src/lib/i18n/request.ts");
ok(
    loader.includes("messages/trust") && loader.includes("...trust.Nav") && loader.includes("...personalization"),
    "Trust i18n must merge without dropping existing catalogs",
);

const openapi = read("docs/api/reference/openapi/admin.trust.v1.yaml");
for (const path of [
    "/api/v1/admin/trust/overview",
    "/api/v1/admin/trust/cases",
    "/api/v1/admin/trust/graph",
    "/api/v1/admin/trust/policies",
    "/api/v1/admin/trust/models",
    "/api/v1/admin/trust/access",
])
    ok(openapi.includes(path), `OpenAPI missing ${path}`);
ok(read("docs/api/package.json").includes("build:json:admin-trust"), "OpenAPI build script missing");
ok(
    read("docs/api/scripts/merge-admin-spec.js").includes("admin.trust.v1.json") &&
        read("docs/api/scripts/merge-admin-spec.js").includes("admin.phase13.v1.json"),
    "OpenAPI merge must preserve prior overlays and add Trust",
);
const prompt = read("docs/calibra/PHASE20_EXECUTION_PROMPT_FA.md");
for (const token of ["فقط Phase 20", "سیستم موازی", "20 endpoint", "11 مسیر write", "G0–G10", "CI سبز"])
    ok(prompt.includes(token), `execution prompt missing ${token}`);

if (failures.length) {
    console.error(`Phase 20 completion verifier failed (${failures.length}):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}
console.log(
    `Phase 20 completion verifier: PASS (${legacyTables.length + additiveTables.length} tenant tables, ${routeMatches.length} endpoints, ${writeRouteChains.length} writes, ${pages.length + 1} UI routes)`,
);
