import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";
const UUID_DEFAULT = `(substr(md5(random()::text || clock_timestamp()::text),1,8)||'-'||substr(md5(random()::text || clock_timestamp()::text),1,4)||'-4'||substr(md5(random()::text || clock_timestamp()::text),1,3)||'-a'||substr(md5(random()::text || clock_timestamp()::text),1,3)||'-'||substr(md5(random()::text || clock_timestamp()::text),1,12))::uuid`;
const NEW_RLS_TABLES = ["fraud_relationship_edges", "fraud_case_evidence", "fraud_policy_versions", "fraud_outcomes"] as const;
const EXISTING_RLS_TABLES = [
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

function deterministicUuidSql(table: string) {
    return `UPDATE ${table} SET public_id = (substr(md5(tenant_id::text || ':' || id::text || ':phase20'),1,8)||'-'||substr(md5(tenant_id::text || ':' || id::text || ':phase20'),9,4)||'-'||substr(md5(tenant_id::text || ':' || id::text || ':phase20'),13,4)||'-'||substr(md5(tenant_id::text || ':' || id::text || ':phase20'),17,4)||'-'||substr(md5(tenant_id::text || ':' || id::text || ':phase20'),21,12))::uuid WHERE public_id IS NULL`;
}

export default class extends BaseSchema {
    async up() {
        this.schema.alterTable("fraud_signals", (t) => {
            t.uuid("public_id").nullable();
            t.string("event_id", 160).nullable();
            t.integer("schema_version").notNullable().defaultTo(1);
            t.string("event_type", 160).nullable();
            t.string("source", 80).nullable();
            t.string("source_ref", 190).nullable();
            t.string("correlation_id", 160).nullable();
            t.string("causation_id", 160).nullable();
            t.string("session_ref", 160).nullable();
            t.jsonb("consent_context").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.string("signal_type", 120).nullable();
            t.string("risk_band", 24).nullable();
            t.integer("score_delta").nullable();
            t.integer("confidence_bp").nullable();
            t.string("privacy_classification", 48).notNullable().defaultTo("internal");
            t.string("rule_key", 120).nullable();
            t.integer("rule_version").nullable();
            t.string("model_id", 120).nullable();
            t.string("model_version", 80).nullable();
            t.timestamp("occurred_at", { useTz: true }).nullable();
            t.timestamp("received_at", { useTz: true }).notNullable().defaultTo(this.now());
        });
        this.schema.raw(deterministicUuidSql("fraud_signals"));
        this.schema.raw(
            `UPDATE fraud_signals SET occurred_at=COALESCE(occurred_at,observed_at), received_at=COALESCE(received_at,created_at,observed_at)`,
        );
        this.schema.raw(`ALTER TABLE fraud_signals ALTER COLUMN public_id SET DEFAULT ${UUID_DEFAULT}`);
        this.schema.raw(`ALTER TABLE fraud_signals ALTER COLUMN public_id SET NOT NULL`);
        this.schema.raw(`CREATE UNIQUE INDEX fraud_signals_public_id_unique ON fraud_signals(public_id)`);
        this.schema.raw(
            `CREATE UNIQUE INDEX fraud_signals_event_unique ON fraud_signals(tenant_id,event_id) WHERE event_id IS NOT NULL`,
        );
        this.schema.raw(`CREATE INDEX fraud_signals_risk_idx ON fraud_signals(tenant_id,risk_band,observed_at)`);

        this.schema.alterTable("fraud_cases", (t) => {
            t.uuid("public_id").nullable();
            t.bigInteger("order_id").unsigned().nullable().references("id").inTable("orders").onDelete("SET NULL");
            t.bigInteger("refund_id").unsigned().nullable().references("id").inTable("order_refunds").onDelete("SET NULL");
            t.bigInteger("ticket_id").unsigned().nullable().references("id").inTable("support_tickets").onDelete("SET NULL");
            t.bigInteger("coupon_id").unsigned().nullable().references("id").inTable("coupons").onDelete("SET NULL");
            t.string("pattern", 120).nullable();
            t.string("title", 240).nullable();
            t.integer("risk_score").notNullable().defaultTo(0);
            t.string("risk_band", 24).nullable();
            t.integer("confidence_bp").nullable();
            t.integer("false_positive_risk_bp").nullable();
            t.string("recommended_action", 32).nullable();
            t.string("policy_key", 120).nullable();
            t.integer("policy_version").nullable();
            t.string("model_id", 120).nullable();
            t.string("model_version", 80).nullable();
            t.integer("version").notNullable().defaultTo(1);
            t.timestamp("sla_due_at", { useTz: true }).nullable();
            t.timestamp("resolved_at", { useTz: true }).nullable();
        });
        this.schema.raw(deterministicUuidSql("fraud_cases"));
        this.schema.raw(
            `UPDATE fraud_cases c SET risk_score=LEAST(100,GREATEST(0,ROUND(s.score::numeric/10))), risk_band=CASE s.band WHEN 'critical' THEN 'severe' WHEN 'high' THEN 'high' WHEN 'medium' THEN 'medium' ELSE 'low' END, recommended_action=CASE s.band WHEN 'critical' THEN 'block' WHEN 'high' THEN 'hold' WHEN 'medium' THEN 'monitor' ELSE 'monitor' END, pattern=COALESCE(c.pattern,'legacy_risk_decision'), title=COALESCE(c.title,c.summary,'Trust review case') FROM fraud_decisions d JOIN fraud_risk_scores s ON s.id=d.risk_score_id WHERE c.decision_id=d.id`,
        );
        this.schema.raw(
            `UPDATE fraud_cases SET risk_band=COALESCE(risk_band,'medium'), recommended_action=COALESCE(recommended_action,'monitor'), pattern=COALESCE(pattern,'manual_review'), title=COALESCE(title,summary,'Trust review case')`,
        );
        this.schema.raw(`ALTER TABLE fraud_cases ALTER COLUMN public_id SET DEFAULT ${UUID_DEFAULT}`);
        this.schema.raw(`ALTER TABLE fraud_cases ALTER COLUMN public_id SET NOT NULL`);
        this.schema.raw(`CREATE UNIQUE INDEX fraud_cases_public_id_unique ON fraud_cases(public_id)`);
        this.schema.raw(`ALTER TABLE fraud_cases DROP CONSTRAINT IF EXISTS fraud_case_status_check`);
        this.schema.raw(
            `ALTER TABLE fraud_cases ADD CONSTRAINT fraud_case_status_check CHECK (status IN ('open','investigating','waiting','in_review','waiting_step_up','held','resolved','closed','dismissed','appealed'))`,
        );
        this.schema.raw(`ALTER TABLE fraud_cases ADD CONSTRAINT fraud_case_version_check CHECK (version >= 1)`);
        this.schema.raw(
            `ALTER TABLE fraud_cases ADD CONSTRAINT fraud_case_risk_score_check CHECK (risk_score BETWEEN 0 AND 100)`,
        );
        this.schema.raw(
            `ALTER TABLE fraud_cases ADD CONSTRAINT fraud_case_confidence_check CHECK (confidence_bp IS NULL OR confidence_bp BETWEEN 0 AND 10000)`,
        );
        this.schema.raw(
            `ALTER TABLE fraud_cases ADD CONSTRAINT fraud_case_fp_risk_check CHECK (false_positive_risk_bp IS NULL OR false_positive_risk_bp BETWEEN 0 AND 10000)`,
        );
        this.schema.raw(`CREATE INDEX fraud_cases_queue_v2_idx ON fraud_cases(tenant_id,status,risk_score,updated_at)`);

        this.schema.alterTable("fraud_decisions", (t) => {
            t.uuid("public_id").nullable();
            t.bigInteger("case_id").unsigned().nullable().references("id").inTable("fraud_cases").onDelete("CASCADE");
            t.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.bigInteger("previous_decision_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("fraud_decisions")
                .onDelete("SET NULL");
            t.string("reason_code", 100).nullable();
            t.text("reason").nullable();
            t.boolean("is_override").notNullable().defaultTo(false);
            t.jsonb("alternatives").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            t.jsonb("evidence_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.jsonb("policy_evaluation").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.jsonb("approval_chain").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            t.string("correlation_id", 160).nullable();
        });
        this.schema.raw(deterministicUuidSql("fraud_decisions"));
        this.schema.raw(`ALTER TABLE fraud_decisions ALTER COLUMN public_id SET DEFAULT ${UUID_DEFAULT}`);
        this.schema.raw(`ALTER TABLE fraud_decisions ALTER COLUMN public_id SET NOT NULL`);
        this.schema.raw(`CREATE UNIQUE INDEX fraud_decisions_public_id_unique ON fraud_decisions(public_id)`);
        this.schema.raw(`ALTER TABLE fraud_decisions DROP CONSTRAINT IF EXISTS fraud_decision_check`);
        this.schema.raw(
            `ALTER TABLE fraud_decisions ADD CONSTRAINT fraud_decision_check CHECK (decision IN ('allow','review','challenge','hold','block','monitor','step_up','dismiss'))`,
        );
        this.schema.raw(`CREATE INDEX fraud_decisions_case_idx ON fraud_decisions(tenant_id,case_id,created_at)`);

        this.schema.alterTable("fraud_action_executions", (t) => {
            t.uuid("public_id").nullable();
            t.bigInteger("case_id").unsigned().nullable().references("id").inTable("fraud_cases").onDelete("CASCADE");
            t.string("risk_class", 32).nullable();
            t.string("required_permission", 120).nullable();
            t.string("autonomy_ceiling", 48).nullable();
            t.boolean("dry_run").notNullable().defaultTo(false);
            t.boolean("reversible").notNullable().defaultTo(false);
            t.text("rollback_plan").nullable();
            t.jsonb("input_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.jsonb("policy_result").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.jsonb("result").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.jsonb("external_refs").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.jsonb("verification").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.string("error_code", 120).nullable();
            t.text("error_message").nullable();
        });
        this.schema.raw(deterministicUuidSql("fraud_action_executions"));
        this.schema.raw(`ALTER TABLE fraud_action_executions ALTER COLUMN public_id SET DEFAULT ${UUID_DEFAULT}`);
        this.schema.raw(`ALTER TABLE fraud_action_executions ALTER COLUMN public_id SET NOT NULL`);
        this.schema.raw(`CREATE UNIQUE INDEX fraud_action_public_id_unique ON fraud_action_executions(public_id)`);
        this.schema.raw(`CREATE INDEX fraud_action_case_idx ON fraud_action_executions(tenant_id,case_id,executed_at)`);

        this.schema.alterTable("fraud_risk_model_versions", (t) => {
            t.uuid("public_id").nullable();
            t.integer("rollout_percent").notNullable().defaultTo(0);
            t.jsonb("features").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            t.jsonb("privacy_controls").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.jsonb("evaluation").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.jsonb("calibration").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.jsonb("deployment").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.jsonb("limitations_json").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            t.string("rollback_version", 80).nullable();
            t.timestamp("last_evaluated_at", { useTz: true }).nullable();
        });
        this.schema.raw(deterministicUuidSql("fraud_risk_model_versions"));
        this.schema.raw(`ALTER TABLE fraud_risk_model_versions ALTER COLUMN public_id SET DEFAULT ${UUID_DEFAULT}`);
        this.schema.raw(`ALTER TABLE fraud_risk_model_versions ALTER COLUMN public_id SET NOT NULL`);
        this.schema.raw(`CREATE UNIQUE INDEX fraud_model_version_public_id_unique ON fraud_risk_model_versions(public_id)`);
        this.schema.raw(`ALTER TABLE fraud_risk_model_versions DROP CONSTRAINT IF EXISTS fraud_model_deployment_check`);
        this.schema.raw(
            `ALTER TABLE fraud_risk_model_versions ADD CONSTRAINT fraud_model_deployment_check CHECK (deployment_state IN ('draft','shadow','candidate','challenger','champion','rollback_ready','disabled','retired'))`,
        );
        this.schema.raw(
            `ALTER TABLE fraud_risk_model_versions ADD CONSTRAINT fraud_model_rollout_check CHECK (rollout_percent BETWEEN 0 AND 100)`,
        );
        this.schema.raw(
            `WITH ranked AS (SELECT v.id, ROW_NUMBER() OVER (PARTITION BY v.tenant_id,m.purpose ORDER BY v.validated_at DESC NULLS LAST,v.updated_at DESC,v.id DESC) AS rn FROM fraud_risk_model_versions v JOIN fraud_risk_models m ON m.id=v.risk_model_id WHERE v.deployment_state='champion') UPDATE fraud_risk_model_versions SET deployment_state='rollback_ready', rollout_percent=0 WHERE id IN (SELECT id FROM ranked WHERE rn>1)`,
        );

        this.schema.createTable("fraud_relationship_edges", (t) => {
            t.bigIncrements("id");
            t.uuid("public_id").notNullable().unique();
            t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.string("source_type", 48).notNullable();
            t.string("source_id", 190).notNullable();
            t.string("target_type", 48).notNullable();
            t.string("target_id", 190).notNullable();
            t.string("relationship", 100).notNullable();
            t.boolean("is_inferred").notNullable().defaultTo(false);
            t.integer("confidence_bp").notNullable().defaultTo(10000);
            t.string("provenance_type", 80).notNullable();
            t.string("provenance_ref", 190).nullable();
            t.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.timestamp("valid_from", { useTz: true }).notNullable().defaultTo(this.now());
            t.timestamp("valid_to", { useTz: true }).nullable();
            t.timestamp("last_observed_at", { useTz: true }).notNullable().defaultTo(this.now());
            t.timestamps(true, true);
            t.unique(["tenant_id", "source_type", "source_id", "target_type", "target_id", "relationship"], {
                indexName: "fraud_relationship_edges_identity_unique",
            });
            t.index(["tenant_id", "source_type", "source_id"], "fraud_relationship_edges_source_idx");
            t.index(["tenant_id", "target_type", "target_id"], "fraud_relationship_edges_target_idx");
        });
        this.schema.raw(
            `ALTER TABLE fraud_relationship_edges ADD CONSTRAINT fraud_relationship_edge_confidence_check CHECK (confidence_bp BETWEEN 0 AND 10000)`,
        );

        this.schema.createTable("fraud_case_evidence", (t) => {
            t.bigIncrements("id");
            t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.bigInteger("case_id").unsigned().notNullable().references("id").inTable("fraud_cases").onDelete("CASCADE");
            t.bigInteger("signal_id").unsigned().nullable().references("id").inTable("fraud_signals").onDelete("SET NULL");
            t.bigInteger("edge_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("fraud_relationship_edges")
                .onDelete("SET NULL");
            t.string("evidence_type", 64).notNullable();
            t.string("evidence_ref", 190).nullable();
            t.integer("weight").notNullable().defaultTo(0);
            t.string("summary", 500).notNullable();
            t.boolean("is_sensitive").notNullable().defaultTo(false);
            t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            t.index(["tenant_id", "case_id", "created_at"], "fraud_case_evidence_case_idx");
        });

        this.schema.createTable("fraud_policy_versions", (t) => {
            t.bigIncrements("id");
            t.uuid("public_id").notNullable().unique();
            t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.string("policy_key", 120).notNullable();
            t.integer("version").notNullable();
            t.string("status", 24).notNullable().defaultTo("draft");
            t.jsonb("scope").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.jsonb("conditions").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            t.string("effect", 32).notNullable();
            t.boolean("approval_required").notNullable().defaultTo(false);
            t.text("reason").notNullable();
            t.bigInteger("owner_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.timestamp("effective_from", { useTz: true }).nullable();
            t.timestamp("effective_to", { useTz: true }).nullable();
            t.timestamps(true, true);
            t.unique(["tenant_id", "policy_key", "version"], { indexName: "fraud_policy_versions_unique" });
            t.index(["tenant_id", "policy_key", "status"], "fraud_policy_versions_status_idx");
        });
        this.schema.raw(
            `ALTER TABLE fraud_policy_versions ADD CONSTRAINT fraud_policy_status_check CHECK (status IN ('draft','active','paused','retired'))`,
        );
        this.schema.raw(
            `ALTER TABLE fraud_policy_versions ADD CONSTRAINT fraud_policy_effect_check CHECK (effect IN ('allow','monitor','step_up','hold','block'))`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX fraud_policy_single_active_idx ON fraud_policy_versions(tenant_id,policy_key) WHERE status='active'`,
        );

        this.schema.createTable("fraud_outcomes", (t) => {
            t.bigIncrements("id");
            t.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.bigInteger("case_id").unsigned().notNullable().references("id").inTable("fraud_cases").onDelete("CASCADE");
            t.bigInteger("decision_id").unsigned().nullable().references("id").inTable("fraud_decisions").onDelete("SET NULL");
            t.string("outcome", 48).notNullable();
            t.boolean("is_false_positive").nullable();
            t.string("appeal_outcome", 48).nullable();
            t.jsonb("baseline").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.bigInteger("predicted_p10_minor").nullable();
            t.bigInteger("predicted_p50_minor").nullable();
            t.bigInteger("predicted_p90_minor").nullable();
            t.bigInteger("actual_loss_minor").nullable();
            t.bigInteger("incremental_effect_minor").nullable();
            t.bigInteger("prevented_loss_minor").nullable();
            t.jsonb("guardrails").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            t.string("final_assessment", 80).nullable();
            t.integer("measurement_confidence_bp").notNullable();
            t.jsonb("unexpected_effects").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            t.text("notes").nullable();
            t.bigInteger("recorded_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            t.index(["tenant_id", "case_id", "created_at"], "fraud_outcomes_case_idx");
            t.index(["tenant_id", "is_false_positive", "created_at"], "fraud_outcomes_fp_idx");
        });
        this.schema.raw(
            `ALTER TABLE fraud_outcomes ADD CONSTRAINT fraud_outcome_confidence_check CHECK (measurement_confidence_bp BETWEEN 0 AND 10000)`,
        );
        this.schema.raw(
            `ALTER TABLE fraud_outcomes ADD CONSTRAINT fraud_outcome_money_nonnegative_check CHECK ((predicted_p10_minor IS NULL OR predicted_p10_minor >= 0) AND (predicted_p50_minor IS NULL OR predicted_p50_minor >= 0) AND (predicted_p90_minor IS NULL OR predicted_p90_minor >= 0) AND (actual_loss_minor IS NULL OR actual_loss_minor >= 0) AND (prevented_loss_minor IS NULL OR prevented_loss_minor >= 0))`,
        );

        for (const table of [...EXISTING_RLS_TABLES, ...NEW_RLS_TABLES]) {
            this.schema.raw(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT ${TENANT.replace("tenant_id = ", "")}`);
        }
        for (const table of NEW_RLS_TABLES) {
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY ${table}_tenant_policy ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
        }
    }

    async down() {
        for (const table of [...NEW_RLS_TABLES].reverse()) this.schema.dropTable(table);

        // Normalize values introduced by the hardening migration before restoring the original checks.
        this.schema.raw(
            `UPDATE fraud_risk_model_versions SET deployment_state=CASE deployment_state WHEN 'challenger' THEN 'candidate' WHEN 'rollback_ready' THEN 'retired' WHEN 'disabled' THEN 'retired' ELSE deployment_state END`,
        );
        this.schema.raw(
            `UPDATE fraud_cases SET status=CASE status WHEN 'in_review' THEN 'investigating' WHEN 'waiting_step_up' THEN 'waiting' WHEN 'held' THEN 'waiting' WHEN 'dismissed' THEN 'closed' WHEN 'appealed' THEN 'investigating' ELSE status END`,
        );
        this.schema.raw(
            `UPDATE fraud_decisions SET decision=CASE decision WHEN 'monitor' THEN 'review' WHEN 'step_up' THEN 'challenge' WHEN 'dismiss' THEN 'allow' ELSE decision END`,
        );

        this.schema.raw(`ALTER TABLE fraud_risk_model_versions DROP CONSTRAINT IF EXISTS fraud_model_rollout_check`);
        this.schema.raw(`ALTER TABLE fraud_risk_model_versions DROP CONSTRAINT IF EXISTS fraud_model_deployment_check`);
        this.schema.raw(
            `ALTER TABLE fraud_risk_model_versions ADD CONSTRAINT fraud_model_deployment_check CHECK (deployment_state IN ('draft','shadow','candidate','champion','retired'))`,
        );
        this.schema.alterTable("fraud_risk_model_versions", (t) => {
            for (const column of [
                "last_evaluated_at",
                "rollback_version",
                "limitations_json",
                "deployment",
                "calibration",
                "evaluation",
                "privacy_controls",
                "features",
                "rollout_percent",
                "public_id",
            ])
                t.dropColumn(column);
        });

        this.schema.alterTable("fraud_action_executions", (t) => {
            for (const column of [
                "error_message",
                "error_code",
                "verification",
                "external_refs",
                "result",
                "policy_result",
                "input_snapshot",
                "rollback_plan",
                "reversible",
                "dry_run",
                "autonomy_ceiling",
                "required_permission",
                "risk_class",
                "case_id",
                "public_id",
            ])
                t.dropColumn(column);
        });

        this.schema.raw(`ALTER TABLE fraud_decisions DROP CONSTRAINT IF EXISTS fraud_decision_check`);
        this.schema.raw(
            `ALTER TABLE fraud_decisions ADD CONSTRAINT fraud_decision_check CHECK (decision IN ('allow','review','challenge','hold','block'))`,
        );
        this.schema.alterTable("fraud_decisions", (t) => {
            for (const column of [
                "correlation_id",
                "approval_chain",
                "policy_evaluation",
                "evidence_snapshot",
                "alternatives",
                "is_override",
                "reason",
                "reason_code",
                "previous_decision_id",
                "actor_user_id",
                "case_id",
                "public_id",
            ])
                t.dropColumn(column);
        });

        this.schema.raw(`ALTER TABLE fraud_cases DROP CONSTRAINT IF EXISTS fraud_case_version_check`);
        this.schema.raw(`ALTER TABLE fraud_cases DROP CONSTRAINT IF EXISTS fraud_case_risk_score_check`);
        this.schema.raw(`ALTER TABLE fraud_cases DROP CONSTRAINT IF EXISTS fraud_case_confidence_check`);
        this.schema.raw(`ALTER TABLE fraud_cases DROP CONSTRAINT IF EXISTS fraud_case_fp_risk_check`);
        this.schema.raw(`ALTER TABLE fraud_cases DROP CONSTRAINT IF EXISTS fraud_case_status_check`);
        this.schema.raw(
            `ALTER TABLE fraud_cases ADD CONSTRAINT fraud_case_status_check CHECK (status IN ('open','investigating','waiting','resolved','closed'))`,
        );
        this.schema.alterTable("fraud_cases", (t) => {
            for (const column of [
                "resolved_at",
                "sla_due_at",
                "version",
                "model_version",
                "model_id",
                "policy_version",
                "policy_key",
                "recommended_action",
                "false_positive_risk_bp",
                "confidence_bp",
                "risk_band",
                "risk_score",
                "title",
                "pattern",
                "coupon_id",
                "ticket_id",
                "refund_id",
                "order_id",
                "public_id",
            ])
                t.dropColumn(column);
        });

        this.schema.alterTable("fraud_signals", (t) => {
            for (const column of [
                "received_at",
                "model_version",
                "model_id",
                "rule_version",
                "rule_key",
                "privacy_classification",
                "confidence_bp",
                "score_delta",
                "risk_band",
                "signal_type",
                "consent_context",
                "session_ref",
                "causation_id",
                "correlation_id",
                "source_ref",
                "source",
                "event_type",
                "schema_version",
                "event_id",
                "public_id",
            ])
                t.dropColumn(column);
        });

        for (const table of EXISTING_RLS_TABLES) this.schema.raw(`ALTER TABLE ${table} ALTER COLUMN tenant_id DROP DEFAULT`);
    }
}
