import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";
const TABLES = [
    "reliability_remediation_policies",
    "reliability_invariants",
    "reliability_incidents",
    "reliability_evaluations",
    "reliability_remediation_runs",
    "reliability_scorecards",
] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("reliability_remediation_policies", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.string("policy_key", 120).notNullable();
            table.string("name", 190).notNullable();
            table.string("action_type", 48).notNullable();
            table.string("risk_level", 16).notNullable().defaultTo("medium");
            table.boolean("auto_execute").notNullable().defaultTo(false);
            table.jsonb("target").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("cooldown_seconds").notNullable().defaultTo(900);
            table.integer("max_executions_per_hour").notNullable().defaultTo(1);
            table.boolean("rollback_required").notNullable().defaultTo(true);
            table.boolean("enabled").notNullable().defaultTo(true);
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "reliability_policy_public_unique" });
            table.unique(["tenant_id", "policy_key"], { indexName: "reliability_policy_key_unique" });
        });

        this.schema.createTable("reliability_invariants", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.string("invariant_key", 120).notNullable();
            table.string("name", 190).notNullable();
            table.string("domain", 64).notNullable();
            table.string("severity", 16).notNullable().defaultTo("warning");
            table.string("source_kind", 48).notNullable();
            table.jsonb("source_config").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("operator", 8).notNullable().defaultTo("gte");
            table.decimal("threshold", 18, 6).notNullable();
            table.integer("window_seconds").notNullable().defaultTo(900);
            table.integer("min_consecutive_failures").notNullable().defaultTo(2);
            table.integer("recovery_consecutive_passes").notNullable().defaultTo(2);
            table
                .bigInteger("remediation_policy_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("reliability_remediation_policies")
                .onDelete("SET NULL");
            table.boolean("enabled").notNullable().defaultTo(true);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "reliability_invariant_public_unique" });
            table.unique(["tenant_id", "invariant_key"], { indexName: "reliability_invariant_key_unique" });
            table.index(["tenant_id", "enabled", "severity"], "reliability_invariant_eval_idx");
        });

        this.schema.createTable("reliability_incidents", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table
                .bigInteger("invariant_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("reliability_invariants")
                .onDelete("CASCADE");
            table
                .bigInteger("remediation_policy_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("reliability_remediation_policies")
                .onDelete("SET NULL");
            table.string("status", 20).notNullable().defaultTo("open");
            table.string("severity", 16).notNullable();
            table.integer("failure_count").notNullable().defaultTo(0);
            table.integer("recovery_count").notNullable().defaultTo(0);
            table.jsonb("latest_evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("opened_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("last_observed_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("resolved_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "reliability_incident_public_unique" });
            table.index(["tenant_id", "status", "severity", "opened_at"], "reliability_incident_ops_idx");
        });

        this.schema.createTable("reliability_evaluations", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("invariant_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("reliability_invariants")
                .onDelete("CASCADE");
            table
                .bigInteger("incident_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("reliability_incidents")
                .onDelete("SET NULL");
            table.decimal("observed_value", 18, 6).notNullable();
            table.boolean("passed").notNullable();
            table.string("evidence_ref", 190).nullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("evaluated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "invariant_id", "evaluated_at"], "reliability_evaluation_history_idx");
        });

        this.schema.createTable("reliability_remediation_runs", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table
                .bigInteger("incident_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("reliability_incidents")
                .onDelete("CASCADE");
            table
                .bigInteger("policy_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("reliability_remediation_policies")
                .onDelete("RESTRICT");
            table.string("action_type", 48).notNullable();
            table.string("status", 20).notNullable().defaultTo("planned");
            table.string("risk_level", 16).notNullable();
            table.string("idempotency_key", 190).notNullable();
            table.jsonb("before_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("after_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("verification").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.text("error_message").nullable();
            table.bigInteger("executed_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("executed_at", { useTz: true }).nullable();
            table.timestamp("verified_at", { useTz: true }).nullable();
            table.timestamp("rolled_back_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "reliability_remediation_public_unique" });
            table.unique(["tenant_id", "idempotency_key"], { indexName: "reliability_remediation_idempotency_unique" });
            table.index(["tenant_id", "policy_id", "created_at"], "reliability_remediation_rate_idx");
        });

        this.schema.createTable("reliability_scorecards", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.timestamp("window_start_at", { useTz: true }).notNullable();
            table.timestamp("window_end_at", { useTz: true }).notNullable();
            table.integer("reliability_bps").notNullable();
            table.integer("evaluated_invariants").notNullable().defaultTo(0);
            table.integer("passing_invariants").notNullable().defaultTo(0);
            table.integer("open_incidents").notNullable().defaultTo(0);
            table.integer("auto_remediations").notNullable().defaultTo(0);
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "window_end_at"], "reliability_scorecard_history_idx");
        });

        const checks = [
            "ALTER TABLE reliability_remediation_policies ADD CONSTRAINT reliability_policy_risk_check CHECK (risk_level IN ('low','medium','high','critical'))",
            "ALTER TABLE reliability_remediation_policies ADD CONSTRAINT reliability_policy_action_check CHECK (action_type IN ('rollback_configuration','pause_experiment','disable_policy'))",
            "ALTER TABLE reliability_remediation_policies ADD CONSTRAINT reliability_policy_limits_check CHECK (cooldown_seconds >= 60 AND max_executions_per_hour BETWEEN 1 AND 12)",
            "ALTER TABLE reliability_remediation_policies ADD CONSTRAINT reliability_policy_auto_check CHECK (NOT auto_execute OR risk_level = 'low')",
            "ALTER TABLE reliability_invariants ADD CONSTRAINT reliability_invariant_severity_check CHECK (severity IN ('info','warning','critical'))",
            "ALTER TABLE reliability_invariants ADD CONSTRAINT reliability_invariant_source_check CHECK (source_kind IN ('synthetic_pass_rate','fulfillment_promise_accuracy','manual_metric'))",
            "ALTER TABLE reliability_invariants ADD CONSTRAINT reliability_invariant_operator_check CHECK (operator IN ('gte','lte','gt','lt','eq'))",
            "ALTER TABLE reliability_invariants ADD CONSTRAINT reliability_invariant_window_check CHECK (window_seconds BETWEEN 60 AND 604800 AND min_consecutive_failures BETWEEN 1 AND 20 AND recovery_consecutive_passes BETWEEN 1 AND 20)",
            "ALTER TABLE reliability_incidents ADD CONSTRAINT reliability_incident_status_check CHECK (status IN ('open','mitigating','monitoring','resolved','suppressed'))",
            "ALTER TABLE reliability_remediation_runs ADD CONSTRAINT reliability_remediation_status_check CHECK (status IN ('planned','executing','verifying','succeeded','failed','rolled_back','approval_required'))",
            "ALTER TABLE reliability_scorecards ADD CONSTRAINT reliability_scorecard_bps_check CHECK (reliability_bps BETWEEN 0 AND 10000)",
        ];
        for (const check of checks) this.schema.raw(check);

        for (const table of TABLES) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY ${table}_tenant_isolation ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
        }
    }

    async down() {
        this.schema.dropTable("reliability_scorecards");
        this.schema.dropTable("reliability_remediation_runs");
        this.schema.dropTable("reliability_evaluations");
        this.schema.dropTable("reliability_incidents");
        this.schema.dropTable("reliability_invariants");
        this.schema.dropTable("reliability_remediation_policies");
    }
}
