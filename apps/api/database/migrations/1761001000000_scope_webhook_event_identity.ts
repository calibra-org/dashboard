import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * A PSP authority identifies a payment attempt, not a single immutable delivery. Providers can
 * legitimately deliver NOK/failed first and a later OK/success result for the same authority.
 * Treat the callback kind as part of the ledger identity so status evolution is auditable and a
 * later success can recover an earlier failure, while identical status retries remain idempotent.
 *
 * Lucid's schema builder queues DDL for the migration runner. Keep these calls synchronous: awaiting
 * the mutable schema builder executes queued statements early and they are then executed again by
 * the migration pipeline. Dropping both possible index names before recreating the canonical index
 * keeps upgrades and fresh/bootstrap databases deterministic without weakening the final definition.
 */
export default class extends BaseSchema {
    protected tableName = "processed_webhook_events";

    async up() {
        this.schema.raw(`DROP INDEX IF EXISTS "processed_webhook_events_provider_event_id_unique"`);
        this.schema.raw(`DROP INDEX IF EXISTS "processed_webhook_events_provider_event_kind_unique"`);
        this.schema.raw(`
            CREATE UNIQUE INDEX "processed_webhook_events_provider_event_kind_unique"
            ON "${this.tableName}" (tenant_id, provider, event_id, event_kind)
        `);
    }

    async down() {
        this.schema.raw(`DROP INDEX IF EXISTS "processed_webhook_events_provider_event_kind_unique"`);
        this.schema.raw(`DROP INDEX IF EXISTS "processed_webhook_events_provider_event_id_unique"`);
        this.schema.raw(`
            CREATE UNIQUE INDEX "processed_webhook_events_provider_event_id_unique"
            ON "${this.tableName}" (tenant_id, provider, event_id)
        `);
    }
}
