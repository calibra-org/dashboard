import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

/** Phase 16 — Search, Discovery, Merchandising, Compatibility and Opportunity control plane. */
export default class extends BaseSchema {
    async up() {
        this.schema.createTable("discovery_search_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("event_key").notNullable();
            table.string("event_type", 40).notNullable();
            table.string("locale", 8).notNullable().defaultTo("fa");
            table.string("surface", 40).notNullable().defaultTo("storefront");
            table.string("session_hash", 64).nullable();
            table.text("raw_query_redacted").nullable();
            table.text("normalized_query").nullable();
            table.string("intent", 64).nullable();
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("result_count").nullable();
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table.integer("position").nullable();
            table.string("retrieval_version", 64).nullable();
            table.string("policy_version", 64).nullable();
            table.string("graph_version", 64).nullable();
            table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "event_key"], { indexName: "discovery_events_idempotency_unique" });
            table.index(["tenant_id", "occurred_at"], "discovery_events_time_idx");
            table.index(["tenant_id", "normalized_query", "occurred_at"], "discovery_events_query_idx");
            table.index(["tenant_id", "event_type", "occurred_at"], "discovery_events_type_idx");
        });

        this.schema.createTable("discovery_synonym_rules", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("locale", 8).notNullable().defaultTo("fa");
            table.string("term", 191).notNullable();
            table.jsonb("synonyms").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("mode", 16).notNullable().defaultTo("equivalent");
            table
                .bigInteger("category_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_categories")
                .onDelete("CASCADE");
            table.boolean("enabled").notNullable().defaultTo(true);
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.index(["tenant_id", "locale", "enabled"], "discovery_synonyms_active_idx");
        });
        this.schema.raw(`CREATE UNIQUE INDEX discovery_synonyms_scope_unique ON discovery_synonym_rules
            (tenant_id, locale, lower(term), COALESCE(category_id, 0))`);

        this.schema.createTable("discovery_search_policies", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("name", 160).notNullable();
            table.string("status", 20).notNullable().defaultTo("draft");
            table.integer("active_version").nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "name"], { indexName: "discovery_policy_name_unique" });
        });

        this.schema.createTable("discovery_search_policy_versions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("policy_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("discovery_search_policies")
                .onDelete("CASCADE");
            table.integer("version_number").notNullable();
            table.integer("max_results").notNullable().defaultTo(60);
            table.boolean("typo_tolerance").notNullable().defaultTo(true);
            table.integer("typo_max_edits").notNullable().defaultTo(1);
            table
                .jsonb("ranking_weights")
                .notNullable()
                .defaultTo(this.raw('\'{"lexical":1,"freshness":0.1,"availability":0.2}\'::jsonb'));
            table.jsonb("configuration").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.text("reason").nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "policy_id", "version_number"], { indexName: "discovery_policy_version_unique" });
        });

        this.schema.createTable("discovery_merchandising_rules", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("name", 160).notNullable();
            table.string("action", 16).notNullable();
            table.string("status", 20).notNullable().defaultTo("draft");
            table.string("query_pattern", 255).nullable();
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("CASCADE");
            table
                .bigInteger("category_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_categories")
                .onDelete("CASCADE");
            table.decimal("boost_factor", 8, 3).nullable();
            table.integer("pin_position").nullable();
            table.integer("priority").notNullable().defaultTo(100);
            table.timestamp("starts_at", { useTz: true }).nullable();
            table.timestamp("ends_at", { useTz: true }).nullable();
            table.string("reason", 500).notNullable();
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.index(["tenant_id", "status", "priority"], "discovery_merch_rules_active_idx");
        });

        this.schema.createTable("discovery_product_relationships", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("subject_product_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("products")
                .onDelete("CASCADE");
            table.string("relation_type", 40).notNullable();
            table
                .bigInteger("object_product_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("products")
                .onDelete("CASCADE");
            table.string("state", 24).notNullable().defaultTo("unknown");
            table.string("confidence_class", 32).notNullable().defaultTo("unknown");
            table.string("source_type", 40).notNullable().defaultTo("operator");
            table.text("source_ref").nullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("status", 20).notNullable().defaultTo("active");
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("reviewed_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("reviewed_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "subject_product_id", "relation_type", "object_product_id"], {
                indexName: "discovery_relationship_unique",
            });
            table.index(["tenant_id", "subject_product_id", "state"], "discovery_relationship_subject_idx");
        });

        this.schema.createTable("discovery_opportunities", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("fingerprint", 64).notNullable();
            table.string("type", 48).notNullable();
            table.string("status", 24).notNullable().defaultTo("detected");
            table.string("title", 255).notNullable();
            table.text("summary").notNullable();
            table.string("query", 255).nullable();
            table.integer("query_count").notNullable().defaultTo(0);
            table.integer("unique_sessions").notNullable().defaultTo(0);
            table.decimal("zero_result_rate", 8, 4).nullable();
            table.decimal("trend_rate", 10, 4).nullable();
            table.string("confidence_class", 32).notNullable().defaultTo("derived");
            table.jsonb("recommended_actions").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.bigInteger("assigned_to_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.text("resolution_note").nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.unique(["tenant_id", "fingerprint"], { indexName: "discovery_opportunity_fingerprint_unique" });
            table.index(["tenant_id", "status", "type"], "discovery_opportunity_status_idx");
        });

        this.schema.createTable("discovery_index_operations", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("operation", 24).notNullable().defaultTo("upsert_product");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("CASCADE");
            table.string("status", 24).notNullable().defaultTo("pending");
            table.string("idempotency_key", 96).notNullable();
            table.integer("attempts").notNullable().defaultTo(0);
            table.integer("max_attempts").notNullable().defaultTo(5);
            table.text("last_error").nullable();
            table.timestamp("available_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("started_at", { useTz: true }).nullable();
            table.timestamp("completed_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "idempotency_key"], { indexName: "discovery_index_operation_idempotency_unique" });
            table.index(["tenant_id", "status", "available_at"], "discovery_index_operation_status_idx");
        });

        this.schema.createTable("discovery_opportunity_evidence", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("opportunity_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("discovery_opportunities")
                .onDelete("CASCADE");
            table.string("evidence_type", 48).notNullable();
            table.jsonb("payload").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("observed_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "opportunity_id", "observed_at"], "discovery_opportunity_evidence_idx");
        });

        const checks = [
            `ALTER TABLE discovery_search_events ADD CONSTRAINT discovery_event_type_check CHECK (event_type IN ('search_performed','results_served','result_clicked','zero_result','no_click','reformulated','filter_applied','sort_changed','add_to_cart','purchase','exit'))`,
            `ALTER TABLE discovery_search_events ADD CONSTRAINT discovery_event_result_count_check CHECK (result_count IS NULL OR result_count >= 0)`,
            `ALTER TABLE discovery_synonym_rules ADD CONSTRAINT discovery_synonym_mode_check CHECK (mode IN ('equivalent','directional'))`,
            `ALTER TABLE discovery_search_policies ADD CONSTRAINT discovery_policy_status_check CHECK (status IN ('draft','active','archived'))`,
            `ALTER TABLE discovery_search_policy_versions ADD CONSTRAINT discovery_policy_max_results_check CHECK (max_results BETWEEN 1 AND 100)`,
            `ALTER TABLE discovery_search_policy_versions ADD CONSTRAINT discovery_policy_typo_edits_check CHECK (typo_max_edits BETWEEN 0 AND 2)`,
            `ALTER TABLE discovery_merchandising_rules ADD CONSTRAINT discovery_merch_action_check CHECK (action IN ('boost','bury','pin','hide'))`,
            `ALTER TABLE discovery_merchandising_rules ADD CONSTRAINT discovery_merch_status_check CHECK (status IN ('draft','active','paused','archived'))`,
            `ALTER TABLE discovery_merchandising_rules ADD CONSTRAINT discovery_merch_target_check CHECK (product_id IS NOT NULL OR category_id IS NOT NULL)`,
            `ALTER TABLE discovery_merchandising_rules ADD CONSTRAINT discovery_merch_dates_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)`,
            `ALTER TABLE discovery_product_relationships ADD CONSTRAINT discovery_relation_state_check CHECK (state IN ('compatible','not_compatible','unknown'))`,
            `ALTER TABLE discovery_product_relationships ADD CONSTRAINT discovery_relation_confidence_check CHECK (confidence_class IN ('verified','manufacturer_declared','operator_confirmed','derived','experimental','unknown'))`,
            `ALTER TABLE discovery_product_relationships ADD CONSTRAINT discovery_relation_self_check CHECK (subject_product_id <> object_product_id)`,
            `ALTER TABLE discovery_product_relationships ADD CONSTRAINT discovery_relation_status_check CHECK (status IN ('active','revoked'))`,
            `ALTER TABLE discovery_opportunities ADD CONSTRAINT discovery_opportunity_status_check CHECK (status IN ('detected','triaged','accepted','assigned','in_progress','implemented','measuring','validated','closed','rejected','duplicate','insufficient_evidence'))`,
            `ALTER TABLE discovery_opportunities ADD CONSTRAINT discovery_opportunity_counts_check CHECK (query_count >= 0 AND unique_sessions >= 0)`,
            `ALTER TABLE discovery_index_operations ADD CONSTRAINT discovery_index_operation_status_check CHECK (status IN ('pending','processing','retrying','succeeded','dead_letter'))`,
            `ALTER TABLE discovery_index_operations ADD CONSTRAINT discovery_index_operation_attempts_check CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 20)`,
        ];
        for (const sql of checks) this.schema.raw(sql);

        const tables = [
            "discovery_search_events",
            "discovery_synonym_rules",
            "discovery_search_policies",
            "discovery_search_policy_versions",
            "discovery_merchandising_rules",
            "discovery_product_relationships",
            "discovery_opportunities",
            "discovery_opportunity_evidence",
            "discovery_index_operations",
        ];
        for (const table of tables) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY tenant_isolation ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
        }
    }

    async down() {
        for (const table of [
            "discovery_opportunity_evidence",
            "discovery_index_operations",
            "discovery_opportunities",
            "discovery_product_relationships",
            "discovery_merchandising_rules",
            "discovery_search_policy_versions",
            "discovery_search_policies",
            "discovery_synonym_rules",
            "discovery_search_events",
        ])
            this.schema.dropTable(table);
    }
}
