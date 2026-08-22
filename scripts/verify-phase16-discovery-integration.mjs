import { existsSync, readFileSync } from "node:fs";

const must = (ok, msg) => {
    if (!ok) throw new Error(msg);
};
const read = (p) => readFileSync(p, "utf8");
for (const p of [
    "apps/api/app/services/discovery/search_service.ts",
    "apps/api/app/services/discovery/index_projection.ts",
    "apps/api/app/jobs/discovery_index_projection_job.ts",
    "apps/api/start/routes/admin_discovery.ts",
    "apps/admin/src/features/discovery/workspace.tsx",
    "docs/api/reference/openapi/admin.discovery.v1.yaml",
])
    must(existsSync(p), `missing ${p}`);
const mig = read("apps/api/database/migrations/1770001600000_create_discovery_os_tables.ts");
must(mig.includes("discovery_index_operations"), "index ledger missing");
must((mig.match(/FORCE ROW LEVEL SECURITY/g) || []).length >= 1, "FORCE RLS missing");
const search = read("apps/api/app/services/discovery/search_service.ts");
must(search.includes('task.status !== "succeeded"'), "Meilisearch terminal status not checked");
must(!search.includes("catch(() => undefined)"), "silent index failure remains");
const cache = read("apps/api/app/services/cache_invalidation.ts");
must(cache.includes("enqueueProductProjection"), "catalog projection seam missing");
const side = read("apps/admin/src/components/Sidebar.tsx");
must(side.includes('navT("growth")') && side.includes("discovery-sidebar-items"), "Growth/Discovery IA missing");
const routes = read("apps/api/start/routes/admin_discovery.ts");
must(routes.includes("/index/operations/:id/retry"), "index retry route missing");
console.log("Phase 16 discovery integration contract: PASS");
