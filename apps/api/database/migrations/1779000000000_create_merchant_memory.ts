import { BaseSchema } from "@adonisjs/lucid/schema";

const TABLES = [
    "merchant_memory_records",
    "merchant_memory_evidence",
    "merchant_memory_lineage",
    "merchant_memory_retrieval_events",
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
            table.string("stable_key", 180).notNullable();
            table.integer("version").notNullable().defaultTo(1);
            table.text("context").notNullable();
            table.jsonb("observed_signals").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.text("decision").nullable();
            table.text("reason").notNullable();
            table.jsonb("alternatives_rejected").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("actors_and_approvals").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.text("action").nullable();
            table.text("outcome").nullable();
            table.text("lesson").notNullable();
            table.decimal("confidence", 8, 6).notNullable().defaultTo(0.5);
            table.decimal("strength", 8, 6).notNullable().defaultTo(0.5);
            table.string("privacy_mode", 24).notNullable().defaultTo("aggregated");
            table.string("visibility_scope", 32).notNullable().defaultTo("tenant_admin");
            table.jsonb("purpose_tags").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("status", 24).notNullable().defaultTo("active");
            table.timestamp("valid_from", { useTz: true }).notNullable();
            table.timestamp("expires_at", { useTz: true }).nullable();
            table.timestamp("last_confirmed_at", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "stable_key", "version"], { indexName: "merchant_memory_stable_version_unique" });
            table.index(["tenant_id", "memory_class", "status"], "merchant_memory_class_status_idx");
            table.index(["tenant_id", "stable_key", "version"], "merchant_memory_stable_idx");
            table.index(["tenant_id", "expires_at"], "merchant_memory_expiry_idx");
        });

        this.schema.createTable("merchant_memory_evidence", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("memory_id").unsigned().notNullable().references("id").inTable("merchant_memory_records").onDelete("CASCADE");
            table.string("source_type", 64).notNullable();
            table.string("source_authority", 96).notNullable();
            table.string("source_record_ref", 180).notNullable();
            table.string("evidence_role", 32).notNullable().defaultTo("supporting");
            table.string("content_hash", 64).nullable();
            table.jsonb("source_metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("observed_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "memory_id", "source_type", "source_record_ref"], {
                indexName: "merchant_memory_evidence_source_unique",
            });
            table.index(["tenant_id", "source_type", "source_record_ref"], "merchant_memory_evidence_lookup_idx");
        });

        this.schema.createTable("merchant_memory_lineage", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("from_memory_id").unsigned().notNullable().references("id").inTable("merchant_memory_records").onDelete("CASCADE");
            table.bigInteger("to_memory_id").unsigned().notNullable().references("id").inTable("merchant_memory_records").onDelete("CASCADE");
            table.string("relation", 24).notNullable();
            table.text("reason").notNullable();
            table.jsonb("evidence_refs").notNullable().defaultTo(this.raw("'[]'::jsonb"));
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
            table.string("requester_type", 24).notNullable();
            table.string("requester_ref", 180).nullable();
            table.string("purpose", 64).notNullable();
            table.string("query_hash", 64).notNullable();
            table.jsonb("filters").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("returned_memory_public_ids").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.integer("permission_filtered_count").notNullable().defaultTo(0);
            table.integer("expired_filtered_count").notNullable().defaultTo(0);
            table.decimal("source_coverage", 8, 6).notNullable().defaultTo(0);
            table.integer("result_count").notNullable().defaultTo(0);
            table.timestamp("retrieved_at", { useTz: true }).notNullable();
            table.index(["tenant_id", "purpose", "retrieved_at"], "merchant_memory_retrieval_purpose_idx");
        });

        this.schema.createTable("merchant_memory_effectiveness", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("retrieval_event_id").unsigned().notNullable().references("id").inTable("merchant_memory_retrieval_events").onDelete("CASCADE");
            table.decimal("usefulness", 8, 6).nullable();
            table.boolean("memory_applied").nullable();
            table.boolean("repeat_error_avoided").nullable();
            table.bigInteger("realized_impact_minor").nullable();
            table.decimal("attribution_confidence", 8, 6).nullable();
            table.text("notes").nullable();
            table.timestamp("measured_at", { useTz: true }).notNullable();
            table.bigInteger("recorded_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "retrieval_event_id", "measured_at"], "merchant_memory_effectiveness_retrieval_idx");
        });

        const checks = [
            "ALTER TABLE merchant_memory_records ADD CONSTRAINT merchant_memory_class_check CHECK (memory_class IN ('operational_incident','supplier_lesson','campaign_lesson','pricing_lesson','customer_segment_behavior','product_quality','architecture_process_decision','policy_precedent'))",
            "ALTER TABLE merchant_memory_records ADD CONSTRAINT merchant_memory_record_ranges_check CHECK (version >= 1 AND confidence BETWEEN 0 AND 1 AND strength BETWEEN 0 AND 1 AND (expires_at IS NULL OR expires_at > valid_from))",
            "ALTER TABLE merchant_memory_records ADD CONSTRAINT merchant_memory_privacy_check CHECK (privacy_mode IN ('aggregated','redacted','restricted'))",
            "ALTER TABLE merchant_memory_records ADD CONSTRAINT merchant_memory_visibility_check CHECK (visibility_scope IN ('tenant_admin','approved_agents','restricted_humans'))",
            "ALTER TABLE merchant_memory_records ADD CONSTRAINT merchant_memory_status_check CHECK (status IN ('active','expired','superseded','revoked'))",
            "ALTER TABLE merchant_memory_evidence ADD CONSTRAINT merchant_memory_evidence_role_check CHECK (evidence_role IN ('supporting','contradicting','outcome','approval','context'))",
            "ALTER TABLE merchant_memory_lineage ADD CONSTRAINT merchant_memory_lineage_relation_check CHECK (relation IN ('supersedes','refines','contradicts','revalidates'))",
            "ALTER TABLE merchant_memory_lineage ADD CONSTRAINT merchant_memory_lineage_self_check CHECK (from_memory_id <> to_memory_id)",
            "ALTER TABLE merchant_memory_retrieval_events ADD CONSTRAINT merchant_memory_retrieval_ranges_check CHECK (permission_filtered_count >= 0 AND expired_filtered_count >= 0 AND source_coverage BETWEEN 0 AND 1 AND result_count >= 0)",
            "ALTER TABLE merchant_memory_effectiveness ADD CONSTRAINT merchant_memory_effectiveness_ranges_check CHECK ((usefulness IS NULL OR usefulness BETWEEN 0 AND 1) AND (attribution_confidence IS NULL OR attribution_confidence BETWEEN 0 AND 1))",
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
