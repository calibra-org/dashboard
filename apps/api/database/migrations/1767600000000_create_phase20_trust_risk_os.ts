import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";
const TABLES = [
    "fraud_risk_models",
    "fraud_risk_model_versions",
    "fraud_signals",
    "fraud_risk_scores",
    "fraud_decisions",
    "fraud_action_executions",
    "fraud_cases",
    "fraud_case_events",
    "fraud_subject_controls",
] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("fraud_risk_models", (t) => {
            t.bigIncrements("id");
            t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.string("model_id", 120).notNullable();
            t.string("purpose", 160).notNullable().defaultTo("commerce_fraud");
            t.string("owner", 160).nullable();
            t.text("description").nullable();
            t.string("status", 24).notNullable().defaultTo("active");
            t.timestamps(true, true);
            t.unique(["tenant_id", "model_id"]);
            t.index(["tenant_id", "status"]);
        });
        this.schema.createTable("fraud_risk_model_versions", (t) => {
            t.bigIncrements("id");
            t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.bigInteger("risk_model_id").unsigned().notNullable().references("id").inTable("fraud_risk_models").onDelete("CASCADE");
            t.string("version", 80).notNullable();
            t.string("deployment_state", 24).notNullable().defaultTo("draft");
            t.jsonb("thresholds").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.jsonb("weights").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.jsonb("validation_metrics").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.text("known_limitations").nullable();
            t.timestamp("validated_at", { useTz: true }).nullable();
            t.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.timestamps(true, true);
            t.unique(["tenant_id", "risk_model_id", "version"]);
            t.index(["tenant_id", "risk_model_id", "deployment_state"]);
        });
        this.schema.createTable("fraud_signals", (t) => {
            t.bigIncrements("id");
            t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.string("subject_type", 40).notNullable(); t.string("subject_id", 160).notNullable(); t.string("code", 120).notNullable();
            t.string("severity", 16).notNullable().defaultTo("medium"); t.decimal("value", 12, 4).notNullable().defaultTo(1);
            t.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb")); t.string("dedupe_key", 180).nullable();
            t.timestamp("observed_at", { useTz: true }).notNullable().defaultTo(this.now()); t.timestamp("expires_at", { useTz: true }).nullable(); t.timestamps(true, true);
            t.unique(["tenant_id", "dedupe_key"]); t.index(["tenant_id", "subject_type", "subject_id", "observed_at"]); t.index(["tenant_id", "code", "severity", "observed_at"]);
        });
        this.schema.createTable("fraud_risk_scores", (t) => {
            t.bigIncrements("id"); t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.string("subject_type", 40).notNullable(); t.string("subject_id", 160).notNullable();
            t.bigInteger("model_version_id").unsigned().nullable().references("id").inTable("fraud_risk_model_versions").onDelete("SET NULL");
            t.integer("score").notNullable(); t.string("band", 16).notNullable(); t.jsonb("reason_codes_json").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            t.jsonb("evidence_summary").notNullable().defaultTo(this.raw("'{}'::jsonb")); t.string("idempotency_key", 180).nullable();
            t.timestamp("evaluated_at", { useTz: true }).notNullable().defaultTo(this.now()); t.timestamps(true, true);
            t.unique(["tenant_id", "idempotency_key"]); t.index(["tenant_id", "subject_type", "subject_id", "evaluated_at"]); t.index(["tenant_id", "band", "evaluated_at"]);
        });
        this.schema.createTable("fraud_decisions", (t) => {
            t.bigIncrements("id"); t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.bigInteger("risk_score_id").unsigned().notNullable().references("id").inTable("fraud_risk_scores").onDelete("CASCADE");
            t.string("subject_type", 40).notNullable(); t.string("subject_id", 160).notNullable(); t.string("decision", 24).notNullable(); t.string("policy_version", 80).notNullable().defaultTo("rule-v1");
            t.jsonb("reason_codes_json").notNullable().defaultTo(this.raw("'[]'::jsonb")); t.string("idempotency_key", 180).nullable(); t.timestamp("expires_at", { useTz: true }).nullable(); t.timestamps(true, true);
            t.unique(["tenant_id", "idempotency_key"]); t.index(["tenant_id", "subject_type", "subject_id", "created_at"]); t.index(["tenant_id", "decision", "created_at"]);
        });
        this.schema.createTable("fraud_action_executions", (t) => {
            t.bigIncrements("id"); t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.bigInteger("decision_id").unsigned().nullable().references("id").inTable("fraud_decisions").onDelete("SET NULL"); t.string("action", 80).notNullable(); t.string("status", 24).notNullable().defaultTo("completed");
            t.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL"); t.string("idempotency_key", 180).nullable();
            t.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb")); t.timestamp("executed_at", { useTz: true }).notNullable().defaultTo(this.now()); t.timestamps(true, true);
            t.unique(["tenant_id", "idempotency_key"]); t.index(["tenant_id", "action", "executed_at"]);
        });
        this.schema.createTable("fraud_cases", (t) => {
            t.bigIncrements("id"); t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE"); t.string("case_number", 80).notNullable();
            t.string("subject_type", 40).notNullable(); t.string("subject_id", 160).notNullable(); t.bigInteger("decision_id").unsigned().nullable().references("id").inTable("fraud_decisions").onDelete("SET NULL");
            t.string("status", 24).notNullable().defaultTo("open"); t.string("priority", 16).notNullable().defaultTo("medium"); t.bigInteger("assignee_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.text("summary").nullable(); t.text("resolution").nullable(); t.timestamp("opened_at", { useTz: true }).notNullable().defaultTo(this.now()); t.timestamp("closed_at", { useTz: true }).nullable(); t.timestamps(true, true);
            t.unique(["tenant_id", "case_number"]); t.index(["tenant_id", "status", "priority", "opened_at"]); t.index(["tenant_id", "subject_type", "subject_id"]);
        });
        this.schema.createTable("fraud_case_events", (t) => {
            t.bigIncrements("id"); t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE"); t.bigInteger("case_id").unsigned().notNullable().references("id").inTable("fraud_cases").onDelete("CASCADE");
            t.string("event_type", 60).notNullable(); t.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL"); t.text("note").nullable(); t.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now()); t.index(["tenant_id", "case_id", "created_at"]);
        });
        this.schema.createTable("fraud_subject_controls", (t) => {
            t.bigIncrements("id"); t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE"); t.string("subject_type", 40).notNullable(); t.string("subject_id", 160).notNullable();
            t.string("control", 32).notNullable(); t.string("status", 16).notNullable().defaultTo("active"); t.text("reason").notNullable(); t.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.string("idempotency_key", 180).nullable(); t.timestamp("expires_at", { useTz: true }).nullable(); t.timestamps(true, true); t.unique(["tenant_id", "idempotency_key"]); t.index(["tenant_id", "subject_type", "subject_id", "status"]);
        });
        for (const sql of [
            `ALTER TABLE fraud_risk_models ADD CONSTRAINT fraud_risk_models_status_check CHECK (status IN ('active','paused','retired'))`,
            `ALTER TABLE fraud_risk_model_versions ADD CONSTRAINT fraud_model_deployment_check CHECK (deployment_state IN ('draft','shadow','candidate','champion','retired'))`,
            `ALTER TABLE fraud_signals ADD CONSTRAINT fraud_signal_severity_check CHECK (severity IN ('low','medium','high','critical'))`,
            `ALTER TABLE fraud_risk_scores ADD CONSTRAINT fraud_score_range_check CHECK (score BETWEEN 0 AND 1000)`,
            `ALTER TABLE fraud_risk_scores ADD CONSTRAINT fraud_score_band_check CHECK (band IN ('low','medium','high','critical'))`,
            `ALTER TABLE fraud_decisions ADD CONSTRAINT fraud_decision_check CHECK (decision IN ('allow','review','challenge','hold','block'))`,
            `ALTER TABLE fraud_cases ADD CONSTRAINT fraud_case_status_check CHECK (status IN ('open','investigating','waiting','resolved','closed'))`,
            `ALTER TABLE fraud_cases ADD CONSTRAINT fraud_case_priority_check CHECK (priority IN ('low','medium','high','critical'))`,
            `ALTER TABLE fraud_subject_controls ADD CONSTRAINT fraud_control_check CHECK (control IN ('block','challenge','review','allow_override'))`,
            `ALTER TABLE fraud_subject_controls ADD CONSTRAINT fraud_control_status_check CHECK (status IN ('active','released','expired'))`,
            `CREATE UNIQUE INDEX fraud_model_single_champion_idx ON fraud_risk_model_versions (tenant_id, risk_model_id) WHERE deployment_state = 'champion'`,
        ]) this.schema.raw(sql);
        for (const table of TABLES) this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
        for (const table of TABLES) this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
        for (const table of TABLES) this.schema.raw(`CREATE POLICY ${table}_tenant_policy ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
    }
    async down() { for (const table of [...TABLES].reverse()) this.schema.dropTable(table); }
}
