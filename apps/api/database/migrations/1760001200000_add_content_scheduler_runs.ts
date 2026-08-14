import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("content_scheduler_runs", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("job_kind", 32).notNullable();
            table.timestamp("scheduled_bucket", { useTz: true }).notNullable();
            table.string("status", 24).notNullable().defaultTo("running");
            table.integer("processed_count").notNullable().defaultTo(0);
            table.text("last_error").nullable();
            table.timestamp("started_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("finished_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "job_kind", "scheduled_bucket"], { indexName: "content_scheduler_runs_bucket_unique" });
            table.index(["tenant_id", "job_kind", "created_at"], "content_scheduler_runs_kind_idx");
        });
        this.schema.raw("ALTER TABLE content_scheduler_runs ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint");
        this.schema.raw("ALTER TABLE content_scheduler_runs ENABLE ROW LEVEL SECURITY");
        this.schema.raw("ALTER TABLE content_scheduler_runs FORCE ROW LEVEL SECURITY");
        this.schema.raw(`CREATE POLICY tenant_isolation ON content_scheduler_runs USING (${TENANT}) WITH CHECK (${TENANT})`);
        this.schema.raw("ALTER TABLE content_scheduler_runs ADD CONSTRAINT content_scheduler_runs_kind_check CHECK (job_kind IN ('publish_due','ingest_due'))");
        this.schema.raw("ALTER TABLE content_scheduler_runs ADD CONSTRAINT content_scheduler_runs_status_check CHECK (status IN ('running','completed','failed','skipped'))");
        this.schema.raw("ALTER TABLE content_scheduler_runs ADD CONSTRAINT content_scheduler_runs_count_check CHECK (processed_count >= 0)");
    }

    async down() {
        this.schema.dropTable("content_scheduler_runs");
    }
}
