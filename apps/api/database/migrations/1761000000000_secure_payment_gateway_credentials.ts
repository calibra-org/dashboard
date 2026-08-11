import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "payment_gateways";

    async up() {
        this.schema.alterTable(this.tableName, (table) => {
            table.text("credentials_ciphertext").nullable();
            table.string("health_status", 24).notNullable().defaultTo("unconfigured");
            table.timestamp("last_verified_at", { useTz: true }).nullable();
            table.text("last_error").nullable();
        });
    }

    async down() {
        this.schema.alterTable(this.tableName, (table) => {
            table.dropColumn("last_error");
            table.dropColumn("last_verified_at");
            table.dropColumn("health_status");
            table.dropColumn("credentials_ciphertext");
        });
    }
}
