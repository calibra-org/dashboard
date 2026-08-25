import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");
const must = (condition, message) => {
    if (!condition) throw new Error(message);
};

const migration = read("apps/api/database/migrations/1800000000000_create_product_passport_os.ts");
const posture = read("docs/calibra/phase29-product-passport-conformance-posture.md");

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

must(!migration.includes('createTable("phase29_products"'), "Phase 29 must not create a parallel product master");
console.log("PASS Phase 29 Product Provenance & Digital Product Passport foundation integrity gate");
