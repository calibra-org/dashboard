import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const mustExist = [
    "docs/calibra/ADMIN_OPERATIONS_ROADMAP_2026-08-14.md",
    "docs/calibra/PHASE5_FULFILLMENT_ORDER_OPS_MASTER_PROMPT.md",
    "apps/api/database/migrations/1762000000000_create_phase5_order_operations.ts",
    "apps/api/database/phase5_schema.generated.ts",
    "apps/api/app/services/phase5_order_operations_service.ts",
    "apps/api/app/services/legacy_mark_shipped_service.ts",
    "apps/api/app/services/inventory_operations_service.ts",
    "apps/api/app/services/store_operations_config_service.ts",
    "apps/api/start/routes/admin_phase5_operations.ts",
    "apps/admin/src/features/operations/fulfillment-operations-card.tsx",
    "apps/admin/src/features/operations/inventory-operations-panel.tsx",
    "apps/admin/messages/operations/fa.json",
    "apps/admin/messages/operations/en.json",
    "docs/api/reference/openapi/admin.phase5.v1.yaml",
    "packages/sdk/src/generated/admin.phase5.d.ts",
    "apps/api/tests/functional/admin/phase5_operations.spec.ts",
];

for (const file of mustExist) {
    if (!fs.existsSync(file)) throw new Error(`Phase 5 required file is missing: ${file}`);
}

function assertContains(path, needles) {
    const source = read(path);
    for (const needle of needles) {
        if (!source.includes(needle)) throw new Error(`${path} is missing required invariant: ${needle}`);
    }
}

function assertNotContains(path, needles) {
    const source = read(path);
    for (const needle of needles) {
        if (source.includes(needle)) throw new Error(`${path} contains forbidden Phase 5 pattern: ${needle}`);
    }
}

assertContains("docs/calibra/ADMIN_OPERATIONS_ROADMAP_2026-08-14.md", [
    "Preservation rule",
    "Phase 1 — Payment Gateway Control Center — CLOSED",
    "Phase 4 — Transaction Operations Center — CLOSED",
    "Ticket Operations Center — CLOSED",
    "Phase 5 — Fulfillment & Order Operations — IN PROGRESS",
    "No new top-level Sidebar group or menu is allowed",
]);

assertContains("apps/api/start/routes/admin_phase5_operations.ts", [
    'prefix("/api/v1/admin")',
    'middleware.auth({ guards: ["api"] })',
    "middleware.admin()",
    '"/orders/:orderId/fulfillments"',
    '"/orders/:orderId/returns"',
    '"/inventory/adjustments"',
    '"/shipping/zones"',
    '"/tax/rates"',
]);

assertContains("apps/api/database/migrations/1762000000000_create_phase5_order_operations.ts", [
    'createTable("order_fulfillments"',
    'createTable("order_shipments"',
    'createTable("order_shipment_events"',
    'createTable("order_returns"',
    'createTable("order_return_items"',
    "FORCE ROW LEVEL SECURITY",
    "tenant_isolation",
    "idempotency_fingerprint",
]);

assertContains("apps/api/app/services/phase5_order_operations_service.ts", [
    "E_FULFILLMENT_OVERFULFILL",
    "E_FULFILLMENT_IDEMPOTENCY_MISMATCH",
    "RefundService",
    "maybeCompleteOrder",
    'shipment.status !== "delivered"',
]);
assertNotContains("apps/api/app/services/phase5_order_operations_service.ts", [
    "inventory.decrement",
    "stock_quantity -",
]);

assertContains("apps/api/app/services/inventory_operations_service.ts", ["InventoryService", "adjust"]);
assertContains("apps/api/app/services/store_operations_config_service.ts", [
    "shipping_zones",
    "shipping_zone_methods",
    "settings_schema",
    "tax_rates",
    "E_SHIPPING_FALLBACK_EXISTS",
]);

for (const view of [
    "apps/admin/src/views/store-config/shipping/shipping-zones-view.tsx",
    "apps/admin/src/views/store-config/shipping/shipping-methods-view.tsx",
    "apps/admin/src/views/store-config/tax/tax-classes-view.tsx",
    "apps/admin/src/views/store-config/tax/tax-rates-view.tsx",
]) {
    assertNotContains(view, ["#/lib/fixtures/", "SHIPPING_ZONES", "SHIPPING_METHODS", "TAX_CLASSES", "TAX_RATES"]);
}

assertContains("apps/admin/src/views/orders/detail/shipping-card.tsx", ["FulfillmentOperationsCard", "orderId={order.id}"]);
assertContains("apps/admin/src/views/orders/list/status-tabs.tsx", ["useOrderOperationsSummary", "shipmentExceptions", "returnsApproval"]);
assertContains("apps/admin/src/views/analytics/stock/stock-view.tsx", ["InventoryOperationsPanel", "selectedInventoryId", "openLedger"]);
assertContains("apps/admin/src/lib/i18n/request.ts", ['messages/operations/${locale}.json', "...operations"]);

assertContains("packages/sdk/src/generated/admin.composed.d.ts", [
    'from "./admin.phase5"',
    "Phase5Paths",
    "Phase5Components",
    "Phase5Operations",
]);

assertContains("docs/api/reference/openapi/admin.phase5.v1.yaml", [
    "/api/v1/admin/orders/{orderId}/fulfillments:",
    "/api/v1/admin/orders/{orderId}/returns:",
    "/api/v1/admin/inventory/adjustments:",
    "/api/v1/admin/shipping/zones:",
    "/api/v1/admin/tax/rates:",
]);

assertContains("apps/api/tests/functional/admin/phase5_operations.spec.ts", [
    "blocks over-fulfillment",
    "Idempotency-Key",
    "records shipment events",
    "requires authentication and admin role",
]);

console.log("Phase 5 operations integration verifier passed.");
