import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Adds the current reconciliation projection to `payment_attempts`. Immutable operator history is
 * written to the existing tenant-scoped `admin_audit_log`, avoiding a second audit subsystem.
 */
export default class extends BaseSchema {
    async up() {
        this.schema.alterTable("payment_attempts", (table) => {
            table.string("reconciliation_status", 20).notNullable().defaultTo("unchecked");
            table.string("reconciliation_provider_status", 20).nullable();
            table.timestamp("reconciliation_checked_at", { useTz: true }).nullable();
            table.bigInteger("reconciliation_checked_by_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("reconciliation_error_code", 80).nullable();
            table.jsonb("reconciliation_evidence").notNullable().defaultTo("{}");
            table.index(["reconciliation_status", "created_at"], "payment_attempts_reconciliation_status_idx");
        });
    }

    async down() {
        this.schema.alterTable("payment_attempts", (table) => {
            table.dropIndex(["reconciliation_status", "created_at"], "payment_attempts_reconciliation_status_idx");
            table.dropColumn("reconciliation_evidence");
            table.dropColumn("reconciliation_error_code");
            table.dropColumn("reconciliation_checked_by_user_id");
            table.dropColumn("reconciliation_checked_at");
            table.dropColumn("reconciliation_provider_status");
            table.dropColumn("reconciliation_status");
        });
    }
}
