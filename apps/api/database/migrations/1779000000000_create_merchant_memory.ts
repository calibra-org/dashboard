import { BaseSchema } from "@adonisjs/lucid/schema";

const TABLES = [
    "merchant_memories",
    "merchant_memory_evidence",
    "merchant_memory_lineage",
    "merchant_memory_retrievals",
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
            table.string("scope_kind", 48).notNullable().defaultTo("merchant");
            table.string("scope_key", 160).nullable();
            table.string("title", 300).notNullable();
            table.text("context").notNullable();
            table.jsonb("observed_signals").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.text("decision").nullable();
            table.text("reason").nullable();
            table.jsonb("alternatives_rejected").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("actors_and_approvals").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.text("action").nullable();
            table.text("outcome").nullable();
            table.text("lesson").notNullable();
            table.decimal("confidence", 8, 6).notNullable().defaultTo(0.5);
            table.decimal("strength", 8, 6).notNullable().defaultTo(0.5);
            table.string("privacy_level", 24).notNullable().defaultTo("internal");
            table.string("retention_class", 32).notNullable().defaultTo("standard");
            table.string("status", 24).notNullable().defaultTo("active");
            table.integer("version").notNullable().defaultTo(1);
            table.timestamp("effective_from", { useTz: true }).notNullable();
            table.timestamp("expires_at", { useTz: true }).nullable();
            table.timestamp("superseded_at", { useTz: true }).nullable();
            table.timestamp("last_validated_at", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "memory_key", "version"], { indexName: "merchant_memory_key_version_unique" });
            table.index(["tenant_id", "memory_class", "status", "updated_at"], "merchant_memories_class_status_idx");
            table.index(["tenant_id", "scope_kind", "scope_key"], "merchant_memories_scope_idx");
            table.index(["tenant_id", "expires_at"], "merchant_memories_expiry_idx");
        });

        this.schema.createTable("merchant_memory_evidence", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("memory_id").unsigned().notNullable().references("id").inTable("merchant_memories").onDelete("CASCADE");
            table.string("source_kind", 64).notNullable();
            table.string("source_ref", 180).notNullable();
            table.string("source_version", 80).nullable();
            table.string("source_route", 500).nullable();
            table.string("label", 300).notNullable();
            table.string("evidence_hash", 64).notNullable();
            table.string("evidence_role", 32).notNullable().defaultTo("supporting");
            table.text("excerpt").nullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("observed_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "memory_id", "source_kind", "source_ref", "evidence_role"], {
                indexName: "merchant_memory_evidence_unique",
            });
            table.index(["tenant_id", "source_kind", "source_ref"], "merchant_memory_evidence_source_idx");
        });

        this.schema.createTable("merchant_memory_lineage", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("from_memory_id").unsigned().notNullable().references("id").inTable("merchant_memories").onDelete("CASCADE");
            table.bigInteger("to_memory_id").unsigned().notNullable().references("id").inTable("merchant_memories").onDelete("CASCADE");
            table.string("relation", 24).notNullable();
            table.text("reason").notNullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "from_memory_id", "to_memory_id", "relation"], {
                indexName: "merchant_memory_lineage_unique",
            });
            table.index(["tenant_id", "from_memory_id"], "merchant_memory_lineage_from_idx");
            table.index(["tenant_id", "to_memory_id"], "merchant_memory_lineage_to_idx");
        });

        this.schema.createTable("merchant_memory_retrievals", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("principal_type", 24).notNullable();
            table.string("principal_ref", 160).notNullable();
            table.string("query_hash", 64).notNullable();
            table.jsonb("query_tokens").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("filters").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("result_memory_ids").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.integer("result_count").notNullable().defaultTo(0);
            table.integer("expired_filtered_count").notNullable().defaultTo(0);
            table.integer("permission_filtered_count").notNullable().defaultTo(0);
            table.integer("superseded_filtered_count").notNullable().defaultTo(0);
            table.string("purpose", 80).notNullable().defaultTo("decision_support");
            table.timestamp("retrieved_at", { useTz: true }).notNullable();
            table.index(["tenant_id", "principal_type", "principal_ref", "retrieved_at"], "merchant_memory_retrieval_principal_idx");
        });

        this.schema.createTable("merchant_memory_feedback", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("retrieval_id").unsigned().notNullable().references("id").inTable("merchant_memory_retrievals").onDelete("CASCADE");
            table.bigInteger("memory_id").unsigned().notNullable().references("id").inTable("merchant_memories").onDelete("CASCADE");
            table.string("feedback", 24).notNullable();
            table.decimal("usefulness_score", 8, 6).nullable();
            table.boolean("prevented_repeat_error").nullable();
            table.decimal("outcome_delta", 14, 6).nullable();
            table.text("note").nullable();
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "retrieval_id", "memory_id"], { indexName: "merchant_memory_feedback_unique" });
        });

        const checks = [
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_class_check CHECK (memory_class IN ('operational_incident','supplier_lesson','campaign_lesson','pricing_lesson','customer_segment_behavior','product_quality','architecture_process_decision','policy_precedent'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_scope_check CHECK (scope_kind IN ('merchant','supplier','campaign','pricing','customer_segment','product','process','policy'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_ranges_check CHECK (confidence BETWEEN 0 AND 1 AND strength BETWEEN 0 AND 1 AND version >= 1)",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_privacy_check CHECK (privacy_level IN ('internal','restricted','aggregated'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_retention_check CHECK (retention_class IN ('short','standard','long','legal_hold'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_status_check CHECK (status IN ('active','superseded','expired','revoked'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_temporal_check CHECK (expires_at IS NULL OR expires_at >= effective_from)",
            "ALTER TABLE merchant_memory_evidence ADD CONSTRAINT merchant_memory_evidence_role_check CHECK (evidence_role IN ('supporting','contradicting','outcome','approval','context'))",
            "ALTER TABLE merchant_memory_lineage ADD CONSTRAINT merchant_memory_lineage_relation_check CHECK (relation IN ('supersedes','contradicts','refines','supports'))",
            "ALTER TABLE merchant_memory_lineage ADD CONSTRAINT merchant_memory_lineage_distinct_check CHECK (from_memory_id <> to_memory_id)",
            "ALTER TABLE merchant_memory_retrievals ADD CONSTRAINT merchant_memory_retrieval_principal_check CHECK (principal_type IN ('human','agent','system'))",
            "ALTER TABLE merchant_memory_retrievals ADD CONSTRAINT merchant_memory_retrieval_counts_check CHECK (result_count >= 0 AND expired_filtered_count >= 0 AND permission_filtered_count >= 0 AND superseded_filtered_count >= 0)",
            "ALTER TABLE merchant_memory_feedback ADD CONSTRAINT merchant_memory_feedback_check CHECK (feedback IN ('useful','irrelevant','applied','incorrect'))",
            "ALTER TABLE merchant_memory_feedback ADD CONSTRAINT merchant_memory_feedback_score_check CHECK (usefulness_score IS NULL OR usefulness_score BETWEEN 0 AND 1)",
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
