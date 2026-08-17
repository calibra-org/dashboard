import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    async up() {
        this.schema.alterTable("governance_action_ledger", (table) => {
            table.text("hash_payload").notNullable().defaultTo("");
        });
    }

    async down() {
        this.schema.alterTable("governance_action_ledger", (table) => {
            table.dropColumn("hash_payload");
        });
    }
}
