import { BaseSchema } from "@adonisjs/lucid/schema";

const TABLES = [
    "merchant_memories",
    "merchant_memory_sources",
    "merchant_memory_lineage",
    "merchant_memory_retrievals",
    "merchant_memory_effectiveness",
] as const;

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("merchant_memories", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("memory_class", 48).notNullable();
            table.string("title", 220).notNullable();
            table.text("context").notNullable();
            table.jsonb("observed_signals").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.text("decision").notNullable();
            table.text("reason").notNullable();
            table.jsonb("alternatives_rejected").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("actors_approvals").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.text("action").nullable();
            table.text("outcome").nullable();
            table.text("lesson").notNullable();
            table.decimal("confidence", 8, 6).notNullable().defaultTo(0.5);
            table.decimal("strength", 8, 6).notNullable().defaultTo(0.5);
            table.string("status", 24).notNullable().defaultTo("active");
            table.string("visibility_scope", 24).notNullable().defaultTo("admin_agent");
            table.string("sensitivity_level", 24).notNullable().defaultTo("internal");
            table.string("aggregation_level", 24).notNullable().defaultTo("aggregate");
            table.timestamp("effective_from", { useTz: true }).notNullable();
            table.timestamp("expires_at", { useTz: true }).nullable();
            table.timestamp("last_validated_at", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.index(["tenant_id", "memory_class", "status"], "merchant_memories_class_status_idx");
            table.index(["tenant_id", "expires_at"], "merchant_memories_expiry_idx");
        });

        this.schema.createTable("merchant_memory_sources", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("memory_id").unsigned().notNullable().references("id").inTable("merchant_memories").onDelete("CASCADE");
            table.string("source_type", 64).notNullable();
            table.string("source_reference", 180).notNullable();
            table.string("source_uri", 500).nullable();
            table.string("evidence_hash", 64).nullable();
            table.string("evidence_role", 32).notNullable().defaultTo("supporting");
            table.jsonb("evidence_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("observed_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "memory_id", "source_type", "source_reference"], {
                indexName: "merchant_memory_source_unique",
            });
        });

        this.schema.createTable("merchant_memory_lineage", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("predecessor_memory_id").unsigned().notNullable().references("id").inTable("merchant_memories").onDelete("CASCADE");
            table.bigInteger("successor_memory_id").unsigned().notNullable().references("id").inTable("merchant_memories").onDelete("CASCADE");
            table.string("relation", 32).notNullable();
            table.text("reason").notNullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "predecessor_memory_id", "successor_memory_id", "relation"], {
                indexName: "merchant_memory_lineage_unique",
            });
        });

        this.schema.createTable("merchant_memory_retrievals", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().unique();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("requester_type", 24).notNullable();
            table.string("requester_reference", 180).nullable();
            table.text("query_text").notNullable();
            table.jsonb("filters").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("returned_memory_ids").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.integer("result_count").notNullable().defaultTo(0);
            table.integer("source_linked_count").notNullable().defaultTo(0);
            table.integer("expired_excluded_count").notNullable().defaultTo(0);
            table.integer("superseded_excluded_count").notNullable().defaultTo(0);
            table.integer("permission_excluded_count").notNullable().defaultTo(0);
            table.timestamp("retrieved_at", { useTz: true }).notNullable();
            table.index(["tenant_id", "retrieved_at"], "merchant_memory_retrievals_time_idx");
        });

        this.schema.createTable("merchant_memory_effectiveness", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("memory_id").unsigned().notNullable().references("id").inTable("merchant_memories").onDelete("CASCADE");
            table.bigInteger("retrieval_id").unsigned().nullable().references("id").inTable("merchant_memory_retrievals").onDelete("SET NULL");
            table.string("effect_kind", 32).notNullable();
            table.decimal("usefulness_score", 8, 6).nullable();
            table.string("decision_reference", 180).nullable();
            table.string("outcome_reference", 180).nullable();
            table.text("notes").nullable();
            table.timestamp("measured_at", { useTz: true }).notNullable();
            table.bigInteger("recorded_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.index(["tenant_id", "memory_id", "measured_at"], "merchant_memory_effectiveness_idx");
        });

        const checks = [
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_class_check CHECK (memory_class IN ('operational_incident','supplier_lesson','campaign_lesson','pricing_lesson','customer_segment_behavior','product_quality','architecture_process_decision','policy_precedent'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_status_check CHECK (status IN ('active','superseded','expired','revoked'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_visibility_check CHECK (visibility_scope IN ('admin_only','admin_agent'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_sensitivity_check CHECK (sensitivity_level IN ('internal','restricted','sensitive'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_aggregation_check CHECK (aggregation_level IN ('aggregate','cohort','record_level'))",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_ranges_check CHECK (confidence BETWEEN 0 AND 1 AND strength BETWEEN 0 AND 1)",
            "ALTER TABLE merchant_memories ADD CONSTRAINT merchant_memory_expiry_check CHECK (expires_at IS NULL OR expires_at > effective_from)",
            "ALTER TABLE merchant_memory_sources ADD CONSTRAINT merchant_memory_evidence_role_check CHECK (evidence_role IN ('supporting','contradicting','outcome','approval','policy'))",
            "ALTER TABLE merchant_memory_lineage ADD CONSTRAINT merchant_memory_lineage_relation_check CHECK (relation IN ('supersedes','refines','contradicts'))",
            "ALTER TABLE merchant_memory_lineage ADD CONSTRAINT merchant_memory_lineage_no_self_check CHECK (predecessor_memory_id <> successor_memory_id)",
            "ALTER TABLE merchant_memory_retrievals ADD CONSTRAINT merchant_memory_requester_check CHECK (requester_type IN ('human','agent','system'))",
            "ALTER TABLE merchant_memory_effectiveness ADD CONSTRAINT merchant_memory_effect_kind_check CHECK (effect_kind IN ('useful','not_useful','prevented_repeat_error','decision_influenced','outcome_supported'))",
            "ALTER TABLE merchant_memory_effectiveness ADD CONSTRAINT merchant_memory_usefulness_check CHECK (usefulness_score IS NULL OR usefulness_score BETWEEN 0 AND 1)",
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
