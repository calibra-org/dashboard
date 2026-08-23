import { BaseSchema } from "@adonisjs/lucid/schema";

const TABLES = [
    "merchant_memories",
    "merchant_memory_sources",
    "merchant_memory_lineage",
    "merchant_memory_retrieval_events",
    "merchant_memory_feedback",
] as const;

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("merchant_memories", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("memory_key", 190).notNullable();
            table.string("memory_class", 48).notNullable();
            table.string("subject_scope", 24).notNullable().defaultTo("merchant");
            table.string("subject_key", 190).nullable();
            table.string("title", 300).notNullable();
            table.jsonb("context").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("observed_signals").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.text("decision").nullable();
            table.text("reason").notNullable();
            table.jsonb("alternatives_rejected").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("actor_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("approval_references").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("action_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("outcome_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.text("lesson").notNullable();
            table.decimal("confidence", 8, 6).notNullable();
            table.decimal("strength", 8, 6).notNullable().defaultTo(0.5);
            table.string("status", 24).notNullable().defaultTo("active");
            table.string("sensitivity", 24).notNullable().defaultTo("internal");
            table.string("retention_class", 32).notNullable().defaultTo("standard");
            table.string("minimum_role", 24).notNullable().defaultTo("agent");
            table.timestamp("relevant_from", { useTz: true }).notNullable();
            table.timestamp("expires_at", { useTz: true }).nullable();
            table.timestamp("last_confirmed_at", { useTz: true }).nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "memory_key", "version"], { indexName: "merchant_memory_key_version_unique" });
            table.index(["tenant_id", "memory_class", "status", "relevant_from"], "merchant_memory_class_status_idx");
            table.index(["tenant_id", "subject_scope", "subject_key"], "merchant_memory_subject_idx");
            table.index(["tenant_id", "expires_at"], "merchant_memory_expiry_idx");
        });

        this.schema.createTable("merchant_memory_sources", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("memory_id").unsigned().notNullable().references("id").inTable("merchant_memories").onDelete("CASCADE");
            table.string("source_domain", 48).notNullable();
            table.string("source_kind", 80).notNullable();
            table.string("source_id", 190).nullable();
            table.string("source_route", 500).nullable();
            table.string("source_version", 80).nullable();
            table.string("evidence_role", 32).notNullable().defaultTo("supporting");
            table.string("content_hash", 64).nullable();
            table.jsonb("evidence_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("freshness_at", { useTz: true }).notNullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "memory_id", "freshness_at"], "merchant_memory_source_memory_idx");
            table.index(["tenant_id", "source_domain", "source_kind", "source_id"], "merchant_memory_source_lookup_idx");
        });

        this.schema.createTable("merchant_memory_lineage", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("memory_id").unsigned().notNullable().references("id").inTable("merchant_memories").onDelete("CASCADE");
            table.bigInteger("predecessor_memory_id").unsigned().notNullable().references("id").inTable("merchant_memories").onDelete("CASCADE");
            table.string("relationship", 24).notNullable().defaultTo("supersedes");
            table.string("reason_kind", 32).notNullable();
            table.text("reason").notNullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.unique(["tenant_id", "memory_id", "predecessor_memory_id"], { indexName: "merchant_memory_lineage_unique" });
            table.index(["tenant_id", "predecessor_memory_id"], "merchant_memory_lineage_predecessor_idx");
        });

        this.schema.createTable("merchant_memory_retrieval_events", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("requester_kind", 24).notNullable();
            table.string("requester_id", 190).nullable();
            table.string("purpose", 80).notNullable();
            table.string("query_hash", 64).notNullable();
            table.jsonb("query_features").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("retrieved_memory_ids").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.integer("result_count").notNullable().defaultTo(0);
            table.integer("expired_filtered_count").notNullable().defaultTo(0);
            table.integer("permission_filtered_count").notNullable().defaultTo(0);
            table.integer("superseded_filtered_count").notNullable().defaultTo(0);
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "purpose", "created_at"], "merchant_memory_retrieval_purpose_idx");
        });

        this.schema.createTable("merchant_memory_feedback", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("retrieval_event_id").unsigned().notNullable().references("id").inTable("merchant_memory_retrieval_events").onDelete("CASCADE");
            table.string("feedback_kind", 32).notNullable();
            table.decimal("usefulness_score", 8, 6).nullable();
            table.boolean("repeat_error_prevented").nullable();
            table.boolean("decision_changed").nullable();
            table.jsonb("applied_memory_ids").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.text("notes").nullable();
            table.bigInteger("recorded_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "feedback_kind", "created_at"], "merchant_memory_feedback_kind_idx");
        });

        const checks = [
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_class_check CHECK (memory_class IN ('operational_incident','supplier_lesson','campaign_lesson','pricing_lesson','customer_segment_behavior','product_quality','architecture_process_decision','policy_precedent'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_subject_scope_check CHECK (subject_scope IN ('merchant','aggregate','segment','supplier','product','process','policy'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_status_check CHECK (status IN ('active','superseded','expired','revoked'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_sensitivity_check CHECK (sensitivity IN ('aggregate','internal','restricted'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_retention_check CHECK (retention_class IN ('short','standard','extended','legal_hold'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_role_check CHECK (minimum_role IN ('agent','admin'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_strength_check CHECK (confidence BETWEEN 0 AND 1 AND strength BETWEEN 0 AND 1 AND version >= 1)",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_expiry_check CHECK (expires_at IS NULL OR expires_at > relevant_from)",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_sensitive_retention_check CHECK (sensitivity <> 'restricted' OR (minimum_role = 'admin' AND expires_at IS NOT NULL))",
            "ALTER TABLE merchant_memory_sources ADD CONSTRAINT merchant_memory_source_role_check CHECK (evidence_role IN ('primary','supporting','contradicting','outcome','approval','action'))",
            "ALTER TABLE merchant_memory_lineage ADD CONSTRAINT merchant_memory_lineage_relationship_check CHECK (relationship IN ('supersedes','refines','contradicts'))",
            "ALTER TABLE merchant_memory_lineage ADD CONSTRAINT merchant_memory_lineage_reason_check CHECK (reason_kind IN ('new_evidence','market_change','policy_change','correction','expiry_refresh'))",
            "ALTER TABLE merchant_memory_lineage ADD CONSTRAINT merchant_memory_lineage_self_check CHECK (memory_id <> predecessor_memory_id)",
            "ALTER TABLE merchant_memory_retrieval_events ADD CONSTRAINT merchant_memory_requester_check CHECK (requester_kind IN ('human','agent','system'))",
            "ALTER TABLE merchant_memory_retrieval_events ADD CONSTRAINT merchant_memory_retrieval_count_check CHECK (result_count >= 0 AND expired_filtered_count >= 0 AND permission_filtered_count >= 0 AND superseded_filtered_count >= 0)",
            "ALTER TABLE merchant_memory_feedback ADD CONSTRAINT merchant_memory_feedback_kind_check CHECK (feedback_kind IN ('useful','not_useful','applied','ignored','harmful'))",
            "ALTER TABLE merchant_memory_feedback ADD CONSTRAINT merchant_memory_feedback_score_check CHECK (usefulness_score IS NULL OR usefulness_score BETWEEN 0 AND 1)",
        ];
        for (const sql of checks) this.schema.raw(sql);

        for (const table of TABLES) {
            this.schema.raw(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`);
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY tenant_isolation ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
        }
    }

    async down() {
        for (const table of [...TABLES].reverse()) this.schema.dropTable(table);
    }
}
