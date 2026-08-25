import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");
const must = (condition, message) => {
    if (!condition) throw new Error(message);
};

const migration = read("apps/api/database/migrations/1800000000000_create_product_passport_os.ts");
const posture = read("docs/calibra/phase29-product-passport-conformance-posture.md");
const service = read("apps/api/app/services/product_passport/product_passport_service.ts");
const permissions = read("apps/api/app/services/product_passport/permissions.ts");
const controller = read("apps/api/app/controllers/admin/product_passport_controller.ts");
const adminRoutes = read("apps/api/start/routes/admin_product_passports.ts");
const publicRoutes = read("apps/api/start/routes/product_passports_public.ts");
const routes = read("apps/api/start/routes.ts");
const openapi = read("docs/api/reference/openapi/admin.phase29.v1.yaml");
const docsPackage = read("docs/api/package.json");
const mergeAdminSpec = read("docs/api/scripts/merge-admin-spec.js");

for (const marker of [
    "product_passports",
    "product_passport_versions",
    "product_passport_evidence",
    "product_passport_edges",
    "product_passport_regulatory_mappings",
    "ENABLE ROW LEVEL SECURITY",
    "FORCE ROW LEVEL SECURITY",
]) {
    must(migration.includes(marker), `Phase 29 migration contract missing: ${marker}`);
}

for (const level of ["'product'", "'model'", "'batch'", "'item'"]) {
    must(migration.includes(level), `Phase 29 identity level missing: ${level}`);
}

must(migration.includes("identity_level <> 'batch' OR batch_code IS NOT NULL"), "Batch passports must require batch_code");
must(migration.includes("identity_level <> 'item' OR serial_number IS NOT NULL"), "Item passports must require serial_number");
must(migration.includes("product_passports_identity_unique"), "Product identity passports require a dedupe boundary");
must(migration.includes("public_fields") && migration.includes("private_fields"), "Phase 29 visibility boundary is missing");
must(migration.includes("content_hash"), "Phase 29 evidence/version content addressing is missing");
must(migration.includes("framework_version") && migration.includes("mapping_version"), "Regulatory mappings must be versioned");
must(migration.includes("conformance_note"), "Regulatory mappings require an explicit conformance note");

for (const boundary of [
    "does not create a parallel product master",
    "public_fields",
    "private_fields",
    "does not claim GS1 Digital Link conformance",
    "Regulatory mappings are data, not hard-coded truth",
    "explicit legal/standards sign-off",
]) {
    must(posture.includes(boundary), `Phase 29 conformance posture missing: ${boundary}`);
}

for (const marker of [
    "findSupplyReceiptLine",
    'relation_type: "received_from"',
    "quality_cases",
    "product_passport_versions",
    'visibility: "public"',
    'verification_status: "verified"',
    "standards_ready_not_conformance_certified",
    "assertPublicPayloadSafe",
]) {
    must(service.includes(marker), `Phase 29 service boundary missing: ${marker}`);
}

must(service.includes("version.public_snapshot"), "Public resolver must serve the published version snapshot");
must(
    !service.includes("public_snapshot: passport.public_fields"),
    "Public resolver must not serve mutable draft fields directly",
);
must(service.includes("maybeTenantContext"), "Public resolver must remain tenant fail-closed");

for (const permission of [
    "product_passport.view",
    "product_passport.manage",
    "product_passport.evidence.verify",
    "product_passport.publish",
    "product_passport.revoke",
    "product_passport.regulatory.manage",
    "product_passport.access.manage",
]) {
    must(permissions.includes(permission), `Phase 29 permission missing: ${permission}`);
}

for (const auditAction of [
    "product_passport.create",
    "product_passport.update",
    "product_passport.publish",
    "product_passport.revoke",
    "product_passport.evidence.create",
    "product_passport.evidence.verify",
    "product_passport.edge.create",
    "product_passport.regulatory.create",
    "product_passport.regulatory.status",
    "product_passport.access.preset.apply",
]) {
    must(controller.includes(`action: "${auditAction}"`), `Strict audit action missing: ${auditAction}`);
}
must(controller.includes("strict: true"), "Phase 29 mutations require strict audit logging");
must(controller.includes("requireRecentIdentityStepUp"), "Sensitive Phase 29 mutations require identity step-up");

const mutationCount = (adminRoutes.match(/\.(post|patch)\(/g) ?? []).length;
const limiterCount = (adminRoutes.match(/\.use\(adminWriteLimiter\)/g) ?? []).length;
must(mutationCount === limiterCount, "Every Phase 29 admin mutation must use adminWriteLimiter");
must(adminRoutes.includes("/api/v1/admin/product-passports"), "Phase 29 admin prefix is missing");
must(publicRoutes.includes("/api/v1/product-passports/:resolverKey"), "Phase 29 public resolver route is missing");
must(routes.includes('await import("./routes/admin_product_passports.js")'), "Phase 29 admin routes are not registered");
must(routes.includes('await import("./routes/product_passports_public.js")'), "Phase 29 public routes are not registered");

for (const operationId of [
    "adminProductPassportOverview",
    "adminProductPassports",
    "adminProductPassportCreate",
    "adminProductPassport",
    "adminProductPassportUpdate",
    "adminProductPassportPublish",
    "adminProductPassportRevoke",
    "adminProductPassportEvidenceCreate",
    "adminProductPassportEvidenceStatus",
    "adminProductPassportEdgeCreate",
    "adminProductPassportRegulatoryMappings",
    "adminProductPassportRegulatoryCreate",
    "adminProductPassportRegulatoryStatus",
    "adminProductPassportAccess",
    "adminProductPassportAccessPreset",
]) {
    must(openapi.includes(`operationId: ${operationId}`), `Phase 29 OpenAPI operation missing: ${operationId}`);
}

must(openapi.includes("private_fields"), "Admin Phase 29 contract must support private passport fields");
must(!openapi.includes("/api/v1/product-passports/{resolverKey}"), "Public resolver must not be mixed into the admin overlay");
must(docsPackage.includes('"build:json:admin-phase29"'), "Phase 29 docs build script is missing");
must(docsPackage.includes("pnpm build:json:admin-phase29"), "Aggregate admin OpenAPI build must include Phase 29");
must(mergeAdminSpec.includes("dist/admin.phase29.v1.json"), "Admin OpenAPI merge must load Phase 29 overlay");
must(mergeAdminSpec.includes("Phase29ProductPassportOverlay"), "Admin OpenAPI merge must namespace Phase 29 overlay");

must(!migration.includes('createTable("phase29_products"'), "Phase 29 must not create a parallel product master");
console.log("PASS Phase 29 Product Provenance & Digital Product Passport contract integrity gate");
