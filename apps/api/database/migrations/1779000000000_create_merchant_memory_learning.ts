import { BaseSchema } from "@adonisjs/lucid/schema";

const TABLES = [
    "merchant_memories",
    "merchant_memory_evidence_links",
    "merchant_memory_lineage",
    "merchant_memory_retrieval_events",
    "merchant_memory_effectiveness_observations",
] as const;

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("merchant_memories", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("memory_class", 48).notNullable();
            table.string("subject_scope", 32).notNullable().defaultTo("merchant");
            table.string("subject_key", 180).nullable();
            table.string("title", 220).notNullable();
            table.text("context").notNullable();
            table.jsonb("observed_signals").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.text("decision").nullable();
            table.text("reason").nullable();
            table.jsonb("alternatives_rejected").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("actor_approvals").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.text("action").nullable();
            table.text("outcome").nullable();
            table.text("lesson").notNullable();
            table.decimal("confidence", 8, 6).notNullable().defaultTo(0.5);
            table.decimal("strength", 8, 6).notNullable().defaultTo(0.5);
            table.string("status", 24).notNullable().defaultTo("active");
            table.string("sensitivity", 24).notNullable().defaultTo("internal");
            table.string("access_scope", 32).notNullable().defaultTo("merchant_internal");
            table.string("retention_class", 40).notNullable().defaultTo("business_learning");
            table.boolean("contains_customer_level_data").notNullable().defaultTo(false);
            table.boolean("aggregated_fact").notNullable().defaultTo(true);
            table.timestamp("effective_at", { useTz: true }).notNullable();
            table.timestamp("expires_at", { useTz: true }).nullable();
            table.timestamp("last_validated_at", { useTz: true }).nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.index(["tenant_id", "memory_class", "status"], "merchant_memories_class_status_idx");
            table.index(["tenant_id", "subject_scope", "subject_key"], "merchant_memories_subject_idx");
            table.index(["tenant_id", "expires_at"], "merchant_memories_expiry_idx");
            table.index(["tenant_id", "sensitivity", "access_scope"], "merchant_memories_access_idx");
        });

        this.schema.createTable("merchant_memory_evidence_links", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("memory_id").unsigned().notNullable().references("id").inTable("merchant_memories").onDelete("CASCADE");
            table.string("source_domain", 64).notNullable();
            table.string("source_type", 80).notNullable();
            table.string("source_stable_key", 180).notNullable();
            table.string("source_record_id", 160).nullable();
            table.string("source_version", 80).nullable();
            table.string("source_integrity_hash", 64).nullable();
            table.string("relation", 32).notNullable().defaultTo("supports");
            table.jsonb("evidence_summary").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("observed_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "memory_id", "source_type", "source_stable_key", "relation"], {
                indexName: "merchant_memory_evidence_unique",
            });
            table.index(["tenant_id", "source_domain", "source_type", "source_stable_key"], "merchant_memory_evidence_source_idx");
        });

        this.schema.createTable("merchant_memory_lineage", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("from_memory_id").unsigned().notNullable().references("id").inTable("merchant_memories").onDelete("CASCADE");
            table.bigInteger("to_memory_id").unsigned().notNullable().references("id").inTable("merchant_memories").onDelete("CASCADE");
            table.string("relation", 24).notNullable();
            table.text("reason").notNullable();
            table.jsonb("evidence_delta").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "from_memory_id", "to_memory_id", "relation"], {
                indexName: "merchant_memory_lineage_unique",
            });
        });

        this.schema.createTable("merchant_memory_retrieval_events", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("principal_type", 24).notNullable();
            table.string("principal_id", 120).notNullable();
            table.string("purpose", 80).notNullable();
            table.string("access_scope", 32).notNullable();
            table.string("query_hash", 64).notNullable();
            table.jsonb("filters").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("returned_memory_public_ids").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.integer("result_count").notNullable().defaultTo(0);
            table.integer("expired_filtered_count").notNullable().defaultTo(0);
            table.integer("permission_filtered_count").notNullable().defaultTo(0);
            table.integer("superseded_filtered_count").notNullable().defaultTo(0);
            table.timestamp("retrieved_at", { useTz: true }).notNullable();
            table.index(["tenant_id", "purpose", "retrieved_at"], "merchant_memory_retrieval_purpose_idx");
            table.index(["tenant_id", "principal_type", "principal_id"], "merchant_memory_retrieval_principal_idx");
        });

        this.schema.createTable("merchant_memory_effectiveness_observations", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("retrieval_event_id").unsigned().notNullable().references("id").inTable("merchant_memory_retrieval_events").onDelete("CASCADE");
            table.string("observation_kind", 40).notNullable();
            table.boolean("useful").nullable();
            table.boolean("accepted").nullable();
            table.boolean("repeat_error_avoided").nullable();
            table.boolean("stale_memory_avoided").nullable();
            table.text("notes").nullable();
            table.bigInteger("recorded_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("observed_at", { useTz: true }).notNullable();
            table.index(["tenant_id", "observation_kind", "observed_at"], "merchant_memory_effectiveness_kind_idx");
        });

        const checks = [
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_class_check CHECK (memory_class IN ('operational_incident','supplier_lesson','campaign_lesson','pricing_lesson','customer_segment_behavior','product_quality','architecture_process_decision','policy_precedent'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_subject_scope_check CHECK (subject_scope IN ('merchant','supplier','campaign','pricing','customer_segment','product','architecture','policy'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_status_check CHECK (status IN ('active','superseded','expired','archived'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_sensitivity_check CHECK (sensitivity IN ('internal','restricted','sensitive'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_access_scope_check CHECK (access_scope IN ('merchant_internal','decision_center','copilot','governance_only'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_ranges_check CHECK (confidence BETWEEN 0 AND 1 AND strength BETWEEN 0 AND 1 AND version >= 1 AND (expires_at IS NULL OR expires_at > effective_at))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_sensitive_raw_check CHECK (NOT (contains_customer_level_data = true AND aggregated_fact = false AND sensitivity = 'internal'))",
            "ALTER TABLE merchant_memory_evidence_links ADD CONSTRAINT merchant_memory_evidence_relation_check CHECK (relation IN ('supports','contradicts','context','outcome','approval','experiment','portfolio','orchestration'))",
            "ALTER TABLE merchant_memory_lineage ADD CONSTRAINT merchant_memory_lineage_relation_check CHECK (relation IN ('supersedes','contradicts','refines','reaffirms'))",
            "ALTER TABLE merchant_memory_lineage ADD CONSTRAINT merchant_memory_lineage_no_self_check CHECK (from_memory_id <> to_memory_id)",
            "ALTER TABLE merchant_memory_retrieval_events ADD CONSTRAINT merchant_memory_principal_type_check CHECK (principal_type IN ('human','agent','system'))",
            "ALTER TABLE merchant_memory_retrieval_events ADD CONSTRAINT merchant_memory_result_count_check CHECK (result_count >= 0 AND expired_filtered_count >= 0 AND permission_filtered_count >= 0 AND superseded_filtered_count >= 0)",
            "ALTER TABLE merchant_memory_effectiveness_observations ADD CONSTRAINT merchant_memory_effectiveness_kind_check CHECK (observation_kind IN ('retrieval_feedback','decision_followup','incident_followup','supersession_quality'))",
        ];
        for (const sql of checks) this.schema.raw(sql);

        for (const table of TABLES) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY tenant_isolation ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
        }
    }

    async down() {
        for (const table of [...TABLES].reverse()) this.schema.dropTable(table);
    }
}
