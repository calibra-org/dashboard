import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("seo_action_queue", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("action_type", 64).notNullable();
            table.string("entity_kind", 32).notNullable();
            table.bigInteger("entity_id").unsigned().nullable();
            table.string("entity_key", 255).nullable();
            table.string("status", 24).notNullable().defaultTo("proposed");
            table.jsonb("before_payload").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("after_payload").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("expected_version").unsigned().nullable();
            table.bigInteger("proposed_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("reviewed_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("applied_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.text("review_note").nullable();
            table.text("last_error").nullable();
            table.timestamp("reviewed_at", { useTz: true }).nullable();
            table.timestamp("applied_at", { useTz: true }).nullable();
            table.timestamp("rolled_back_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.index(["tenant_id", "status", "created_at"], "seo_action_queue_status_idx");
            table.index(["tenant_id", "entity_kind", "entity_id"], "seo_action_queue_entity_idx");
        });

        this.schema.createTable("seo_crawl_runs", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("status", 24).notNullable().defaultTo("queued");
            table.string("base_url", 2048).notNullable();
            table.integer("requested_count").notNullable().defaultTo(0);
            table.integer("completed_count").notNullable().defaultTo(0);
            table.integer("failed_count").notNullable().defaultTo(0);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.text("last_error").nullable();
            table.timestamp("started_at", { useTz: true }).nullable();
            table.timestamp("finished_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.index(["tenant_id", "status", "created_at"], "seo_crawl_runs_status_idx");
        });

        this.schema.createTable("seo_crawl_observations", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("crawl_run_id").unsigned().notNullable().references("id").inTable("seo_crawl_runs").onDelete("CASCADE");
            table.string("url", 2048).notNullable();
            table.smallint("status_code").nullable();
            table.string("content_type", 255).nullable();
            table.string("canonical_url", 2048).nullable();
            table.string("robots_meta", 512).nullable();
            table.boolean("indexable").nullable();
            table.integer("duration_ms").nullable();
            table.bigInteger("bytes_received").unsigned().nullable();
            table.string("fetch_status", 24).notNullable();
            table.text("error_evidence").nullable();
            table.timestamp("fetched_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "crawl_run_id", "url"], { indexName: "seo_crawl_observations_run_url_unique" });
        });

        this.schema.createTable("seo_export_jobs", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("report_kind", 64).notNullable();
            table.string("format", 12).notNullable();
            table.string("status", 24).notNullable().defaultTo("queued");
            table.jsonb("filters").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("result_metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.text("last_error").nullable();
            table.timestamp("completed_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.index(["tenant_id", "status", "created_at"], "seo_export_jobs_status_idx");
        });

        for (const table of ["seo_action_queue", "seo_crawl_runs", "seo_crawl_observations", "seo_export_jobs"]) {
            this.schema.raw(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`);
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY tenant_isolation ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
        }

        this.schema.raw("ALTER TABLE seo_action_queue ADD CONSTRAINT seo_action_queue_status_check CHECK (status IN ('proposed','approved','rejected','applied','failed','rolled_back'))");
        this.schema.raw("ALTER TABLE seo_action_queue ADD CONSTRAINT seo_action_queue_entity_check CHECK (entity_kind IN ('product','category','brand','attribute','content_post','media','page'))");
        this.schema.raw("ALTER TABLE seo_crawl_runs ADD CONSTRAINT seo_crawl_runs_status_check CHECK (status IN ('queued','running','completed','partial','failed'))");
        this.schema.raw("ALTER TABLE seo_crawl_runs ADD CONSTRAINT seo_crawl_counts_check CHECK (requested_count >= 0 AND completed_count >= 0 AND failed_count >= 0)");
        this.schema.raw("ALTER TABLE seo_crawl_observations ADD CONSTRAINT seo_crawl_observations_status_check CHECK (fetch_status IN ('success','http_error','network_error','blocked'))");
        this.schema.raw("ALTER TABLE seo_export_jobs ADD CONSTRAINT seo_export_jobs_format_check CHECK (format IN ('csv','json'))");
        this.schema.raw("ALTER TABLE seo_export_jobs ADD CONSTRAINT seo_export_jobs_status_check CHECK (status IN ('queued','running','completed','failed'))");
    }

    async down() {
        this.schema.dropTable("seo_export_jobs");
        this.schema.dropTable("seo_crawl_observations");
        this.schema.dropTable("seo_crawl_runs");
        this.schema.dropTable("seo_action_queue");
    }
}
