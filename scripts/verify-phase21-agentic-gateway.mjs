import fs from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const read = (p) => fs.readFileSync(`${root}/${p}`, "utf8");
const migration = read("apps/api/database/migrations/1774000000000_create_agentic_commerce_gateway.ts");
const service = read("apps/api/app/services/agentic_gateway/gateway_service.ts");
const graph = read("apps/api/app/services/agentic_gateway/product_graph_service.ts");
const routes = read("apps/api/start/routes/admin_agentic_gateway.ts");
const ui = read("apps/admin/src/features/agentic_gateway/AgenticCommerceWorkspace.tsx");
const assertions = [
  ["7 RLS tables", (migration.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length === 1 && migration.includes("for (const table of TABLES)") && migration.includes("agentic_conformance_runs")],
  ["no duplicate product/order truth tables", !/createTable\("(?:products|orders|payments|order_refunds)"/.test(migration)],
  ["live conformance gate", service.includes("E_AGENTIC_CONFORMANCE_REQUIRED") && service.includes("recent passing conformance run")],
  ["signed capability metadata verified", service.includes("getMessageVerifier().sign") && service.includes("getMessageVerifier().unsign") && service.includes("E_AGENTIC_CAPABILITY_SIGNATURE_INVALID")],
  ["fresh conformance gate", service.includes("CONFORMANCE_MAX_AGE_MS") && service.includes("recent passing conformance")],
  ["idempotency payload conflict", service.includes("E_AGENTIC_IDEMPOTENCY_CONFLICT")],
  ["canonical product reuse", ["products", "product_variations", "inventory_items"].every((x) => graph.includes(`\"${x}\"`))],
  ["principal dynamic rate limit", service.includes("principal_rate_limit_exceeded") && service.includes("window_seconds") && service.includes("recent_action_count")],
  ["write rate limit", routes.split("router.post").slice(1).every((x) => x.includes("adminWriteLimiter"))],
  ["UI help", (ui.match(/HelperTooltip/g) ?? []).length >= 4],
  ["no raw colors", !/(bg|text|border)-(red|blue|green|amber|slate|gray|zinc|neutral|stone)-\d/.test(ui)],
  ["RTL logical spacing", !/\b(mr|ml|pr|pl)-\d/.test(ui)],
  ["no mock markers", !/mock|demo data|fake metric/i.test(ui)],
];
let failed = 0; for (const [name, ok] of assertions) { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
