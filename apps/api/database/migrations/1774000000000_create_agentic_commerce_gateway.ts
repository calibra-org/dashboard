import { BaseSchema } from "@adonisjs/lucid/schema";

const TABLES = [
    "agentic_principals",
    "agentic_channels",
    "agentic_capability_versions",
    "agentic_product_readiness",
    "agentic_channel_events",
    "agentic_action_ledger",
    "agentic_conformance_runs",
] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("agentic_principals", (table) => {
            table.bigIncrements("id").notNullable();
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("principal_key", 120).notNullable();
            table.string("display_name", 190).notNullable();
            table.string("principal_type", 32).notNullable().defaultTo("external_agent");
            table.string("status", 24).notNullable().defaultTo("disabled");
            table.jsonb("scopes").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("credential_fingerprint", 190).nullable();
            table.jsonb("rate_limit_policy").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("last_seen_at", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "principal_key"], { indexName: "agentic_principals_key_unique" });
        });

        this.schema.createTable("agentic_channels", (table) => {
            table.bigIncrements("id").notNullable();
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("channel_key", 120).notNullable();
            table.string("display_name", 190).notNullable();
            table.string("adapter_key", 64).notNullable().defaultTo("native");
            table.string("mode", 24).notNullable().defaultTo("disabled");
            table.string("protocol_version", 80).nullable();
            table.boolean("kill_switch").notNullable().defaultTo(false);
            table.jsonb("eligible_product_scope").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("policy_boundary").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "channel_key"], { indexName: "agentic_channels_key_unique" });
            table.index(["tenant_id", "mode", "updated_at"], "agentic_channels_mode_idx");
        });

        this.schema.createTable("agentic_capability_versions", (table) => {
            table.bigIncrements("id").notNullable();
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("channel_id").unsigned().notNullable().references("id").inTable("agentic_channels").onDelete("CASCADE");
            table.string("capability_key", 120).notNullable();
            table.integer("version").notNullable();
            table.string("status", 24).notNullable().defaultTo("draft");
            table.string("protocol_version", 80).nullable();
            table.string("transport", 32).notNullable().defaultTo("rest");
            table.string("endpoint_path", 320).nullable();
            table.jsonb("input_schema").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("output_schema").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("required_scopes").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("risk_class", 24).notNullable().defaultTo("read_only");
            table.string("metadata_digest", 128).notNullable();
            table.text("signature").nullable();
            table.timestamp("verified_at", { useTz: true }).nullable();
            table.timestamp("effective_from", { useTz: true }).nullable();
            table.timestamp("effective_to", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "channel_id", "capability_key", "version"], { indexName: "agentic_capability_version_unique" });
        });

        this.schema.createTable("agentic_product_readiness", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("CASCADE");
            table.integer("snapshot_version").notNullable();
            table.integer("score_bp").notNullable();
            table.jsonb("decomposition").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("missing_facts").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("source_freshness").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("evaluator_version", 80).notNullable();
            table.timestamp("evaluated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "product_id", "snapshot_version"], { indexName: "agentic_readiness_snapshot_unique" });
            table.index(["tenant_id", "score_bp", "evaluated_at"], "agentic_readiness_score_idx");
        });

        this.schema.createTable("agentic_channel_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("event_id", 160).notNullable();
            table.integer("schema_version").notNullable().defaultTo(1);
            table.string("event_type", 160).notNullable();
            table.bigInteger("channel_id").unsigned().nullable().references("id").inTable("agentic_channels").onDelete("SET NULL");
            table.bigInteger("principal_id").unsigned().nullable().references("id").inTable("agentic_principals").onDelete("SET NULL");
            table.string("aggregate_type", 64).notNullable();
            table.string("aggregate_id", 190).notNullable();
            table.string("session_id", 160).nullable();
            table.string("correlation_id", 160).nullable();
            table.string("causation_id", 160).nullable();
            table.string("source", 48).notNullable().defaultTo("agent");
            table.string("consent_context", 160).nullable();
            table.string("privacy_classification", 48).notNullable().defaultTo("internal");
            table.jsonb("payload").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("occurred_at", { useTz: true }).notNullable();
            table.timestamp("received_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "event_id"], { indexName: "agentic_channel_events_idempotency_unique" });
            table.index(["tenant_id", "channel_id", "occurred_at"], "agentic_channel_events_channel_idx");
        });

        this.schema.createTable("agentic_action_ledger", (table) => {
            table.bigIncrements("id").notNullable();
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("channel_id").unsigned().nullable().references("id").inTable("agentic_channels").onDelete("SET NULL");
            table.bigInteger("principal_id").unsigned().nullable().references("id").inTable("agentic_principals").onDelete("SET NULL");
            table.string("capability_key", 120).notNullable();
            table.string("action_type", 120).notNullable();
            table.string("idempotency_key", 160).notNullable();
            table.string("input_hash", 128).notNullable();
            table.string("risk_class", 24).notNullable();
            table.string("status", 24).notNullable().defaultTo("pending");
            table.jsonb("policy_result").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("approval_ids").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("result").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("external_refs").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("verification").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("error_class", 120).nullable();
            table.timestamp("started_at", { useTz: true }).nullable();
            table.timestamp("completed_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "idempotency_key"], { indexName: "agentic_action_ledger_idempotency_unique" });
        });

        this.schema.createTable("agentic_conformance_runs", (table) => {
            table.bigIncrements("id").notNullable();
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("channel_id").unsigned().notNullable().references("id").inTable("agentic_channels").onDelete("CASCADE");
            table.string("adapter_key", 64).notNullable();
            table.string("protocol_version", 80).nullable();
            table.string("status", 24).notNullable();
            table.jsonb("checks").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("artifacts").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.text("failure_summary").nullable();
            table.bigInteger("ran_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("ran_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "channel_id", "ran_at"], "agentic_conformance_channel_idx");
        });

        this.schema.raw(`ALTER TABLE "agentic_principals" ADD CONSTRAINT "agentic_principals_status_check" CHECK (status IN ('disabled','shadow','active','revoked'))`);
        this.schema.raw(`ALTER TABLE "agentic_channels" ADD CONSTRAINT "agentic_channels_mode_check" CHECK (mode IN ('disabled','shadow','read_only','live'))`);
        this.schema.raw(`ALTER TABLE "agentic_capability_versions" ADD CONSTRAINT "agentic_capabilities_status_check" CHECK (status IN ('draft','verified','active','retired'))`);
        this.schema.raw(`ALTER TABLE "agentic_product_readiness" ADD CONSTRAINT "agentic_readiness_score_check" CHECK (score_bp BETWEEN 0 AND 10000)`);
        this.schema.raw(`ALTER TABLE "agentic_action_ledger" ADD CONSTRAINT "agentic_action_status_check" CHECK (status IN ('pending','approved','running','completed','blocked','failed','rolled_back'))`);
        this.schema.raw(`ALTER TABLE "agentic_conformance_runs" ADD CONSTRAINT "agentic_conformance_status_check" CHECK (status IN ('pass','fail','blocked'))`);

        for (const table of TABLES) {
            this.schema.raw(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY "${table}_tenant_isolation" ON "${table}" USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint)`);
        }
    }

    async down() {
        for (const table of [...TABLES].reverse()) this.schema.dropTable(table);
    }
}
