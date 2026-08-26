import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const must = (condition, message) => {
    if (!condition) throw new Error(message);
};

const routes = read("apps/api/start/routes.ts");
const checkout = read("apps/api/app/controllers/checkout/submit_controller.ts");
const sidebar = read("apps/admin/src/components/Sidebar.tsx");
const docsPackage = read("docs/api/package.json");
const mergeAdmin = read("docs/api/scripts/merge-admin-spec.js");
const mergeStorefront = read("docs/api/scripts/merge-storefront-spec.js");

must(routes.includes('await import("./routes/admin_fulfillment_promise.js")'), "Phase31 admin routes are not materialized");
must(routes.includes('await import("./routes/fulfillment_promise_storefront.js")'), "Phase31 storefront routes are not materialized");
must(checkout.includes('from "#services/fulfillment_promise/promise_service"'), "Phase31 checkout promise guard import is missing");
must(checkout.includes("await fulfillmentPromise.checkoutGuard(cart, draft)"), "Phase31 checkout promise guard is missing");
must(checkout.includes("await fulfillmentCapacity.holdPromiseCapacity(selectedPromiseId)"), "Phase31 capacity hold is missing");
must(checkout.includes("await fulfillmentCapacity.commitPromiseCapacity(selectedPromiseId"), "Phase31 capacity commit is missing");
must(checkout.includes("await fulfillmentPromise.commitOrderPromise(result.order, selectedPromiseId)"), "Phase31 promise evidence commit is missing");
must(sidebar.includes('href: "/analytics/fulfillment-promise"'), "Phase31 admin navigation is missing");
must(docsPackage.includes('"build:json:admin-phase31"'), "Phase31 admin OpenAPI build is missing");
must(docsPackage.includes('"build:json:storefront-phase31"'), "Phase31 storefront OpenAPI build is missing");
must(mergeAdmin.includes("dist/admin.phase31.v1.json") && mergeAdmin.includes("Phase31FulfillmentPromiseOverlay"), "Phase31 admin OpenAPI merge is missing");
must(mergeStorefront.includes("phase30, phase31, discovery"), "Phase31 storefront OpenAPI merge order is missing");

console.log("PASS Phase 31 integration is already materialized");
