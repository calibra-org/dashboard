import { BaseSchema } from "@adonisjs/lucid/schema";
const TENANT_PREDICATE = `tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint`;
export default class extends BaseSchema {
    async up() {
        this.schema.alterTable("social_media_assets", (table) => {
            table.string("safety_state", 24).notNullable().defaultTo("pending");
            table.string("safety_provider", 64).nullable();
            table.jsonb("safety_evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("safety_checked_at", { useTz: true }).nullable();
            table.integer("retry_count").notNullable().defaultTo(0);
            table.timestamp("next_retry_at", { useTz: true }).nullable();
        });
        this.schema.raw(
            `ALTER TABLE social_media_assets ADD CONSTRAINT social_media_assets_safety_state_check CHECK (safety_state IN ('pending','scanning','clean','quarantined','rejected','error'))`,
        );
        this.schema.raw(
            `ALTER TABLE social_media_assets ADD CONSTRAINT social_media_assets_retry_count_check CHECK (retry_count >= 0)`,
        );
        this.schema.raw(
            `CREATE INDEX social_media_assets_recovery_idx ON social_media_assets (tenant_id, upload_state, next_retry_at)`,
        );
        this.schema.alterTable("social_live_sessions", (table) => {
            table.boolean("chat_frozen").notNullable().defaultTo(false);
            table.text("chat_freeze_reason").nullable();
            table.timestamp("chat_frozen_at", { useTz: true }).nullable();
            table
                .bigInteger("chat_frozen_by_user_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("users")
                .onDelete("SET NULL");
        });
        this.schema.createTable("media_security_scans", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("media_id").unsigned().notNullable().references("id").inTable("media").onDelete("CASCADE");
            table.string("scanner", 64).notNullable();
            table.string("scanner_ref", 200).notNullable().defaultTo("manual");
            table.string("verdict", 24).notNullable().defaultTo("pending");
            table.string("content_hash", 128).nullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("recorded_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("scanned_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.index(["tenant_id", "media_id", "created_at"], "media_security_scans_media_idx");
            table.unique(["tenant_id", "media_id", "scanner", "scanner_ref"], {
                indexName: "media_security_scans_provider_unique",
            });
        });
        this.schema.raw(
            `ALTER TABLE media_security_scans ADD CONSTRAINT media_security_scans_verdict_check CHECK (verdict IN ('pending','clean','suspicious','malicious','error'))`,
        );
        this.schema.createTable("social_live_participant_controls", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("live_session_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("social_live_sessions")
                .onDelete("CASCADE");
            table.bigInteger("customer_id").unsigned().nullable().references("id").inTable("customers").onDelete("CASCADE");
            table.string("anonymous_id", 96).nullable();
            table.string("control", 16).notNullable();
            table.boolean("active").notNullable().defaultTo(true);
            table.text("reason").nullable();
            table.timestamp("expires_at", { useTz: true }).nullable();
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
        });
        this.schema.raw(
            `ALTER TABLE social_live_participant_controls ADD CONSTRAINT social_live_participant_control_check CHECK (control IN ('mute','ban'))`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX social_live_participant_customer_unique ON social_live_participant_controls (tenant_id, live_session_id, customer_id, control) WHERE customer_id IS NOT NULL`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX social_live_participant_anonymous_unique ON social_live_participant_controls (tenant_id, live_session_id, anonymous_id, control) WHERE anonymous_id IS NOT NULL`,
        );
        for (const table of ["media_security_scans", "social_live_participant_controls"]) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(
                `CREATE POLICY tenant_isolation ON ${table} USING (${TENANT_PREDICATE}) WITH CHECK (${TENANT_PREDICATE})`,
            );
        }
    }
    async down() {
        this.schema.dropTable("social_live_participant_controls");
        this.schema.dropTable("media_security_scans");
        this.schema.alterTable("social_live_sessions", (table) => {
            table.dropColumn("chat_frozen");
            table.dropColumn("chat_freeze_reason");
            table.dropColumn("chat_frozen_at");
            table.dropColumn("chat_frozen_by_user_id");
        });
        this.schema.raw(`DROP INDEX IF EXISTS social_media_assets_recovery_idx`);
        this.schema.raw(`ALTER TABLE social_media_assets DROP CONSTRAINT IF EXISTS social_media_assets_retry_count_check`);
        this.schema.raw(`ALTER TABLE social_media_assets DROP CONSTRAINT IF EXISTS social_media_assets_safety_state_check`);
        this.schema.alterTable("social_media_assets", (table) => {
            table.dropColumn("safety_state");
            table.dropColumn("safety_provider");
            table.dropColumn("safety_evidence");
            table.dropColumn("safety_checked_at");
            table.dropColumn("retry_count");
            table.dropColumn("next_retry_at");
        });
    }
}
