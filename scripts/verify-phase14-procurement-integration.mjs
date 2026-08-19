import fs from "node:fs";

const required = [
    "apps/api/database/migrations/1767000000000_create_phase14_procurement_os.ts",
    "apps/api/app/services/phase14_procurement_service.ts",
    "apps/api/app/controllers/admin/procurement_controller.ts",
    "apps/api/start/routes/admin_procurement.ts",
    "apps/admin/src/features/procurement/ProcurementWorkspace.tsx",
];
for (const f of required) if (!fs.existsSync(f)) throw new Error(`Phase14 missing ${f}`);
const migration = fs.readFileSync(required[0], "utf8");
for (const t of ["suppliers", "purchase_orders", "purchase_order_receipts", "supplier_incidents"])
    if (!migration.includes(t)) throw new Error(`Phase14 table missing ${t}`);
const service = fs.readFileSync(required[1], "utf8");
for (const token of [
    "planning_replenishment_recommendations",
    "supplier_reliability",
    "partially_received",
    "supplier_incidents",
])
    if (!service.includes(token)) throw new Error(`Phase14 invariant missing ${token}`);
console.log("phase14 procurement integration: ok");