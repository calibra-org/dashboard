import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT_PREDICATE = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("order_fulfillments", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");
            table.string("status", 24).notNullable().defaultTo("pending");
            table.string("idempotency_key", 64).nullable();
            table.string("idempotency_fingerprint", 64).nullable();
            table.text("note").nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.integer("version").notNullable().defaultTo(1);
            table.timestamp("packed_at", { useTz: true }).nullable();
            table.timestamp("shipped_at", { useTz: true }).nullable();
            table.timestamp("delivered_at", { useTz: true }).nullable();
            table.timestamp("cancelled_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "order_id", "idempotency_key"], { indexName: "order_fulfillments_idempotency_unique" });
            table.index(["tenant_id", "order_id", "status", "created_at"], "order_fulfillments_order_idx");
        });

        this.schema.createTable("order_fulfillment_items", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("fulfillment_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("order_fulfillments")
                .onDelete("CASCADE");
            table
                .bigInteger("order_line_item_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("order_line_items")
                .onDelete("RESTRICT");
            table.integer("quantity").notNullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "fulfillment_id", "order_line_item_id"], {
                indexName: "order_fulfillment_items_line_unique",
            });
            table.index(["tenant_id", "order_line_item_id"], "order_fulfillment_items_line_idx");
        });

        this.schema.createTable("order_shipments", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("fulfillment_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("order_fulfillments")
                .onDelete("CASCADE");
            table.string("status", 32).notNullable().defaultTo("label_created");
            table.string("carrier", 120).nullable();
            table.string("service", 120).nullable();
            table.string("tracking_number", 190).nullable();
            table.text("tracking_url").nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.timestamp("shipped_at", { useTz: true }).nullable();
            table.timestamp("delivered_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.index(["tenant_id", "fulfillment_id", "created_at"], "order_shipments_fulfillment_idx");
            table.index(["tenant_id", "status", "updated_at"], "order_shipments_status_idx");
        });

        this.schema.createTable("order_shipment_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("shipment_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("order_shipments")
                .onDelete("CASCADE");
            table.string("status", 32).notNullable();
            table.string("location", 190).nullable();
            table.text("message").nullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "shipment_id", "occurred_at"], "order_shipment_events_timeline_idx");
        });

        this.schema.createTable("order_returns", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");
            table.string("status", 24).notNullable().defaultTo("requested");
            table.string("idempotency_key", 64).nullable();
            table.string("idempotency_fingerprint", 64).nullable();
            table.string("reason", 190).nullable();
            table.text("customer_note").nullable();
            table.text("internal_note").nullable();
            table.string("carrier", 120).nullable();
            table.string("tracking_number", 190).nullable();
            table.bigInteger("refund_id").unsigned().nullable().references("id").inTable("order_refunds").onDelete("SET NULL");
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("approved_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.integer("version").notNullable().defaultTo(1);
            table.timestamp("approved_at", { useTz: true }).nullable();
            table.timestamp("received_at", { useTz: true }).nullable();
            table.timestamp("completed_at", { useTz: true }).nullable();
            table.timestamp("cancelled_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "order_id", "idempotency_key"], { indexName: "order_returns_idempotency_unique" });
            table.index(["tenant_id", "order_id", "status", "created_at"], "order_returns_order_idx");
            table.index(["tenant_id", "status", "updated_at"], "order_returns_status_idx");
        });

        this.schema.createTable("order_return_items", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("return_id").unsigned().notNullable().references("id").inTable("order_returns").onDelete("CASCADE");
            table
                .bigInteger("order_line_item_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("order_line_items")
                .onDelete("RESTRICT");
            table.integer("requested_quantity").notNullable();
            table.integer("approved_quantity").notNullable().defaultTo(0);
            table.integer("received_quantity").notNullable().defaultTo(0);
            table.integer("damaged_quantity").notNullable().defaultTo(0);
            table.integer("restock_quantity").notNullable().defaultTo(0);
            table.bigInteger("refund_amount_minor").nullable();
            table.string("reason", 190).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "return_id", "order_line_item_id"], { indexName: "order_return_items_line_unique" });
            table.index(["tenant_id", "order_line_item_id"], "order_return_items_line_idx");
        });

        const checks = [
            `ALTER TABLE order_fulfillments ADD CONSTRAINT order_fulfillments_status_check CHECK (status IN ('pending','packed','shipped','delivered','cancelled'))`,
            `ALTER TABLE order_fulfillments ADD CONSTRAINT order_fulfillments_version_check CHECK (version >= 1)`,
            `ALTER TABLE order_fulfillment_items ADD CONSTRAINT order_fulfillment_items_quantity_check CHECK (quantity > 0)`,
            `ALTER TABLE order_shipments ADD CONSTRAINT order_shipments_status_check CHECK (status IN ('label_created','in_transit','out_for_delivery','delivered','exception','returned'))`,
            `ALTER TABLE order_shipments ADD CONSTRAINT order_shipments_version_check CHECK (version >= 1)`,
            `ALTER TABLE order_shipment_events ADD CONSTRAINT order_shipment_events_status_check CHECK (status IN ('label_created','in_transit','out_for_delivery','delivered','exception','returned'))`,
            `ALTER TABLE order_returns ADD CONSTRAINT order_returns_status_check CHECK (status IN ('requested','approved','in_transit','received','completed','cancelled'))`,
            `ALTER TABLE order_returns ADD CONSTRAINT order_returns_version_check CHECK (version >= 1)`,
            `ALTER TABLE order_return_items ADD CONSTRAINT order_return_items_quantities_check CHECK (requested_quantity > 0 AND approved_quantity >= 0 AND received_quantity >= 0 AND damaged_quantity >= 0 AND restock_quantity >= 0 AND approved_quantity <= requested_quantity AND received_quantity <= approved_quantity AND damaged_quantity <= received_quantity AND restock_quantity <= (received_quantity - damaged_quantity))`,
            `ALTER TABLE order_return_items ADD CONSTRAINT order_return_items_refund_check CHECK (refund_amount_minor IS NULL OR refund_amount_minor >= 0)`,
        ];
        for (const sql of checks) this.schema.raw(sql);

        const tenantTables = [
            "order_fulfillments",
            "order_fulfillment_items",
            "order_shipments",
            "order_shipment_events",
            "order_returns",
            "order_return_items",
        ];
        for (const table of tenantTables) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(
                `CREATE POLICY tenant_isolation ON ${table} USING (${TENANT_PREDICATE}) WITH CHECK (${TENANT_PREDICATE})`,
            );
        }

        this.schema.raw(`ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_ref_kind_check`);
        this.schema.raw(
            `ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_ref_kind_check CHECK (ref_kind IS NULL OR ref_kind IN ('order','refund','return','manual'))`,
        );
    }

    async down() {
        this.schema.raw(`ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_ref_kind_check`);
        this.schema.raw(
            `ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_ref_kind_check CHECK (ref_kind IS NULL OR ref_kind IN ('order','refund','manual'))`,
        );
        this.schema.dropTable("order_return_items");
        this.schema.dropTable("order_returns");
        this.schema.dropTable("order_shipment_events");
        this.schema.dropTable("order_shipments");
        this.schema.dropTable("order_fulfillment_items");
        this.schema.dropTable("order_fulfillments");
    }
}
