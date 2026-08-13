#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;

function read(relative) {
    return fs.readFileSync(path.join(root, relative), "utf8");
}

function exists(relative) {
    return fs.existsSync(path.join(root, relative));
}

function check(condition, message) {
    checks += 1;
    if (!condition) failures.push(message);
}

function contains(relative, needle, message = `${relative} must contain ${needle}`) {
    check(read(relative).includes(needle), message);
}

function notContains(relative, needle, message = `${relative} must not contain ${needle}`) {
    check(!read(relative).includes(needle), message);
}

const requiredFiles = [
    "apps/api/start/routes/admin_reports.ts",
    "apps/api/app/controllers/admin/reports_controller.ts",
    "apps/api/app/services/reports/analytics_service.ts",
    "apps/api/app/validators/admin/report_validator.ts",
    "apps/admin/src/lib/queries/reports.ts",
    "apps/admin/src/views/reports/sales-report-view.tsx",
    "apps/admin/src/views/reports/top-sellers-view.tsx",
    "apps/admin/src/app/[locale]/(authenticated)/reports/page.tsx",
    "apps/admin/src/app/[locale]/(authenticated)/reports/top-sellers/page.tsx",
    "docs/api/reference/openapi/admin.v1.yaml",
];
for (const file of requiredFiles) check(exists(file), `missing reports integration file: ${file}`);

const routes = read("apps/api/start/routes/admin_reports.ts");
for (const endpoint of [
    "/top-products",
    "/top-categories",
    "/sales-stats",
    "/coupons-stats",
    "/revenue",
    "/orders",
    "/products",
    "/categories",
    "/coupons",
    "/taxes",
    "/stock",
]) {
    check(routes.includes(endpoint), `missing Admin reports route: ${endpoint}`);
}
check(routes.includes('middleware.auth({ guards: ["api"] })'), "Admin reports must require API authentication");
check(routes.includes("middleware.admin()"), "Admin reports must require admin middleware");

const controller = read("apps/api/app/controllers/admin/reports_controller.ts");
for (const handler of [
    "async topProducts",
    "async topCategories",
    "async salesStats",
    "async couponsStats",
    "async revenueTable",
    "async ordersTable",
    "async productsTable",
    "async categoriesTable",
    "async couponsTable",
    "async taxesTable",
    "async stockReport",
]) {
    check(controller.includes(handler), `Reports controller missing handler: ${handler}`);
}
for (const invariant of [
    "adminReportStatsValidator",
    "adminReportTableValidator",
    "adminStockReportValidator",
    "currentTenantId()",
    "currentTrx()",
    "CacheTags.adminReports",
    "CSV_ROW_CAP",
]) {
    check(controller.includes(invariant), `Reports controller invariant missing: ${invariant}`);
}

const analytics = read("apps/api/app/services/reports/analytics_service.ts");
for (const invariant of [
    "REPORT_COUNTED_STATUSES",
    "computeSalesWindow",
    "computeOrdersTable",
    "computeProductsTable",
    "computeCategoriesTable",
    "computeCouponsTable",
    "computeTaxesTable",
    "computeStockTable",
    "order_refunds",
    "currentTrx()",
]) {
    check(analytics.includes(invariant), `Analytics service invariant missing: ${invariant}`);
}

const queries = read("apps/admin/src/lib/queries/reports.ts");
contains("apps/admin/src/lib/queries/reports.ts", 'apiGet<SalesStatsResponse>("reports/sales-stats"');
contains("apps/admin/src/lib/queries/reports.ts", 'apiGet<TopProductsResponse>("reports/top-products"');
notContains("apps/admin/src/lib/queries/reports.ts", 'apiGet<OrderListEnvelope>("orders"', "Sales report must not aggregate an arbitrary order-list page in the browser");
notContains("apps/admin/src/lib/queries/reports.ts", "limit: 100", "Sales report must not be capped to 100 orders");
notContains("apps/admin/src/lib/queries/reports.ts", "refundedAmount: 0", "Refund total must come from the backend analytics source");

const topSellers = read("apps/admin/src/views/reports/top-sellers-view.tsx");
check(topSellers.includes("useTopSellersReport"), "Top sellers view must consume the real reports query");
check(!topSellers.includes("getTopSellersFixture"), "Top sellers view must not use a fixture");
check(topSellers.includes("isLoading"), "Top sellers view must render loading state");
check(topSellers.includes("isError"), "Top sellers view must render error state");

const salesView = read("apps/admin/src/views/reports/sales-report-view.tsx");
check(salesView.includes("useSalesReport"), "Sales report view must consume reports query");
check(salesView.includes("isLoading"), "Sales report view must render loading state");
check(salesView.includes("isError"), "Sales report view must render error state");

const openapi = read("docs/api/reference/openapi/admin.v1.yaml");
for (const endpoint of [
    "/api/v1/admin/reports/top-products:",
    "/api/v1/admin/reports/top-categories:",
    "/api/v1/admin/reports/sales-stats:",
    "/api/v1/admin/reports/coupons-stats:",
    "/api/v1/admin/reports/revenue:",
    "/api/v1/admin/reports/orders:",
    "/api/v1/admin/reports/products:",
    "/api/v1/admin/reports/categories:",
    "/api/v1/admin/reports/coupons:",
    "/api/v1/admin/reports/taxes:",
    "/api/v1/admin/reports/stock:",
]) {
    check(openapi.includes(endpoint), `Admin OpenAPI missing reports path: ${endpoint}`);
}

for (const file of [
    "apps/admin/src/lib/queries/reports.ts",
    "apps/admin/src/views/reports/sales-report-view.tsx",
    "apps/admin/src/views/reports/top-sellers-view.tsx",
    "apps/api/app/controllers/admin/reports_controller.ts",
    "apps/api/app/services/reports/analytics_service.ts",
]) {
    const source = read(file);
    check(!/\b(?:TODO|FIXME|HACK)\b/.test(source), `unfinished marker found in reports release surface: ${file}`);
    check(!/@ts-ignore|@ts-nocheck/.test(source), `TypeScript suppression found in reports release surface: ${file}`);
}

if (failures.length > 0) {
    console.error(`Reports integration verifier failed: ${failures.length}/${checks} checks`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Reports integration verifier passed: ${checks} checks`);
