import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Payment-init idempotency is an order-scoped contract, not a globally unique token namespace.
 *
 * The original phase-08 index made `idempotency_key` globally unique. That disagreed with
 * PaymentService, which resolves a replay by `(order_id, idempotency_key)`, and meant two unrelated
 * orders (including orders from different tenants) could collide when clients legitimately reused
 * a key. Multi-tenancy later added `tenant_id`, so make the database invariant match the runtime
 * contract explicitly.
 */
export default class extends BaseSchema {
    protected tableName = "payment_attempts";

    async up() {
        this.schema.raw(`DROP INDEX IF EXISTS "payment_attempts_idempotency_key_unique"`);
        this.schema.raw(`
            CREATE UNIQUE INDEX "payment_attempts_tenant_order_idempotency_unique"
            ON "${this.tableName}" (tenant_id, order_id, idempotency_key)
            WHERE idempotency_key IS NOT NULL
        `);
    }

    async down() {
        this.schema.raw(`DROP INDEX IF EXISTS "payment_attempts_tenant_order_idempotency_unique"`);
        this.schema.raw(`
            CREATE UNIQUE INDEX "payment_attempts_idempotency_key_unique"
            ON "${this.tableName}" (idempotency_key)
            WHERE idempotency_key IS NOT NULL
        `);
    }
}
