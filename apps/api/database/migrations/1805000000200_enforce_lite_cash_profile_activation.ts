import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    async up() {
        this.schema.raw(
            "CREATE UNIQUE INDEX lite_cash_profiles_single_active ON lite_cash_optimization_profiles (tenant_id) WHERE status = 'active'",
        );
    }

    async down() {
        this.schema.raw("DROP INDEX IF EXISTS lite_cash_profiles_single_active");
    }
}
