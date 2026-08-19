import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";
const TABLES = [
    "experiments",
    "experiment_variants",
    "experiment_assignments",
    "experiment_exposures",
    "experiment_metric_observations",
    "experiment_analysis_runs",
    "experiment_holdouts",
    "experiment_holdout_memberships",
    "experiment_causal_knowledge",
] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("experiments", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("experiment_key", 120).notNullable();
            table.string("name", 190).notNullable();
            table.text("hypothesis").notNullable();
            table.string("surface", 64).notNullable();
            table.string("status", 24).notNullable().defaultTo("draft");
            table.string("risk_level", 16).notNullable().defaultTo("medium");
            table.string("randomization_unit", 24).notNullable().defaultTo("visitor");
            table.string("layer_key", 96).notNullable().defaultTo("default");
            table.integer("layer_start_bps").notNullable().defaultTo(0);
            table.integer("layer_end_bps").notNullable().defaultTo(10000);
            table.string("salt", 96).notNullable();
            table.string("primary_metric_key", 120).notNullable();
            table.string("primary_metric_kind", 24).notNullable().defaultTo("binary");
            table.jsonb("secondary_metrics").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("guardrails").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("eligibility").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("exclusions").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("sample_plan").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("analysis_method", 48).notNullable().defaultTo("fixed_horizon_v1");
            table.string("approval_reference", 190).nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("owner_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("approved_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("approved_at", { useTz: true }).nullable();
            table.timestamp("starts_at", { useTz: true }).nullable();
            table.timestamp("ends_at", { useTz: true }).nullable();
            table.timestamp("started_at", { useTz: true }).nullable();
            table.timestamp("stopped_at", { useTz: true }).nullable();
            table.text("stop_reason").nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "experiment_key"], { indexName: "experiments_key_unique" });
            table.index(["tenant_id", "status", "updated_at"], "experiments_status_idx");
            table.index(["tenant_id", "layer_key", "status"], "experiments_layer_idx");
        });

        this.schema.createTable("experiment_variants", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("experiment_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("experiments")
                .onDelete("CASCADE");
            table.string("variant_key", 80).notNullable();
            table.string("name", 160).notNullable();
            table.integer("weight_bps").notNullable();
            table.boolean("is_control").notNullable().defaultTo(false);
            table.jsonb("payload").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamps(true, true);
            table.unique(["tenant_id", "experiment_id", "variant_key"], { indexName: "experiment_variants_key_unique" });
            table.index(["tenant_id", "experiment_id"], "experiment_variants_experiment_idx");
        });

        this.schema.createTable("experiment_assignments", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("experiment_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("experiments")
                .onDelete("CASCADE");
            table
                .bigInteger("variant_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("experiment_variants")
                .onDelete("RESTRICT");
            table.string("subject_type", 24).notNullable();
            table.string("subject_hash", 64).notNullable();
            table.integer("layer_bucket").notNullable();
            table.integer("variant_bucket").notNullable();
            table.integer("experiment_version").notNullable();
            table.string("assignment_reason", 64).notNullable().defaultTo("eligible");
            table.timestamp("assigned_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "experiment_id", "subject_type", "subject_hash"], {
                indexName: "experiment_assignments_sticky_unique",
            });
            table.index(["tenant_id", "experiment_id", "variant_id", "assigned_at"], "experiment_assignments_variant_idx");
        });

        this.schema.createTable("experiment_exposures", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("experiment_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("experiments")
                .onDelete("CASCADE");
            table
                .bigInteger("assignment_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("experiment_assignments")
                .onDelete("CASCADE");
            table.uuid("exposure_id").notNullable();
            table.string("surface", 64).notNullable();
            table.string("placement", 96).nullable();
            table.jsonb("context").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("occurred_at", { useTz: true }).notNullable();
            table.timestamp("received_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "exposure_id"], { indexName: "experiment_exposures_id_unique" });
            table.index(["tenant_id", "experiment_id", "assignment_id", "occurred_at"], "experiment_exposures_experiment_idx");
        });

        this.schema.createTable("experiment_metric_observations", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("experiment_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("experiments")
                .onDelete("CASCADE");
            table
                .bigInteger("assignment_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("experiment_assignments")
                .onDelete("CASCADE");
            table.uuid("observation_id").notNullable();
            table.string("metric_key", 120).notNullable();
            table.string("metric_kind", 24).notNullable();
            table.decimal("value", 24, 6).notNullable();
            table.string("currency", 3).nullable();
            table.jsonb("context").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("occurred_at", { useTz: true }).notNullable();
            table.timestamp("received_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "observation_id"], { indexName: "experiment_observations_id_unique" });
            table.index(["tenant_id", "experiment_id", "metric_key", "occurred_at"], "experiment_observations_metric_idx");
        });

        this.schema.createTable("experiment_analysis_runs", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("experiment_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("experiments")
                .onDelete("CASCADE");
            table.string("analysis_version", 48).notNullable().defaultTo("phase17-v1");
            table.string("status", 24).notNullable();
            table.boolean("srm_detected").notNullable().defaultTo(false);
            table.decimal("srm_chi_square", 24, 8).nullable();
            table.jsonb("variant_metrics").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("guardrail_results").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("causal_strength", 32).notNullable().defaultTo("insufficient_data");
            table.text("conclusion").nullable();
            table.timestamp("data_cutoff_at", { useTz: true }).notNullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "experiment_id", "created_at"], "experiment_analysis_experiment_idx");
        });

        this.schema.createTable("experiment_holdouts", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("holdout_key", 120).notNullable();
            table.string("name", 190).notNullable();
            table.string("scope", 48).notNullable();
            table.integer("allocation_bps").notNullable().defaultTo(500);
            table.string("salt", 96).notNullable();
            table.string("status", 16).notNullable().defaultTo("active");
            table.text("purpose").notNullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "holdout_key"], { indexName: "experiment_holdouts_key_unique" });
        });

        this.schema.createTable("experiment_holdout_memberships", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("holdout_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("experiment_holdouts")
                .onDelete("CASCADE");
            table.string("subject_type", 24).notNullable();
            table.string("subject_hash", 64).notNullable();
            table.integer("bucket").notNullable();
            table.timestamp("assigned_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "holdout_id", "subject_type", "subject_hash"], {
                indexName: "experiment_holdout_membership_unique",
            });
        });

        this.schema.createTable("experiment_causal_knowledge", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("experiment_id").unsigned().nullable().references("id").inTable("experiments").onDelete("SET NULL");
            table.string("knowledge_key", 160).notNullable();
            table.string("surface", 64).notNullable();
            table.string("metric_key", 120).notNullable();
            table.string("evidence_strength", 32).notNullable();
            table.text("conclusion").notNullable();
            table.jsonb("effect_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("limitations").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.integer("replication_count").notNullable().defaultTo(1);
            table.timestamp("last_evaluated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamps(true, true);
            table.unique(["tenant_id", "knowledge_key"], { indexName: "experiment_causal_knowledge_key_unique" });
        });

        const checks = [
            `ALTER TABLE experiments ADD CONSTRAINT experiments_status_check CHECK (status IN ('draft','review','scheduled','running','paused','stopped','completed','archived'))`,
            `ALTER TABLE experiments ADD CONSTRAINT experiments_risk_check CHECK (risk_level IN ('low','medium','high','critical'))`,
            `ALTER TABLE experiments ADD CONSTRAINT experiments_unit_check CHECK (randomization_unit IN ('visitor','customer','session','account','order','product','request'))`,
            `ALTER TABLE experiments ADD CONSTRAINT experiments_metric_kind_check CHECK (primary_metric_kind IN ('binary','continuous','count','money'))`,
            `ALTER TABLE experiments ADD CONSTRAINT experiments_layer_bounds_check CHECK (layer_start_bps >= 0 AND layer_end_bps <= 10000 AND layer_end_bps > layer_start_bps AND version >= 1)`,
            `ALTER TABLE experiment_variants ADD CONSTRAINT experiment_variants_weight_check CHECK (weight_bps > 0 AND weight_bps <= 10000)`,
            `ALTER TABLE experiment_assignments ADD CONSTRAINT experiment_assignments_bucket_check CHECK (layer_bucket BETWEEN 0 AND 9999 AND variant_bucket BETWEEN 0 AND 9999 AND experiment_version >= 1)`,
            `ALTER TABLE experiment_metric_observations ADD CONSTRAINT experiment_observations_kind_check CHECK (metric_kind IN ('binary','continuous','count','money'))`,
            `ALTER TABLE experiment_analysis_runs ADD CONSTRAINT experiment_analysis_status_check CHECK (status IN ('insufficient_data','healthy','srm_detected','guardrail_breached'))`,
            `ALTER TABLE experiment_analysis_runs ADD CONSTRAINT experiment_analysis_strength_check CHECK (causal_strength IN ('insufficient_data','randomized_evidence','randomized_evidence_guardrail_failed'))`,
            `ALTER TABLE experiment_holdouts ADD CONSTRAINT experiment_holdouts_scope_check CHECK (scope IN ('recommendation','automation','ai_intervention','marketing'))`,
            `ALTER TABLE experiment_holdouts ADD CONSTRAINT experiment_holdouts_status_check CHECK (status IN ('active','paused','archived'))`,
            `ALTER TABLE experiment_holdouts ADD CONSTRAINT experiment_holdouts_allocation_check CHECK (allocation_bps BETWEEN 1 AND 5000)`,
            `ALTER TABLE experiment_holdout_memberships ADD CONSTRAINT experiment_holdout_bucket_check CHECK (bucket BETWEEN 0 AND 9999)`,
            `ALTER TABLE experiment_causal_knowledge ADD CONSTRAINT experiment_knowledge_strength_check CHECK (evidence_strength IN ('observational','quasi_experimental','randomized_evidence','repeated_replicated'))`,
            `ALTER TABLE experiment_causal_knowledge ADD CONSTRAINT experiment_knowledge_replication_check CHECK (replication_count >= 1)`,
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
        this.schema.dropTable("experiment_causal_knowledge");
        this.schema.dropTable("experiment_holdout_memberships");
        this.schema.dropTable("experiment_holdouts");
        this.schema.dropTable("experiment_analysis_runs");
        this.schema.dropTable("experiment_metric_observations");
        this.schema.dropTable("experiment_exposures");
        this.schema.dropTable("experiment_assignments");
        this.schema.dropTable("experiment_variants");
        this.schema.dropTable("experiments");
    }
}
