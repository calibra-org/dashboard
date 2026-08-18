import fs from "node:fs";

const required = [
    "apps/api/database/migrations/1767600000000_create_phase20_trust_risk_os.ts",
    "apps/api/app/services/phase20_trust_risk_service.ts",
    "apps/api/app/controllers/admin/trust_risk_controller.ts",
    "apps/api/app/validators/admin/phase20_trust_risk_validator.ts",
    "apps/api/start/routes/admin_trust_risk.ts",
    "apps/admin/src/features/trust/TrustRiskWorkspace.tsx",
    "apps/admin/src/lib/queries/trust-risk.ts",
    "apps/admin/src/app/[locale]/(authenticated)/trust/page.tsx",
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Phase20 missing ${file}`);

const migration = fs.readFileSync(required[0], "utf8");
const tables = ["fraud_risk_models", "fraud_risk_model_versions", "fraud_signals", "fraud_risk_scores", "fraud_decisions", "fraud_action_executions", "fraud_cases", "fraud_case_events", "fraud_subject_controls"];
for (const table of tables) {
    if (!migration.includes(`createTable(\"${table}\"`)) throw new Error(`Phase20 table missing ${table}`);
    if (!migration.includes(`\"${table}\"`)) throw new Error(`Phase20 RLS table registry missing ${table}`);
}
for (const token of ["ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY", "ALTER TABLE ${table} FORCE ROW LEVEL SECURITY", "CREATE POLICY ${table}_tenant_policy"]) if (!migration.includes(token)) throw new Error(`Phase20 RLS loop invariant missing ${token}`);
if (!migration.includes("fraud_model_single_champion_idx")) throw new Error("Phase20 single Champion guard missing");

const routes = fs.readFileSync(required[4], "utf8");
const writeRoutes = routes.split("\n").filter((line) => line.includes("router.post("));
if (writeRoutes.length !== 11) throw new Error(`Phase20 expected 11 write routes, found ${writeRoutes.length}`);
for (const line of writeRoutes) if (!line.includes("adminWriteLimiter")) throw new Error(`Phase20 write route lacks limiter: ${line.trim()}`);

const service = fs.readFileSync(required[1], "utf8");
for (const token of ["calculateRiskDecision", "idempotency_key", "control.block", "model.promote_champion", "[redacted]"]) if (!service.includes(token)) throw new Error(`Phase20 invariant missing ${token}`);
const checkout = fs.readFileSync("apps/api/app/controllers/checkout/submit_controller.ts", "utf8");
const guard = checkout.indexOf("phase20TrustRiskService.checkoutGuard");
const finalize = checkout.indexOf("orderFinalizer.finalize");
if (guard < 0 || finalize < 0 || guard > finalize) throw new Error("Phase20 checkout guard must run before order finalization");

const ui = fs.readFileSync(required[5], "utf8");
if (/#[0-9a-f]{3,8}\b|rgba?\(|\b(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+/i.test(ui)) throw new Error("Phase20 TrustWorkspace contains non-token color");
if (/\b(?:mr|ml|pr|pl)-/.test(ui)) throw new Error("Phase20 TrustWorkspace uses physical RTL spacing classes");
if (/\b(mock|demo|fake)\b/i.test(ui)) throw new Error("Phase20 TrustWorkspace contains runtime mock/demo marker");
console.log(`phase20 trust risk integration: ok (${tables.length} RLS tables, ${writeRoutes.length} limited writes)`);
