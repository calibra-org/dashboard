import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const must = (condition, message) => {
    if (!condition) throw new Error(message);
};

const migration = read("apps/api/database/migrations/1802000000000_create_hyperlocal_promise_fulfillment_os.ts");
const splitMigration = read("apps/api/database/migrations/1802000000001_support_split_fulfillment_promise_quotes.ts");
const holdMigration = read("apps/api/database/migrations/1802000000002_add_fulfillment_capacity_holds.ts");
const service = read("apps/api/app/services/fulfillment_promise/promise_service.ts");
const capacity = read("apps/api/app/services/fulfillment_promise/capacity_service.ts");
const permissions = read("apps/api/app/services/fulfillment_promise/permissions.ts");
const adminRoutes = read("apps/api/start/routes/admin_fulfillment_promise.ts");
const publicRoutes = read("apps/api/start/routes/fulfillment_promise_storefront.ts");
const publicController = read("apps/api/app/controllers/fulfillment_promise_storefront_controller.ts");
const routes = read("apps/api/start/routes.ts");
const checkout = read("apps/api/app/controllers/checkout/submit_controller.ts");
const ui = read("apps/admin/src/features/fulfillment-promise/FulfillmentPromiseWorkspace.tsx");
const sidebar = read("apps/admin/src/components/Sidebar.tsx");
const posture = read("docs/calibra/phase31-fulfillment-promise-conformance-posture.md");
const adminOpenapi = read("docs/api/reference/openapi/admin.phase31.v1.yaml");
const storefrontOpenapi = read("docs/api/reference/openapi/storefront.phase31.v1.yaml");
const docsPackage = read("docs/api/package.json");
const mergeAdmin = read("docs/api/scripts/merge-admin-spec.js");
const mergeStorefront = read("docs/api/scripts/merge-storefront-spec.js");

for (const table of [
    "fulfillment_network_nodes",
    "fulfillment_node_inventory_sources",
    "fulfillment_capacity_windows",
    "fulfillment_service_profiles",
    "fulfillment_transfer_lanes",
    "fulfillment_promise_quotes",
    "fulfillment_allocation_recommendations",
    "fulfillment_promise_outcomes",
]) {
    must(migration.includes(table), `Phase31 migration missing ${table}`);
}
must(migration.includes("inventory_item_id") && migration.includes('inTable("inventory_items")'), "Phase31 must reuse canonical inventory_items");
must(migration.includes('inTable("shipping_zone_methods")'), "Phase31 must reuse canonical shipping zone methods");
must(migration.includes('inTable("order_shipments")'), "Phase31 outcomes must attach to canonical shipments");
must(!/createTable\(["'](?:inventory_items|inventory_movements|order_fulfillments|order_shipments|shipping_zone_methods)/.test(migration), "Phase31 introduced a competing canonical truth table");
must(migration.includes("inventory_stale_after_minutes"), "Inventory freshness budget missing");
must(migration.includes("calibration_sample_count") && migration.includes("last_calibrated_at"), "Service calibration evidence missing");
must(migration.includes("capacity_units") && migration.includes("reserved_units"), "Capacity model missing");
must(migration.includes("destination_fingerprint"), "Promise persistence must avoid raw destination data");
must(migration.includes("ENABLE ROW LEVEL SECURITY") && migration.includes("FORCE ROW LEVEL SECURITY"), "Phase31 tenant RLS missing");
must(splitMigration.includes("strategy = 'single_location'"), "Split/single anchor constraint missing");

for (const marker of ["fulfillment_capacity_holds", "promise_quote_id", "capacity_window_id", "idempotency_key", "expires_at", "FORCE ROW LEVEL SECURITY"]) {
    must(holdMigration.includes(marker), `Phase31 capacity hold migration missing ${marker}`);
}
for (const marker of ["forUpdate()", "capacity_units", "reserved_units", "holdPromiseCapacity", "releasePromiseCapacity", "commitPromiseCapacity", "releaseExpiredCapacityHolds", "E_PROMISE_CAPACITY_EXHAUSTED"]) {
    must(capacity.includes(marker), `Phase31 capacity concurrency boundary missing ${marker}`);
}
must(publicController.includes("releaseExpiredCapacityHolds"), "Expired capacity must be reclaimed before storefront quoting");

for (const marker of [
    "enumerateShippingRates",
    "inventory_items",
    "inventory_stale_after_minutes",
    "isInventoryFreshAt",
    "isCalibratedServiceProfile",
    "fulfillment_capacity_windows",
    "destinationFingerprint",
    "lineFingerprint",
    "checkoutGuard",
    "commitOrderPromise",
    "order_shipment_events",
    'event.status", "delivered"',
]) {
    must(service.includes(marker), `Phase31 service boundary missing ${marker}`);
}
must(service.includes("if (!publicId) return null"), "Unconfigured Promise OS must not globally block checkout");
must(!service.includes("Math.random"), "Promise engine must not synthesize ETA evidence");
must(!/weather|carbon/i.test(service), "Unimplemented weather/carbon inputs must not be presented as runtime truth");

for (const permission of [
    "fulfillment_promise.view",
    "fulfillment_promise.node.manage",
    "fulfillment_promise.capacity.manage",
    "fulfillment_promise.service.manage",
    "fulfillment_promise.allocation.view",
    "fulfillment_promise.outcome.manage",
    "fulfillment_promise.access.manage",
]) {
    must(permissions.includes(permission), `Phase31 permission missing ${permission}`);
}
must(permissions.includes("Self lockout is forbidden"), "Access self-lockout protection missing");

const adminMutations = (adminRoutes.match(/\.(post|patch|put|delete)\(/g) ?? []).length;
const adminLimiters = (adminRoutes.match(/\.use\(adminWriteLimiter\)/g) ?? []).length;
must(adminMutations === adminLimiters, "Every Phase31 admin mutation must use adminWriteLimiter");
const publicMutations = (publicRoutes.match(/\.post\(/g) ?? []).length;
const publicLimiters = (publicRoutes.match(/\.use\(contentPublicLimiter\)/g) ?? []).length;
must(publicMutations === publicLimiters, "Every Phase31 public mutation must use contentPublicLimiter");
must(routes.includes('await import("./routes/admin_fulfillment_promise.js")'), "Admin Phase31 routes not registered");
must(routes.includes('await import("./routes/fulfillment_promise_storefront.js")'), "Storefront Phase31 routes not registered");

const reviewedGuard = checkout.indexOf("await assertTrustAllowsCheckout");
const scorerGuard = checkout.indexOf("await phase20TrustRiskService.checkoutGuard");
const promiseGuard = checkout.indexOf("await fulfillmentPromise.checkoutGuard");
const capacityHold = checkout.indexOf("await fulfillmentCapacity.holdPromiseCapacity");
const finalize = checkout.indexOf("orderFinalizer.finalize");
const release = checkout.indexOf("await fulfillmentCapacity.releasePromiseCapacity");
const capacityCommit = checkout.indexOf("await fulfillmentCapacity.commitPromiseCapacity");
const consume = checkout.indexOf("await fulfillmentPromise.commitOrderPromise");
must(
    reviewedGuard >= 0 &&
        scorerGuard > reviewedGuard &&
        promiseGuard > scorerGuard &&
        capacityHold > promiseGuard &&
        finalize > capacityHold &&
        release > finalize &&
        capacityCommit > finalize &&
        consume > capacityCommit,
    "Checkout ordering must be Trust -> Promise revalidation -> capacity hold -> canonical finalization -> capacity/evidence commit",
);

must(ui.includes("HelperTooltip"), "Phase31 admin explainability helper missing");
must(ui.includes('dir="rtl"'), "Phase31 admin workspace must be RTL");
must(!/#[0-9a-fA-F]{3,8}/.test(ui), "Raw hex color found in Phase31 UI");
must(!/\b(?:bg|text|border)-(?:red|green|blue|yellow|purple|slate|gray)-\d/.test(ui), "Raw Tailwind palette found in Phase31 UI");
must(!/\b(?:mr|ml|pr|pl)-\d/.test(ui), "Physical RTL spacing class found in Phase31 UI");
must(sidebar.includes('href: "/analytics/fulfillment-promise"'), "Phase31 must have one contextual admin navigation entry");

for (const boundary of [
    "does **not** become the fulfillment",
    "Stale/unknown stock returns no promise",
    "Phase 20 reviewed trust guard",
    "must not invent ETA confidence",
]) {
    must(posture.includes(boundary), `Phase31 posture missing ${boundary}`);
}
for (const operationId of ["adminFulfillmentPromiseOverview", "adminFulfillmentPromiseNodes", "adminFulfillmentPromiseAccuracy", "adminFulfillmentPromiseAccessPreset"]) {
    must(adminOpenapi.includes(operationId), `Admin OpenAPI missing ${operationId}`);
}
for (const operationId of ["storefrontFulfillmentPromiseQuote", "storefrontFulfillmentPromiseSelect"]) {
    must(storefrontOpenapi.includes(operationId), `Storefront OpenAPI missing ${operationId}`);
}
must(docsPackage.includes('"build:json:admin-phase31"') && docsPackage.includes('"build:json:storefront-phase31"'), "Phase31 docs build scripts missing");
must(mergeAdmin.includes("dist/admin.phase31.v1.json") && mergeAdmin.includes("Phase31FulfillmentPromiseOverlay"), "Admin OpenAPI merge missing Phase31");
must(mergeStorefront.includes("phase30, phase31, discovery"), "Storefront OpenAPI order must insert Phase31 before discovery");

console.log("PASS Phase 31 Hyperlocal Promise & Fulfillment Network contract integrity gate");
