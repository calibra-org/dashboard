import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    private tables = ["commerce_twin_scenarios", "commerce_twin_runs", "commerce_twin_results"];

    async up() {
        this.schema.createTable("commerce_twin_scenarios", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.string("title", 180).notNullable();
            t.text("objective").notNullable();
            t.string("status", 24).notNullable().defaultTo("draft");
            t.integer("version").notNullable().defaultTo(1);
            t.jsonb("assumptions").notNullable().defaultTo("{}");
            t.jsonb("source_refs").notNullable().defaultTo("{}");
            t.string("assumption_hash", 64).notNullable();
            t.integer("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.timestamp("created_at", { useTz: true }).notNullable();
            t.timestamp("updated_at", { useTz: true }).notNullable();
            t.index(["tenant_id", "updated_at"], "commerce_twin_scenarios_tenant_updated_idx");
        });

        this.schema.createTable("commerce_twin_runs", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.integer("scenario_id").unsigned().notNullable().references("id").inTable("commerce_twin_scenarios").onDelete("CASCADE");
            t.integer("scenario_version").notNullable();
            t.string("engine_version", 48).notNullable();
            t.bigInteger("seed").notNullable();
            t.string("input_hash", 64).notNullable();
            t.string("assumption_hash", 64).notNullable();
            t.jsonb("input_snapshot").notNullable();
            t.jsonb("source_refs").notNullable().defaultTo("{}");
            t.string("status", 24).notNullable().defaultTo("completed");
            t.integer("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.timestamp("created_at", { useTz: true }).notNullable();
            t.unique(["tenant_id", "scenario_id", "scenario_version", "input_hash"], "commerce_twin_runs_repro_unique");
            t.index(["tenant_id", "created_at"], "commerce_twin_runs_tenant_created_idx");
        });

        this.schema.createTable("commerce_twin_results", (t) => {
            t.increments("id");
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.integer("run_id").unsigned().notNullable().references("id").inTable("commerce_twin_runs").onDelete("CASCADE");
            t.string("metric_key", 96).notNullable();
            t.decimal("p10", 20, 4).notNullable();
            t.decimal("p50", 20, 4).notNullable();
            t.decimal("p90", 20, 4).notNullable();
            t.string("unit", 40).notNullable();
            t.decimal("confidence", 8, 6).notNullable();
            t.jsonb("drivers").notNullable().defaultTo("[]");
            t.jsonb("evidence").notNullable().defaultTo("{}");
            t.timestamp("created_at", { useTz: true }).notNullable();
            t.unique(["tenant_id", "run_id", "metric_key"]);
        });

        this.schema.raw(`ALTER TABLE commerce_twin_scenarios ADD CONSTRAINT commerce_twin_scenarios_status_check CHECK (status IN ('draft','ready','archived'))`);
        this.schema.raw(`ALTER TABLE commerce_twin_scenarios ADD CONSTRAINT commerce_twin_scenarios_version_check CHECK (version >= 1)`);
        this.schema.raw(`ALTER TABLE commerce_twin_runs ADD CONSTRAINT commerce_twin_runs_status_check CHECK (status IN ('completed','failed'))`);
        this.schema.raw(`ALTER TABLE commerce_twin_results ADD CONSTRAINT commerce_twin_results_quantiles_check CHECK (p90 >= p50 AND p50 >= p10 AND confidence BETWEEN 0 AND 1)`);

        for (const table of this.tables) {
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
        for (const table of [...this.tables].reverse()) this.schema.dropTable(table);
    }
}
