import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";
const TABLES = ["suppliers", "supplier_products", "purchase_orders", "purchase_order_lines", "purchase_order_receipts", "purchase_order_receipt_lines", "supplier_incidents"] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("suppliers", (t) => {
            t.bigIncrements("id"); t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.string("code", 64).notNullable(); t.string("legal_name", 220).notNullable(); t.string("display_name", 220).notNullable(); t.string("status", 24).notNullable().defaultTo("active");
            t.string("email", 254).nullable(); t.string("phone", 64).nullable(); t.string("currency", 3).notNullable().defaultTo("IRR"); t.string("payment_terms", 120).nullable();
            t.integer("default_lead_time_days").nullable(); t.decimal("lead_time_variance_days", 10, 3).nullable(); t.decimal("fill_rate", 8, 6).nullable(); t.decimal("on_time_rate", 8, 6).nullable(); t.decimal("quality_rate", 8, 6).nullable();
            t.decimal("cost_score", 8, 6).nullable(); t.decimal("responsiveness_score", 8, 6).nullable(); t.decimal("dependency_risk", 8, 6).nullable(); t.string("criticality", 16).notNullable().defaultTo("normal");
            t.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb")); t.timestamps(true, true); t.unique(["tenant_id", "code"]); t.index(["tenant_id", "status", "criticality"]);
        });
        this.schema.createTable("supplier_products", (t) => {
            t.bigIncrements("id"); t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE"); t.bigInteger("supplier_id").unsigned().notNullable().references("id").inTable("suppliers").onDelete("CASCADE");
            t.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("CASCADE"); t.bigInteger("variation_id").unsigned().nullable().references("id").inTable("product_variations").onDelete("SET NULL");
            t.string("supplier_sku", 190).nullable(); t.decimal("unit_cost", 20, 4).nullable(); t.string("currency", 3).notNullable().defaultTo("IRR"); t.decimal("moq", 18, 4).notNullable().defaultTo(1); t.decimal("order_multiple", 18, 4).notNullable().defaultTo(1);
            t.integer("lead_time_days").nullable(); t.boolean("preferred").notNullable().defaultTo(false); t.boolean("active").notNullable().defaultTo(true); t.timestamps(true, true); t.index(["tenant_id", "supplier_id", "active"]); t.index(["tenant_id", "product_id", "variation_id"]);
        });
        this.schema.createTable("purchase_orders", (t) => {
            t.bigIncrements("id"); t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE"); t.bigInteger("supplier_id").unsigned().notNullable().references("id").inTable("suppliers").onDelete("RESTRICT");
            t.string("number", 80).notNullable(); t.string("status", 32).notNullable().defaultTo("draft"); t.string("currency", 3).notNullable().defaultTo("IRR"); t.integer("version").notNullable().defaultTo(1); t.date("order_date").nullable(); t.date("expected_date").nullable();
            t.string("payment_terms", 120).nullable(); t.bigInteger("subtotal_minor").notNullable().defaultTo(0); t.bigInteger("tax_minor").notNullable().defaultTo(0); t.bigInteger("fees_minor").notNullable().defaultTo(0); t.bigInteger("total_minor").notNullable().defaultTo(0);
            t.bigInteger("planning_recommendation_id").unsigned().nullable().references("id").inTable("planning_replenishment_recommendations").onDelete("SET NULL"); t.string("idempotency_key", 160).nullable(); t.jsonb("impact_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL"); t.bigInteger("approved_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL"); t.timestamp("approved_at", { useTz: true }).nullable();
            t.timestamps(true, true); t.unique(["tenant_id", "number"]); t.unique(["tenant_id", "idempotency_key"]); t.index(["tenant_id", "status", "expected_date"]);
        });
        this.schema.createTable("purchase_order_lines", (t) => {
            t.bigIncrements("id"); t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE"); t.bigInteger("purchase_order_id").unsigned().notNullable().references("id").inTable("purchase_orders").onDelete("CASCADE");
            t.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("RESTRICT"); t.bigInteger("variation_id").unsigned().nullable().references("id").inTable("product_variations").onDelete("SET NULL"); t.string("sku_snapshot", 190).nullable(); t.string("name_snapshot", 255).notNullable();
            t.decimal("ordered_quantity", 18, 4).notNullable(); t.decimal("received_quantity", 18, 4).notNullable().defaultTo(0); t.decimal("accepted_quantity", 18, 4).notNullable().defaultTo(0); t.decimal("rejected_quantity", 18, 4).notNullable().defaultTo(0); t.decimal("quarantine_quantity", 18, 4).notNullable().defaultTo(0);
            t.decimal("unit_cost", 20, 4).notNullable(); t.bigInteger("line_total_minor").notNullable(); t.date("expected_date").nullable(); t.timestamps(true, true); t.index(["tenant_id", "purchase_order_id"]);
        });
        this.schema.createTable("purchase_order_receipts", (t) => {
            t.bigIncrements("id"); t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE"); t.bigInteger("purchase_order_id").unsigned().notNullable().references("id").inTable("purchase_orders").onDelete("RESTRICT");
            t.string("number", 80).notNullable(); t.string("idempotency_key", 160).nullable(); t.timestamp("received_at", { useTz: true }).notNullable(); t.text("notes").nullable(); t.bigInteger("received_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.timestamps(true, true); t.unique(["tenant_id", "number"]); t.unique(["tenant_id", "idempotency_key"]);
        });
        this.schema.createTable("purchase_order_receipt_lines", (t) => {
            t.bigIncrements("id"); t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE"); t.bigInteger("receipt_id").unsigned().notNullable().references("id").inTable("purchase_order_receipts").onDelete("CASCADE"); t.bigInteger("purchase_order_line_id").unsigned().notNullable().references("id").inTable("purchase_order_lines").onDelete("RESTRICT");
            t.decimal("received_quantity", 18, 4).notNullable(); t.decimal("accepted_quantity", 18, 4).notNullable(); t.decimal("rejected_quantity", 18, 4).notNullable().defaultTo(0); t.decimal("quarantine_quantity", 18, 4).notNullable().defaultTo(0); t.string("quality_reason", 240).nullable(); t.string("lot_code", 120).nullable(); t.string("batch_code", 120).nullable();
            t.jsonb("serials").notNullable().defaultTo(this.raw("'[]'::jsonb")); t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
        });
        this.schema.createTable("supplier_incidents", (t) => {
            t.bigIncrements("id"); t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE"); t.bigInteger("supplier_id").unsigned().notNullable().references("id").inTable("suppliers").onDelete("CASCADE"); t.bigInteger("purchase_order_id").unsigned().nullable().references("id").inTable("purchase_orders").onDelete("SET NULL");
            t.string("type", 32).notNullable(); t.string("severity", 16).notNullable().defaultTo("medium"); t.string("status", 16).notNullable().defaultTo("open"); t.text("summary").notNullable(); t.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb")); t.timestamps(true, true); t.index(["tenant_id", "supplier_id", "status"]);
        });
        for (const sql of [
            `ALTER TABLE suppliers ADD CONSTRAINT suppliers_status_check CHECK (status IN ('active','paused','blocked','archived'))`,
            `ALTER TABLE suppliers ADD CONSTRAINT suppliers_rates_check CHECK ((fill_rate IS NULL OR fill_rate BETWEEN 0 AND 1) AND (on_time_rate IS NULL OR on_time_rate BETWEEN 0 AND 1) AND (quality_rate IS NULL OR quality_rate BETWEEN 0 AND 1) AND (dependency_risk IS NULL OR dependency_risk BETWEEN 0 AND 1))`,
            `ALTER TABLE purchase_orders ADD CONSTRAINT po_status_check CHECK (status IN ('draft','approval','sent','acknowledged','partially_shipped','partially_received','received','closed','cancelled'))`,
            `ALTER TABLE purchase_order_lines ADD CONSTRAINT po_line_qty_check CHECK (ordered_quantity > 0 AND received_quantity >= 0 AND accepted_quantity >= 0 AND rejected_quantity >= 0 AND quarantine_quantity >= 0)`,
            `ALTER TABLE purchase_order_receipt_lines ADD CONSTRAINT receipt_line_qty_check CHECK (received_quantity > 0 AND accepted_quantity >= 0 AND rejected_quantity >= 0 AND quarantine_quantity >= 0 AND accepted_quantity + rejected_quantity + quarantine_quantity = received_quantity)`,
            `ALTER TABLE supplier_incidents ADD CONSTRAINT supplier_incident_type_check CHECK (type IN ('delay','quality','short_shipment','price_jump','responsiveness','dependency'))`,
        ]) this.schema.raw(sql);
        for (const table of TABLES) this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
        for (const table of TABLES) this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
        for (const table of TABLES) this.schema.raw(`CREATE POLICY ${table}_tenant_policy ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
    }

    async down() { for (const table of [...TABLES].reverse()) this.schema.dropTable(table); }
}
