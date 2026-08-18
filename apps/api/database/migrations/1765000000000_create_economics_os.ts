import { BaseSchema } from "@adonisjs/lucid/schema";

const TABLES = [
    "economic_cost_policies",
    "economic_cost_layers",
    "economic_line_cost_snapshots",
    "economic_ledger_entries",
    "economic_settlements",
    "economic_mutation_receipts",
] as const;
const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("economic_cost_policies", (table) => {
            table.bigIncrements("id").primary();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.integer("version").notNullable();
            table.string("inventory_method", 24).notNullable().defaultTo("fifo");
            table.bigInteger("packaging_minor").nullable();
            table.bigInteger("fulfillment_minor").nullable();
            table.bigInteger("payment_fee_bps").nullable();
            table.bigInteger("channel_fee_bps").nullable();
            table.bigInteger("promotion_minor").nullable();
            table.bigInteger("affiliate_minor").nullable();
            table.string("currency", 3).notNullable();
            table.timestamp("effective_from", { useTz: true }).notNullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "version"], { indexName: "economic_cost_policies_version_uq" });
            table.index(["tenant_id", "effective_from"], "economic_cost_policies_effective_idx");
        });

        this.schema.createTable("economic_cost_layers", (table) => {
            table.bigIncrements("id").primary();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("RESTRICT");
            table
                .bigInteger("variation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("RESTRICT");
            table.integer("quantity_initial").notNullable();
            table.integer("quantity_remaining").notNullable();
            table.bigInteger("unit_purchase_cost_minor").nullable();
            table.bigInteger("unit_landed_cost_minor").nullable();
            table.string("currency", 3).notNullable();
            table.string("source_kind", 48).notNullable().defaultTo("manual");
            table.string("source_ref", 190).nullable();
            table.timestamp("effective_at", { useTz: true }).notNullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "product_id", "variation_id", "currency", "effective_at"], "economic_cost_layers_fifo_idx");
        });

        this.schema.createTable("economic_line_cost_snapshots", (table) => {
            table.bigIncrements("id").primary();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("RESTRICT");
            table
                .bigInteger("order_line_item_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("order_line_items")
                .onDelete("RESTRICT");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("RESTRICT");
            table
                .bigInteger("variation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("RESTRICT");
            table.integer("version").notNullable();
            table.integer("quantity").notNullable();
            table.bigInteger("unit_cost_minor").nullable();
            table.bigInteger("total_cost_minor").nullable();
            table.string("currency", 3).notNullable();
            table.string("quality", 24).notNullable();
            table.string("method", 24).notNullable();
            table
                .bigInteger("policy_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("economic_cost_policies")
                .onDelete("RESTRICT");
            table.jsonb("layer_breakdown").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("reason", 500).nullable();
            table
                .bigInteger("replaces_snapshot_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("economic_line_cost_snapshots")
                .onDelete("RESTRICT");
            table.timestamp("effective_at", { useTz: true }).notNullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "order_line_item_id", "version"], {
                indexName: "economic_line_cost_snapshots_version_uq",
            });
            table.index(["tenant_id", "order_id"], "economic_line_cost_snapshots_order_idx");
        });

        this.schema.createTable("economic_ledger_entries", (table) => {
            table.bigIncrements("id").primary();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("order_id").unsigned().nullable().references("id").inTable("orders").onDelete("RESTRICT");
            table
                .bigInteger("order_line_item_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("order_line_items")
                .onDelete("RESTRICT");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("RESTRICT");
            table
                .bigInteger("variation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("RESTRICT");
            table.string("entry_kind", 48).notNullable();
            table.string("quality", 24).notNullable();
            table.bigInteger("amount_minor").nullable();
            table.string("currency", 3).notNullable();
            table.string("source_kind", 48).notNullable();
            table.string("source_id", 190).notNullable();
            table
                .bigInteger("reversal_of_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("economic_ledger_entries")
                .onDelete("RESTRICT");
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("effective_at", { useTz: true }).notNullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "entry_kind", "source_kind", "source_id", "order_line_item_id"], {
                indexName: "economic_ledger_source_uq",
            });
            table.index(["tenant_id", "currency", "effective_at"], "economic_ledger_time_idx");
            table.index(["tenant_id", "order_id"], "economic_ledger_order_idx");
            table.index(["tenant_id", "product_id", "variation_id"], "economic_ledger_product_idx");
        });

        this.schema.createTable("economic_settlements", (table) => {
            table.bigIncrements("id").primary();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("provider", 80).notNullable();
            table.string("settlement_key", 190).notNullable();
            table.integer("revision").notNullable();
            table.string("status", 24).notNullable();
            table.string("currency", 3).notNullable();
            table.bigInteger("gross_minor").notNullable();
            table.bigInteger("fee_minor").notNullable().defaultTo(0);
            table.bigInteger("refund_minor").notNullable().defaultTo(0);
            table.bigInteger("net_minor").notNullable();
            table.timestamp("expected_at", { useTz: true }).nullable();
            table.timestamp("settled_at", { useTz: true }).nullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table
                .bigInteger("replaces_settlement_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("economic_settlements")
                .onDelete("RESTRICT");
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "provider", "settlement_key", "revision"], {
                indexName: "economic_settlements_revision_uq",
            });
            table.index(["tenant_id", "status", "expected_at"], "economic_settlements_forecast_idx");
        });

        this.schema.createTable("economic_mutation_receipts", (table) => {
            table.bigIncrements("id").primary();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("scope", 80).notNullable();
            table.string("idempotency_key", 190).notNullable();
            table.string("request_hash", 64).notNullable();
            table.jsonb("response_payload").nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "scope", "idempotency_key"], { indexName: "economic_mutation_receipts_uq" });
        });

        const checks = [
            "ALTER TABLE economic_cost_policies ADD CONSTRAINT economic_cost_policy_method_chk CHECK (inventory_method IN ('fifo','weighted_average','manual'))",
            "ALTER TABLE economic_cost_layers ADD CONSTRAINT economic_cost_layer_qty_chk CHECK (quantity_initial > 0 AND quantity_remaining >= 0 AND quantity_remaining <= quantity_initial)",
            "ALTER TABLE economic_line_cost_snapshots ADD CONSTRAINT economic_snapshot_quality_chk CHECK (quality IN ('estimated','realized','forecast','incomplete'))",
            "ALTER TABLE economic_line_cost_snapshots ADD CONSTRAINT economic_snapshot_cost_chk CHECK ((quality = 'incomplete' AND total_cost_minor IS NULL) OR quality <> 'incomplete')",
            "ALTER TABLE economic_ledger_entries ADD CONSTRAINT economic_ledger_quality_chk CHECK (quality IN ('estimated','realized','forecast','incomplete'))",
            "ALTER TABLE economic_settlements ADD CONSTRAINT economic_settlement_status_chk CHECK (status IN ('forecast','pending','settled','reversed'))",
        ];
        for (const sql of checks) this.schema.raw(sql);

        for (const table of TABLES) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY tenant_isolation ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
        }

        for (const table of [
            "economic_cost_policies",
            "economic_cost_layers",
            "economic_line_cost_snapshots",
            "economic_ledger_entries",
            "economic_settlements",
        ]) {
            this.schema.raw(
                `CREATE OR REPLACE FUNCTION ${table}_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '${table} is append-only'; END; $$`,
            );
            this.schema.raw(
                `CREATE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION ${table}_immutable_guard()`,
            );
        }
    }

    async down() {
        for (const table of [
            "economic_settlements",
            "economic_ledger_entries",
            "economic_line_cost_snapshots",
            "economic_cost_layers",
            "economic_cost_policies",
        ]) {
            this.schema.raw(`DROP FUNCTION IF EXISTS ${table}_immutable_guard() CASCADE`);
        }
        this.schema.dropTable("economic_mutation_receipts");
        this.schema.dropTable("economic_settlements");
        this.schema.dropTable("economic_ledger_entries");
        this.schema.dropTable("economic_line_cost_snapshots");
        this.schema.dropTable("economic_cost_layers");
        this.schema.dropTable("economic_cost_policies");
    }
}
