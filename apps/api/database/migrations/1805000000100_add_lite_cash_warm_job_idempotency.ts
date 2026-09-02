import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    async up() {
        this.schema.alterTable("lite_cash_warm_jobs", (table) => {
            table.string("idempotency_key", 190).nullable();
        });
        this.schema.raw(
            "CREATE UNIQUE INDEX lite_cash_warm_jobs_idempotency_unique ON lite_cash_warm_jobs (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL",
        );
    }

    async down() {
        this.schema.raw("DROP INDEX IF EXISTS lite_cash_warm_jobs_idempotency_unique");
        this.schema.alterTable("lite_cash_warm_jobs", (table) => {
            table.dropColumn("idempotency_key");
        });
    }
}
