import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.alterTable("support_channel_integrations", (table) => {
            table.boolean("enabled").notNullable().defaultTo(false);
            table.string("provider_key", 48).nullable();
            table.text("credentials_ciphertext").nullable();
            table.jsonb("credential_keys").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("capabilities").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("account_identifier", 255).nullable();
            table.jsonb("granted_scopes").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.timestamp("token_expires_at", { useTz: true }).nullable();
            table.timestamp("last_rotated_at", { useTz: true }).nullable();
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("webhook_status", 24).notNullable().defaultTo("unconfigured");
            table.timestamp("webhook_verified_at", { useTz: true }).nullable();
            table.timestamp("last_inbound_at", { useTz: true }).nullable();
            table.timestamp("last_outbound_at", { useTz: true }).nullable();
            table.timestamp("last_webhook_at", { useTz: true }).nullable();
            table.timestamp("last_successful_api_at", { useTz: true }).nullable();
            table.integer("failed_verification_attempts").notNullable().defaultTo(0);
        });
        this.schema.raw(
            "UPDATE support_channel_integrations SET enabled = (status <> 'disabled'), provider_key = channel WHERE provider_key IS NULL",
        );
        this.schema.raw("ALTER TABLE support_channel_integrations DROP CONSTRAINT IF EXISTS support_channel_status_check");
        this.schema.raw(
            "ALTER TABLE support_channel_integrations ADD CONSTRAINT support_channel_status_check CHECK (status IN ('disabled','configured','connecting','connected','degraded','error','expired'))",
        );
        this.schema.raw(
            "ALTER TABLE support_channel_integrations ADD CONSTRAINT support_channel_webhook_status_check CHECK (webhook_status IN ('unconfigured','pending','verified','error','not_applicable'))",
        );
        this.schema.raw(
            "ALTER TABLE support_channel_integrations ADD CONSTRAINT support_channel_failed_verifications_check CHECK (failed_verification_attempts >= 0)",
        );
        this.schema.raw(
            "CREATE INDEX support_channel_integrations_health_idx ON support_channel_integrations (tenant_id, enabled, status, last_verified_at DESC)",
        );

        this.schema.alterTable("support_campaigns", (table) => {
            table.string("provider_template_key", 255).nullable();
            table.string("provider_template_status", 24).notNullable().defaultTo("not_required");
            table.jsonb("provider_template_config").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("last_dispatch_at", { useTz: true }).nullable();
        });
        this.schema.raw(
            "ALTER TABLE support_campaigns ADD CONSTRAINT support_campaign_provider_template_status_check CHECK (provider_template_status IN ('not_required','pending','approved','rejected'))",
        );

        this.schema.alterTable("support_tickets", (table) => {
            table.string("provider_account_id", 255).nullable();
            table.string("provider_conversation_id", 255).nullable();
            table.string("external_identity_key", 320).nullable();
            table.integer("unread_count").notNullable().defaultTo(0);
            table.timestamp("last_read_at", { useTz: true }).nullable();
        });
        this.schema.raw("ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_unread_check CHECK (unread_count >= 0)");
        this.schema.raw(
            "CREATE UNIQUE INDEX support_tickets_provider_conversation_unique ON support_tickets (tenant_id, channel, provider_account_id, provider_conversation_id) WHERE provider_conversation_id IS NOT NULL",
        );
        this.schema.raw(
            "CREATE INDEX support_tickets_channel_unread_idx ON support_tickets (tenant_id, channel, unread_count, last_message_at DESC)",
        );
        this.schema.raw(
            "CREATE INDEX support_tickets_external_identity_idx ON support_tickets (tenant_id, external_identity_key) WHERE external_identity_key IS NOT NULL",
        );

        this.schema.alterTable("support_ticket_messages", (table) => {
            table.string("provider", 32).nullable();
            table.string("provider_account_id", 255).nullable();
            table.string("provider_conversation_id", 255).nullable();
            table.string("provider_message_id", 255).nullable();
            table.string("direction", 16).notNullable().defaultTo("internal");
            table.string("sender_external_id", 320).nullable();
            table.string("recipient_external_id", 320).nullable();
            table.string("message_type", 24).notNullable().defaultTo("text");
            table.jsonb("media_reference").nullable();
            table.string("reply_to_external_id", 255).nullable();
            table.string("delivery_state", 24).nullable();
            table.timestamp("sent_at", { useTz: true }).nullable();
            table.timestamp("delivered_at", { useTz: true }).nullable();
            table.timestamp("read_at", { useTz: true }).nullable();
            table.timestamp("provider_timestamp", { useTz: true }).nullable();
            table.jsonb("provider_metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
        });
        this.schema.raw(
            "UPDATE support_ticket_messages SET direction = CASE WHEN kind = 'requester_message' THEN 'inbound' WHEN kind = 'reply' THEN 'outbound' ELSE 'internal' END",
        );
        this.schema.raw(
            "ALTER TABLE support_ticket_messages ADD CONSTRAINT support_ticket_message_direction_check CHECK (direction IN ('inbound','outbound','internal','system'))",
        );
        this.schema.raw(
            "ALTER TABLE support_ticket_messages ADD CONSTRAINT support_ticket_message_type_check CHECK (message_type IN ('text','image','video','audio','document','sticker','location','contact','template','system'))",
        );
        this.schema.raw(
            "ALTER TABLE support_ticket_messages ADD CONSTRAINT support_ticket_delivery_state_check CHECK (delivery_state IS NULL OR delivery_state IN ('queued','sending','sent','delivered','read','failed','received'))",
        );
        this.schema.raw(
            "CREATE UNIQUE INDEX support_ticket_messages_external_unique ON support_ticket_messages (tenant_id, provider, provider_account_id, provider_message_id) WHERE provider_message_id IS NOT NULL",
        );
        this.schema.raw(
            "CREATE INDEX support_ticket_messages_provider_conversation_idx ON support_ticket_messages (tenant_id, provider, provider_conversation_id, created_at DESC)",
        );

        this.schema.createTable("support_channel_webhook_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("provider", 32).notNullable();
            table.string("provider_account_id", 255).nullable();
            table.string("provider_event_id", 255).nullable();
            table.string("payload_hash", 64).notNullable();
            table.string("event_type", 80).nullable();
            table.string("processing_state", 24).notNullable().defaultTo("received");
            table.string("error_code", 96).nullable();
            table.timestamp("received_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("processed_at", { useTz: true }).nullable();
            table.unique(["tenant_id", "provider", "payload_hash"], { indexName: "support_channel_webhook_payload_unique" });
            table.index(["tenant_id", "provider", "received_at"], "support_channel_webhook_provider_idx");
        });
        this.schema.raw(
            "CREATE UNIQUE INDEX support_channel_webhook_event_unique ON support_channel_webhook_events (tenant_id, provider, provider_event_id) WHERE provider_event_id IS NOT NULL",
        );
        this.schema.raw(
            "ALTER TABLE support_channel_webhook_events ADD CONSTRAINT support_channel_webhook_processing_check CHECK (processing_state IN ('received','processed','ignored','failed'))",
        );

        this.schema.createTable("support_channel_connection_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("channel", 32).notNullable();
            table.string("provider_key", 48).notNullable();
            table.string("event_type", 64).notNullable();
            table.string("from_state", 24).nullable();
            table.string("to_state", 24).nullable();
            table.string("reason_code", 96).nullable();
            table.string("safe_message", 1000).nullable();
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "channel", "created_at"], "support_channel_connection_events_idx");
        });

        this.schema.createTable("support_api_keys", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("name", 120).notNullable();
            table.string("key_prefix", 20).notNullable();
            table.string("key_hash", 64).notNullable();
            table.jsonb("scopes").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("allowed_ips").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.integer("rate_limit_per_minute").notNullable().defaultTo(120);
            table.timestamp("expires_at", { useTz: true }).nullable();
            table.timestamp("last_used_at", { useTz: true }).nullable();
            table.timestamp("revoked_at", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "key_hash"], { indexName: "support_api_keys_hash_unique" });
            table.index(["tenant_id", "revoked_at", "expires_at"], "support_api_keys_active_idx");
        });
        this.schema.raw(
            "ALTER TABLE support_api_keys ADD CONSTRAINT support_api_keys_rate_limit_check CHECK (rate_limit_per_minute BETWEEN 1 AND 10000)",
        );

        this.schema.createTable("support_api_webhook_subscriptions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("name", 120).notNullable();
            table.text("url").notNullable();
            table.jsonb("events").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.text("signing_secret_ciphertext").notNullable();
            table.string("secret_prefix", 16).notNullable();
            table.boolean("active").notNullable().defaultTo(true);
            table.timestamp("last_delivery_at", { useTz: true }).nullable();
            table.string("last_error", 1000).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.index(["tenant_id", "active"], "support_api_webhooks_active_idx");
        });

        this.schema.createTable("support_channel_oauth_sessions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("integration_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("support_channel_integrations")
                .onDelete("CASCADE");
            table.string("provider_key", 64).notNullable();
            table.string("state_hash", 64).notNullable();
            table.text("pkce_verifier_ciphertext").notNullable();
            table.text("redirect_uri").notNullable();
            table.string("return_path", 512).notNullable().defaultTo("/fa/tickets/channels");
            table.timestamp("expires_at", { useTz: true }).notNullable();
            table.timestamp("used_at", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "state_hash"], { indexName: "support_channel_oauth_state_unique" });
            table.index(["tenant_id", "integration_id", "expires_at"], "support_channel_oauth_session_idx");
        });

        this.schema.createTable("support_api_request_logs", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("api_key_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("support_api_keys")
                .onDelete("SET NULL");
            table.string("request_id", 96).nullable();
            table.string("method", 12).notNullable();
            table.string("path", 512).notNullable();
            table.integer("status_code").notNullable();
            table.string("ip", 64).nullable();
            table.string("error_code", 96).nullable();
            table.integer("duration_ms").nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "created_at"], "support_api_request_logs_time_idx");
            table.index(["tenant_id", "api_key_id", "created_at"], "support_api_request_logs_key_idx");
        });
        this.schema.raw(
            "ALTER TABLE support_api_request_logs ADD CONSTRAINT support_api_request_status_check CHECK (status_code BETWEEN 100 AND 599)",
        );

        for (const table of [
            "support_channel_webhook_events",
            "support_channel_connection_events",
            "support_api_keys",
            "support_api_webhook_subscriptions",
            "support_channel_oauth_sessions",
            "support_api_request_logs",
        ]) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY tenant_isolation ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
        }
    }

    async down() {
        this.schema.dropTable("support_api_request_logs");
        this.schema.dropTable("support_channel_oauth_sessions");
        this.schema.dropTable("support_api_webhook_subscriptions");
        this.schema.dropTable("support_api_keys");
        this.schema.dropTable("support_channel_connection_events");
        this.schema.dropTable("support_channel_webhook_events");

        this.schema.raw("DROP INDEX IF EXISTS support_ticket_messages_provider_conversation_idx");
        this.schema.raw("DROP INDEX IF EXISTS support_ticket_messages_external_unique");
        this.schema.alterTable("support_ticket_messages", (table) => {
            table.dropColumns(
                "provider",
                "provider_account_id",
                "provider_conversation_id",
                "provider_message_id",
                "direction",
                "sender_external_id",
                "recipient_external_id",
                "message_type",
                "media_reference",
                "reply_to_external_id",
                "delivery_state",
                "sent_at",
                "delivered_at",
                "read_at",
                "provider_timestamp",
                "provider_metadata",
            );
        });

        this.schema.raw(
            "ALTER TABLE support_campaigns DROP CONSTRAINT IF EXISTS support_campaign_provider_template_status_check",
        );
        this.schema.alterTable("support_campaigns", (table) => {
            table.dropColumns(
                "provider_template_key",
                "provider_template_status",
                "provider_template_config",
                "last_dispatch_at",
            );
        });

        this.schema.raw("DROP INDEX IF EXISTS support_tickets_external_identity_idx");
        this.schema.raw("DROP INDEX IF EXISTS support_tickets_channel_unread_idx");
        this.schema.raw("DROP INDEX IF EXISTS support_tickets_provider_conversation_unique");
        this.schema.alterTable("support_tickets", (table) => {
            table.dropColumns(
                "provider_account_id",
                "provider_conversation_id",
                "external_identity_key",
                "unread_count",
                "last_read_at",
            );
        });

        this.schema.raw(
            "UPDATE support_channel_integrations SET status = CASE WHEN status = 'connected' THEN 'connected' WHEN status = 'disabled' THEN 'disabled' WHEN status = 'error' THEN 'error' ELSE 'configured' END",
        );
        this.schema.raw("ALTER TABLE support_channel_integrations DROP CONSTRAINT IF EXISTS support_channel_status_check");
        this.schema.raw(
            "ALTER TABLE support_channel_integrations ADD CONSTRAINT support_channel_status_check CHECK (status IN ('disabled','configured','connected','error'))",
        );
        this.schema.raw("DROP INDEX IF EXISTS support_channel_integrations_health_idx");
        this.schema.alterTable("support_channel_integrations", (table) => {
            table.dropColumns(
                "enabled",
                "provider_key",
                "credentials_ciphertext",
                "credential_keys",
                "capabilities",
                "account_identifier",
                "granted_scopes",
                "token_expires_at",
                "last_rotated_at",
                "updated_by_user_id",
                "webhook_status",
                "webhook_verified_at",
                "last_inbound_at",
                "last_outbound_at",
                "last_webhook_at",
                "last_successful_api_at",
                "failed_verification_attempts",
            );
        });
    }
}
