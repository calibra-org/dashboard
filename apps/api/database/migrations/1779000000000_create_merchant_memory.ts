import { BaseSchema } from "@adonisjs/lucid/schema";

const TABLES = [
    "merchant_memory_records",
    "merchant_memory_sources",
    "merchant_memory_lineage",
    "merchant_memory_retrievals",
    "merchant_memory_effectiveness",
] as const;

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("merchant_memory_records", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("memory_class", 48).notNullable();
            table.string("subject_type", 64).nullable();
            table.string("subject_key", 160).nullable();
            table.string("title", 220).notNullable();
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
            table.string("status", 24).notNullable().defaultTo("active");
            table.string("sensitivity", 24).notNullable().defaultTo("aggregated");
            table.string("retention_class", 32).notNullable().defaultTo("standard");
            table.string("required_permission", 80).nullable();
            table.timestamp("relevant_from", { useTz: true }).notNullable();
            table.timestamp("expires_at", { useTz: true }).nullable();
            table.timestamp("superseded_at", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.index(["tenant_id", "status", "memory_class", "updated_at"], "merchant_memory_active_idx");
            table.index(["tenant_id", "subject_type", "subject_key"], "merchant_memory_subject_idx");
            table.index(["tenant_id", "expires_at"], "merchant_memory_expiry_idx");
        });

        this.schema.createTable("merchant_memory_sources", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("memory_id").unsigned().notNullable().references("id").inTable("merchant_memory_records").onDelete("CASCADE");
            table.string("source_kind", 32).notNullable();
            table.string("source_table", 96).notNullable();
            table.string("source_id", 160).notNullable();
            table.string("source_public_id", 160).nullable();
            table.string("evidence_hash", 64).nullable();
            table.string("evidence_role", 32).notNullable().defaultTo("supporting");
            table.timestamp("observed_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "memory_id", "source_table", "source_id", "evidence_role"], {
                indexName: "merchant_memory_source_unique",
            });
            table.index(["tenant_id", "source_table", "source_id"], "merchant_memory_source_lookup_idx");
        });

        this.schema.createTable("merchant_memory_lineage", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("from_memory_id").unsigned().notNullable().references("id").inTable("merchant_memory_records").onDelete("CASCADE");
            table.bigInteger("to_memory_id").unsigned().notNullable().references("id").inTable("merchant_memory_records").onDelete("CASCADE");
            table.string("relation", 32).notNullable();
            table.text("reason").notNullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "from_memory_id", "to_memory_id", "relation"], {
                indexName: "merchant_memory_lineage_unique",
            });
        });

        this.schema.createTable("merchant_memory_retrievals", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("principal_kind", 24).notNullable();
            table.string("principal_id", 160).nullable();
            table.text("query").notNullable();
            table.jsonb("filters").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("returned_memory_ids").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.integer("result_count").notNullable().defaultTo(0);
            table.integer("source_linked_count").notNullable().defaultTo(0);
            table.integer("expired_filtered_count").notNullable().defaultTo(0);
            table.integer("permission_filtered_count").notNullable().defaultTo(0);
            table.timestamp("retrieved_at", { useTz: true }).notNullable();
            table.index(["tenant_id", "principal_kind", "retrieved_at"], "merchant_memory_retrieval_principal_idx");
        });

        this.schema.createTable("merchant_memory_effectiveness", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("retrieval_id").unsigned().notNullable().references("id").inTable("merchant_memory_retrievals").onDelete("CASCADE");
            table.bigInteger("memory_id").unsigned().nullable().references("id").inTable("merchant_memory_records").onDelete("SET NULL");
            table.string("outcome", 32).notNullable();
            table.decimal("usefulness", 8, 6).nullable();
            table.boolean("repeat_error_avoided").nullable();
            table.bigInteger("source_outcome_record_id").unsigned().nullable().references("id").inTable("intelligence_outcome_records").onDelete("SET NULL");
            table.text("notes").nullable();
            table.bigInteger("recorded_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("recorded_at", { useTz: true }).notNullable();
            table.index(["tenant_id", "memory_id", "recorded_at"], "merchant_memory_effectiveness_memory_idx");
        });

        const checks = [
            "ALTER TABLE merchant_memory_records ADD CONSTRAINT merchant_memory_class_check CHECK (memory_class IN ('operational_incident','supplier_lesson','campaign_lesson','pricing_lesson','customer_segment_behavior','product_quality','architecture_process_decision','policy_precedent'))",
            "ALTER TABLE merchant_memory_records ADD CONSTRAINT merchant_memory_status_check CHECK (status IN ('active','superseded','expired','revoked'))",
            "ALTER TABLE merchant_memory_records ADD CONSTRAINT merchant_memory_sensitivity_check CHECK (sensitivity IN ('aggregated','internal','restricted'))",
            "ALTER TABLE merchant_memory_records ADD CONSTRAINT merchant_memory_retention_check CHECK (retention_class IN ('short','standard','extended','legal_hold'))",
            "ALTER TABLE merchant_memory_records ADD CONSTRAINT merchant_memory_strength_check CHECK (confidence BETWEEN 0 AND 1 AND strength BETWEEN 0 AND 1)",
            "ALTER TABLE merchant_memory_records ADD CONSTRAINT merchant_memory_expiry_check CHECK (expires_at IS NULL OR expires_at > relevant_from)",
            "ALTER TABLE merchant_memory_sources ADD CONSTRAINT merchant_memory_source_kind_check CHECK (source_kind IN ('decision','outcome','approval','experiment','orchestration','portfolio','audit'))",
            "ALTER TABLE merchant_memory_sources ADD CONSTRAINT merchant_memory_evidence_role_check CHECK (evidence_role IN ('primary','supporting','contradicting'))",
            "ALTER TABLE merchant_memory_lineage ADD CONSTRAINT merchant_memory_lineage_relation_check CHECK (relation IN ('supersedes','contradicts','refines'))",
            "ALTER TABLE merchant_memory_lineage ADD CONSTRAINT merchant_memory_lineage_distinct_check CHECK (from_memory_id <> to_memory_id)",
            "ALTER TABLE merchant_memory_retrievals ADD CONSTRAINT merchant_memory_principal_check CHECK (principal_kind IN ('admin','copilot','automation'))",
            "ALTER TABLE merchant_memory_retrievals ADD CONSTRAINT merchant_memory_retrieval_count_check CHECK (result_count >= 0 AND source_linked_count >= 0 AND expired_filtered_count >= 0 AND permission_filtered_count >= 0)",
            "ALTER TABLE merchant_memory_effectiveness ADD CONSTRAINT merchant_memory_effectiveness_outcome_check CHECK (outcome IN ('used','ignored','misleading','prevented_repeat_error','unknown'))",
            "ALTER TABLE merchant_memory_effectiveness ADD CONSTRAINT merchant_memory_usefulness_check CHECK (usefulness IS NULL OR usefulness BETWEEN 0 AND 1)",
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
