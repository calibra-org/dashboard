import { BaseSchema } from "@adonisjs/lucid/schema";

const RLS_TABLES = [
    "admin_permissions",
    "identity_provider_configs",
    "identity_policies",
    "identity_verifications",
    "identity_verification_challenges",
    "identity_provider_attempts",
    "identity_credentials",
    "identity_sessions",
    "identity_risk_events",
    "identity_security_events",
] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("admin_permissions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("user_id").unsigned().notNullable().references("id").inTable("users").onDelete("CASCADE");
            table.string("permission", 120).notNullable();
            table.boolean("allowed").notNullable().defaultTo(true);
            table.bigInteger("updated_by").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "user_id", "permission"], { indexName: "admin_permissions_subject_unique" });
        });

        this.schema.createTable("identity_provider_configs", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("provider_key", 80).notNullable();
            table.string("channel", 24).notNullable();
            table.string("driver", 40).notNullable();
            table.boolean("enabled").notNullable().defaultTo(false);
            table.boolean("is_primary").notNullable().defaultTo(false);
            table.integer("priority").notNullable().defaultTo(100);
            table.string("sender_id", 120).nullable();
            table.string("base_url", 500).nullable();
            table.text("secret_ciphertext").nullable();
            table.jsonb("configuration").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("capabilities").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("health_state", 24).notNullable().defaultTo("unconfigured");
            table.integer("consecutive_failures").notNullable().defaultTo(0);
            table.timestamp("circuit_open_until", { useTz: true }).nullable();
            table.timestamp("last_health_checked_at", { useTz: true }).nullable();
            table.timestamp("last_success_at", { useTz: true }).nullable();
            table.text("last_error").nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "provider_key"], { indexName: "identity_provider_configs_key_unique" });
            table.index(["tenant_id", "channel", "enabled"], "identity_provider_configs_route_idx");
        });

        this.schema.createTable("identity_policies", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("policy_key", 100).notNullable();
            table.string("purpose", 80).notNullable();
            table.integer("version").notNullable().defaultTo(1);
            table.boolean("enabled").notNullable().defaultTo(true);
            table.jsonb("methods").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("config").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("created_by").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "policy_key", "version"], { indexName: "identity_policies_version_unique" });
            table.index(["tenant_id", "purpose", "enabled", "version"], "identity_policies_resolve_idx");
        });

        this.schema.createTable("identity_verifications", (table) => {
            table.bigIncrements("id").notNullable();
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("purpose", 80).notNullable();
            table.string("method", 40).notNullable();
            table.string("channel", 24).nullable();
            table.string("identifier_hash", 64).nullable();
            table.string("identifier_masked", 254).nullable();
            table.string("status", 40).notNullable().defaultTo("requested");
            table.string("policy_key", 100).nullable();
            table.string("action_scope", 120).nullable();
            table.integer("policy_version").nullable();
            table.integer("risk_score").notNullable().defaultTo(0);
            table.jsonb("risk_reasons").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("request_ip_hash", 64).nullable();
            table.string("request_ip_masked", 80).nullable();
            table.string("device_hash", 64).nullable();
            table.timestamp("expires_at", { useTz: true }).notNullable();
            table.timestamp("verified_at", { useTz: true }).nullable();
            table.timestamp("consumed_at", { useTz: true }).nullable();
            table.timestamp("blocked_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "identifier_hash", "purpose", "created_at"], "identity_verifications_subject_idx");
            table.index(["tenant_id", "status", "created_at"], "identity_verifications_status_idx");
        });

        this.schema.createTable("identity_verification_challenges", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("verification_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("identity_verifications")
                .onDelete("CASCADE");
            table.integer("generation").notNullable().defaultTo(1);
            table.string("challenge_type", 40).notNullable();
            table.string("secret_hash", 255).nullable();
            table.text("payload_ciphertext").nullable();
            table.string("state", 24).notNullable().defaultTo("active");
            table.integer("attempts").notNullable().defaultTo(0);
            table.integer("max_attempts").notNullable().defaultTo(5);
            table.timestamp("expires_at", { useTz: true }).notNullable();
            table.timestamp("consumed_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "verification_id", "generation"], { indexName: "identity_challenges_generation_unique" });
        });

        this.schema.createTable("identity_provider_attempts", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("verification_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("identity_verifications")
                .onDelete("CASCADE");
            table.integer("generation").notNullable().defaultTo(1);
            table.string("provider_key", 80).notNullable();
            table.string("channel", 24).notNullable();
            table.string("state", 32).notNullable().defaultTo("created");
            table.string("provider_message_id", 200).nullable();
            table.string("idempotency_key", 120).notNullable();
            table.integer("latency_ms").nullable();
            table.bigInteger("cost_minor").nullable();
            table.string("error_code", 120).nullable();
            table.text("error_message").nullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("accepted_at", { useTz: true }).nullable();
            table.timestamp("delivered_at", { useTz: true }).nullable();
            table.timestamp("failed_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "idempotency_key"], { indexName: "identity_provider_attempts_idempotency_unique" });
            table.index(["tenant_id", "provider_message_id"], "identity_provider_attempts_message_idx");
        });

        this.schema.createTable("identity_credentials", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("user_id").unsigned().notNullable().references("id").inTable("users").onDelete("CASCADE");
            table.string("credential_type", 40).notNullable();
            table.string("credential_key", 500).notNullable();
            table.string("label", 200).nullable();
            table.string("secret_hash", 255).nullable();
            table.text("secret_ciphertext").nullable();
            table.jsonb("public_jwk").nullable();
            table.bigInteger("sign_count").notNullable().defaultTo(0);
            table.boolean("backup_eligible").notNullable().defaultTo(false);
            table.boolean("backed_up").notNullable().defaultTo(false);
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("verified_at", { useTz: true }).nullable();
            table.timestamp("last_used_at", { useTz: true }).nullable();
            table.timestamp("revoked_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "credential_type", "credential_key"], { indexName: "identity_credentials_key_unique" });
            table.index(["tenant_id", "user_id", "credential_type", "revoked_at"], "identity_credentials_user_idx");
        });

        this.schema.createTable("identity_sessions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("user_id").unsigned().notNullable().references("id").inTable("users").onDelete("CASCADE");
            table.bigInteger("token_identifier").unsigned().notNullable();
            table.string("device_hash", 64).nullable();
            table.string("device_label", 200).nullable();
            table.string("user_agent", 500).nullable();
            table.string("ip_hash", 64).nullable();
            table.string("ip_masked", 80).nullable();
            table.integer("risk_score").notNullable().defaultTo(0);
            table.string("auth_method", 40).notNullable().defaultTo("password");
            table.timestamp("last_seen_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("expires_at", { useTz: true }).nullable();
            table.timestamp("revoked_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "token_identifier"], { indexName: "identity_sessions_token_unique" });
            table.index(["tenant_id", "user_id", "revoked_at"], "identity_sessions_user_idx");
        });

        this.schema.createTable("identity_risk_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("verification_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("identity_verifications")
                .onDelete("SET NULL");
            table.bigInteger("user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("event_type", 120).notNullable();
            table.string("subject_hash", 64).nullable();
            table.integer("score").notNullable().defaultTo(0);
            table.string("decision", 32).notNullable();
            table.jsonb("reasons").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "event_type", "created_at"], "identity_risk_events_type_idx");
        });

        this.schema.createTable("identity_security_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table
                .bigInteger("verification_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("identity_verifications")
                .onDelete("SET NULL");
            table.string("event_type", 120).notNullable();
            table.string("outcome", 32).notNullable();
            table.string("severity", 16).notNullable().defaultTo("info");
            table.string("request_id", 120).nullable();
            table.string("ip_masked", 80).nullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "event_type", "created_at"], "identity_security_events_type_idx");
        });

        this.schema.raw(
            `INSERT INTO "identity_provider_configs" (tenant_id, provider_key, channel, driver, enabled, is_primary, priority, health_state, capabilities) SELECT id, 'legacy-log-sms', 'sms', 'log', true, true, 900, 'unknown', '{"send":true,"simulated":true}'::jsonb FROM tenants ON CONFLICT (tenant_id, provider_key) DO NOTHING`,
        );
        this.schema.raw(
            `INSERT INTO "identity_provider_configs" (tenant_id, provider_key, channel, driver, enabled, is_primary, priority, health_state, capabilities) SELECT id, 'mail', 'email', 'mail', true, true, 100, 'unknown', '{"send":true,"delivery_lookup":false}'::jsonb FROM tenants ON CONFLICT (tenant_id, provider_key) DO NOTHING`,
        );

        this.schema.raw(
            `ALTER TABLE "identity_provider_configs" ADD CONSTRAINT "identity_provider_channel_check" CHECK (channel IN ('sms','email'))`,
        );
        this.schema.raw(
            `ALTER TABLE "identity_provider_configs" ADD CONSTRAINT "identity_provider_health_check" CHECK (health_state IN ('unconfigured','unknown','healthy','degraded','unhealthy','circuit_open'))`,
        );
        this.schema.raw(
            `ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verification_status_check" CHECK (status IN ('requested','policy_evaluated','allowed','blocked','challenge_created','provider_accepted','sent','delivered','delivery_unknown','delivery_failed','proof_submitted','verified','failed','expired','consumed','cancelled'))`,
        );
        this.schema.raw(
            `ALTER TABLE "identity_verification_challenges" ADD CONSTRAINT "identity_challenge_state_check" CHECK (state IN ('active','consumed','expired','superseded','failed','cancelled'))`,
        );
        this.schema.raw(
            `ALTER TABLE "identity_provider_attempts" ADD CONSTRAINT "identity_provider_attempt_state_check" CHECK (state IN ('created','accepted','sent','delivered','delivery_unknown','failed','cancelled'))`,
        );
        this.schema.raw(
            `ALTER TABLE "identity_credentials" ADD CONSTRAINT "identity_credential_type_check" CHECK (credential_type IN ('passkey','totp','recovery_code'))`,
        );

        for (const table of RLS_TABLES) {
            this.schema.raw(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
            this.schema.raw(
                `CREATE POLICY "tenant_isolation" ON "${table}" USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint)`,
            );
        }
    }

    async down() {
        for (const table of [...RLS_TABLES].reverse()) {
            this.schema.dropTable(table);
        }
    }
}
