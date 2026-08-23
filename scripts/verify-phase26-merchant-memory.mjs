import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const must = (condition, message) => {
    if (!condition) throw new Error(message);
};

const migration = read("apps/api/database/migrations/1779000000000_create_merchant_memory.ts");
const service = read("apps/api/app/services/phase26_merchant_memory_service.ts");
const routes = read("apps/api/start/routes/admin_merchant_memory.ts");
const controller = read("apps/api/app/controllers/admin/merchant_memory_controller.ts");
const validator = read("apps/api/app/validators/admin/phase26_merchant_memory_validator.ts");
const routeRegistry = read("apps/api/start/routes.ts");

for (const table of [
    "merchant_memories",
    "merchant_memory_sources",
    "merchant_memory_lineage",
    "merchant_memory_retrievals",
    "merchant_memory_effectiveness",
]) {
    must(migration.includes(`createTable(\"${table}\"`), `missing ${table}`);
    must(migration.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`), `RLS missing for ${table}`);
    must(migration.includes(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`), `FORCE RLS missing for ${table}`);
}

for (const field of [
    "context",
    "observed_signals",
    "decision",
    "reason",
    "alternatives_rejected",
    "actors_approvals",
    "action",
    "outcome",
    "lesson",
    "confidence",
    "strength",
    "expires_at",
]) {
    must(migration.includes(`\"${field}\"`), `memory field missing: ${field}`);
}

must(migration.includes("superseded"), "supersession status missing");
must(migration.includes("relation IN ('supersedes','refines','contradicts')"), "memory lineage relations missing");
must(service.includes("Merchant memory must have at least one source"), "source-linked write guard missing");
must(service.includes("Sensitive record-level memory is not allowed"), "sensitive raw-memory guard missing");
must(service.includes("whereExists"), "source-linked retrieval guard missing");
must(service.includes('where("m.status", "active")'), "active-only retrieval missing");
must(service.includes('whereNull("m.expires_at")'), "expiry retrieval guard missing");
must(service.includes('where("m.visibility_scope", "admin_agent")'), "permission-aware agent retrieval missing");
must(service.includes("merchant_memory_effectiveness"), "effectiveness feedback loop missing");
must(routes.includes("/api/v1/admin/merchant-memory"), "Phase 26 API prefix missing");
must(routes.includes("adminWriteLimiter"), "admin write limiter missing");
must(controller.includes("supersedeMerchantMemoryValidator"), "supersession controller validation missing");
must(validator.includes("sources: vine.array(source).minLength(1)"), "source validation missing");
must(routeRegistry.includes('await import("./routes/admin_merchant_memory.js")'), "route registry wiring missing");

console.log("Phase 26 merchant memory integrity: PASS");
