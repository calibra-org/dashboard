import { readFileSync, writeFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const write = (path, content) => writeFileSync(path, content.endsWith("\n") ? content : `${content}\n`, "utf8");

function replaceRequired(content, before, after, label) {
    if (content.includes(after)) return content;
    if (!content.includes(before)) throw new Error(`Missing expected text for ${label}`);
    return content.replace(before, after);
}

// Phase 14 tenant/RLS correctness: every tenant-table query must ride the request transaction.
const phase14Path = "apps/api/app/services/phase14_procurement_service.ts";
let phase14 = read(phase14Path);
phase14 = phase14.replace('import db from "@adonisjs/lucid/services/db";\n', "");
phase14 = replaceRequired(
    phase14,
    'import { withTenantTransaction } from "#services/tenant_context";',
    'import { currentTrx, withTenantTransaction } from "#services/tenant_context";',
    "Phase 14 tenant context import",
);
phase14 = phase14.replaceAll("db.", "currentTrx().");
if (phase14.includes("db.")) throw new Error("Bare global db reference remains in Phase 14 procurement service");
write(phase14Path, phase14);

// Preserve Phase 20's current navigation while restoring the Phase 18 entry on the latest main baseline.
const sidebarPath = "apps/admin/src/components/Sidebar.tsx";
let sidebar = read(sidebarPath);
sidebar = replaceRequired(
    sidebar,
    '    { titleKey: "finance", items: [{ href: "/economics", labelKey: "economics", icon: Wallet }] },',
    `    {\n        titleKey: "finance",\n        items: [\n            { href: "/economics", labelKey: "economics", icon: Wallet },\n            { href: "/pricing-brain", label: "مغز قیمت‌گذاری", icon: Sparkles },\n        ],\n    },`,
    "Phase 18 sidebar entry",
);
write(sidebarPath, sidebar);

write(
    "docs/api/reference/openapi/admin.phase14.v1.yaml",
    `openapi: 3.1.0
info:
  title: Calibra Admin Phase 14 Procurement API
  version: 1.0.0
paths:
  /api/v1/admin/procurement/overview:
    get:
      tags: [Phase14Procurement]
      operationId: phase14ProcurementOverview
      responses:
        "200": { description: Procurement portfolio overview }
  /api/v1/admin/procurement/suppliers:
    get:
      tags: [Phase14Procurement]
      operationId: phase14SupplierList
      responses:
        "200": { description: Supplier registry }
    post:
      tags: [Phase14Procurement]
      operationId: phase14SupplierCreate
      responses:
        "201": { description: Supplier created }
  /api/v1/admin/procurement/purchase-orders:
    get:
      tags: [Phase14Procurement]
      operationId: phase14PurchaseOrderList
      responses:
        "200": { description: Purchase order registry }
    post:
      tags: [Phase14Procurement]
      operationId: phase14PurchaseOrderCreate
      responses:
        "200": { description: Idempotent replay }
        "201": { description: Purchase order created }
  /api/v1/admin/procurement/purchase-orders/{id}/transition:
    post:
      tags: [Phase14Procurement]
      operationId: phase14PurchaseOrderTransition
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }
      responses:
        "200": { description: Purchase order state changed }
  /api/v1/admin/procurement/purchase-orders/{id}/receipts:
    post:
      tags: [Phase14Procurement]
      operationId: phase14PurchaseOrderReceive
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }
      responses:
        "200": { description: Idempotent replay }
        "201": { description: Goods receipt recorded }
  /api/v1/admin/procurement/recommendations:
    get:
      tags: [Phase14Procurement]
      operationId: phase14ProcurementRecommendations
      responses:
        "200": { description: Replenishment recommendations }
  /api/v1/admin/procurement/health:
    get:
      tags: [Phase14Procurement]
      operationId: phase14ProcurementHealth
      responses:
        "200": { description: Procurement data-plane readiness }
tags:
  - name: Phase14Procurement
    description: Supplier, purchase-order, receiving, recommendation and readiness contracts.
`,
);

write(
    "docs/api/reference/openapi/storefront.phase17.v1.yaml",
    `openapi: 3.1.0
info:
  title: Calibra Storefront Phase 17 Experimentation API
  version: 1.0.0
paths:
  /api/v1/experiments/assign:
    post:
      tags: [Phase17Experimentation]
      operationId: phase17ExperimentAssign
      responses:
        "200": { description: Deterministic assignment result }
  /api/v1/experiments/exposures:
    post:
      tags: [Phase17Experimentation]
      operationId: phase17ExperimentExposure
      responses:
        "200": { description: Exposure accepted or deduplicated }
  /api/v1/experiments/observations:
    post:
      tags: [Phase17Experimentation]
      operationId: phase17ExperimentObservation
      responses:
        "200": { description: Observation accepted or deduplicated }
tags:
  - name: Phase17Experimentation
    description: Deterministic assignment, exposure logging and outcome observation.
`,
);

const packagePath = "docs/api/package.json";
const pkg = JSON.parse(read(packagePath));
pkg.scripts["build:json:storefront-phase17"] =
    "redocly bundle reference/openapi/storefront.phase17.v1.yaml -o dist/storefront.phase17.v1.json --ext json";
pkg.scripts["build:json:admin-phase14"] =
    "redocly bundle reference/openapi/admin.phase14.v1.yaml -o dist/admin.phase14.v1.json --ext json";
pkg.scripts["build:json:admin-phase17"] =
    "redocly bundle reference/openapi/admin.phase17.v1.yaml -o dist/admin.phase17.v1.json --ext json";
pkg.scripts["build:json:admin-phase18"] =
    "redocly bundle reference/openapi/admin.phase18.v1.yaml -o dist/admin.phase18.v1.json --ext json";
pkg.scripts["build:json:storefront"] =
    "pnpm build:json:storefront-base && pnpm build:json:storefront-completion && pnpm build:json:storefront-identity && pnpm build:json:storefront-phase9 && pnpm build:json:storefront-phase17 && pnpm build:json:storefront-merge";
pkg.scripts["build:json:admin"] =
    "pnpm build:json:admin-base && pnpm build:json:admin-tickets && pnpm build:json:admin-ticket-omnichannel && pnpm build:json:admin-phase5 && pnpm build:json:admin-phase6 && pnpm build:json:admin-runtime-sync && pnpm build:json:admin-identity && pnpm build:json:admin-phase9 && pnpm build:json:admin-phase10 && pnpm build:json:admin-phase11 && pnpm build:json:admin-phase12 && pnpm build:json:admin-phase13 && pnpm build:json:admin-phase14 && pnpm build:json:admin-phase17 && pnpm build:json:admin-phase18 && pnpm build:json:admin-trust && pnpm build:json:admin-completion && pnpm build:json:admin-merge";
write(packagePath, `${JSON.stringify(pkg, null, 4)}\n`);

const mergeAdminPath = "docs/api/scripts/merge-admin-spec.js";
let mergeAdmin = read(mergeAdminPath);
mergeAdmin = replaceRequired(
    mergeAdmin,
    'const phase13 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase13.v1.json"), "utf8"));\nconst trust = JSON.parse(readFileSync(resolve(root, "dist/admin.trust.v1.json"), "utf8"));',
    'const phase13 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase13.v1.json"), "utf8"));\nconst phase14 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase14.v1.json"), "utf8"));\nconst phase17 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase17.v1.json"), "utf8"));\nconst phase18 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase18.v1.json"), "utf8"));\nconst trust = JSON.parse(readFileSync(resolve(root, "dist/admin.trust.v1.json"), "utf8"));',
    "Admin OpenAPI overlay imports",
);
mergeAdmin = replaceRequired(
    mergeAdmin,
    '    [phase13, "Phase13PlanningOverlay"],\n    [trust, "TrustOverlay"],',
    '    [phase13, "Phase13PlanningOverlay"],\n    [phase14, "Phase14ProcurementOverlay"],\n    [phase17, "Phase17ExperimentationOverlay"],\n    [phase18, "Phase18PricingOverlay"],\n    [trust, "TrustOverlay"],',
    "Admin OpenAPI overlay registry",
);
write(mergeAdminPath, mergeAdmin);

const mergeStorefrontPath = "docs/api/scripts/merge-storefront-spec.js";
let mergeStorefront = read(mergeStorefrontPath);
mergeStorefront = replaceRequired(
    mergeStorefront,
    'const phase9 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase9.v1.json"), "utf8"));',
    'const phase9 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase9.v1.json"), "utf8"));\nconst phase17 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase17.v1.json"), "utf8"));',
    "Storefront Phase 17 import",
);
mergeStorefront = replaceRequired(
    mergeStorefront,
    "for (const overlay of [completion, identity, phase9]) {",
    "for (const overlay of [completion, identity, phase9, phase17]) {",
    "Storefront OpenAPI overlay registry",
);
write(mergeStorefrontPath, mergeStorefront);

console.log("Release baseline source repair prepared on latest main.");
