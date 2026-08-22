import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    private tables = [
        "agent_identities",
        "agent_tool_registry",
        "agent_plans",
        "agent_plan_steps",
        "agent_conflicts",
        "agent_approvals",
        "agent_tool_runs",
        "agent_outcome_hooks",
    ];
    async up() {
        this.schema.createTable("agent_identities", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.string("agent_key", 96).notNullable();
            t.string("display_name", 160).notNullable();
            t.string("specialty", 64).notNullable();
            t.jsonb("scopes").notNullable().defaultTo("[]");
            t.integer("budget_minor").notNullable().defaultTo(0);
            t.boolean("is_active").notNullable().defaultTo(true);
            t.boolean("kill_switch").notNullable().defaultTo(false);
            t.integer("version").notNullable().defaultTo(1);
            t.integer("created_by_user_id").unsigned().nullable();
            t.timestamp("created_at", { useTz: true }).notNullable();
            t.timestamp("updated_at", { useTz: true }).notNullable();
            t.unique(["tenant_id", "agent_key"]);
        });
        this.schema.createTable("agent_tool_registry", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.string("tool_key", 128).notNullable();
            t.integer("version").notNullable().defaultTo(1);
            t.string("handler_key", 128).notNullable();
            t.jsonb("input_schema").notNullable();
            t.jsonb("output_schema").notNullable();
            t.jsonb("required_scopes").notNullable().defaultTo("[]");
            t.string("required_permission", 128).nullable();
            t.string("risk_class", 24).notNullable().defaultTo("read_only");
            t.boolean("supports_dry_run").notNullable().defaultTo(true);
            t.boolean("reversible").notNullable().defaultTo(false);
            t.text("rollback_plan").nullable();
            t.boolean("approval_required").notNullable().defaultTo(false);
            t.jsonb("side_effects").notNullable().defaultTo("[]");
            t.boolean("is_active").notNullable().defaultTo(true);
            t.integer("created_by_user_id").unsigned().nullable();
            t.timestamp("created_at", { useTz: true }).notNullable();
            t.unique(["tenant_id", "tool_key", "version"]);
        });
        this.schema.createTable("agent_plans", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.integer("agent_identity_id").unsigned().notNullable().references("id").inTable("agent_identities");
            t.string("status", 32).notNullable().defaultTo("draft");
            t.text("goal").notNullable();
            t.jsonb("context_snapshot").notNullable();
            t.jsonb("constraints").notNullable();
            t.jsonb("evidence").notNullable();
            t.jsonb("options").notNullable();
            t.jsonb("expected_outcomes").notNullable();
            t.jsonb("risk").notNullable();
            t.jsonb("policy_evaluation").notNullable();
            t.string("approval_requirement", 32).notNullable().defaultTo("none");
            t.jsonb("verification_plan").notNullable();
            t.jsonb("learning_plan").notNullable();
            t.string("correlation_id", 128).nullable();
            t.integer("version").notNullable().defaultTo(1);
            t.integer("created_by_user_id").unsigned().nullable();
            t.timestamp("created_at", { useTz: true }).notNullable();
            t.timestamp("updated_at", { useTz: true }).notNullable();
        });
        this.schema.createTable("agent_plan_steps", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.integer("plan_id").unsigned().notNullable().references("id").inTable("agent_plans").onDelete("CASCADE");
            t.integer("sequence").notNullable();
            t.string("tool_key", 128).notNullable();
            t.integer("tool_version").notNullable();
            t.jsonb("input").notNullable();
            t.string("risk_class", 24).notNullable();
            t.boolean("approval_required").notNullable().defaultTo(false);
            t.string("status", 32).notNullable().defaultTo("pending");
            t.string("idempotency_key", 160).notNullable();
            t.timestamp("created_at", { useTz: true }).notNullable();
            t.timestamp("updated_at", { useTz: true }).notNullable();
            t.unique(["tenant_id", "idempotency_key"]);
            t.unique(["tenant_id", "plan_id", "sequence"]);
        });
        this.schema.createTable("agent_conflicts", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.integer("plan_id").unsigned().notNullable().references("id").inTable("agent_plans").onDelete("CASCADE");
            t.jsonb("participants").notNullable();
            t.text("conflict_summary").notNullable();
            t.string("objective_key", 96).notNullable();
            t.jsonb("priority_order").notNullable();
            t.jsonb("evidence_snapshot").notNullable();
            t.jsonb("alternatives").notNullable();
            t.jsonb("resolution").notNullable();
            t.string("resolved_by", 32).notNullable();
            t.integer("resolved_by_user_id").unsigned().nullable();
            t.timestamp("created_at", { useTz: true }).notNullable();
        });
        this.schema.createTable("agent_approvals", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.integer("plan_step_id").unsigned().notNullable().references("id").inTable("agent_plan_steps").onDelete("CASCADE");
            t.string("status", 24).notNullable().defaultTo("pending");
            t.text("reason").notNullable();
            t.integer("requested_by_user_id").unsigned().nullable();
            t.integer("decided_by_user_id").unsigned().nullable();
            t.timestamp("decided_at", { useTz: true }).nullable();
            t.timestamp("created_at", { useTz: true }).notNullable();
        });
        this.schema.createTable("agent_tool_runs", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.integer("plan_step_id").unsigned().notNullable().references("id").inTable("agent_plan_steps").onDelete("CASCADE");
            t.integer("tool_registry_id").unsigned().notNullable().references("id").inTable("agent_tool_registry");
            t.string("status", 32).notNullable();
            t.string("idempotency_key", 160).notNullable();
            t.boolean("dry_run").notNullable().defaultTo(false);
            t.jsonb("input_snapshot").notNullable();
            t.jsonb("policy_result").notNullable();
            t.jsonb("result").notNullable().defaultTo("{}");
            t.jsonb("verification").notNullable().defaultTo("{}");
            t.string("error_code", 96).nullable();
            t.text("error_message").nullable();
            t.integer("attempt").notNullable().defaultTo(1);
            t.timestamp("started_at", { useTz: true }).notNullable();
            t.timestamp("finished_at", { useTz: true }).nullable();
            t.unique(["tenant_id", "idempotency_key"]);
        });
        this.schema.createTable("agent_outcome_hooks", (t) => {
            t.increments("id");
            t.uuid("public_id").notNullable().unique();
            t.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            t.integer("plan_id").unsigned().notNullable().references("id").inTable("agent_plans").onDelete("CASCADE");
            t.string("metric_key", 128).notNullable();
            t.timestamp("evaluate_after", { useTz: true }).notNullable();
            t.jsonb("baseline").notNullable();
            t.jsonb("predicted").notNullable();
            t.jsonb("actual").nullable();
            t.string("status", 24).notNullable().defaultTo("pending");
            t.timestamp("created_at", { useTz: true }).notNullable();
        });
        for (const table of this.tables) {
            this.defer(async (db) => {
                await db.rawQuery(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
                await db.rawQuery(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
                await db.rawQuery(
                    `CREATE POLICY ${table}_tenant_isolation ON ${table} USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::int) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::int)`,
                );
            });
        }
    }
    async down() {
        for (const table of [...this.tables].reverse()) this.schema.dropTable(table);
    }
}
