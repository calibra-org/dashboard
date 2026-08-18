#!/usr/bin/env node
import fs from "node:fs";

const failures = [];
let checks = 0;
const read = (p) => fs.readFileSync(p, "utf8");
const check = (v, m) => {
    checks++;
    if (!v) failures.push(m);
};

const migration = read("apps/api/database/migrations/1763000000000_create_phase9_personalization_deals.ts");
const hardening = read("apps/api/database/migrations/1763001000000_harden_phase9_master_dod.ts");
for (const table of [
    "personalization_events",
    "personalization_profiles",
    "personalization_consents",
    "recommendation_exposures",
    "deal_campaigns",
    "deal_campaign_products",
    "personalization_placements",
])
    check(migration.includes(`"${table}"`), `migration missing ${table}`);
for (const table of [
    "personalization_feature_registry",
    "personalization_policies",
    "personalization_models",
    "personalization_rollouts",
    "personalization_preferences",
    "personalization_identity_merges",
    "personalization_projection_cursors",
    "deal_reservations",
    "deal_redemptions",
])
    check(hardening.includes(`"${table}"`), `hardening migration missing ${table}`);
for (const source of [migration, hardening]) {
    for (const needle of ["ENABLE ROW LEVEL SECURITY", "FORCE ROW LEVEL SECURITY", "app.current_tenant", "tenant_isolation"])
        check(source.includes(needle), `tenant isolation missing ${needle}`);
}
for (const status of ["scheduled", "preheat", "active", "paused", "sold_out", "expired", "cancelled"])
    check(hardening.includes(`'${status}'`), `deal lifecycle missing ${status}`);

const service = read("apps/api/app/services/phase9_personalization_service.ts");
for (const needle of [
    "ProductTransformer",
    "controlled_random",
    "category_affinity",
    "brand_affinity",
    "recommendation_exposures",
    "consent",
    "currentTrx",
    "currentTenantId",
])
    check(service.includes(needle), `service missing ${needle}`);
const productTransformer = read("apps/api/app/transformers/product_transformer.ts");
check(productTransformer.includes("resolvePrice"), "canonical ProductTransformer must use resolvePrice");
check(!service.includes("Math.random()"), "raw Math.random forbidden for controlled rotation");
check(!service.includes("discount_minor"), "Phase 9 must not create a second discount calculation");

const identity = read("apps/api/app/services/phase9_event_identity_service.ts");
for (const needle of [
    "PHASE9_EVENT_VOCABULARY",
    "personalization_identity_merges",
    "mergeAnonymousIntoCustomer",
    "personalization_preferences",
])
    check(identity.includes(needle), `identity/event service missing ${needle}`);
check(
    identity.includes('.whereNot("customer_id", customerId)') && identity.includes("visitor_already_linked_to_another_customer"),
    "identity/event service missing account-switch guard",
);
const governance = read("apps/api/app/services/phase9_governance_service.ts");
for (const needle of [
    "personalization_feature_registry",
    "personalization_policies",
    "personalization_models",
    "personalization_rollouts",
    "rollback",
])
    check(governance.includes(needle), `governance service missing ${needle}`);
const dealGuard = read("apps/api/app/services/phase9_deal_guard_service.ts");
for (const needle of [
    "getDiscounter",
    "forUpdate",
    "quantity_limit",
    "deal_reservations",
    "deal_redemptions",
    "consumeOrder",
    "preheat",
    "sold_out",
])
    check(dealGuard.includes(needle), `deal guard missing ${needle}`);
const orderFinalizer = read("apps/api/app/services/order_finalizer.ts");
check(orderFinalizer.includes("Phase9DealGuardService"), "order finalizer missing Phase9 deal integration");
check(orderFinalizer.includes("consumeOrder(Number(draft.id))"), "successful order must consume deal reservation");

const publicRoutes = read("apps/api/start/routes/personalization.ts");
for (const route of ["/events", "/events/batch", "/recommendations/serve", "/recommendations/serve-page"])
    check(publicRoutes.includes(route), `canonical public route missing ${route}`);
check(
    publicRoutes.includes('.prefix("/api/v1/personalization")') && publicRoutes.includes('router.get("/preferences"'),
    "canonical public route missing /api/v1/personalization/preferences",
);
const adminRoutes = read("apps/api/start/routes/admin_personalization.ts");
for (const route of [
    "/features",
    "/policies",
    "/models",
    "/rollouts",
    "/registry/:kind/:key/:version/activate",
    "/registry/:kind/:key/rollback",
    "/campaigns/:id/transition/:target",
])
    check(adminRoutes.includes(route), `admin governance route missing ${route}`);

const admin = read("apps/admin/src/views/personalization/personalization-workspace.tsx");
check(admin.includes("HelperTooltip"), "admin help tooltips missing");
check(admin.includes("useProductsList"), "real product picker missing");
check(!admin.includes('from "lucide-react"'), "direct lucide import forbidden");
const sidebar = read("apps/admin/src/components/Sidebar.tsx");
check(sidebar.includes("/products/amazing-deals"), "sidebar route missing");
check(
    sidebar.indexOf("/products/amazing-deals") > sidebar.indexOf('href: "/products"'),
    "amazing deals must appear after Products",
);
const routes = read("apps/api/start/routes.ts");
check(routes.includes("personalization.js"), "public route registry missing");
check(routes.includes("admin_personalization.js"), "admin route registry missing");
const home = read("apps/web/src/app/[locale]/page.tsx");
check(home.includes("AmazingDealsSection"), "storefront home section missing");
const docsAdmin = read("docs/api/reference/openapi/admin.phase9.v1.yaml"),
    docsStore = read("docs/api/reference/openapi/storefront.phase9.v1.yaml");
for (const needle of [
    "/api/v1/admin/personalization/features",
    "/api/v1/admin/personalization/models",
    "/api/v1/admin/personalization/rollouts",
])
    check(docsAdmin.includes(needle), `admin Phase9 OpenAPI missing ${needle}`);
for (const needle of [
    "/api/v1/events",
    "/api/v1/events/batch",
    "/api/v1/recommendations/serve",
    "/api/v1/recommendations/serve-page",
])
    check(docsStore.includes(needle), `storefront Phase9 OpenAPI missing ${needle}`);
const fa = JSON.parse(read("apps/admin/messages/personalization/fa.json"));
check(fa.Nav?.amazingDeals === "پیشنهادات شگفت‌انگیز", "Persian nav copy missing");
check(Boolean(fa.Personalization?.help?.killSwitch), "kill switch help copy missing");
if (failures.length) {
    console.error(`Phase 9 verifier failed: ${failures.length}/${checks}`);
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
}
console.log(`Phase 9 verifier passed: ${checks} checks`);
