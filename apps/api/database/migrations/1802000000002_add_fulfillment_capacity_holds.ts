import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("fulfillment_capacity_holds", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("promise_quote_id").unsigned().notNullable().references("id").inTable("fulfillment_promise_quotes").onDelete("CASCADE");
            table.bigInteger("capacity_window_id").unsigned().notNullable().references("id").inTable("fulfillment_capacity_windows").onDelete("RESTRICT");
            table.bigInteger("order_id").unsigned().nullable().references("id").inTable("orders").onDelete("SET NULL");
            table.integer("units").notNullable();
            table.string("status", 16).notNullable().defaultTo("held");
            table.string("idempotency_key", 190).notNullable();
            table.timestamp("expires_at", { useTz: true }).notNullable();
            table.timestamp("committed_at", { useTz: true }).nullable();
            table.timestamp("released_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "promise_quote_id", "capacity_window_id"], {
                indexName: "fulfillment_capacity_hold_quote_window_unique",
            });
            table.unique(["tenant_id", "idempotency_key"], { indexName: "fulfillment_capacity_hold_idempotency_unique" });
            table.index(["tenant_id", "status", "expires_at"], "fulfillment_capacity_hold_expiry_idx");
        });
        this.schema.raw("ALTER TABLE fulfillment_capacity_holds ADD CONSTRAINT fulfillment_capacity_hold_units_check CHECK (units > 0)");
        this.schema.raw("ALTER TABLE fulfillment_capacity_holds ADD CONSTRAINT fulfillment_capacity_hold_status_check CHECK (status IN ('held','committed','released','expired'))");
        this.schema.raw(`ALTER TABLE fulfillment_capacity_holds ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`);
        this.schema.raw("ALTER TABLE fulfillment_capacity_holds ENABLE ROW LEVEL SECURITY");
        this.schema.raw("ALTER TABLE fulfillment_capacity_holds FORCE ROW LEVEL SECURITY");
        this.schema.raw(`CREATE POLICY fulfillment_capacity_holds_tenant_isolation ON fulfillment_capacity_holds USING (${TENANT}) WITH CHECK (${TENANT})`);
    }

    async down() {
        this.schema.dropTable("fulfillment_capacity_holds");
    }
}
