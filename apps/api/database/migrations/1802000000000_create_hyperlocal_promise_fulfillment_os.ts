import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";
const TABLES = [
    "fulfillment_network_nodes",
    "fulfillment_node_inventory_sources",
    "fulfillment_capacity_windows",
    "fulfillment_service_profiles",
    "fulfillment_transfer_lanes",
    "fulfillment_promise_quotes",
    "fulfillment_allocation_recommendations",
    "fulfillment_promise_outcomes",
] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("fulfillment_network_nodes", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.string("node_code", 96).notNullable();
            table.string("name", 190).notNullable();
            table.string("node_type", 24).notNullable().defaultTo("warehouse");
            table.string("status", 16).notNullable().defaultTo("active");
            table.string("timezone", 64).notNullable().defaultTo("Asia/Tehran");
            table.string("country", 2).notNullable();
            table.bigInteger("region_id").unsigned().nullable().references("id").inTable("regions").onDelete("SET NULL");
            table.string("city", 120).nullable();
            table.string("postcode_prefix", 32).nullable();
            table.decimal("latitude", 9, 6).nullable();
            table.decimal("longitude", 9, 6).nullable();
            table.time("cutoff_local_time").nullable();
            table.integer("handling_minutes").notNullable().defaultTo(60);
            table.integer("inventory_stale_after_minutes").notNullable().defaultTo(15);
            table.jsonb("operating_hours").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "fulfillment_nodes_public_unique" });
            table.unique(["tenant_id", "node_code"], { indexName: "fulfillment_nodes_code_unique" });
            table.index(["tenant_id", "status", "country", "region_id"], "fulfillment_nodes_match_idx");
        });

        this.schema.createTable("fulfillment_node_inventory_sources", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("node_id").unsigned().notNullable().references("id").inTable("fulfillment_network_nodes").onDelete("CASCADE");
            table.bigInteger("inventory_item_id").unsigned().notNullable().references("id").inTable("inventory_items").onDelete("CASCADE");
            table.string("status", 16).notNullable().defaultTo("active");
            table.timestamps(true, true);
            table.unique(["tenant_id", "inventory_item_id"], { indexName: "fulfillment_inventory_source_single_truth_unique" });
            table.index(["tenant_id", "node_id", "status"], "fulfillment_inventory_source_node_idx");
        });

        this.schema.createTable("fulfillment_capacity_windows", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("node_id").unsigned().notNullable().references("id").inTable("fulfillment_network_nodes").onDelete("CASCADE");
            table.date("service_date").notNullable();
            table.time("window_start_local").notNullable();
            table.time("window_end_local").notNullable();
            table.integer("capacity_units").notNullable();
            table.integer("reserved_units").notNullable().defaultTo(0);
            table.string("status", 16).notNullable().defaultTo("open");
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.unique(["tenant_id", "node_id", "service_date", "window_start_local", "window_end_local"], {
                indexName: "fulfillment_capacity_window_unique",
            });
            table.index(["tenant_id", "node_id", "service_date", "status"], "fulfillment_capacity_lookup_idx");
        });

        this.schema.createTable("fulfillment_service_profiles", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("node_id").unsigned().notNullable().references("id").inTable("fulfillment_network_nodes").onDelete("CASCADE");
            table
                .bigInteger("shipping_zone_method_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("shipping_zone_methods")
                .onDelete("CASCADE");
            table.string("status", 16).notNullable().defaultTo("active");
            table.integer("transit_minutes_p50").notNullable();
            table.integer("transit_minutes_p90").notNullable();
            table.integer("calibration_sample_count").notNullable().defaultTo(0);
            table.integer("minimum_sample_count").notNullable().defaultTo(20);
            table.integer("confidence_bps").notNullable().defaultTo(0);
            table.integer("max_calibration_age_hours").notNullable().defaultTo(168);
            table.timestamp("last_calibrated_at", { useTz: true }).nullable();
            table.jsonb("service_weekdays").notNullable().defaultTo(this.raw("'[1,2,3,4,5,6,7]'::jsonb"));
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.unique(["tenant_id", "node_id", "shipping_zone_method_id"], { indexName: "fulfillment_service_profile_unique" });
            table.index(["tenant_id", "shipping_zone_method_id", "status"], "fulfillment_service_profile_lookup_idx");
        });

        this.schema.createTable("fulfillment_transfer_lanes", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("from_node_id").unsigned().notNullable().references("id").inTable("fulfillment_network_nodes").onDelete("CASCADE");
            table.bigInteger("to_node_id").unsigned().notNullable().references("id").inTable("fulfillment_network_nodes").onDelete("CASCADE");
            table.string("status", 16).notNullable().defaultTo("active");
            table.integer("transfer_minutes_p90").notNullable();
            table.bigInteger("cost_minor").notNullable().defaultTo(0);
            table.integer("confidence_bps").notNullable().defaultTo(0);
            table.integer("calibration_sample_count").notNullable().defaultTo(0);
            table.timestamp("last_calibrated_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "from_node_id", "to_node_id"], { indexName: "fulfillment_transfer_lane_unique" });
        });

        this.schema.createTable("fulfillment_promise_quotes", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.bigInteger("cart_id").unsigned().nullable().references("id").inTable("carts").onDelete("SET NULL");
            table.bigInteger("order_id").unsigned().nullable().references("id").inTable("orders").onDelete("SET NULL");
            table.bigInteger("node_id").unsigned().notNullable().references("id").inTable("fulfillment_network_nodes").onDelete("RESTRICT");
            table
                .bigInteger("shipping_zone_method_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("shipping_zone_methods")
                .onDelete("RESTRICT");
            table.bigInteger("capacity_window_id").unsigned().nullable().references("id").inTable("fulfillment_capacity_windows").onDelete("SET NULL");
            table.bigInteger("service_profile_id").unsigned().notNullable().references("id").inTable("fulfillment_service_profiles").onDelete("RESTRICT");
            table.string("strategy", 32).notNullable().defaultTo("single_location");
            table.string("status", 16).notNullable().defaultTo("quoted");
            table.timestamp("window_start_at", { useTz: true }).notNullable();
            table.timestamp("window_end_at", { useTz: true }).notNullable();
            table.integer("confidence_bps").notNullable();
            table.bigInteger("shipping_cost_minor").notNullable();
            table.bigInteger("transfer_cost_minor").notNullable().defaultTo(0);
            table.string("currency", 3).notNullable().defaultTo("IRR");
            table.timestamp("inventory_observed_at", { useTz: true }).notNullable();
            table.timestamp("inventory_fresh_until", { useTz: true }).notNullable();
            table.string("destination_fingerprint", 64).notNullable();
            table.jsonb("line_snapshot").notNullable();
            table.jsonb("constraints").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("decision_trace").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("expires_at", { useTz: true }).notNullable();
            table.timestamp("consumed_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "fulfillment_promise_quote_public_unique" });
            table.index(["tenant_id", "cart_id", "status", "expires_at"], "fulfillment_promise_quote_cart_idx");
            table.index(["tenant_id", "order_id", "created_at"], "fulfillment_promise_quote_order_idx");
        });

        this.schema.createTable("fulfillment_allocation_recommendations", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");
            table.bigInteger("promise_quote_id").unsigned().nullable().references("id").inTable("fulfillment_promise_quotes").onDelete("SET NULL");
            table.string("strategy", 32).notNullable();
            table.integer("score_bps").notNullable();
            table.jsonb("recommendation").notNullable();
            table.jsonb("constraints").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("status", 16).notNullable().defaultTo("recommended");
            table.timestamp("accepted_at", { useTz: true }).nullable();
            table.bigInteger("accepted_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "order_id", "created_at"], "fulfillment_allocation_order_idx");
        });

        this.schema.createTable("fulfillment_promise_outcomes", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("promise_quote_id").unsigned().notNullable().references("id").inTable("fulfillment_promise_quotes").onDelete("CASCADE");
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");
            table.bigInteger("shipment_id").unsigned().nullable().references("id").inTable("order_shipments").onDelete("SET NULL");
            table.timestamp("actual_delivered_at", { useTz: true }).nullable();
            table.integer("lateness_minutes").nullable();
            table.boolean("on_time").nullable();
            table.string("source", 24).notNullable().defaultTo("shipment_event");
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "promise_quote_id"], { indexName: "fulfillment_promise_outcome_quote_unique" });
            table.index(["tenant_id", "order_id", "actual_delivered_at"], "fulfillment_promise_outcome_order_idx");
        });

        const checks = [
            "ALTER TABLE fulfillment_network_nodes ADD CONSTRAINT fulfillment_node_stale_minutes_check CHECK (inventory_stale_after_minutes BETWEEN 1 AND 1440)",
            "ALTER TABLE fulfillment_network_nodes ADD CONSTRAINT fulfillment_node_handling_check CHECK (handling_minutes BETWEEN 0 AND 10080)",
            "ALTER TABLE fulfillment_capacity_windows ADD CONSTRAINT fulfillment_capacity_nonnegative_check CHECK (capacity_units >= 0 AND reserved_units >= 0 AND reserved_units <= capacity_units)",
            "ALTER TABLE fulfillment_service_profiles ADD CONSTRAINT fulfillment_service_transit_check CHECK (transit_minutes_p50 >= 0 AND transit_minutes_p90 >= transit_minutes_p50)",
            "ALTER TABLE fulfillment_service_profiles ADD CONSTRAINT fulfillment_service_confidence_check CHECK (confidence_bps BETWEEN 0 AND 10000 AND calibration_sample_count >= 0 AND minimum_sample_count >= 1)",
            "ALTER TABLE fulfillment_transfer_lanes ADD CONSTRAINT fulfillment_transfer_nodes_check CHECK (from_node_id <> to_node_id)",
            "ALTER TABLE fulfillment_transfer_lanes ADD CONSTRAINT fulfillment_transfer_values_check CHECK (transfer_minutes_p90 >= 0 AND cost_minor >= 0 AND confidence_bps BETWEEN 0 AND 10000 AND calibration_sample_count >= 0)",
            "ALTER TABLE fulfillment_promise_quotes ADD CONSTRAINT fulfillment_promise_window_check CHECK (window_end_at >= window_start_at AND expires_at > created_at)",
            "ALTER TABLE fulfillment_promise_quotes ADD CONSTRAINT fulfillment_promise_confidence_check CHECK (confidence_bps BETWEEN 0 AND 10000 AND shipping_cost_minor >= 0 AND transfer_cost_minor >= 0)",
            "ALTER TABLE fulfillment_allocation_recommendations ADD CONSTRAINT fulfillment_allocation_score_check CHECK (score_bps BETWEEN 0 AND 10000)",
        ];
        for (const sql of checks) this.schema.raw(sql);

        for (const table of TABLES) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY ${table}_tenant_isolation ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
        }
    }

    async down() {
        for (const table of [...TABLES].reverse()) this.schema.dropTable(table);
    }
}
