import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT_PREDICATE = `tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint`;
const EXTENSION_TABLES = [
    "social_media_assets",
    "media_variants",
    "media_tracks",
    "media_rights",
    "social_provider_events",
    "product_review_media",
    "product_review_helpful_votes",
    "product_review_responses",
    "product_review_reports",
    "social_moderation_appeals",
] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.raw(`ALTER TABLE media DROP CONSTRAINT IF EXISTS media_kind_check`);
        this.schema.raw(`ALTER TABLE media ADD CONSTRAINT media_kind_check CHECK (kind IN ('image','video','audio','file'))`);
        this.schema.alterTable("media", (table) => {
            table.string("processing_state", 32).notNullable().defaultTo("ready");
            table.string("provider", 32).nullable();
            table.string("provider_ref", 160).nullable();
            table.string("storage_key", 1024).nullable();
            table.string("checksum_sha256", 64).nullable();
            table.integer("duration_ms").nullable();
            table.string("codec", 80).nullable();
            table.string("container", 40).nullable();
            table.string("access_policy", 24).notNullable().defaultTo("public");
        });
        this.schema.raw(
            `ALTER TABLE media ADD CONSTRAINT media_processing_state_check CHECK (processing_state IN ('initiated','uploading','uploaded','validating','scanning','processing','ready','moderation_pending','publishable','upload_failed','validation_failed','quarantined','processing_failed','rejected','deleted'))`,
        );
        this.schema.raw(
            `ALTER TABLE media ADD CONSTRAINT media_access_policy_check CHECK (access_policy IN ('public','signed','members','private'))`,
        );
        this.schema.raw(
            `ALTER TABLE media ADD CONSTRAINT media_duration_ms_check CHECK (duration_ms IS NULL OR duration_ms >= 0)`,
        );

        this.schema.createTable("social_media_assets", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("media_id").unsigned().notNullable().references("id").inTable("media").onDelete("CASCADE");
            table.string("purpose", 32).notNullable().defaultTo("video");
            table.string("owner_actor_type", 24).notNullable();
            table.string("owner_actor_ref", 96).notNullable();
            table.string("upload_state", 32).notNullable().defaultTo("initiated");
            table.string("provider", 32).notNullable();
            table.string("provider_ref", 160).nullable();
            table.string("original_filename", 512).nullable();
            table.string("declared_mime", 128).notNullable();
            table.bigInteger("declared_size_bytes").notNullable();
            table.integer("max_duration_seconds").nullable();
            table.timestamp("upload_expires_at", { useTz: true }).nullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.unique(["tenant_id", "media_id"], { indexName: "social_media_assets_tenant_media_unique" });
            table.index(["tenant_id", "provider", "provider_ref"], "social_media_assets_provider_idx");
        });
        this.schema.raw(
            `ALTER TABLE social_media_assets ADD CONSTRAINT social_media_assets_purpose_check CHECK (purpose IN ('story','video','live_replay','review','message','thumbnail','caption','transcript'))`,
        );
        this.schema.raw(
            `ALTER TABLE social_media_assets ADD CONSTRAINT social_media_assets_owner_check CHECK (owner_actor_type IN ('customer','user','creator','brand','system'))`,
        );
        this.schema.raw(
            `ALTER TABLE social_media_assets ADD CONSTRAINT social_media_assets_state_check CHECK (upload_state IN ('initiated','uploading','uploaded','validating','scanning','processing','ready','moderation_pending','publishable','upload_failed','validation_failed','quarantined','processing_failed','rejected','deleted'))`,
        );
        this.schema.raw(
            `ALTER TABLE social_media_assets ADD CONSTRAINT social_media_assets_size_check CHECK (declared_size_bytes > 0)`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX social_media_assets_provider_ref_unique ON social_media_assets (tenant_id, provider, provider_ref) WHERE provider_ref IS NOT NULL`,
        );

        this.schema.createTable("media_variants", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("media_id").unsigned().notNullable().references("id").inTable("media").onDelete("CASCADE");
            table.string("variant_key", 80).notNullable();
            table.string("aspect_ratio", 8).nullable();
            table.integer("width").nullable();
            table.integer("height").nullable();
            table.integer("bitrate_kbps").nullable();
            table.string("mime", 128).nullable();
            table.string("provider_ref", 200).nullable();
            table.string("url", 2048).nullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamps(true, true);
            table.unique(["tenant_id", "media_id", "variant_key"], { indexName: "media_variants_tenant_media_key_unique" });
        });
        this.schema.raw(
            `ALTER TABLE media_variants ADD CONSTRAINT media_variants_aspect_check CHECK (aspect_ratio IS NULL OR aspect_ratio IN ('9:16','1:1','16:9'))`,
        );

        this.schema.createTable("media_tracks", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("media_id").unsigned().notNullable().references("id").inTable("media").onDelete("CASCADE");
            table.string("kind", 24).notNullable();
            table.string("locale", 16).nullable();
            table.string("status", 24).notNullable().defaultTo("draft");
            table.string("provider_ref", 200).nullable();
            table.string("storage_key", 1024).nullable();
            table.text("text_content").nullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("reviewed_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("reviewed_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.index(["tenant_id", "media_id", "kind", "locale"], "media_tracks_lookup_idx");
        });

        this.schema.raw(
            `ALTER TABLE media_tracks ADD CONSTRAINT media_tracks_kind_check CHECK (kind IN ('caption','transcript','chapter','audio_description'))`,
        );
        this.schema.raw(
            `ALTER TABLE media_tracks ADD CONSTRAINT media_tracks_status_check CHECK (status IN ('draft','generated','in_review','approved','rejected','ready','error'))`,
        );

        this.schema.createTable("media_rights", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("media_id").unsigned().notNullable().references("id").inTable("media").onDelete("CASCADE");
            table.string("rights_basis", 32).notNullable();
            table.string("holder_ref", 200).nullable();
            table.boolean("consent_confirmed").notNullable().defaultTo(false);
            table.timestamp("valid_until", { useTz: true }).nullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("recorded_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.index(["tenant_id", "media_id"], "media_rights_media_idx");
        });
        this.schema.raw(
            `ALTER TABLE media_rights ADD CONSTRAINT media_rights_basis_check CHECK (rights_basis IN ('owned','licensed','creator_consent','customer_consent','public_domain','other'))`,
        );

        this.schema.createTable("social_provider_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("provider", 32).notNullable();
            table.string("provider_ref", 200).notNullable();
            table.string("event_kind", 80).notNullable();
            table.specificType("payload_hash", "char(64)").notNullable();
            table.string("outcome", 32).notNullable().defaultTo("pending");
            table.timestamp("received_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("processed_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "provider", "provider_ref", "event_kind", "payload_hash"], {
                indexName: "social_provider_events_dedupe_unique",
            });
            table.index(["tenant_id", "provider", "provider_ref", "received_at"], "social_provider_events_lookup_idx");
        });

        this.schema.alterTable("social_interaction_events", (table) => {
            table.uuid("event_id").nullable();
            table.integer("schema_version").notNullable().defaultTo(1);
            table.string("event_name", 96).nullable();
            table.timestamp("received_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.string("aggregate_type", 40).nullable();
            table.string("aggregate_ref", 96).nullable();
            table.string("actor_type", 24).notNullable().defaultTo("anonymous");
            table.string("actor_ref", 96).nullable();
            table.string("session_id", 120).nullable();
            table.string("correlation_id", 120).nullable();
            table.string("causation_id", 120).nullable();
            table.string("consent_context", 80).nullable();
            table.string("privacy_classification", 24).notNullable().defaultTo("personal");
            table.string("dedupe_key", 200).nullable();
        });
        this.schema.raw(
            `ALTER TABLE social_interaction_events ADD CONSTRAINT social_interaction_schema_version_check CHECK (schema_version >= 1)`,
        );
        this.schema.raw(
            `ALTER TABLE social_interaction_events ADD CONSTRAINT social_interaction_actor_type_check CHECK (actor_type IN ('customer','staff','agent','system','anonymous'))`,
        );
        this.schema.raw(
            `ALTER TABLE social_interaction_events ADD CONSTRAINT social_interaction_privacy_check CHECK (privacy_classification IN ('public','internal','personal','sensitive'))`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX social_interaction_event_id_unique ON social_interaction_events (tenant_id, event_id) WHERE event_id IS NOT NULL`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX social_interaction_dedupe_unique ON social_interaction_events (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL`,
        );

        this.schema.createTable("social_moderation_appeals", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("case_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("social_moderation_cases")
                .onDelete("CASCADE");
            table.bigInteger("customer_id").unsigned().nullable().references("id").inTable("customers").onDelete("SET NULL");
            table.bigInteger("user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.text("reason").notNullable();
            table.string("status", 24).notNullable().defaultTo("submitted");
            table.text("resolution_note").nullable();
            table.bigInteger("resolved_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("resolved_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.index(["tenant_id", "case_id", "status"], "social_moderation_appeals_case_idx");
        });
        this.schema.raw(
            `ALTER TABLE social_moderation_appeals ADD CONSTRAINT social_moderation_appeals_actor_check CHECK (customer_id IS NOT NULL OR user_id IS NOT NULL)`,
        );
        this.schema.raw(
            `ALTER TABLE social_moderation_appeals ADD CONSTRAINT social_moderation_appeals_status_check CHECK (status IN ('submitted','in_review','restored','final_removed','withdrawn'))`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX social_moderation_open_appeal_unique ON social_moderation_appeals (tenant_id, case_id, COALESCE(customer_id, 0), COALESCE(user_id, 0)) WHERE status IN ('submitted','in_review')`,
        );

        this.schema.alterTable("product_reviews", (table) => {
            table.bigInteger("verified_order_id").unsigned().nullable().references("id").inTable("orders").onDelete("SET NULL");
            table.string("verification_policy_version", 40).nullable();
            table.string("moderation_state", 24).notNullable().defaultTo("pending");
            table.string("locale", 16).notNullable().defaultTo("fa");
            table.integer("version").notNullable().defaultTo(1);
            table.timestamp("edited_at", { useTz: true }).nullable();
        });
        this.schema.raw(
            `ALTER TABLE product_reviews ADD CONSTRAINT product_reviews_moderation_state_check CHECK (moderation_state IN ('pending','draft','submitted','moderation_pending','published','limited','removed','appealed','restored','final_removed'))`,
        );
        this.schema.raw(`ALTER TABLE product_reviews ADD CONSTRAINT product_reviews_version_check CHECK (version >= 1)`);

        this.schema.createTable("product_review_media", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("review_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_reviews")
                .onDelete("CASCADE");
            table.bigInteger("media_id").unsigned().notNullable().references("id").inTable("media").onDelete("RESTRICT");
            table.integer("sequence").notNullable().defaultTo(0);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "review_id", "media_id"], { indexName: "product_review_media_unique" });
        });
        this.schema.createTable("product_review_helpful_votes", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("review_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_reviews")
                .onDelete("CASCADE");
            table.bigInteger("customer_id").unsigned().notNullable().references("id").inTable("customers").onDelete("CASCADE");
            table.boolean("helpful").notNullable().defaultTo(true);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "review_id", "customer_id"], { indexName: "product_review_helpful_unique" });
        });
        this.schema.createTable("product_review_responses", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("review_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_reviews")
                .onDelete("CASCADE");
            table.bigInteger("user_id").unsigned().notNullable().references("id").inTable("users").onDelete("RESTRICT");
            table.text("body").notNullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "review_id", "created_at"], "product_review_responses_idx");
        });
        this.schema.createTable("product_review_reports", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("review_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("product_reviews")
                .onDelete("CASCADE");
            table.bigInteger("customer_id").unsigned().nullable().references("id").inTable("customers").onDelete("SET NULL");
            table.string("anonymous_id", 96).nullable();
            table.string("reason_code", 40).notNullable();
            table.text("details").nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "review_id", "created_at"], "product_review_reports_idx");
        });
        this.schema.raw(
            `ALTER TABLE product_review_reports ADD CONSTRAINT product_review_reports_actor_check CHECK (customer_id IS NOT NULL OR anonymous_id IS NOT NULL)`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX product_review_reports_customer_unique ON product_review_reports (tenant_id, review_id, customer_id) WHERE customer_id IS NOT NULL`,
        );

        for (const table of EXTENSION_TABLES) {
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
        // Phase 8 is the migration that makes canonical video/audio media kinds legal.
        // A downgrade cannot preserve rows that violate the pre-Phase-8 schema; remove all
        // incompatible media kinds before restoring the old media_kind_check. This also covers
        // rows whose social_media_assets projection was already removed by retention/test reset.
        this.schema.raw(`DELETE FROM media WHERE kind IN ('video','audio')`);
        for (const table of [...EXTENSION_TABLES].reverse()) this.schema.dropTable(table);
        this.schema.raw(`DROP INDEX IF EXISTS social_interaction_dedupe_unique`);
        this.schema.raw(`DROP INDEX IF EXISTS social_interaction_event_id_unique`);
        this.schema.alterTable("social_interaction_events", (table) => {
            for (const column of [
                "event_id",
                "schema_version",
                "event_name",
                "received_at",
                "aggregate_type",
                "aggregate_ref",
                "actor_type",
                "actor_ref",
                "session_id",
                "correlation_id",
                "causation_id",
                "consent_context",
                "privacy_classification",
                "dedupe_key",
            ])
                table.dropColumn(column);
        });
        this.schema.alterTable("product_reviews", (table) => {
            for (const column of [
                "verified_order_id",
                "verification_policy_version",
                "moderation_state",
                "locale",
                "version",
                "edited_at",
            ])
                table.dropColumn(column);
        });
        this.schema.raw(`ALTER TABLE media DROP CONSTRAINT IF EXISTS media_processing_state_check`);
        this.schema.raw(`ALTER TABLE media DROP CONSTRAINT IF EXISTS media_access_policy_check`);
        this.schema.raw(`ALTER TABLE media DROP CONSTRAINT IF EXISTS media_duration_ms_check`);
        this.schema.raw(`ALTER TABLE media DROP CONSTRAINT IF EXISTS media_kind_check`);
        this.schema.raw(`ALTER TABLE media ADD CONSTRAINT media_kind_check CHECK (kind IN ('image','file'))`);
        this.schema.alterTable("media", (table) => {
            for (const column of [
                "processing_state",
                "provider",
                "provider_ref",
                "storage_key",
                "checksum_sha256",
                "duration_ms",
                "codec",
                "container",
                "access_policy",
            ])
                table.dropColumn(column);
        });
    }
}
