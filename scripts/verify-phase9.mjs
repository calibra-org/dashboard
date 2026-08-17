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
for (const table of [
    "personalization_events",
    "personalization_profiles",
    "personalization_consents",
    "recommendation_exposures",
    "deal_campaigns",
    "deal_campaign_products",
    "personalization_placements",
])
    check(migration.includes(`\"${table}\"`), `migration missing ${table}`);
for (const needle of ["ENABLE ROW LEVEL SECURITY", "FORCE ROW LEVEL SECURITY", "app.current_tenant", "tenant_isolation"])
    check(migration.includes(needle), `migration missing ${needle}`);
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
check(docsAdmin.includes("/api/v1/admin/personalization"), "admin Phase9 OpenAPI missing");
check(docsStore.includes("/api/v1/personalization"), "storefront Phase9 OpenAPI missing");
const fa = JSON.parse(read("apps/admin/messages/personalization/fa.json"));
check(fa.Nav?.amazingDeals === "پیشنهادات شگفت‌انگیز", "Persian nav copy missing");
check(Boolean(fa.Personalization?.help?.killSwitch), "kill switch help copy missing");
if (failures.length) {
    console.error(`Phase 9 verifier failed: ${failures.length}/${checks}`);
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
}
console.log(`Phase 9 verifier passed: ${checks} checks`);
