import { BaseSchema } from "@adonisjs/lucid/schema";
const TENANT_PREDICATE = `tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint`;
export default class extends BaseSchema {
    async up() {
        this.schema.createTable("social_message_media", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("message_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("social_messages")
                .onDelete("CASCADE");
            table.bigInteger("media_id").unsigned().notNullable().references("id").inTable("media").onDelete("RESTRICT");
            table.integer("sequence").notNullable().defaultTo(0);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "message_id", "media_id"], { indexName: "social_message_media_unique" });
            table.index(["tenant_id", "message_id", "sequence"], "social_message_media_message_idx");
        });
        this.schema.raw(
            `ALTER TABLE social_message_media ADD CONSTRAINT social_message_media_sequence_check CHECK (sequence BETWEEN 0 AND 8)`,
        );
        this.schema.raw(
            `ALTER TABLE social_message_media ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
        );
        this.schema.raw(`ALTER TABLE social_message_media ENABLE ROW LEVEL SECURITY`);
        this.schema.raw(`ALTER TABLE social_message_media FORCE ROW LEVEL SECURITY`);
        this.schema.raw(
            `CREATE POLICY tenant_isolation ON social_message_media USING (${TENANT_PREDICATE}) WITH CHECK (${TENANT_PREDICATE})`,
        );
    }
    async down() {
        this.schema.dropTable("social_message_media");
    }
}
