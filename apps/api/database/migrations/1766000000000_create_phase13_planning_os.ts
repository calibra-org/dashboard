import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT_PREDICATE = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

const TENANT_TABLES = [
    "planning_forecast_runs",
    "planning_forecast_points",
    "planning_replenishment_recommendations",
    "planning_cycles",
    "planning_scenarios",
    "planning_overrides",
    "planning_approvals",
] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("planning_forecast_runs", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("model_code", 80).notNullable().defaultTo("calibra_weighted_seasonal_v2");
            table.string("model_version", 40).notNullable().defaultTo("2.0.0");
            table.integer("history_days").notNullable().defaultTo(84);
            table.integer("horizon_days").notNullable().defaultTo(28);
            table.integer("review_period_days").notNullable().defaultTo(7);
            table.integer("default_lead_time_days").nullable();
            table.decimal("service_level_target", 8, 6).notNullable().defaultTo(0.9);
            table.timestamp("data_cutoff_at", { useTz: true }).notNullable();
            table.timestamp("source_freshness_at", { useTz: true }).nullable();
            table.string("source_hash", 64).notNullable();
            table.string("status", 24).notNullable().defaultTo("running");
            table.integer("series_count").notNullable().defaultTo(0);
            table.integer("point_count").notNullable().defaultTo(0);
            table.integer("insufficient_series_count").notNullable().defaultTo(0);
            table.integer("stockout_censored_days").notNullable().defaultTo(0);
            table.decimal("wape", 12, 6).nullable();
            table.decimal("bias", 12, 6).nullable();
            table.decimal("interval_coverage", 12, 6).nullable();
            table.integer("accuracy_evaluated_days").notNullable().defaultTo(0);
            table.integer("accuracy_censored_points").notNullable().defaultTo(0);
            table.jsonb("model_parameters").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("dependency_state").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.text("failure_reason").nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.index(["tenant_id", "created_at"], "planning_forecast_runs_tenant_created_idx");
            table.index(["tenant_id", "status", "created_at"], "planning_forecast_runs_status_idx");
        });

        this.schema.createTable("planning_forecast_points", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("forecast_run_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("planning_forecast_runs")
                .onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table
                .bigInteger("variation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("SET NULL");
            table
                .bigInteger("inventory_item_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("inventory_items")
                .onDelete("SET NULL");
            table.bigInteger("location_id").unsigned().nullable();
            table.string("location_key", 96).notNullable().defaultTo("unassigned");
            table.string("sku_snapshot", 190).nullable();
            table.string("product_name_snapshot", 255).notNullable();
            table.date("forecast_date").notNullable();
            table.decimal("p10_quantity", 18, 4).notNullable();
            table.decimal("p50_quantity", 18, 4).notNullable();
            table.decimal("p90_quantity", 18, 4).notNullable();
            table.decimal("actual_quantity", 18, 4).nullable();
            table.timestamp("actual_observed_at", { useTz: true }).nullable();
            table.boolean("actual_censored").notNullable().defaultTo(false);
            table.string("quality", 32).notNullable();
            table.decimal("confidence", 8, 6).notNullable();
            table.jsonb("reason_codes").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "forecast_run_id", "forecast_date"], "planning_forecast_points_run_day_idx");
            table.index(["tenant_id", "product_id", "variation_id", "location_key"], "planning_forecast_points_series_idx");
        });
        this.schema.raw(`
            CREATE UNIQUE INDEX planning_forecast_points_series_day_unique
            ON planning_forecast_points (
                tenant_id,
                forecast_run_id,
                COALESCE(product_id, 0),
                COALESCE(variation_id, 0),
                location_key,
                forecast_date
            )
        `);

        this.schema.createTable("planning_replenishment_recommendations", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("forecast_run_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("planning_forecast_runs")
                .onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table
                .bigInteger("variation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("SET NULL");
            table
                .bigInteger("inventory_item_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("inventory_items")
                .onDelete("SET NULL");
            table.bigInteger("location_id").unsigned().nullable();
            table.string("location_key", 96).notNullable();
            table.string("sku_snapshot", 190).nullable();
            table.string("product_name_snapshot", 255).notNullable();
            table.string("status", 24).notNullable();
            table.integer("on_hand_quantity").nullable();
            table.decimal("suggested_quantity", 18, 4).nullable();
            table.decimal("daily_p50", 18, 4).notNullable();
            table.decimal("daily_p90", 18, 4).notNullable();
            table.decimal("lead_time_demand_p50", 18, 4).nullable();
            table.decimal("lead_time_demand_p90", 18, 4).nullable();
            table.decimal("safety_stock", 18, 4).nullable();
            table.decimal("reorder_point", 18, 4).nullable();
            table.decimal("target_stock", 18, 4).nullable();
            table.integer("lead_time_days").nullable();
            table.integer("review_period_days").notNullable();
            table.decimal("service_level_target", 8, 6).notNullable();
            table.string("economics_status", 40).notNullable().defaultTo("dependency_not_landed");
            table.string("execution_boundary", 40).notNullable().defaultTo("phase14_procurement_only");
            table.jsonb("reason_codes").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamps(true, true);
            table.index(["tenant_id", "forecast_run_id", "status"], "planning_replenishment_run_status_idx");
            table.index(["tenant_id", "product_id", "variation_id", "location_key"], "planning_replenishment_series_idx");
        });

        this.schema.createTable("planning_cycles", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("title", 160).notNullable();
            table.string("status", 32).notNullable().defaultTo("draft");
            table
                .bigInteger("forecast_run_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("planning_forecast_runs")
                .onDelete("SET NULL");
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("approved_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("published_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("approved_at", { useTz: true }).nullable();
            table.timestamp("published_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.index(["tenant_id", "status", "updated_at"], "planning_cycles_status_idx");
        });

        this.schema.createTable("planning_scenarios", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("title", 160).notNullable();
            table.string("status", 24).notNullable().defaultTo("draft");
            table
                .bigInteger("base_forecast_run_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("planning_forecast_runs")
                .onDelete("SET NULL");
            table.decimal("demand_multiplier", 8, 4).notNullable().defaultTo(1);
            table.integer("lead_time_days").nullable();
            table.integer("review_period_days").notNullable().defaultTo(7);
            table.bigInteger("capital_limit_minor").nullable();
            table.text("notes").nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.index(["tenant_id", "updated_at"], "planning_scenarios_updated_idx");
        });

        this.schema.createTable("planning_overrides", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("forecast_point_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("planning_forecast_points")
                .onDelete("CASCADE");
            table.decimal("original_quantity", 18, 4).notNullable();
            table.decimal("override_quantity", 18, 4).notNullable();
            table.string("reason", 320).notNullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("status", 24).notNullable().defaultTo("pending");
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("reviewed_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("reviewed_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.index(["tenant_id", "status", "created_at"], "planning_overrides_status_idx");
        });

        this.schema.createTable("planning_approvals", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("planning_cycle_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("planning_cycles")
                .onDelete("CASCADE");
            table.string("decision", 16).notNullable();
            table.text("note").nullable();
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "planning_cycle_id", "created_at"], "planning_approvals_cycle_idx");
        });

        const checks = [
            `ALTER TABLE planning_forecast_runs ADD CONSTRAINT planning_forecast_runs_status_check CHECK (status IN ('running','completed','failed'))`,
            `ALTER TABLE planning_forecast_runs ADD CONSTRAINT planning_forecast_runs_window_check CHECK (history_days BETWEEN 28 AND 365 AND horizon_days BETWEEN 1 AND 90 AND review_period_days BETWEEN 1 AND 60 AND (default_lead_time_days IS NULL OR default_lead_time_days BETWEEN 0 AND 365))`,
            `ALTER TABLE planning_forecast_runs ADD CONSTRAINT planning_forecast_runs_service_check CHECK (service_level_target BETWEEN 0.5 AND 0.999)`,
            `ALTER TABLE planning_forecast_runs ADD CONSTRAINT planning_forecast_runs_accuracy_check CHECK ((wape IS NULL OR wape >= 0) AND (interval_coverage IS NULL OR interval_coverage BETWEEN 0 AND 1))`,
            `ALTER TABLE planning_forecast_points ADD CONSTRAINT planning_forecast_points_quantiles_check CHECK (p10_quantity >= 0 AND p50_quantity >= p10_quantity AND p90_quantity >= p50_quantity AND (actual_quantity IS NULL OR actual_quantity >= 0))`,
            `ALTER TABLE planning_forecast_points ADD CONSTRAINT planning_forecast_points_quality_check CHECK (quality IN ('ready','limited_history','insufficient_data'))`,
            `ALTER TABLE planning_forecast_points ADD CONSTRAINT planning_forecast_points_confidence_check CHECK (confidence BETWEEN 0 AND 1)`,
            `ALTER TABLE planning_replenishment_recommendations ADD CONSTRAINT planning_replenishment_status_check CHECK (status IN ('ready','needs_input','not_managed','blocked'))`,
            `ALTER TABLE planning_replenishment_recommendations ADD CONSTRAINT planning_replenishment_quantity_check CHECK ((suggested_quantity IS NULL OR suggested_quantity >= 0) AND daily_p50 >= 0 AND daily_p90 >= daily_p50 AND (lead_time_days IS NULL OR lead_time_days BETWEEN 0 AND 365) AND review_period_days BETWEEN 1 AND 60 AND service_level_target BETWEEN 0.5 AND 0.999)`,
            `ALTER TABLE planning_cycles ADD CONSTRAINT planning_cycles_status_check CHECK (status IN ('draft','data_ready','forecasted','under_review','approved','published','superseded','cancelled'))`,
            `ALTER TABLE planning_cycles ADD CONSTRAINT planning_cycles_version_check CHECK (version >= 1)`,
            `ALTER TABLE planning_scenarios ADD CONSTRAINT planning_scenarios_status_check CHECK (status IN ('draft','ready','archived'))`,
            `ALTER TABLE planning_scenarios ADD CONSTRAINT planning_scenarios_values_check CHECK (demand_multiplier BETWEEN 0.1 AND 5 AND (lead_time_days IS NULL OR lead_time_days BETWEEN 0 AND 365) AND review_period_days BETWEEN 1 AND 60 AND version >= 1)`,
            `ALTER TABLE planning_overrides ADD CONSTRAINT planning_overrides_status_check CHECK (status IN ('pending','approved','rejected'))`,
            `ALTER TABLE planning_overrides ADD CONSTRAINT planning_overrides_quantity_check CHECK (original_quantity >= 0 AND override_quantity >= 0)`,
            `ALTER TABLE planning_approvals ADD CONSTRAINT planning_approvals_decision_check CHECK (decision IN ('approved','rejected','published'))`,
        ];
        for (const sql of checks) this.schema.raw(sql);

        for (const table of TENANT_TABLES) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(
                `CREATE POLICY tenant_isolation ON ${table} USING (${TENANT_PREDICATE}) WITH CHECK (${TENANT_PREDICATE})`,
            );
        }
    }

    async down() {
        this.schema.dropTable("planning_approvals");
        this.schema.dropTable("planning_overrides");
        this.schema.dropTable("planning_scenarios");
        this.schema.dropTable("planning_cycles");
        this.schema.dropTable("planning_replenishment_recommendations");
        this.schema.raw("DROP INDEX IF EXISTS planning_forecast_points_series_day_unique");
        this.schema.dropTable("planning_forecast_points");
        this.schema.dropTable("planning_forecast_runs");
    }
}
