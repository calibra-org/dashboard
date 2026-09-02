import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";
const TABLES = [
    "lite_cash_settings",
    "lite_cash_policies",
    "lite_cash_purge_events",
    "lite_cash_warm_jobs",
    "lite_cash_optimization_profiles",
    "lite_cash_observations",
    "lite_cash_snapshots",
] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("lite_cash_settings", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.boolean("enabled").notNullable().defaultTo(true);
            table.integer("default_ttl_seconds").notNullable().defaultTo(300);
            table.integer("default_grace_seconds").notNullable().defaultTo(86400);
            table.integer("default_stale_if_error_seconds").notNullable().defaultTo(3600);
            table.integer("max_policy_ttl_seconds").notNullable().defaultTo(86400);
            table.integer("max_warm_concurrency").notNullable().defaultTo(4);
            table.boolean("broad_purge_requires_step_up").notNullable().defaultTo(true);
            table.timestamp("debug_until", { useTz: true }).nullable();
            table.string("default_profile", 20).notNullable().defaultTo("safe");
            table.string("edge_provider", 20).notNullable().defaultTo("none");
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id"], { indexName: "lite_cash_settings_tenant_unique" });
        });

        this.schema.createTable("lite_cash_policies", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.string("policy_key", 120).notNullable();
            table.string("name", 190).notNullable();
            table.text("description").notNullable().defaultTo("");
            table.string("kind", 16).notNullable().defaultTo("api");
            table.string("route_pattern", 300).notNullable();
            table.string("status", 16).notNullable().defaultTo("disabled");
            table.string("risk_tier", 16).notNullable().defaultTo("medium");
            table.integer("ttl_seconds").notNullable().defaultTo(300);
            table.integer("grace_seconds").notNullable().defaultTo(0);
            table.integer("stale_if_error_seconds").notNullable().defaultTo(0);
            table.integer("soft_timeout_ms").notNullable().defaultTo(200);
            table.integer("hard_timeout_ms").notNullable().defaultTo(2000);
            table.jsonb("tags").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("vary").notNullable().defaultTo(this.raw('\'["tenant","locale"]\'::jsonb'));
            table.jsonb("conditions").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("version").notNullable().defaultTo(1);
            table.jsonb("validation").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "lite_cash_policies_public_unique" });
            table.unique(["tenant_id", "policy_key"], { indexName: "lite_cash_policies_key_unique" });
            table.index(["tenant_id", "status", "kind", "updated_at"], "lite_cash_policies_inventory_idx");
        });

        this.schema.createTable("lite_cash_purge_events", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.string("scope", 40).notNullable();
            table.string("target", 190).nullable();
            table.string("mode", 16).notNullable();
            table.string("status", 16).notNullable().defaultTo("planned");
            table.jsonb("resolved_tags").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("blast_radius", 16).notNullable();
            table.string("idempotency_key", 190).notNullable();
            table.text("reason").notNullable();
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("completed_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "public_id"], { indexName: "lite_cash_purge_events_public_unique" });
            table.unique(["tenant_id", "idempotency_key"], { indexName: "lite_cash_purge_events_idempotency_unique" });
            table.index(["tenant_id", "created_at"], "lite_cash_purge_events_history_idx");
        });

        this.schema.createTable("lite_cash_warm_jobs", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.string("scope", 40).notNullable();
            table.string("target_key", 160).notNullable();
            table.string("strategy", 16).notNullable().defaultTo("cold_fill");
            table.string("status", 16).notNullable().defaultTo("queued");
            table.string("priority", 16).notNullable().defaultTo("normal");
            table.integer("concurrency").notNullable().defaultTo(2);
            table.jsonb("plan").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("plan_sha256", 64).notNullable();
            table.integer("discovered_count").notNullable().defaultTo(0);
            table.integer("processed_count").notNullable().defaultTo(0);
            table.integer("success_count").notNullable().defaultTo(0);
            table.integer("failure_count").notNullable().defaultTo(0);
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("started_at", { useTz: true }).nullable();
            table.timestamp("completed_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "lite_cash_warm_jobs_public_unique" });
            table.index(["tenant_id", "status", "created_at"], "lite_cash_warm_jobs_queue_idx");
        });

        this.schema.createTable("lite_cash_optimization_profiles", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.string("profile_key", 120).notNullable();
            table.string("name", 190).notNullable();
            table.string("mode", 20).notNullable().defaultTo("safe");
            table.string("status", 16).notNullable().defaultTo("draft");
            table.jsonb("css").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("javascript").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("images").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("fonts").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("navigation").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("edge").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("version").notNullable().defaultTo(1);
            table.string("fingerprint_sha256", 64).notNullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "lite_cash_profiles_public_unique" });
            table.unique(["tenant_id", "profile_key"], { indexName: "lite_cash_profiles_key_unique" });
            table.index(["tenant_id", "status", "updated_at"], "lite_cash_profiles_status_idx");
        });

        this.schema.createTable("lite_cash_observations", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("source", 20).notNullable();
            table.string("metric_key", 120).notNullable();
            table.decimal("value", 20, 6).nullable();
            table.string("unit", 24).notNullable().defaultTo("count");
            table.string("outcome", 24).nullable();
            table.jsonb("labels").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("request_id", 120).nullable();
            table.timestamp("observed_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "metric_key", "observed_at"], "lite_cash_observations_metric_idx");
            table.index(["tenant_id", "source", "observed_at"], "lite_cash_observations_source_idx");
        });

        this.schema.createTable("lite_cash_snapshots", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.string("snapshot_kind", 24).notNullable();
            table.jsonb("document").notNullable();
            table.string("fingerprint_sha256", 64).notNullable();
            table.text("reason").notNullable();
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "public_id"], { indexName: "lite_cash_snapshots_public_unique" });
            table.index(["tenant_id", "created_at"], "lite_cash_snapshots_history_idx");
        });

        for (const check of [
            "ALTER TABLE lite_cash_settings ADD CONSTRAINT lite_cash_settings_ttl_check CHECK (default_ttl_seconds BETWEEN 1 AND 86400 AND max_policy_ttl_seconds BETWEEN 1 AND 604800 AND default_ttl_seconds <= max_policy_ttl_seconds)",
            "ALTER TABLE lite_cash_settings ADD CONSTRAINT lite_cash_settings_grace_check CHECK (default_grace_seconds BETWEEN 0 AND 604800 AND default_stale_if_error_seconds BETWEEN 0 AND 604800)",
            "ALTER TABLE lite_cash_settings ADD CONSTRAINT lite_cash_settings_concurrency_check CHECK (max_warm_concurrency BETWEEN 1 AND 32)",
            "ALTER TABLE lite_cash_settings ADD CONSTRAINT lite_cash_settings_profile_check CHECK (default_profile IN ('safe','balanced','aggressive','custom'))",
            "ALTER TABLE lite_cash_settings ADD CONSTRAINT lite_cash_settings_edge_check CHECK (edge_provider IN ('none','cloudflare','quic','custom'))",
            "ALTER TABLE lite_cash_policies ADD CONSTRAINT lite_cash_policies_kind_check CHECK (kind IN ('api','page','asset','query'))",
            "ALTER TABLE lite_cash_policies ADD CONSTRAINT lite_cash_policies_status_check CHECK (status IN ('enabled','disabled','archived'))",
            "ALTER TABLE lite_cash_policies ADD CONSTRAINT lite_cash_policies_risk_check CHECK (risk_tier IN ('low','medium','high','critical'))",
            "ALTER TABLE lite_cash_policies ADD CONSTRAINT lite_cash_policies_ttl_check CHECK (ttl_seconds BETWEEN 1 AND 604800 AND grace_seconds BETWEEN 0 AND 604800 AND stale_if_error_seconds BETWEEN 0 AND 604800)",
            "ALTER TABLE lite_cash_policies ADD CONSTRAINT lite_cash_policies_timeout_check CHECK (soft_timeout_ms BETWEEN 10 AND 60000 AND hard_timeout_ms BETWEEN soft_timeout_ms AND 120000)",
            "ALTER TABLE lite_cash_policies ADD CONSTRAINT lite_cash_policies_version_check CHECK (version >= 1)",
            "ALTER TABLE lite_cash_purge_events ADD CONSTRAINT lite_cash_purge_events_mode_check CHECK (mode IN ('dry_run','execute'))",
            "ALTER TABLE lite_cash_purge_events ADD CONSTRAINT lite_cash_purge_events_status_check CHECK (status IN ('planned','succeeded','failed','rejected'))",
            "ALTER TABLE lite_cash_purge_events ADD CONSTRAINT lite_cash_purge_events_blast_check CHECK (blast_radius IN ('narrow','medium','broad'))",
            "ALTER TABLE lite_cash_warm_jobs ADD CONSTRAINT lite_cash_warm_jobs_strategy_check CHECK (strategy IN ('cold_fill','refresh','verify'))",
            "ALTER TABLE lite_cash_warm_jobs ADD CONSTRAINT lite_cash_warm_jobs_status_check CHECK (status IN ('queued','running','succeeded','partial','failed','cancelled'))",
            "ALTER TABLE lite_cash_warm_jobs ADD CONSTRAINT lite_cash_warm_jobs_priority_check CHECK (priority IN ('low','normal','high'))",
            "ALTER TABLE lite_cash_warm_jobs ADD CONSTRAINT lite_cash_warm_jobs_concurrency_check CHECK (concurrency BETWEEN 1 AND 32)",
            "ALTER TABLE lite_cash_warm_jobs ADD CONSTRAINT lite_cash_warm_jobs_counts_check CHECK (discovered_count >= 0 AND processed_count >= 0 AND success_count >= 0 AND failure_count >= 0 AND success_count + failure_count <= processed_count AND processed_count <= discovered_count)",
            "ALTER TABLE lite_cash_warm_jobs ADD CONSTRAINT lite_cash_warm_jobs_checksum_check CHECK (plan_sha256 ~ '^[0-9a-f]{64}$')",
            "ALTER TABLE lite_cash_optimization_profiles ADD CONSTRAINT lite_cash_profiles_mode_check CHECK (mode IN ('safe','balanced','aggressive','custom'))",
            "ALTER TABLE lite_cash_optimization_profiles ADD CONSTRAINT lite_cash_profiles_status_check CHECK (status IN ('draft','active','archived'))",
            "ALTER TABLE lite_cash_optimization_profiles ADD CONSTRAINT lite_cash_profiles_version_check CHECK (version >= 1)",
            "ALTER TABLE lite_cash_optimization_profiles ADD CONSTRAINT lite_cash_profiles_checksum_check CHECK (fingerprint_sha256 ~ '^[0-9a-f]{64}$')",
            "ALTER TABLE lite_cash_observations ADD CONSTRAINT lite_cash_observations_source_check CHECK (source IN ('api','redis','edge','storefront','synthetic','worker'))",
            "ALTER TABLE lite_cash_snapshots ADD CONSTRAINT lite_cash_snapshots_kind_check CHECK (snapshot_kind IN ('manual','profile_activation','settings_change','import'))",
            "ALTER TABLE lite_cash_snapshots ADD CONSTRAINT lite_cash_snapshots_checksum_check CHECK (fingerprint_sha256 ~ '^[0-9a-f]{64}$')",
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
        this.schema.dropTable("lite_cash_snapshots");
        this.schema.dropTable("lite_cash_observations");
        this.schema.dropTable("lite_cash_optimization_profiles");
        this.schema.dropTable("lite_cash_warm_jobs");
        this.schema.dropTable("lite_cash_purge_events");
        this.schema.dropTable("lite_cash_policies");
        this.schema.dropTable("lite_cash_settings");
    }
}
