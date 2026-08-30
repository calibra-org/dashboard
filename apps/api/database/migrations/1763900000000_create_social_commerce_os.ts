import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT_PREDICATE = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";
const TENANT_TABLES = [
    "social_contents",
    "social_story_frames",
    "social_product_markers",
    "social_follow_edges",
    "social_interaction_events",
    "social_channels",
    "social_channel_memberships",
    "social_threads",
    "social_messages",
    "social_moderation_cases",
    "social_moderation_actions",
    "social_live_sessions",
    "social_commerce_attributions",
    "social_reputation_signals",
] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("social_contents", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("kind", 24).notNullable();
            table.string("status", 24).notNullable().defaultTo("draft");
            table.string("title", 300).notNullable();
            table.text("description").nullable();
            table.string("locale", 8).notNullable().defaultTo("fa");
            table.string("market", 32).nullable();
            table.bigInteger("cover_media_id").unsigned().nullable().references("id").inTable("media").onDelete("SET NULL");
            table.bigInteger("primary_media_id").unsigned().nullable().references("id").inTable("media").onDelete("SET NULL");
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.jsonb("audience").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("rights_metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("moderation_state", 24).notNullable().defaultTo("approved");
            table.string("experiment_variant", 80).nullable();
            table.string("aspect_ratio", 8).nullable();
            table.integer("duration_seconds").nullable();
            table.timestamp("publish_at", { useTz: true }).nullable();
            table.timestamp("expires_at", { useTz: true }).nullable();
            table.timestamp("published_at", { useTz: true }).nullable();
            table.timestamp("archived_at", { useTz: true }).nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.index(["tenant_id", "status", "publish_at"], "social_contents_publish_idx");
            table.index(["tenant_id", "kind", "published_at"], "social_contents_feed_idx");
        });

        this.schema.createTable("social_story_frames", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("content_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("social_contents")
                .onDelete("CASCADE");
            table.integer("sequence").notNullable();
            table.string("frame_type", 24).notNullable();
            table.bigInteger("media_id").unsigned().nullable().references("id").inTable("media").onDelete("SET NULL");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table.integer("duration_ms").notNullable().defaultTo(5000);
            table.string("cta_label", 120).nullable();
            table.string("cta_url", 1024).nullable();
            table.jsonb("payload").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamps(true, true);
            table.unique(["tenant_id", "content_id", "sequence"], { indexName: "social_story_frames_sequence_unique" });
        });

        this.schema.createTable("social_product_markers", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("content_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("social_contents")
                .onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("CASCADE");
            table.integer("timestamp_ms").notNullable().defaultTo(0);
            table.string("label", 180).nullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamps(true, true);
            table.index(["tenant_id", "content_id", "timestamp_ms"], "social_product_markers_timeline_idx");
        });

        this.schema.createTable("social_follow_edges", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("follower_customer_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("customers")
                .onDelete("CASCADE");
            table.string("subject_type", 24).notNullable();
            table.string("subject_ref", 160).notNullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "follower_customer_id", "subject_type", "subject_ref"], {
                indexName: "social_follow_edges_unique",
            });
        });

        this.schema.createTable("social_interaction_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("customer_id").unsigned().nullable().references("id").inTable("customers").onDelete("SET NULL");
            table.string("anonymous_id", 96).nullable();
            table.bigInteger("content_id").unsigned().nullable().references("id").inTable("social_contents").onDelete("SET NULL");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table
                .bigInteger("marker_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("social_product_markers")
                .onDelete("SET NULL");
            table.string("event_type", 48).notNullable();
            table.string("source_surface", 80).notNullable();
            table.integer("position_ms").nullable();
            table.integer("watch_ms").nullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "content_id", "occurred_at"], "social_events_content_idx");
        });

        this.schema.createTable("social_channels", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("name", 180).notNullable();
            table.string("slug", 180).notNullable();
            table.string("kind", 32).notNullable().defaultTo("discussion");
            table.string("visibility", 24).notNullable().defaultTo("public");
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.unique(["tenant_id", "slug"], { indexName: "social_channels_slug_unique" });
        });

        this.schema.createTable("social_channel_memberships", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("channel_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("social_channels")
                .onDelete("CASCADE");
            table.bigInteger("customer_id").unsigned().nullable().references("id").inTable("customers").onDelete("CASCADE");
            table.bigInteger("user_id").unsigned().nullable().references("id").inTable("users").onDelete("CASCADE");
            table.string("role", 32).notNullable().defaultTo("member");
            table.string("status", 24).notNullable().defaultTo("active");
            table.timestamps(true, true);
            table.index(["tenant_id", "channel_id", "status"], "social_memberships_channel_idx");
        });

        this.schema.createTable("social_threads", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("channel_id").unsigned().nullable().references("id").inTable("social_channels").onDelete("SET NULL");
            table.bigInteger("customer_id").unsigned().nullable().references("id").inTable("customers").onDelete("SET NULL");
            table.bigInteger("content_id").unsigned().nullable().references("id").inTable("social_contents").onDelete("SET NULL");
            table.string("kind", 24).notNullable().defaultTo("community");
            table.string("subject", 300).notNullable();
            table.string("status", 32).notNullable().defaultTo("open");
            table
                .bigInteger("converted_ticket_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("support_tickets")
                .onDelete("SET NULL");
            table.timestamp("last_message_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.integer("version").notNullable().defaultTo(1);
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamps(true, true);
            table.index(["tenant_id", "customer_id", "status", "last_message_at"], "social_threads_customer_idx");
        });

        this.schema.createTable("social_messages", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("thread_id").unsigned().notNullable().references("id").inTable("social_threads").onDelete("CASCADE");
            table
                .bigInteger("author_customer_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("customers")
                .onDelete("SET NULL");
            table.bigInteger("author_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("kind", 32).notNullable().defaultTo("message");
            table.text("body").notNullable();
            table.string("moderation_state", 24).notNullable().defaultTo("approved");
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "thread_id", "created_at"], "social_messages_thread_idx");
        });

        this.schema.createTable("social_moderation_cases", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("target_type", 32).notNullable();
            table.bigInteger("target_id").notNullable();
            table.string("category", 48).notNullable();
            table.string("status", 32).notNullable().defaultTo("pending_review");
            table.text("reason").nullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.index(["tenant_id", "status", "created_at"], "social_moderation_queue_idx");
        });

        this.schema.createTable("social_moderation_actions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("case_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("social_moderation_cases")
                .onDelete("CASCADE");
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("action", 32).notNullable();
            table.text("reason").nullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "case_id", "created_at"], "social_moderation_actions_case_idx");
        });

        this.schema.createTable("social_live_sessions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("content_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("social_contents")
                .onDelete("CASCADE");
            table.string("status", 32).notNullable().defaultTo("scheduled");
            table.timestamp("scheduled_at", { useTz: true }).notNullable();
            table.timestamp("started_at", { useTz: true }).nullable();
            table.timestamp("ended_at", { useTz: true }).nullable();
            table
                .bigInteger("pinned_marker_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("social_product_markers")
                .onDelete("SET NULL");
            table.integer("slow_mode_seconds").notNullable().defaultTo(0);
            table.string("provider", 32).nullable();
            table.string("provider_ref", 160).nullable();
            table.timestamp("provider_ready_at", { useTz: true }).nullable();
            table.string("playback_ref", 512).nullable();
            table.bigInteger("replay_media_id").unsigned().nullable().references("id").inTable("media").onDelete("SET NULL");
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.unique(["tenant_id", "content_id"], { indexName: "social_live_content_unique" });
        });

        this.schema.createTable("social_commerce_attributions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");
            table.bigInteger("customer_id").unsigned().nullable().references("id").inTable("customers").onDelete("SET NULL");
            table.bigInteger("content_id").unsigned().nullable().references("id").inTable("social_contents").onDelete("SET NULL");
            table
                .bigInteger("marker_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("social_product_markers")
                .onDelete("SET NULL");
            table
                .bigInteger("interaction_event_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("social_interaction_events")
                .onDelete("SET NULL");
            table.string("source_surface", 80).notNullable();
            table.integer("position_ms").nullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "order_id", "source_surface"], { indexName: "social_attribution_order_surface_unique" });
        });

        this.schema.createTable("social_reputation_signals", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("customer_id").unsigned().notNullable().references("id").inTable("customers").onDelete("CASCADE");
            table.string("signal_type", 64).notNullable();
            table.decimal("weight", 10, 4).notNullable().defaultTo(0);
            table.string("evidence_ref", 190).nullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "customer_id", "created_at"], "social_reputation_customer_idx");
        });

        const checks = [
            `ALTER TABLE social_contents ADD CONSTRAINT social_contents_kind_check CHECK (kind IN ('story','video','live','post','question'))`,
            `ALTER TABLE social_contents ADD CONSTRAINT social_contents_status_check CHECK (status IN ('draft','review','scheduled','published','expired','archived','highlight'))`,
            `ALTER TABLE social_contents ADD CONSTRAINT social_contents_moderation_check CHECK (moderation_state IN ('pending_review','approved','limited','removed'))`,
            `ALTER TABLE social_contents ADD CONSTRAINT social_contents_aspect_check CHECK (aspect_ratio IS NULL OR aspect_ratio IN ('9:16','1:1','16:9'))`,
            `ALTER TABLE social_contents ADD CONSTRAINT social_contents_duration_check CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 1 AND 14400)`,
            `ALTER TABLE social_story_frames ADD CONSTRAINT social_story_frames_type_check CHECK (frame_type IN ('image','video','text','poll','product'))`,
            `ALTER TABLE social_follow_edges ADD CONSTRAINT social_follow_subject_check CHECK (subject_type IN ('user','creator','brand','category','topic','series'))`,
            `ALTER TABLE social_channel_memberships ADD CONSTRAINT social_membership_role_check CHECK (role IN ('owner','admin','moderator','verified_expert','creator','member'))`,
            `ALTER TABLE social_threads ADD CONSTRAINT social_thread_kind_check CHECK (kind IN ('public_qa','community','private'))`,
            `ALTER TABLE social_threads ADD CONSTRAINT social_thread_status_check CHECK (status IN ('open','closed','converted_to_ticket'))`,
            `ALTER TABLE social_moderation_cases ADD CONSTRAINT social_moderation_category_check CHECK (category IN ('spam','scam','phishing','harassment','unsafe_content','impersonation','duplicate','prohibited_link','misinformation','product_claim_risk','copyright','rights','editorial_review'))`,
            `ALTER TABLE social_moderation_cases ADD CONSTRAINT social_moderation_status_check CHECK (status IN ('pending_review','limited','removed','appealed','restored','final'))`,
            `ALTER TABLE social_moderation_actions ADD CONSTRAINT social_moderation_action_check CHECK (action IN ('limit','remove','restore','finalize','escalate','note'))`,
            `ALTER TABLE social_live_sessions ADD CONSTRAINT social_live_sessions_status_check CHECK (status IN ('scheduled','pre_live','ready','starting','live','ending','ended','processing_replay','replay_ready','archived','start_failed','interrupted','replay_failed','removed','cancelled'))`,
            `ALTER TABLE social_live_sessions ADD CONSTRAINT social_live_sessions_slow_mode_check CHECK (slow_mode_seconds BETWEEN 0 AND 300)`,
        ];
        for (const sql of checks) this.schema.raw(sql);

        for (const table of TENANT_TABLES) {
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
        for (const table of [...TENANT_TABLES].reverse()) this.schema.dropTable(table);
    }
}
