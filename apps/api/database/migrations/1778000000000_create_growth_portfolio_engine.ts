import { BaseSchema } from "@adonisjs/lucid/schema";

const TABLES = [
    "growth_portfolio_plans",
    "growth_portfolio_candidates",
    "growth_portfolio_runs",
    "growth_portfolio_run_items",
    "growth_portfolio_outcomes",
] as const;

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("growth_portfolio_plans", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("name", 180).notNullable();
            table.text("objective").notNullable();
            table.string("objective_mode", 40).notNullable().defaultTo("expected_contribution");
            table.bigInteger("cash_budget_minor").nullable();
            table.decimal("team_hours_budget", 12, 2).nullable();
            table.decimal("warehouse_capacity_budget", 12, 4).nullable();
            table.decimal("supplier_capacity_budget", 12, 4).nullable();
            table.decimal("max_risk", 8, 6).nullable();
            table.jsonb("channel_limits").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("policy_constraints").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("status", 24).notNullable().defaultTo("draft");
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.index(["tenant_id", "status", "updated_at"], "growth_portfolio_plans_status_idx");
        });

        this.schema.createTable("growth_portfolio_candidates", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("plan_id").unsigned().notNullable().references("id").inTable("growth_portfolio_plans").onDelete("CASCADE");
            table.bigInteger("intelligence_case_id").unsigned().notNullable().references("id").inTable("intelligence_cases").onDelete("CASCADE");
            table.bigInteger("expected_incremental_contribution_minor").notNullable().defaultTo(0);
            table.decimal("confidence", 8, 6).notNullable().defaultTo(0);
            table.bigInteger("required_cash_minor").notNullable().defaultTo(0);
            table.decimal("team_hours", 12, 2).notNullable().defaultTo(0);
            table.decimal("warehouse_capacity", 12, 4).notNullable().defaultTo(0);
            table.decimal("supplier_capacity", 12, 4).notNullable().defaultTo(0);
            table.decimal("risk", 8, 6).notNullable().defaultTo(0);
            table.decimal("reversibility", 8, 6).notNullable().defaultTo(0.5);
            table.decimal("time_to_value", 8, 6).notNullable().defaultTo(0.5);
            table.decimal("customer_impact", 8, 6).notNullable().defaultTo(0.5);
            table.decimal("strategic_alignment", 8, 6).notNullable().defaultTo(0.5);
            table.jsonb("dependencies").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("exclusive_with").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("channel_requirements").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("source_case_stable_key", 160).notNullable();
            table.integer("source_case_version").notNullable();
            table.timestamp("snapshot_at", { useTz: true }).notNullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "plan_id", "intelligence_case_id"], {
                indexName: "growth_portfolio_candidate_case_unique",
            });
        });

        this.schema.createTable("growth_portfolio_runs", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("plan_id").unsigned().notNullable().references("id").inTable("growth_portfolio_plans").onDelete("CASCADE");
            table.integer("plan_version").notNullable();
            table.string("solver_version", 80).notNullable();
            table.string("input_hash", 64).notNullable();
            table.string("status", 24).notNullable().defaultTo("completed");
            table.bigInteger("expected_value_p10_minor").notNullable().defaultTo(0);
            table.bigInteger("expected_value_p50_minor").notNullable().defaultTo(0);
            table.bigInteger("expected_value_p90_minor").notNullable().defaultTo(0);
            table.jsonb("resource_utilization").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("dependency_plan").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("constraint_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("generated_at", { useTz: true }).notNullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.unique(["tenant_id", "plan_id", "plan_version", "input_hash"], {
                indexName: "growth_portfolio_run_input_unique",
            });
            table.index(["tenant_id", "plan_id", "generated_at"], "growth_portfolio_runs_plan_idx");
        });

        this.schema.createTable("growth_portfolio_run_items", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("run_id").unsigned().notNullable().references("id").inTable("growth_portfolio_runs").onDelete("CASCADE");
            table.bigInteger("candidate_id").unsigned().notNullable().references("id").inTable("growth_portfolio_candidates").onDelete("CASCADE");
            table.string("decision", 16).notNullable();
            table.text("reason").notNullable();
            table.bigInteger("expected_weighted_value_minor").notNullable().defaultTo(0);
            table.decimal("portfolio_score", 18, 6).notNullable().defaultTo(0);
            table.integer("execution_order").nullable();
            table.jsonb("binding_constraints").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.unique(["tenant_id", "run_id", "candidate_id"], {
                indexName: "growth_portfolio_run_item_unique",
            });
        });

        this.schema.createTable("growth_portfolio_outcomes", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("run_id").unsigned().notNullable().references("id").inTable("growth_portfolio_runs").onDelete("CASCADE");
            table.bigInteger("expected_value_minor").notNullable().defaultTo(0);
            table.bigInteger("realized_value_minor").nullable();
            table.decimal("realization_ratio", 12, 6).nullable();
            table.decimal("attribution_confidence", 8, 6).nullable();
            table.jsonb("source_outcome_ids").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.text("notes").nullable();
            table.timestamp("measured_at", { useTz: true }).notNullable();
            table.bigInteger("recorded_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "run_id", "measured_at"], "growth_portfolio_outcomes_run_idx");
        });

        const checks = [
            "ALTER TABLE growth_portfolio_plans ADD CONSTRAINT growth_portfolio_plan_status_check CHECK (status IN ('draft','active','paused','archived'))",
            "ALTER TABLE growth_portfolio_plans ADD CONSTRAINT growth_portfolio_plan_ranges_check CHECK ((cash_budget_minor IS NULL OR cash_budget_minor >= 0) AND (team_hours_budget IS NULL OR team_hours_budget >= 0) AND (warehouse_capacity_budget IS NULL OR warehouse_capacity_budget >= 0) AND (supplier_capacity_budget IS NULL OR supplier_capacity_budget >= 0) AND (max_risk IS NULL OR max_risk BETWEEN 0 AND 1) AND version >= 1)",
            "ALTER TABLE growth_portfolio_candidates ADD CONSTRAINT growth_portfolio_candidate_ranges_check CHECK (required_cash_minor >= 0 AND team_hours >= 0 AND warehouse_capacity >= 0 AND supplier_capacity >= 0 AND confidence BETWEEN 0 AND 1 AND risk BETWEEN 0 AND 1 AND reversibility BETWEEN 0 AND 1 AND time_to_value BETWEEN 0 AND 1 AND customer_impact BETWEEN 0 AND 1 AND strategic_alignment BETWEEN 0 AND 1 AND source_case_version >= 1)",
            "ALTER TABLE growth_portfolio_runs ADD CONSTRAINT growth_portfolio_run_status_check CHECK (status IN ('completed','superseded'))",
            "ALTER TABLE growth_portfolio_run_items ADD CONSTRAINT growth_portfolio_item_decision_check CHECK (decision IN ('selected','deferred','infeasible'))",
            "ALTER TABLE growth_portfolio_outcomes ADD CONSTRAINT growth_portfolio_outcome_ranges_check CHECK ((realization_ratio IS NULL OR realization_ratio >= -10) AND (attribution_confidence IS NULL OR attribution_confidence BETWEEN 0 AND 1))",
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
    }

    async down() {
        for (const table of [...TABLES].reverse()) this.schema.dropTable(table);
    }
}
