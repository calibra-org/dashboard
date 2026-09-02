import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";
const TABLES = ["snippets", "snippet_revisions", "snippet_deployments", "snippet_executions", "snippet_settings"] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("snippets", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.string("snippet_key", 120).notNullable();
            table.string("name", 190).notNullable();
            table.text("description").notNullable().defaultTo("");
            table.string("language", 20).notNullable().defaultTo("typescript");
            table.string("runtime", 20).notNullable().defaultTo("build");
            table.string("placement", 80).notNullable().defaultTo("global");
            table.string("status", 20).notNullable().defaultTo("draft");
            table.string("risk_level", 16).notNullable().defaultTo("medium");
            table.text("source").notNullable().defaultTo("");
            table.jsonb("conditions").notNullable().defaultTo(this.raw('\'{"operator":"and","rules":[]}\'::jsonb'));
            table.jsonb("capabilities").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.bigInteger("active_revision_id").unsigned().nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.jsonb("last_validation").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("consecutive_failures").notNullable().defaultTo(0);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "snippets_public_unique" });
            table.unique(["tenant_id", "snippet_key"], { indexName: "snippets_key_unique" });
            table.index(["tenant_id", "status", "runtime", "updated_at"], "snippets_inventory_idx");
        });

        this.schema.createTable("snippet_revisions", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("snippet_id").unsigned().notNullable().references("id").inTable("snippets").onDelete("CASCADE");
            table.integer("revision").notNullable();
            table.text("source").notNullable();
            table.jsonb("conditions").notNullable().defaultTo(this.raw('\'{"operator":"and","rules":[]}\'::jsonb'));
            table.jsonb("capabilities").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("source_sha256", 64).notNullable();
            table.jsonb("validation").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.text("reason").notNullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "snippet_id", "revision"], { indexName: "snippet_revisions_number_unique" });
            table.index(["tenant_id", "snippet_id", "created_at"], "snippet_revisions_history_idx");
            table.index(["tenant_id", "source_sha256"], "snippet_revisions_checksum_idx");
        });

        this.schema.alterTable("snippets", (table) => {
            table.foreign("active_revision_id").references("id").inTable("snippet_revisions").onDelete("SET NULL");
        });

        this.schema.createTable("snippet_deployments", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.bigInteger("snippet_id").unsigned().notNullable().references("id").inTable("snippets").onDelete("CASCADE");
            table
                .bigInteger("revision_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("snippet_revisions")
                .onDelete("SET NULL");
            table.string("environment", 20).notNullable().defaultTo("staging");
            table.string("action", 20).notNullable();
            table.string("status", 20).notNullable().defaultTo("active");
            table.integer("rollout_percent").notNullable().defaultTo(100);
            table.string("idempotency_key", 190).notNullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("activated_at", { useTz: true }).nullable();
            table.timestamp("rolled_back_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "snippet_deployments_public_unique" });
            table.unique(["tenant_id", "idempotency_key"], { indexName: "snippet_deployments_idempotency_unique" });
            table.index(["tenant_id", "snippet_id", "created_at"], "snippet_deployments_history_idx");
        });

        this.schema.createTable("snippet_executions", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("snippet_id").unsigned().notNullable().references("id").inTable("snippets").onDelete("CASCADE");
            table
                .bigInteger("revision_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("snippet_revisions")
                .onDelete("SET NULL");
            table.string("consumer_key", 120).notNullable();
            table.string("outcome", 16).notNullable();
            table.integer("duration_ms").nullable();
            table.string("request_id", 120).nullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("observed_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "snippet_id", "observed_at"], "snippet_executions_health_idx");
            table.index(["tenant_id", "outcome", "observed_at"], "snippet_executions_outcome_idx");
        });

        this.schema.createTable("snippet_settings", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.boolean("safe_mode").notNullable().defaultTo(false);
            table.boolean("production_publish_requires_step_up").notNullable().defaultTo(true);
            table.integer("auto_quarantine_threshold").notNullable().defaultTo(3);
            table.string("default_environment", 20).notNullable().defaultTo("staging");
            table.integer("max_rollout_percent").notNullable().defaultTo(100);
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id"], { indexName: "snippet_settings_tenant_unique" });
        });

        for (const check of [
            "ALTER TABLE snippets ADD CONSTRAINT snippets_language_check CHECK (language IN ('typescript','javascript','css','html','json'))",
            "ALTER TABLE snippets ADD CONSTRAINT snippets_runtime_check CHECK (runtime IN ('storefront','admin','server','worker','build'))",
            "ALTER TABLE snippets ADD CONSTRAINT snippets_status_check CHECK (status IN ('draft','published','paused','quarantined','archived'))",
            "ALTER TABLE snippets ADD CONSTRAINT snippets_risk_check CHECK (risk_level IN ('low','medium','high','critical'))",
            "ALTER TABLE snippets ADD CONSTRAINT snippets_version_check CHECK (version >= 1)",
            "ALTER TABLE snippets ADD CONSTRAINT snippets_failures_check CHECK (consecutive_failures >= 0)",
            "ALTER TABLE snippet_revisions ADD CONSTRAINT snippet_revisions_number_check CHECK (revision >= 1)",
            "ALTER TABLE snippet_revisions ADD CONSTRAINT snippet_revisions_checksum_check CHECK (source_sha256 ~ '^[0-9a-f]{64}$')",
            "ALTER TABLE snippet_deployments ADD CONSTRAINT snippet_deployments_environment_check CHECK (environment IN ('preview','staging','production'))",
            "ALTER TABLE snippet_deployments ADD CONSTRAINT snippet_deployments_action_check CHECK (action IN ('publish','rollback','pause','resume','quarantine','safe_mode'))",
            "ALTER TABLE snippet_deployments ADD CONSTRAINT snippet_deployments_status_check CHECK (status IN ('planned','active','superseded','failed','rolled_back'))",
            "ALTER TABLE snippet_deployments ADD CONSTRAINT snippet_deployments_rollout_check CHECK (rollout_percent BETWEEN 0 AND 100)",
            "ALTER TABLE snippet_executions ADD CONSTRAINT snippet_executions_outcome_check CHECK (outcome IN ('success','failure','skipped','blocked'))",
            "ALTER TABLE snippet_executions ADD CONSTRAINT snippet_executions_duration_check CHECK (duration_ms IS NULL OR duration_ms >= 0)",
            "ALTER TABLE snippet_settings ADD CONSTRAINT snippet_settings_threshold_check CHECK (auto_quarantine_threshold BETWEEN 1 AND 20)",
            "ALTER TABLE snippet_settings ADD CONSTRAINT snippet_settings_environment_check CHECK (default_environment IN ('preview','staging','production'))",
            "ALTER TABLE snippet_settings ADD CONSTRAINT snippet_settings_rollout_check CHECK (max_rollout_percent BETWEEN 1 AND 100)",
        ]) {
            this.schema.raw(check);
        }

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
        this.schema.alterTable("snippets", (table) => table.dropForeign("active_revision_id"));
        this.schema.dropTable("snippet_settings");
        this.schema.dropTable("snippet_executions");
        this.schema.dropTable("snippet_deployments");
        this.schema.dropTable("snippet_revisions");
        this.schema.dropTable("snippets");
    }
}
