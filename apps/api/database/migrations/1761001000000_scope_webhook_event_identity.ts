import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * A PSP authority identifies a payment attempt, not a single immutable delivery. Providers can
 * legitimately deliver NOK/failed first and a later OK/success result for the same authority.
 * Treat the callback kind as part of the ledger identity so status evolution is auditable and a
 * later success can recover an earlier failure, while identical status retries remain idempotent.
 *
 * Drop both the legacy and target index names before recreating the exact target definition. This
 * keeps a fresh migration deterministic and also repairs an interrupted/unrecorded rollout where
 * the target index was created before the migration transaction was recorded. CREATE IF NOT EXISTS
 * is intentionally avoided because it could silently preserve a same-name index with the wrong
 * column definition.
 */
export default class extends BaseSchema {
    protected tableName = "processed_webhook_events";

    async up() {
        await this.schema.raw(`DROP INDEX IF EXISTS "processed_webhook_events_provider_event_id_unique"`);
        await this.schema.raw(`DROP INDEX IF EXISTS "processed_webhook_events_provider_event_kind_unique"`);
        await this.schema.raw(`
            CREATE UNIQUE INDEX "processed_webhook_events_provider_event_kind_unique"
            ON "${this.tableName}" (tenant_id, provider, event_id, event_kind)
        `);
    }

    async down() {
        await this.schema.raw(`DROP INDEX IF EXISTS "processed_webhook_events_provider_event_kind_unique"`);
        await this.schema.raw(`DROP INDEX IF EXISTS "processed_webhook_events_provider_event_id_unique"`);
        await this.schema.raw(`
            CREATE UNIQUE INDEX "processed_webhook_events_provider_event_id_unique"
            ON "${this.tableName}" (tenant_id, provider, event_id)
        `);
    }
}
