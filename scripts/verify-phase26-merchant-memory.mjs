import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const must = (value, message) => {
    if (!value) throw new Error(message);
};

const migration = read("apps/api/database/migrations/1779000000000_create_merchant_memory.ts");
const service = read("apps/api/app/services/phase26_merchant_memory_service.ts");
const validator = read("apps/api/app/validators/admin/phase26_merchant_memory_validator.ts");
const routes = read("apps/api/start/routes/admin_merchant_memory.ts");
const routeIndex = read("apps/api/start/routes.ts");

for (const table of [
    "merchant_memory_records",
    "merchant_memory_sources",
    "merchant_memory_lineage",
    "merchant_memory_retrievals",
    "merchant_memory_effectiveness",
]) {
    must(migration.includes(`createTable("${table}"`), `missing ${table}`);
}

must(migration.includes("ENABLE ROW LEVEL SECURITY"), "Phase 26 RLS is missing");
must(migration.includes("FORCE ROW LEVEL SECURITY"), "Phase 26 FORCE RLS is missing");
must(
    migration.includes("source_phase IN ('phase10','phase11','phase17','phase22','phase25','manual_reviewed')"),
    "source phase allowlist missing",
);
must(migration.includes("relation IN ('supersedes','contradicts','refines')"), "lineage relation contract missing");
must(migration.includes("expires_at"), "expiry contract missing");
must(migration.includes("repeat_error_avoided"), "repeat-error effectiveness signal missing");
must(!migration.includes('table.text("query")'), "raw retrieval query must never be persisted");
must(migration.includes('table.string("query_hash", 64)'), "retrieval query hash missing");
must(migration.includes("customer_level_sensitive"), "sensitive-memory class missing");

must(service.includes("SOURCE_TARGETS"), "canonical source authority map missing");
must(service.includes("E_MERCHANT_MEMORY_SOURCE_NOT_FOUND"), "tenant-owned source validation missing");
must(service.includes("E_MERCHANT_MEMORY_AGENT_SENSITIVE_FORBIDDEN"), "agent-sensitive privacy gate missing");
must(service.includes("E_MERCHANT_MEMORY_SENSITIVE_RETENTION_REQUIRED"), "sensitive retention gate missing");
must(service.includes("allowed_consumers @>"), "consumer-aware retrieval missing");
must(service.includes("purposes @>"), "purpose-limited retrieval missing");
must(service.includes("merchant_memory_sources.memory_id = merchant_memory_records.id"), "source-linked retrieval gate missing");
must(service.includes('status: "superseded"'), "supersession state transition missing");
must(service.includes("returned_memory_public_ids"), "retrieval evidence ledger missing");
must(service.includes("E_MERCHANT_MEMORY_EFFECTIVENESS_SCOPE_MISMATCH"), "effectiveness retrieval-scope gate missing");
must(service.includes("intelligence_outcome_records"), "Phase 10 outcome authority link missing");
must(
    !service.includes("chat_history") && !service.includes("conversation_history"),
    "chat transcript must not become memory authority",
);

must(validator.includes('vine.enum(["human", "agent"])'), "human/agent consumer contract missing");
must(validator.includes("manual_reviewed"), "manual-reviewed source contract missing");
must(routes.includes("adminWriteLimiter"), "Phase 26 write limiter missing");
for (const segment of routes.split("router.post").slice(1)) {
    must(segment.includes("adminWriteLimiter"), "Phase 26 write route without limiter");
}
must(routeIndex.includes('await import("./routes/admin_merchant_memory.js")'), "Phase 26 route registration missing");


must(service.includes("agentPrincipal!.id"), "server-derived agent principal linkage missing");
must(service.includes("E_MERCHANT_MEMORY_SOURCE_SENSITIVITY_DOWNGRADE"), "source sensitivity downgrade protection missing");
must(service.includes("misleading_memory_rate") && service.includes("source_linked_retrieval_rate"), "Phase 26 effectiveness KPIs incomplete");
must(read("apps/api/app/controllers/admin/merchant_memory_controller.ts").includes("agentPrincipal = await requireApprovedAgentPrincipal"), "Governance principal is not bound to retrieval logging");

console.log("PASS Phase26 Merchant Memory integrity gate");
