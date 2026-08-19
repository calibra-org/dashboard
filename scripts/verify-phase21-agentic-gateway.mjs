import fs from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => fs.readFileSync(`${root}/${path}`, "utf8");
const migration = read("apps/api/database/migrations/1774000000000_create_agentic_commerce_gateway.ts");
const service = read("apps/api/app/services/agentic_gateway/gateway_service.ts");
const publicService = read("apps/api/app/services/agentic_gateway/public_service.ts");
const riskBridge = read("apps/api/app/services/agentic_gateway/risk_bridge.ts");
const graph = read("apps/api/app/services/agentic_gateway/product_graph_service.ts");
const adminRoutes = read("apps/api/start/routes/admin_agentic_gateway.ts");
const publicRoutes = read("apps/api/start/routes/agentic_gateway.ts");
const routeRegistry = read("apps/api/start/routes.ts");
const limiter = read("apps/api/start/limiter.ts");
const sidebar = read("apps/admin/src/components/Sidebar.tsx");
const ui = read("apps/admin/src/features/agentic_gateway/AgenticCommerceWorkspace.tsx");
const openapi = read("docs/api/reference/openapi/admin.agentic-commerce.v1.yaml");

const assertions = [
    ["7 RLS tables", (migration.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length === 1 && migration.includes("for (const table of TABLES)") && migration.includes("agentic_conformance_runs")],
    ["no duplicate product/order truth tables", !/createTable\("(?:products|orders|payments|order_refunds)"/.test(migration)],
    ["live conformance gate", service.includes("E_AGENTIC_CONFORMANCE_REQUIRED") && service.includes("recent passing conformance run")],
    ["signed capability metadata verified", service.includes("getMessageVerifier().sign") && service.includes("getMessageVerifier().unsign") && service.includes("E_AGENTIC_CAPABILITY_SIGNATURE_INVALID")],
    ["fresh conformance gate", service.includes("CONFORMANCE_MAX_AGE_MS") && service.includes("recent passing conformance")],
    ["idempotency payload conflict", service.includes("E_AGENTIC_IDEMPOTENCY_CONFLICT")],
    ["canonical product reuse", ["products", "product_variations", "inventory_items"].every((name) => graph.includes(`\"${name}\"`))],
    ["principal dynamic rate limit", service.includes("principal_rate_limit_exceeded") && service.includes("window_seconds") && service.includes("recent_action_count")],
    ["admin write rate limit", adminRoutes.split("router.post").slice(1).every((chunk) => chunk.includes("adminWriteLimiter"))],
    ["public profile and data plane routed", publicRoutes.includes("/.well-known/calibra-agentic-commerce") && publicRoutes.includes("/actions/authorize") && publicRoutes.includes("/events") && routeRegistry.includes("./routes/agentic_gateway.js")],
    ["public principal credentials are hash verified", publicService.includes("timingSafeEqual") && publicService.includes("credential_fingerprint") && publicService.includes("sha256")],
    ["public telemetry is redacted and idempotent", publicService.includes("[redacted]") && publicService.includes("E_AGENTIC_EVENT_IDEMPOTENCY_CONFLICT")],
    ["canonical Phase 20 trust bridge", riskBridge.includes("phase20TrustRiskService.evaluate") && riskBridge.includes("signals: []") && riskBridge.includes("E_AGENTIC_TRUST_BLOCKED")],
    ["public outer rate limiter", limiter.includes("agenticPublicLimiter") && publicRoutes.includes("agenticPublicLimiter")],
    ["public OpenAPI contract", openapi.includes("/.well-known/calibra-agentic-commerce") && openapi.includes("/api/v1/agentic/actions/authorize") && openapi.includes("/api/v1/agentic/events")],
    ["admin navigation", sidebar.includes("/agentic-commerce/overview") && sidebar.includes("agenticCommerce")],
    ["UI help", (ui.match(/HelperTooltip/g) ?? []).length >= 4],
    ["no raw colors", !/(bg|text|border)-(red|blue|green|amber|slate|gray|zinc|neutral|stone)-\d/.test(ui)],
    ["RTL logical spacing", !/\b(mr|ml|pr|pl)-\d/.test(ui)],
    ["no mock markers", !/mock|demo data|fake metric/i.test(ui)],
];

let failed = 0;
for (const [name, ok] of assertions) {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) failed++;
}
if (failed) process.exit(1);
