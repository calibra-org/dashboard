import { readFileSync } from "node:fs";

const required = [
    "apps/api/database/migrations/1765000000000_create_economics_os.ts",
    "apps/api/app/services/economics_service.ts",
    "apps/api/app/controllers/admin/economics_controller.ts",
    "apps/api/start/routes/admin_economics.ts",
    "apps/admin/src/features/economics/EconomicsWorkspace.tsx",
    "apps/admin/src/features/economics/EconomicsDrilldowns.tsx",
    "apps/admin/src/lib/queries/economics.ts",
    "docs/api/reference/openapi/admin.phase12.v1.yaml",
];
for (const file of required) readFileSync(file, "utf8");
const migration = readFileSync(required[0], "utf8");
const service = readFileSync(required[1], "utf8");
const orderState = readFileSync("apps/api/app/services/order_state_machine.ts", "utf8");
const refund = readFileSync("apps/api/app/services/refund_service.ts", "utf8");
const routes = readFileSync("apps/api/start/routes.ts", "utf8");
const admin = readFileSync(required[4], "utf8");
for (const token of ["ENABLE ROW LEVEL SECURITY", "FORCE ROW LEVEL SECURITY", "append-only", "economic_mutation_receipts"]) {
    if (!migration.includes(token)) throw new Error(`Phase 12 migration invariant missing: ${token}`);
}
for (const token of [
    "incomplete",
    "realized",
    "forecast",
    "reversal_of_id",
    "Idempotency-Key",
    "pg_advisory_xact_lock",
    "unit_landed_cost_minor === null",
]) {
    if (!service.includes(token) && !readFileSync(required[2], "utf8").includes(token))
        throw new Error(`Phase 12 service invariant missing: ${token}`);
}
if (!orderState.includes("captureOrderEconomics")) throw new Error("Order economic capture is not wired into paid transition");
if (!refund.includes("captureRefundEconomics")) throw new Error("Refund economic decomposition is not wired");
if (!routes.includes("admin_economics.js")) throw new Error("Economics routes are not registered");
for (const label of ["Profitability Cube", "Cash & Reconciliation", "Unknown landed cost", "Capital Simulator"]) {
    if (!admin.includes(label)) throw new Error(`Economics admin surface missing: ${label}`);
}
console.log("Phase 12 economics integration invariants: OK");
