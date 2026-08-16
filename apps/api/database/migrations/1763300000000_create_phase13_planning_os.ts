import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT_PREDICATE = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("planning_forecast_runs", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("model_code", 48).notNullable().defaultTo("seasonal_naive_v1");
            table.string("model_version", 24).notNullable().defaultTo("1.0.0");
            table.integer("history_days").notNullable().defaultTo(56);
            table.integer("horizon_days").notNullable().defaultTo(14);
            table.timestamp("data_cutoff_at", { useTz: true }).notNullable();
            table.string("status", 24).notNullable().defaultTo("running");
            table.integer("series_count").notNullable().defaultTo(0);
            table.integer("point_count").notNullable().defaultTo(0);
            table.integer("insufficient_series_count").notNullable().defaultTo(0);
            table.text("failure_reason").nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.index(["tenant_id", "created_at"], "planning_forecast_runs_tenant_created_idx");
        });

        this.schema.createTable("planning_forecast_points", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("forecast_run_id").unsigned().notNullable().references("id").inTable("planning_forecast_runs").onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table.bigInteger("variation_id").unsigned().nullable().references("id").inTable("product_variations").onDelete("SET NULL");
            table.string("sku", 190).nullable();
            table.string("product_name", 255).notNullable();
            table.date("forecast_date").notNullable();
            table.decimal("point_quantity", 18, 4).notNullable();
            table.decimal("interval_lower", 18, 4).nullable();
            table.decimal("interval_upper", 18, 4).nullable();
            table.decimal("mae", 18, 4).nullable();
            table.string("quality", 32).notNullable().defaultTo("observed_sales");
            table.jsonb("reason_codes").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "forecast_run_id", "product_id", "variation_id", "forecast_date"], {
                indexName: "planning_forecast_points_series_day_unique",
            });
            table.index(["tenant_id", "forecast_run_id", "forecast_date"], "planning_forecast_points_run_day_idx");
            table.index(["tenant_id", "product_id", "variation_id"], "planning_forecast_points_product_idx");
        });

        this.schema.createTable("planning_cycles", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("title", 160).notNullable();
            table.string("status", 32).notNullable().defaultTo("draft");
            table.bigInteger("forecast_run_id").unsigned().nullable().references("id").inTable("planning_forecast_runs").onDelete("SET NULL");
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
            table.bigInteger("base_forecast_run_id").unsigned().nullable().references("id").inTable("planning_forecast_runs").onDelete("SET NULL");
            table.decimal("demand_multiplier", 8, 4).notNullable().defaultTo(1);
            table.integer("lead_time_days").notNullable().defaultTo(0);
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
            table.bigInteger("forecast_point_id").unsigned().notNullable().references("id").inTable("planning_forecast_points").onDelete("CASCADE");
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
            table.bigInteger("planning_cycle_id").unsigned().notNullable().references("id").inTable("planning_cycles").onDelete("CASCADE");
            table.string("decision", 16).notNullable();
            table.text("note").nullable();
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "planning_cycle_id", "created_at"], "planning_approvals_cycle_idx");
        });

        const checks = [
            `ALTER TABLE planning_forecast_runs ADD CONSTRAINT planning_forecast_runs_status_check CHECK (status IN ('running','completed','failed'))`,
            `ALTER TABLE planning_forecast_runs ADD CONSTRAINT planning_forecast_runs_window_check CHECK (history_days BETWEEN 14 AND 365 AND horizon_days BETWEEN 1 AND 90)`,
            `ALTER TABLE planning_forecast_points ADD CONSTRAINT planning_forecast_points_quantity_check CHECK (point_quantity >= 0 AND (interval_lower IS NULL OR interval_lower >= 0) AND (interval_upper IS NULL OR interval_upper >= point_quantity))`,
            `ALTER TABLE planning_cycles ADD CONSTRAINT planning_cycles_status_check CHECK (status IN ('draft','data_ready','forecasted','under_review','approved','published','superseded','cancelled'))`,
            `ALTER TABLE planning_cycles ADD CONSTRAINT planning_cycles_version_check CHECK (version >= 1)`,
            `ALTER TABLE planning_scenarios ADD CONSTRAINT planning_scenarios_status_check CHECK (status IN ('draft','ready','archived'))`,
            `ALTER TABLE planning_scenarios ADD CONSTRAINT planning_scenarios_values_check CHECK (demand_multiplier BETWEEN 0.1 AND 5 AND lead_time_days BETWEEN 0 AND 365 AND version >= 1)`,
            `ALTER TABLE planning_overrides ADD CONSTRAINT planning_overrides_status_check CHECK (status IN ('pending','approved','rejected'))`,
            `ALTER TABLE planning_overrides ADD CONSTRAINT planning_overrides_quantity_check CHECK (original_quantity >= 0 AND override_quantity >= 0)`,
            `ALTER TABLE planning_approvals ADD CONSTRAINT planning_approvals_decision_check CHECK (decision IN ('approved','rejected','published'))`,
        ];
        for (const sql of checks) this.schema.raw(sql);

        const tenantTables = [
            "planning_forecast_runs",
            "planning_forecast_points",
            "planning_cycles",
            "planning_scenarios",
            "planning_overrides",
            "planning_approvals",
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
    }

    async down() {
        this.schema.dropTable("planning_approvals");
        this.schema.dropTable("planning_overrides");
        this.schema.dropTable("planning_scenarios");
        this.schema.dropTable("planning_cycles");
        this.schema.dropTable("planning_forecast_points");
        this.schema.dropTable("planning_forecast_runs");
    }
}
