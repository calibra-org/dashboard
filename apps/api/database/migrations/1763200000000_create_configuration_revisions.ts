import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT_PREDICATE = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("configuration_revisions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("scope_key", 64).notNullable();
            table.integer("revision").notNullable();
            table.string("source", 24).notNullable().defaultTo("update");
            table.integer("rollback_of_revision").nullable();
            table.jsonb("snapshot").notNullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "scope_key", "revision"], {
                indexName: "configuration_revisions_tenant_scope_revision_unique",
            });
            table.index(["tenant_id", "created_at"], "configuration_revisions_tenant_created_idx");
            table.index(["tenant_id", "scope_key", "created_at"], "configuration_revisions_tenant_scope_created_idx");
        });

        this.schema.raw("ALTER TABLE configuration_revisions ENABLE ROW LEVEL SECURITY");
        this.schema.raw("ALTER TABLE configuration_revisions FORCE ROW LEVEL SECURITY");
        this.schema.raw(
            `CREATE POLICY configuration_revisions_tenant_isolation ON configuration_revisions USING (${TENANT_PREDICATE}) WITH CHECK (${TENANT_PREDICATE})`,
        );
    }

    async down() {
        this.schema.raw("DROP POLICY IF EXISTS configuration_revisions_tenant_isolation ON configuration_revisions");
        this.schema.dropTable("configuration_revisions");
    }
}
