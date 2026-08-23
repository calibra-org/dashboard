import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    private tables = [
        "synthetic_commerce_environments",
        "synthetic_commerce_personas",
        "synthetic_commerce_seed_versions",
        "synthetic_commerce_scenarios",
        "synthetic_commerce_runs",
        "synthetic_commerce_gate_results",
        "synthetic_commerce_artifacts",
    ];

    async up() {
        this.schema.createTable("synthetic_commerce_environments", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.string("name", 160).notNullable();
            t.string("namespace", 220).notNullable();
            t.string("status", 24).notNullable().defaultTo("active");
            t.boolean("is_synthetic").notNullable().defaultTo(true);
            t.string("provider_mode", 24).notNullable().defaultTo("stubbed");
            t.string("analytics_mode", 24).notNullable().defaultTo("isolated");
            t.integer("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.timestamp("created_at", { useTz: true }).notNullable();
            t.timestamp("updated_at", { useTz: true }).notNullable();
            t.unique(["tenant_id", "namespace"]);
            t.index(["tenant_id", "status"]);
        });

        this.schema.createTable("synthetic_commerce_personas", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.string("name", 160).notNullable();
            t.string("archetype", 64).notNullable();
            t.string("locale", 16).notNullable().defaultTo("fa-IR");
            t.string("device_profile", 48).notNullable().defaultTo("desktop");
            t.string("network_profile", 48).notNullable().defaultTo("normal");
            t.jsonb("behavior_profile").notNullable().defaultTo("{}");
            t.jsonb("accessibility_profile").notNullable().defaultTo("{}");
            t.integer("version").notNullable().defaultTo(1);
            t.boolean("active").notNullable().defaultTo(true);
            t.integer("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.timestamp("created_at", { useTz: true }).notNullable();
            t.timestamp("updated_at", { useTz: true }).notNullable();
            t.index(["tenant_id", "active"]);
        });

        this.schema.createTable("synthetic_commerce_seed_versions", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.integer("environment_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("synthetic_commerce_environments")
                .onDelete("CASCADE");
            t.string("name", 160).notNullable();
            t.integer("version").notNullable();
            t.bigInteger("seed").notNullable();
            t.string("fixture_hash", 64).notNullable();
            t.jsonb("fixture_manifest").notNullable().defaultTo("{}");
            t.string("status", 24).notNullable().defaultTo("draft");
            t.timestamp("frozen_at", { useTz: true }).nullable();
            t.integer("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.timestamp("created_at", { useTz: true }).notNullable();
            t.unique(["tenant_id", "environment_id", "name", "version"]);
            t.index(["tenant_id", "environment_id", "status"]);
        });

        this.schema.createTable("synthetic_commerce_scenarios", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.integer("environment_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("synthetic_commerce_environments")
                .onDelete("CASCADE");
            t.integer("persona_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("synthetic_commerce_personas")
                .onDelete("RESTRICT");
            t.integer("seed_version_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("synthetic_commerce_seed_versions")
                .onDelete("RESTRICT");
            t.string("title", 180).notNullable();
            t.string("journey_key", 80).notNullable();
            t.jsonb("steps").notNullable().defaultTo("[]");
            t.jsonb("gate_policy").notNullable().defaultTo("{}");
            t.string("status", 24).notNullable().defaultTo("ready");
            t.integer("version").notNullable().defaultTo(1);
            t.integer("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.timestamp("created_at", { useTz: true }).notNullable();
            t.timestamp("updated_at", { useTz: true }).notNullable();
            t.index(["tenant_id", "environment_id", "status"]);
        });

        this.schema.createTable("synthetic_commerce_runs", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.integer("environment_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("synthetic_commerce_environments")
                .onDelete("CASCADE");
            t.integer("scenario_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("synthetic_commerce_scenarios")
                .onDelete("CASCADE");
            t.integer("scenario_version").notNullable();
            t.integer("seed_version_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("synthetic_commerce_seed_versions")
                .onDelete("RESTRICT");
            t.string("runner_version", 64).notNullable();
            t.string("input_hash", 64).notNullable();
            t.string("status", 24).notNullable().defaultTo("queued");
            t.integer("total_gates").notNullable().defaultTo(0);
            t.integer("passed_gates").notNullable().defaultTo(0);
            t.integer("failed_gates").notNullable().defaultTo(0);
            t.integer("blocked_gates").notNullable().defaultTo(0);
            t.integer("false_alarm_gates").notNullable().defaultTo(0);
            t.decimal("journey_coverage", 8, 6).notNullable().defaultTo(0);
            t.timestamp("started_at", { useTz: true }).nullable();
            t.timestamp("completed_at", { useTz: true }).nullable();
            t.integer("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.timestamp("created_at", { useTz: true }).notNullable();
            t.unique(["tenant_id", "scenario_id", "scenario_version", "seed_version_id", "input_hash"]);
            t.index(["tenant_id", "created_at"]);
        });

        this.schema.createTable("synthetic_commerce_gate_results", (t) => {
            t.increments("id");
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.integer("run_id").unsigned().notNullable().references("id").inTable("synthetic_commerce_runs").onDelete("CASCADE");
            t.string("gate_key", 96).notNullable();
            t.string("category", 64).notNullable();
            t.string("severity", 16).notNullable();
            t.string("status", 16).notNullable();
            t.text("expected").notNullable();
            t.text("observed").nullable();
            t.jsonb("evidence").notNullable().defaultTo("{}");
            t.boolean("is_false_alarm").notNullable().defaultTo(false);
            t.timestamp("created_at", { useTz: true }).notNullable();
            t.unique(["tenant_id", "run_id", "gate_key"]);
        });

        this.schema.createTable("synthetic_commerce_artifacts", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.integer("run_id").unsigned().notNullable().references("id").inTable("synthetic_commerce_runs").onDelete("CASCADE");
            t.integer("gate_result_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("synthetic_commerce_gate_results")
                .onDelete("SET NULL");
            t.string("kind", 24).notNullable();
            t.string("name", 180).notNullable();
            t.string("storage_key", 512).notNullable();
            t.string("checksum_sha256", 64).notNullable();
            t.string("mime_type", 96).notNullable();
            t.jsonb("metadata").notNullable().defaultTo("{}");
            t.timestamp("created_at", { useTz: true }).notNullable();
            t.index(["tenant_id", "run_id", "kind"]);
        });

        this.schema.raw(
            `ALTER TABLE synthetic_commerce_environments ADD CONSTRAINT synthetic_environment_boundary_check CHECK (is_synthetic = TRUE AND provider_mode = 'stubbed' AND analytics_mode = 'isolated')`,
        );
        this.schema.raw(
            `ALTER TABLE synthetic_commerce_seed_versions ADD CONSTRAINT synthetic_seed_status_check CHECK (status IN ('draft','frozen','retired') AND version >= 1 AND seed > 0)`,
        );
        this.schema.raw(
            `ALTER TABLE synthetic_commerce_scenarios ADD CONSTRAINT synthetic_scenario_status_check CHECK (status IN ('ready','archived') AND version >= 1)`,
        );
        this.schema.raw(
            `ALTER TABLE synthetic_commerce_runs ADD CONSTRAINT synthetic_run_status_check CHECK (status IN ('queued','running','passed','failed','blocked'))`,
        );
        this.schema.raw(
            `ALTER TABLE synthetic_commerce_runs ADD CONSTRAINT synthetic_run_counts_check CHECK (total_gates >= 0 AND passed_gates >= 0 AND failed_gates >= 0 AND blocked_gates >= 0 AND false_alarm_gates >= 0 AND journey_coverage BETWEEN 0 AND 1)`,
        );
        this.schema.raw(
            `ALTER TABLE synthetic_commerce_gate_results ADD CONSTRAINT synthetic_gate_status_check CHECK (status IN ('pass','fail','blocked') AND severity IN ('info','low','medium','high','critical'))`,
        );
        this.schema.raw(
            `ALTER TABLE synthetic_commerce_artifacts ADD CONSTRAINT synthetic_artifact_kind_check CHECK (kind IN ('screenshot','trace','log','network','snapshot'))`,
        );

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
