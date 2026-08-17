import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("governance_policy_versions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("policy_key", 128).notNullable();
            table.integer("version").notNullable();
            table.string("name", 180).notNullable();
            table.text("description").nullable();
            table.string("action_pattern", 180).notNullable().defaultTo("*");
            table.jsonb("scope").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("predicate").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("effect", 32).notNullable();
            table.integer("priority").notNullable().defaultTo(100);
            table.smallint("autonomy_ceiling").nullable();
            table.jsonb("limits").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.boolean("enabled").notNullable().defaultTo(true);
            table.timestamp("effective_from", { useTz: true }).nullable();
            table.timestamp("effective_until", { useTz: true }).nullable();
            table.bigInteger("owner_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.text("reason").notNullable();
            table.string("content_hash", 64).notNullable();
            table
                .bigInteger("supersedes_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("governance_policy_versions")
                .onDelete("RESTRICT");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "policy_key", "version"], { indexName: "governance_policy_versions_unique" });
            table.index(["tenant_id", "action_pattern", "priority"], "governance_policy_action_idx");
        });

        this.schema.createTable("governance_agent_principals", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("principal_key", 120).notNullable();
            table.string("name", 180).notNullable();
            table.bigInteger("owner_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.specificType("allowed_actions", "text[]").notNullable().defaultTo(this.raw("ARRAY[]::text[]"));
            table.specificType("prohibited_actions", "text[]").notNullable().defaultTo(this.raw("ARRAY[]::text[]"));
            table.specificType("data_access_classes", "text[]").notNullable().defaultTo(this.raw("ARRAY[]::text[]"));
            table.smallint("autonomy_level").notNullable().defaultTo(0);
            table.bigInteger("budget_limit_minor").nullable();
            table.string("budget_currency", 3).nullable();
            table.string("budget_period", 16).notNullable().defaultTo("monthly");
            table.bigInteger("budget_spent_minor").notNullable().defaultTo(0);
            table.timestamp("budget_resets_at", { useTz: true }).nullable();
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.boolean("enabled").notNullable().defaultTo(true);
            table.boolean("kill_switch").notNullable().defaultTo(false);
            table.integer("row_version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "principal_key"], { indexName: "governance_agent_principal_unique" });
            table.index(["tenant_id", "enabled", "kill_switch"], "governance_agent_status_idx");
        });

        this.schema.createTable("governance_approval_requests", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("reference", 80).notNullable();
            table.string("action_key", 180).notNullable();
            table.string("resource_type", 80).nullable();
            table.string("resource_id", 160).nullable();
            table.string("requester_type", 16).notNullable();
            table.bigInteger("requested_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table
                .bigInteger("requested_by_agent_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("governance_agent_principals")
                .onDelete("SET NULL");
            table.text("reason").notNullable();
            table.jsonb("safe_payload").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("request_hash", 64).notNullable();
            table.string("workflow_kind", 24).notNullable().defaultTo("single");
            table.boolean("separation_of_duties").notNullable().defaultTo(true);
            table.string("status", 24).notNullable().defaultTo("pending");
            table.integer("current_step").notNullable().defaultTo(0);
            table.integer("row_version").notNullable().defaultTo(1);
            table.timestamp("expires_at", { useTz: true }).notNullable();
            table.timestamp("approved_at", { useTz: true }).nullable();
            table.timestamp("rejected_at", { useTz: true }).nullable();
            table.timestamp("executed_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "reference"], { indexName: "governance_approval_reference_unique" });
            table.index(["tenant_id", "status", "expires_at"], "governance_approval_queue_idx");
        });

        this.schema.createTable("governance_approval_steps", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("request_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("governance_approval_requests")
                .onDelete("CASCADE");
            table.integer("step_index").notNullable();
            table.string("label", 160).notNullable();
            table.bigInteger("assigned_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("required_permission", 160).nullable();
            table.integer("escalate_after_minutes").nullable();
            table.string("escalation_permission", 160).nullable();
            table.integer("quorum").notNullable().defaultTo(1);
            table.string("status", 24).notNullable().defaultTo("pending");
            table.timestamp("completed_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "request_id", "step_index"], { indexName: "governance_approval_steps_unique" });
        });

        this.schema.createTable("governance_approval_decisions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("request_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("governance_approval_requests")
                .onDelete("CASCADE");
            table
                .bigInteger("step_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("governance_approval_steps")
                .onDelete("CASCADE");
            table.string("decision", 24).notNullable();
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("delegated_to_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("step_up_reference", 120).nullable();
            table.text("reason").notNullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "request_id", "created_at"], "governance_approval_decisions_idx");
        });

        this.schema.createTable("governance_ledger_heads", (table) => {
            table.bigInteger("tenant_id").unsigned().primary().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("last_sequence").notNullable().defaultTo(0);
            table.string("last_hash", 64).notNullable().defaultTo("0".repeat(64));
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
        });

        this.schema.createTable("governance_action_ledger", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("sequence").notNullable();
            table.uuid("event_id").notNullable();
            table.string("actor_type", 16).notNullable();
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table
                .bigInteger("actor_agent_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("governance_agent_principals")
                .onDelete("SET NULL");
            table.string("action_key", 180).notNullable();
            table.string("resource_type", 80).nullable();
            table.string("resource_id", 160).nullable();
            table.string("request_id", 120).nullable();
            table.string("correlation_id", 120).nullable();
            table.string("causation_id", 120).nullable();
            table.text("reason").notNullable();
            table.jsonb("evidence_refs").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("policy_decision").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("approval_references").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("before_hash", 64).nullable();
            table.string("after_hash", 64).nullable();
            table.jsonb("external_evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("result_status", 24).notNullable();
            table.jsonb("result").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("compensation").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("previous_hash", 64).notNullable();
            table.string("entry_hash", 64).notNullable();
            table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "sequence"], { indexName: "governance_ledger_sequence_unique" });
            table.unique(["tenant_id", "entry_hash"], { indexName: "governance_ledger_hash_unique" });
            table.index(["tenant_id", "action_key", "occurred_at"], "governance_ledger_action_idx");
        });

        this.schema.createTable("governance_shadow_observations", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("agent_principal_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("governance_agent_principals")
                .onDelete("SET NULL");
            table.string("action_key", 180).notNullable();
            table.smallint("autonomy_stage").notNullable().defaultTo(0);
            table.string("proposal_hash", 64).notNullable();
            table.jsonb("safe_proposal").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("policy_decision").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("human_decision", 24).nullable();
            table.jsonb("outcome").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("policy_digest", 64).nullable();
            table.integer("row_version").notNullable().defaultTo(1);
            table.timestamp("reviewed_at", { useTz: true }).nullable();
            table.bigInteger("reviewed_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.index(["tenant_id", "action_key", "created_at"], "governance_shadow_action_idx");
        });

        this.schema.raw(
            `ALTER TABLE governance_policy_versions ADD CONSTRAINT governance_policy_effect_check CHECK (effect IN ('allow','deny','require_approval','require_step_up','limit'))`,
        );
        this.schema.raw(
            `ALTER TABLE governance_policy_versions ADD CONSTRAINT governance_policy_autonomy_check CHECK (autonomy_ceiling IS NULL OR autonomy_ceiling BETWEEN 0 AND 5)`,
        );
        this.schema.raw(
            `ALTER TABLE governance_agent_principals ADD CONSTRAINT governance_agent_autonomy_check CHECK (autonomy_level BETWEEN 0 AND 5)`,
        );
        this.schema.raw(
            `ALTER TABLE governance_agent_principals ADD CONSTRAINT governance_agent_budget_check CHECK (budget_limit_minor IS NULL OR budget_limit_minor >= 0)`,
        );
        this.schema.raw(
            `ALTER TABLE governance_approval_requests ADD CONSTRAINT governance_approval_status_check CHECK (status IN ('pending','approved','rejected','expired','cancelled','executed'))`,
        );
        this.schema.raw(
            `ALTER TABLE governance_approval_decisions ADD CONSTRAINT governance_approval_decision_check CHECK (decision IN ('approve','reject','delegate','break_glass'))`,
        );
        this.schema.raw(
            `ALTER TABLE governance_action_ledger ADD CONSTRAINT governance_ledger_result_check CHECK (result_status IN ('proposed','allowed','denied','executed','failed','compensated'))`,
        );
        this.schema.raw(
            `ALTER TABLE governance_shadow_observations ADD CONSTRAINT governance_shadow_autonomy_check CHECK (autonomy_stage BETWEEN 0 AND 5)`,
        );

        for (const table of [
            "governance_policy_versions",
            "governance_agent_principals",
            "governance_approval_requests",
            "governance_approval_steps",
            "governance_approval_decisions",
            "governance_ledger_heads",
            "governance_action_ledger",
            "governance_shadow_observations",
        ]) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY tenant_isolation ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
        }

        this.schema.raw(
            `CREATE OR REPLACE FUNCTION calibra_forbid_governance_history_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'append-only governance record cannot be modified'; END; $$ LANGUAGE plpgsql`,
        );
        for (const table of ["governance_policy_versions", "governance_approval_decisions", "governance_action_ledger"]) {
            this.schema.raw(
                `CREATE TRIGGER ${table}_append_only BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION calibra_forbid_governance_history_mutation()`,
            );
        }
    }

    async down() {
        for (const table of ["governance_policy_versions", "governance_approval_decisions", "governance_action_ledger"]) {
            this.schema.raw(`DROP TRIGGER IF EXISTS ${table}_append_only ON ${table}`);
        }
        this.schema.dropTable("governance_shadow_observations");
        this.schema.dropTable("governance_action_ledger");
        this.schema.dropTable("governance_ledger_heads");
        this.schema.dropTable("governance_approval_decisions");
        this.schema.dropTable("governance_approval_steps");
        this.schema.dropTable("governance_approval_requests");
        this.schema.dropTable("governance_agent_principals");
        this.schema.dropTable("governance_policy_versions");
        this.schema.raw("DROP FUNCTION IF EXISTS calibra_forbid_governance_history_mutation() CASCADE");
    }
}
