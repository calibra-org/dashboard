import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT_PREDICATE = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("configuration_overrides", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("group_key", 64).notNullable();
            table.string("definition_key", 160).notNullable();
            table.string("scope_type", 32).notNullable();
            table.string("scope_key", 160).notNullable();
            table.jsonb("value").nullable();
            table.string("value_type", 24).notNullable();
            table.text("reason").notNullable();
            table.integer("version").notNullable().defaultTo(1);
            table.boolean("is_deleted").notNullable().defaultTo(false);
            table.integer("rollout_percent").notNullable().defaultTo(100);
            table.timestamp("expires_at", { useTz: true }).nullable();
            table.string("approval_reference", 160).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "definition_key", "scope_type", "scope_key"], {
                indexName: "configuration_overrides_scope_unique",
            });
            table.index(["tenant_id", "group_key"], "configuration_overrides_tenant_group_idx");
        });

        this.schema.createTable("configuration_url_redirect_history", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("definition_key", 160).notNullable();
            table.string("scope_type", 32).notNullable();
            table.string("scope_key", 160).notNullable();
            table.jsonb("before_value").nullable();
            table.jsonb("after_value").nullable();
            table.text("reason").notNullable();
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "created_at"], "configuration_url_redirect_history_tenant_created_idx");
        });

        for (const table of ["configuration_overrides", "configuration_url_redirect_history"]) {
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(
                `CREATE POLICY ${table}_tenant_isolation ON ${table} USING (${TENANT_PREDICATE}) WITH CHECK (${TENANT_PREDICATE})`,
            );
        }
    }

    async down() {
        this.schema.raw(
            "DROP POLICY IF EXISTS configuration_url_redirect_history_tenant_isolation ON configuration_url_redirect_history",
        );
        this.schema.raw("DROP POLICY IF EXISTS configuration_overrides_tenant_isolation ON configuration_overrides");
        this.schema.dropTable("configuration_url_redirect_history");
        this.schema.dropTable("configuration_overrides");
    }
}
