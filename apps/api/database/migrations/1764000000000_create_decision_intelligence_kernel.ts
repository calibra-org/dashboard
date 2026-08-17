import { BaseSchema } from "@adonisjs/lucid/schema";

const RLS_TABLES = [
    "intelligence_cases",
    "intelligence_evidence_links",
    "intelligence_decisions",
    "intelligence_action_records",
    "intelligence_outcome_records",
] as const;

const TENANT_PREDICATE = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("intelligence_cases", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("stable_key", 160).notNullable();
            table.string("kind", 24).notNullable();
            table.string("domain", 48).notNullable();
            table.string("lifecycle_stage", 24).notNullable().defaultTo("proposed");
            table.string("signal_state", 16).notNullable().defaultTo("open");
            table.string("severity", 16).notNullable().defaultTo("medium");
            table.string("title_fa", 300).notNullable();
            table.string("title_en", 300).notNullable();
            table.text("summary_fa").notNullable();
            table.text("summary_en").notNullable();
            table.text("recommended_action_fa").notNullable();
            table.text("recommended_action_en").notNullable();
            table.string("action_route", 500).nullable();
            table.jsonb("signal_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("observation_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("anomaly_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("expected_value_minor").nullable();
            table.string("expected_value_currency", 3).nullable();
            table.decimal("confidence", 8, 6).nullable();
            table.string("confidence_source", 160).nullable();
            table.decimal("urgency", 8, 6).nullable();
            table.decimal("reversibility_weight", 8, 6).nullable();
            table.decimal("strategic_alignment", 8, 6).nullable();
            table.decimal("capital_efficiency", 8, 6).nullable();
            table.decimal("time_to_value_weight", 8, 6).nullable();
            table.decimal("customer_harm_penalty", 8, 6).nullable();
            table.decimal("priority_score", 10, 4).notNullable().defaultTo(0);
            table.string("score_mode", 24).notNullable().defaultTo("provisional");
            table.string("ranking_policy_version", 80).notNullable();
            table.jsonb("score_components").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("missing_components").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.timestamp("freshness_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("first_seen_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("last_seen_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("cleared_at", { useTz: true }).nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.unique(["tenant_id", "stable_key"], { indexName: "intelligence_cases_stable_key_unique" });
            table.index(["tenant_id", "signal_state", "priority_score"], "intelligence_cases_inbox_idx");
            table.index(["tenant_id", "domain", "lifecycle_stage"], "intelligence_cases_domain_stage_idx");
            table.index(["tenant_id", "freshness_at"], "intelligence_cases_freshness_idx");
        });

        this.schema.createTable("intelligence_evidence_links", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("case_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("intelligence_cases")
                .onDelete("CASCADE");
            table.string("evidence_type", 48).notNullable();
            table.string("source_domain", 48).notNullable();
            table.string("source_kind", 80).notNullable();
            table.string("source_id", 160).nullable();
            table.string("source_route", 500).nullable();
            table.string("label_fa", 300).notNullable();
            table.string("label_en", 300).notNullable();
            table.string("metric_name", 120).nullable();
            table.jsonb("payload").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("freshness_at", { useTz: true }).notNullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "case_id", "freshness_at"], "intelligence_evidence_case_idx");
        });

        this.schema.createTable("intelligence_decisions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("case_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("intelligence_cases")
                .onDelete("CASCADE");
            table.string("decision", 16).notNullable();
            table.text("reason").notNullable();
            table.bigInteger("reviewer_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.integer("case_version").notNullable();
            table.jsonb("context_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("evidence_snapshot").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "case_id", "created_at"], "intelligence_decisions_case_idx");
        });

        this.schema.createTable("intelligence_action_records", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("case_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("intelligence_cases")
                .onDelete("CASCADE");
            table
                .bigInteger("decision_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("intelligence_decisions")
                .onDelete("SET NULL");
            table.string("action_kind", 48).notNullable();
            table.string("status", 24).notNullable().defaultTo("planned");
            table.string("action_route", 500).nullable();
            table.string("external_ref", 190).nullable();
            table.jsonb("result").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("started_at", { useTz: true }).nullable();
            table.timestamp("completed_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "case_id", "status"], "intelligence_actions_case_idx");
        });

        this.schema.createTable("intelligence_outcome_records", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("case_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("intelligence_cases")
                .onDelete("CASCADE");
            table
                .bigInteger("action_record_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("intelligence_action_records")
                .onDelete("SET NULL");
            table.string("metric_name", 160).notNullable();
            table.decimal("baseline_value", 24, 6).nullable();
            table.decimal("observed_value", 24, 6).nullable();
            table.decimal("delta", 24, 6).nullable();
            table.string("measurement_window", 80).nullable();
            table.decimal("attribution_confidence", 8, 6).nullable();
            table.text("notes").nullable();
            table.timestamp("observed_at", { useTz: true }).notNullable();
            table.bigInteger("recorded_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "case_id", "observed_at"], "intelligence_outcomes_case_idx");
        });

        const checks = [
            "ALTER TABLE intelligence_cases ADD CONSTRAINT intelligence_cases_kind_check CHECK (kind IN ('risk','opportunity','recommendation'))",
            "ALTER TABLE intelligence_cases ADD CONSTRAINT intelligence_cases_lifecycle_check CHECK (lifecycle_stage IN ('detected','validated','proposed','reviewed','approved','rejected','executed','measured','learned'))",
            "ALTER TABLE intelligence_cases ADD CONSTRAINT intelligence_cases_state_check CHECK (signal_state IN ('open','cleared'))",
            "ALTER TABLE intelligence_cases ADD CONSTRAINT intelligence_cases_severity_check CHECK (severity IN ('low','medium','high','critical'))",
            "ALTER TABLE intelligence_cases ADD CONSTRAINT intelligence_cases_score_mode_check CHECK (score_mode IN ('provisional','calibrated'))",
            "ALTER TABLE intelligence_cases ADD CONSTRAINT intelligence_cases_factor_ranges_check CHECK ((confidence IS NULL OR confidence BETWEEN 0 AND 1) AND (urgency IS NULL OR urgency BETWEEN 0 AND 1) AND (reversibility_weight IS NULL OR reversibility_weight BETWEEN 0 AND 1) AND (strategic_alignment IS NULL OR strategic_alignment BETWEEN 0 AND 1) AND (capital_efficiency IS NULL OR capital_efficiency BETWEEN 0 AND 1) AND (time_to_value_weight IS NULL OR time_to_value_weight BETWEEN 0 AND 1) AND (customer_harm_penalty IS NULL OR customer_harm_penalty BETWEEN 0 AND 1) AND priority_score BETWEEN 0 AND 100)",
            "ALTER TABLE intelligence_decisions ADD CONSTRAINT intelligence_decisions_value_check CHECK (decision IN ('accept','reject','defer','watch'))",
            "ALTER TABLE intelligence_decisions ADD CONSTRAINT intelligence_decisions_version_check CHECK (case_version >= 1)",
            "ALTER TABLE intelligence_action_records ADD CONSTRAINT intelligence_actions_status_check CHECK (status IN ('planned','in_progress','completed','cancelled','failed'))",
            "ALTER TABLE intelligence_outcome_records ADD CONSTRAINT intelligence_outcomes_confidence_check CHECK (attribution_confidence IS NULL OR attribution_confidence BETWEEN 0 AND 1)",
        ];
        for (const sql of checks) this.schema.raw(sql);

        for (const table of RLS_TABLES) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(
                `CREATE POLICY tenant_isolation ON ${table} USING (${TENANT_PREDICATE}) WITH CHECK (${TENANT_PREDICATE})`,
            );
        }
    }

    async down() {
        this.schema.dropTable("intelligence_outcome_records");
        this.schema.dropTable("intelligence_action_records");
        this.schema.dropTable("intelligence_decisions");
        this.schema.dropTable("intelligence_evidence_links");
        this.schema.dropTable("intelligence_cases");
    }
}
