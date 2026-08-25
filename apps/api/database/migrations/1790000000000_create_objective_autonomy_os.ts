import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    private readonly tenantTables = [
        "autonomy_objectives",
        "autonomy_cycles",
        "autonomy_checkpoints",
        "autonomy_postmortems",
    ] as const;

    async up() {
        this.schema.createTable("autonomy_objectives", (table) => {
            table.increments("id");
            table.uuid("public_id").notNullable().unique();
            table.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("name", 180).notNullable();
            table.string("target_metric", 120).notNullable();
            table.string("direction", 16).notNullable();
            table.decimal("baseline_value", 28, 8).notNullable();
            table.decimal("target_value", 28, 8).notNullable();
            table.timestamp("horizon_end", { useTz: true }).notNullable();
            table.bigInteger("budget_minor").nullable();
            table.jsonb("constraints").notNullable().defaultTo("{}");
            table.jsonb("allowed_tool_keys").notNullable().defaultTo("[]");
            table.string("autonomy_level", 24).notNullable();
            table.string("effective_autonomy_level", 24).notNullable();
            table.string("risk_ceiling", 16).notNullable();
            table.decimal("minimum_confidence", 8, 6).notNullable().defaultTo(0.6);
            table.jsonb("stop_loss").notNullable().defaultTo("{}");
            table.jsonb("approvers").notNullable().defaultTo("[]");
            table.uuid("scenario_public_id").notNullable();
            table.uuid("portfolio_plan_public_id").notNullable();
            table.uuid("agent_plan_public_id").notNullable();
            table.string("status", 24).notNullable().defaultTo("draft");
            table.integer("version").notNullable().defaultTo(1);
            table.text("reason").notNullable();
            table.integer("created_by_user_id").unsigned().nullable();
            table.integer("updated_by_user_id").unsigned().nullable();
            table.timestamp("activated_at", { useTz: true }).nullable();
            table.timestamp("halted_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable();
            table.timestamp("updated_at", { useTz: true }).notNullable();
            table.index(["tenant_id", "status"]);
            table.index(["tenant_id", "target_metric"]);
        });

        this.schema.createTable("autonomy_cycles", (table) => {
            table.increments("id");
            table.uuid("public_id").notNullable().unique();
            table.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .integer("objective_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("autonomy_objectives")
                .onDelete("CASCADE");
            table.integer("sequence").notNullable();
            table.string("status", 32).notNullable();
            table.uuid("twin_run_public_id").nullable();
            table.uuid("portfolio_run_public_id").nullable();
            table.uuid("agent_plan_public_id").notNullable();
            table.decimal("simulation_confidence", 8, 6).notNullable().defaultTo(0);
            table.jsonb("simulation_snapshot").notNullable().defaultTo("{}");
            table.jsonb("portfolio_snapshot").notNullable().defaultTo("{}");
            table.jsonb("policy_snapshot").notNullable().defaultTo("{}");
            table.jsonb("explanation").notNullable().defaultTo("{}");
            table.string("input_digest", 64).notNullable();
            table.integer("created_by_user_id").unsigned().nullable();
            table.timestamp("started_at", { useTz: true }).notNullable();
            table.timestamp("finished_at", { useTz: true }).nullable();
            table.unique(["tenant_id", "objective_id", "sequence"]);
            table.index(["tenant_id", "status"]);
        });

        this.schema.createTable("autonomy_checkpoints", (table) => {
            table.increments("id");
            table.uuid("public_id").notNullable().unique();
            table.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .integer("objective_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("autonomy_objectives")
                .onDelete("CASCADE");
            table.integer("cycle_id").unsigned().nullable().references("id").inTable("autonomy_cycles").onDelete("SET NULL");
            table.decimal("observed_value", 28, 8).notNullable();
            table.bigInteger("budget_spent_minor").notNullable().defaultTo(0);
            table.decimal("confidence", 8, 6).notNullable();
            table.jsonb("constraint_breaches").notNullable().defaultTo("[]");
            table.boolean("unexpected_harm").notNullable().defaultTo(false);
            table.jsonb("evidence_refs").notNullable().defaultTo("[]");
            table.string("decision", 32).notNullable();
            table.text("reason").notNullable();
            table.integer("created_by_user_id").unsigned().nullable();
            table.timestamp("created_at", { useTz: true }).notNullable();
            table.index(["tenant_id", "objective_id", "created_at"]);
        });

        this.schema.createTable("autonomy_postmortems", (table) => {
            table.increments("id");
            table.uuid("public_id").notNullable().unique();
            table.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .integer("objective_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("autonomy_objectives")
                .onDelete("CASCADE");
            table.string("outcome", 32).notNullable();
            table.decimal("final_value", 28, 8).notNullable();
            table.text("summary").notNullable();
            table.text("lesson").notNullable();
            table.jsonb("residual_uncertainty").notNullable().defaultTo("{}");
            table.uuid("memory_public_id").nullable();
            table.integer("created_by_user_id").unsigned().nullable();
            table.timestamp("created_at", { useTz: true }).notNullable();
            table.unique(["tenant_id", "objective_id"]);
        });

        this.defer(async (db) => {
            await db.rawQuery(
                "ALTER TABLE autonomy_objectives ADD CONSTRAINT autonomy_objective_direction_check CHECK (direction IN ('maximize','minimize','target'))",
            );
            await db.rawQuery(
                "ALTER TABLE autonomy_objectives ADD CONSTRAINT autonomy_confidence_check CHECK (minimum_confidence >= 0 AND minimum_confidence <= 1)",
            );
            await db.rawQuery(
                "ALTER TABLE autonomy_checkpoints ADD CONSTRAINT autonomy_checkpoint_confidence_check CHECK (confidence >= 0 AND confidence <= 1)",
            );
            await db.rawQuery(
                "ALTER TABLE autonomy_checkpoints ADD CONSTRAINT autonomy_checkpoint_budget_check CHECK (budget_spent_minor >= 0)",
            );
        });

        for (const table of this.tenantTables) {
            this.defer(async (db) => {
                await db.rawQuery(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
                await db.rawQuery(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
                await db.rawQuery(
                    `CREATE POLICY ${table}_tenant_isolation ON ${table} USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::int) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::int)`,
                );
            });
        }
    }

    async down() {
        for (const table of [...this.tenantTables].reverse()) this.schema.dropTable(table);
    }
}
