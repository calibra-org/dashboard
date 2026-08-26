import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");
const must = (condition, message) => {
    if (!condition) throw new Error(message);
};

const migration = read("apps/api/database/migrations/1801000000000_create_retail_media_creator_os.ts");
const service = read("apps/api/app/services/retail_media/retail_media_service.ts");
const permissions = read("apps/api/app/services/retail_media/permissions.ts");
const controller = read("apps/api/app/controllers/admin/retail_media_controller.ts");
const storefrontController = read("apps/api/app/controllers/retail_media_storefront_controller.ts");
const adminRoutes = read("apps/api/start/routes/admin_retail_media.ts");
const storefrontRoutes = read("apps/api/start/routes/retail_media_storefront.ts");
const routes = read("apps/api/start/routes.ts");
const events = read("apps/api/start/events.ts");
const orderFactory = read("apps/api/app/services/order_factory.ts");
const workspace = read("apps/admin/src/features/retail-media/RetailMediaWorkspace.tsx");
const sidebar = read("apps/admin/src/components/Sidebar.tsx");
const adminOpenapi = read("docs/api/reference/openapi/admin.phase30.v1.yaml");
const storefrontOpenapi = read("docs/api/reference/openapi/storefront.phase30.v1.yaml");
const generatedAdminSdk = read("packages/sdk/src/generated/admin.d.ts");
const generatedStorefrontSdk = read("packages/sdk/src/generated/storefront.d.ts");
const docsPackage = read("docs/api/package.json");
const docsPackageJson = JSON.parse(docsPackage);
const mergeAdminSpec = read("docs/api/scripts/merge-admin-spec.js");
const mergeStorefrontSpec = read("docs/api/scripts/merge-storefront-spec.js");
const posture = read("docs/calibra/phase30-retail-media-conformance-posture.md");

for (const table of [
    "retail_media_advertisers",
    "retail_media_campaigns",
    "retail_media_campaign_products",
    "retail_media_placements",
    "retail_media_campaign_placements",
    "retail_media_budget_ledger",
    "retail_media_delivery_events",
    "retail_media_creators",
    "retail_media_affiliate_links",
    "retail_media_commission_ledger",
]) {
    must(migration.includes(`createTable("${table}"`), `Phase 30 table missing: ${table}`);
}
for (const marker of ["ENABLE ROW LEVEL SECURITY", "FORCE ROW LEVEL SECURITY", "app.current_tenant"]) {
    must(migration.includes(marker), `Phase 30 tenant isolation missing: ${marker}`);
}
must(migration.includes("privacy_min_cohort >= 20"), "Privacy cohort must have a hard database floor of 20");
must(migration.includes("entry_kind = 'refund' AND amount_minor < 0"), "Budget refund ledger entries must be negative");
must(
    migration.includes("entry_kind IN ('refund_adjustment','payout') AND amount_minor < 0"),
    "Creator refund/payout ledger entries must be negative",
);
must(migration.includes("retail_media_budget_idempotency_unique"), "Budget ledger requires idempotency uniqueness");
must(migration.includes("retail_media_commission_idempotency_unique"), "Commission ledger requires idempotency uniqueness");
must(!migration.includes('createTable("phase30_products"'), "Phase 30 must not create a parallel product master");
must(!migration.includes('createTable("phase30_orders"'), "Phase 30 must not create a parallel order master");
must(!migration.includes('createTable("phase30_inventory"'), "Phase 30 must not create a parallel inventory master");

for (const marker of [
    '"cp.safety_status": "approved"',
    '"product.status": "publish"',
    'where("cp.relevance_bps", ">="',
    'where("cp.quality_bps", ">="',
    "productAvailable",
    "budgetSnapshot",
    "rankEligibleRetailMediaCandidates(eligible)",
]) {
    must(service.includes(marker), `Sponsored eligibility/ranking guard missing: ${marker}`);
}
const rankCall = service.indexOf("rankEligibleRetailMediaCandidates(eligible)");
for (const marker of ["productAvailable", "budgetSnapshot", "const baseBid"]) {
    must(service.indexOf(marker) < rankCall, `${marker} must execute before the auction/ranking step`);
}
must(service.includes("a.relevance_bps * 0.7"), "Relevance must dominate the ranking score");
must(service.includes("a.quality_bps * 0.2"), "Quality must be a material ranking signal");
must(service.includes("* 0.1"), "Bid must remain a bounded 10% ranking signal");
must(service.includes("authorizedBudget = Math.min"), "Spend must be capped by configured budget and recorded funding");
must(service.includes(".forUpdate()"), "Budget and payout money paths require row locking");
must(service.includes("daily_pacing_cap_minor"), "Campaign daily pacing is missing");
must(service.includes("sponsored: true"), "Storefront sponsored decision must be explicit");
must(service.includes("disclosure: String(placement.disclosure_text)"), "Storefront disclosure is missing");
must(service.includes("assertPrivacySafeContext(input.context)"), "Public event context must be recursively privacy screened");
must(service.includes("calculateCreatorRefundAdjustment"), "Refund-aware creator reconciliation is missing");
must(service.includes('entry_kind: "refund_adjustment"'), "Refunds must append a creator adjustment ledger entry");
must(service.includes("amount_minor: -adjustment"), "Creator refund adjustments must be negative");
must(service.includes("experiment_causal_knowledge"), "Phase 30 measurement must reuse Phase 17 causal evidence");
must(service.includes("incremental_contribution_minor"), "Incremental contribution contract is missing");
must(service.includes("suppressed"), "Privacy threshold suppression is missing");

for (const permission of [
    "retail_media.view",
    "retail_media.campaign.manage",
    "retail_media.placement.manage",
    "retail_media.budget.manage",
    "retail_media.creator.manage",
    "retail_media.payout.manage",
    "retail_media.measurement.view",
    "retail_media.access.manage",
]) {
    must(permissions.includes(permission), `Phase 30 permission missing: ${permission}`);
}
must(permissions.includes("Self lockout is forbidden"), "Phase 30 access changes must prevent self-lockout");
must(controller.includes("strict: true"), "Every Phase 30 admin mutation requires strict audit logging");
for (const action of [
    "retail_media.campaign.status",
    "retail_media.campaign.fund",
    "retail_media.creator.payout.record",
    "retail_media.access.preset.apply",
]) {
    must(controller.includes(action), `Sensitive Phase 30 audit action missing: ${action}`);
}
must(
    controller.match(/requireRecentIdentityStepUp/g)?.length >= 4,
    "Sensitive money/access/state changes require recent identity step-up",
);
const mutationCount = (adminRoutes.match(/\.(post|patch)\(/g) ?? []).length;
const limiterCount = (adminRoutes.match(/\.use\(adminWriteLimiter\)/g) ?? []).length;
must(mutationCount === limiterCount, "Every Phase 30 admin mutation must use adminWriteLimiter");
must(storefrontRoutes.match(/contentPublicLimiter/g)?.length === 3, "Every Phase 30 public mutation must use the public limiter");
must(storefrontController.includes("retailMediaServeValidator"), "Storefront serve request must be validated");
must(routes.includes('await import("./routes/admin_retail_media.js")'), "Phase 30 admin routes are not registered");
must(routes.includes('await import("./routes/retail_media_storefront.js")'), "Phase 30 storefront routes are not registered");
must(events.includes("handleRetailMediaOrderCompleted"), "Creator settlement must hook canonical order completion");
must(events.includes("handleRetailMediaOrderRefunded"), "Creator refund reconciliation must hook canonical refund event");
must(
    orderFactory.includes("retail_media_attribution"),
    "Affiliate attribution must snapshot through canonical Cart -> Order attributes",
);

for (const label of ["نمای کلی", "کمپین‌ها", "جایگاه‌ها", "سازندگان", "اندازه‌گیری", "دسترسی"]) {
    must(workspace.includes(label), `Phase 30 workspace tab missing: ${label}`);
}
must(
    workspace.includes("ResponsiveContainer") && workspace.includes("BarChart"),
    "Phase 30 measurement requires real responsive charts",
);
must(workspace.includes("HelperTooltip"), "Phase 30 workspace must explain non-obvious controls");
must(workspace.includes('dir="rtl"'), "Phase 30 workspace must preserve Persian RTL layout");
must(!workspace.includes("Math.random"), "Phase 30 UI must not synthesize fake metrics");
must(sidebar.includes("/analytics/retail-media"), "Phase 30 must have one discoverable analytics navigation entry");

const adminOperations = [
    "adminRetailMediaOverview",
    "adminRetailMediaAdvertisers",
    "adminRetailMediaAdvertiserCreate",
    "adminRetailMediaCampaigns",
    "adminRetailMediaCampaignCreate",
    "adminRetailMediaCampaign",
    "adminRetailMediaCampaignUpdate",
    "adminRetailMediaCampaignStatus",
    "adminRetailMediaCampaignProductUpsert",
    "adminRetailMediaCampaignPlacementUpsert",
    "adminRetailMediaCampaignFund",
    "adminRetailMediaPlacements",
    "adminRetailMediaPlacementCreate",
    "adminRetailMediaPlacementStatus",
    "adminRetailMediaCreators",
    "adminRetailMediaCreatorCreate",
    "adminRetailMediaCreatorLinkCreate",
    "adminRetailMediaCreatorPayout",
    "adminRetailMediaCommissions",
    "adminRetailMediaMeasurement",
    "adminRetailMediaAccess",
    "adminRetailMediaAccessPreset",
];
for (const operationId of adminOperations) {
    must(adminOpenapi.includes(`operationId: ${operationId}`), `Admin Phase 30 OpenAPI operation missing: ${operationId}`);
    must(generatedAdminSdk.includes(operationId), `Generated Admin SDK operation missing: ${operationId}`);
}
for (const operationId of [
    "storefrontRetailMediaServePlacement",
    "storefrontRetailMediaRecordClick",
    "storefrontRetailMediaAffiliateTouch",
]) {
    must(storefrontOpenapi.includes(`operationId: ${operationId}`), `Storefront Phase 30 operation missing: ${operationId}`);
    must(generatedStorefrontSdk.includes(operationId), `Generated Storefront SDK operation missing: ${operationId}`);
}
must(
    storefrontOpenapi.includes("sponsored: { const: true }"),
    "Storefront contract must require explicit sponsored disclosure state",
);
must(
    storefrontOpenapi.includes("subject_hash") && !storefrontOpenapi.includes("customer_email"),
    "Storefront measurement contract must remain pseudonymous",
);
must(docsPackage.includes('"build:json:admin-phase30"'), "Phase 30 admin OpenAPI build script is missing");
must(docsPackage.includes('"build:json:storefront-phase30"'), "Phase 30 storefront OpenAPI build script is missing");
must(
    String(docsPackageJson.scripts?.["build:json:admin"] ?? "").includes("pnpm build:json:admin-phase30"),
    "Aggregate admin OpenAPI build must include Phase 30 before merge",
);
must(
    String(docsPackageJson.scripts?.["build:json:storefront"] ?? "").includes("pnpm build:json:storefront-phase30"),
    "Aggregate storefront OpenAPI build must include Phase 30 before merge",
);
must(!docsPackageJson.scripts?.["build:json:admin-parts"], "Phase 30 must not invent a non-canonical admin-parts aggregate");
must(
    !docsPackageJson.scripts?.["build:json:storefront-parts"],
    "Phase 30 must not invent a non-canonical storefront-parts aggregate",
);
must(
    mergeAdminSpec.includes("dist/admin.phase30.v1.json") && mergeAdminSpec.includes("Phase30RetailMediaOverlay"),
    "Admin OpenAPI merge is missing Phase 30",
);
must(
    mergeStorefrontSpec.includes(
        'const phase30 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase30.v1.json"), "utf8"));',
    ),
    "Storefront Phase 30 merge must load the Phase 30 bundle, not another phase",
);
must(mergeStorefrontSpec.includes("phase29, phase30, discovery"), "Storefront merge order must include Phase 30 exactly once");

for (const statement of [
    "does not create a parallel commerce master",
    "does **not** claim to transmit money to a payout provider",
    "does **not** claim IAB certification",
    "Incrementality is not inferred from attributed revenue",
]) {
    must(posture.includes(statement), `Phase 30 conformance posture missing: ${statement}`);
}

console.log("PASS Phase 30 Retail Media & Creator Monetization full-stack contract integrity gate");
