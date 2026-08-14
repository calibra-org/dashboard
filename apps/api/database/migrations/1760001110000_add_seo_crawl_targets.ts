import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("seo_crawl_targets", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("crawl_run_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("seo_crawl_runs")
                .onDelete("CASCADE");
            table.string("url", 2048).notNullable();
            table.string("status", 24).notNullable().defaultTo("queued");
            table.integer("attempts").notNullable().defaultTo(0);
            table.text("last_error").nullable();
            table.timestamp("claimed_at", { useTz: true }).nullable();
            table.timestamp("finished_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "crawl_run_id", "url"], { indexName: "seo_crawl_targets_run_url_unique" });
            table.index(["tenant_id", "status", "created_at"], "seo_crawl_targets_queue_idx");
        });
        this.schema.raw(
            "ALTER TABLE seo_crawl_targets ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint",
        );
        this.schema.raw("ALTER TABLE seo_crawl_targets ENABLE ROW LEVEL SECURITY");
        this.schema.raw("ALTER TABLE seo_crawl_targets FORCE ROW LEVEL SECURITY");
        this.schema.raw(`CREATE POLICY tenant_isolation ON seo_crawl_targets USING (${TENANT}) WITH CHECK (${TENANT})`);
        this.schema.raw(
            "ALTER TABLE seo_crawl_targets ADD CONSTRAINT seo_crawl_targets_status_check CHECK (status IN ('queued','processing','completed','failed'))",
        );
        this.schema.raw(
            "ALTER TABLE seo_crawl_targets ADD CONSTRAINT seo_crawl_targets_attempts_check CHECK (attempts BETWEEN 0 AND 5)",
        );
    }

    async down() {
        this.schema.dropTable("seo_crawl_targets");
    }
}
