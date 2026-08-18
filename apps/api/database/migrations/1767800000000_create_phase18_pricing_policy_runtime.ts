import { BaseSchema } from "@adonisjs/lucid/schema";

const RLS_TABLES = [
    "pricing_policies",
    "pricing_policy_versions",
    "pricing_proposals",
    "pricing_policy_actions",
    "pricing_order_snapshots",
] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("pricing_policies", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("policy_key", 120).notNullable();
            table.string("name", 180).notNullable();
            table.string("objective", 120).nullable();
            table.string("status", 32).notNullable().defaultTo("active");
            table.bigInteger("created_by").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("frozen_by").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.text("freeze_reason").nullable();
            table.timestamp("frozen_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "policy_key"], { indexName: "pricing_policies_key_unique" });
            table.index(["tenant_id", "status", "updated_at"], "pricing_policies_status_idx");
        });

        this.schema.createTable("pricing_policy_versions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("policy_id").unsigned().notNullable().references("id").inTable("pricing_policies").onDelete("CASCADE");
            table.integer("version").notNullable();
            table.string("state", 32).notNullable().defaultTo("draft");
            table.string("currency", 3).notNullable().defaultTo("IRR");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table.bigInteger("variation_id").unsigned().nullable().references("id").inTable("product_variations").onDelete("SET NULL");
            table.jsonb("scope").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("guardrails").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.text("reason").nullable();
            table.bigInteger("proposed_by").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("reviewed_by").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("approved_by").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("scheduled_by").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("activated_by").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("rollback_of_version_id").unsigned().nullable().references("id").inTable("pricing_policy_versions").onDelete("SET NULL");
            table.timestamp("reviewed_at", { useTz: true }).nullable();
            table.timestamp("approved_at", { useTz: true }).nullable();
            table.timestamp("scheduled_at", { useTz: true }).nullable();
            table.timestamp("activated_at", { useTz: true }).nullable();
            table.timestamp("retired_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "policy_id", "version"], { indexName: "pricing_policy_versions_version_unique" });
            table.index(["tenant_id", "state", "product_id", "variation_id"], "pricing_policy_versions_resolve_idx");
        });
        this.schema.raw(
            `CREATE UNIQUE INDEX "pricing_policy_versions_one_active" ON "pricing_policy_versions" ("tenant_id", "policy_id") WHERE state = 'active'`,
        );

        this.schema.createTable("pricing_proposals", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("policy_id").unsigned().notNullable().references("id").inTable("pricing_policies").onDelete("CASCADE");
            table.bigInteger("policy_version_id").unsigned().nullable().references("id").inTable("pricing_policy_versions").onDelete("SET NULL");
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("CASCADE");
            table.bigInteger("variation_id").unsigned().nullable().references("id").inTable("product_variations").onDelete("CASCADE");
            table.bigInteger("reference_price_minor").notNullable();
            table.bigInteger("candidate_price_minor").notNullable();
            table.string("currency", 3).notNullable();
            table.string("status", 32).notNullable().defaultTo("draft");
            table.string("objective", 120).nullable();
            table.text("rationale").nullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("proposed_by").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("reviewed_by").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("reviewed_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "status", "created_at"], "pricing_proposals_status_idx");
            table.index(["tenant_id", "product_id", "variation_id", "created_at"], "pricing_proposals_product_idx");
        });

        this.schema.createTable("pricing_policy_actions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("policy_id").unsigned().notNullable().references("id").inTable("pricing_policies").onDelete("CASCADE");
            table.bigInteger("policy_version_id").unsigned().nullable().references("id").inTable("pricing_policy_versions").onDelete("SET NULL");
            table.string("action", 64).notNullable();
            table.string("from_state", 32).nullable();
            table.string("to_state", 32).nullable();
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.text("reason").nullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("correlation_id", 120).nullable();
            table.string("idempotency_key", 180).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "idempotency_key"], { indexName: "pricing_policy_actions_idempotency_unique" });
            table.index(["tenant_id", "policy_id", "created_at"], "pricing_policy_actions_policy_idx");
        });

        this.schema.createTable("pricing_order_snapshots", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");
            table.bigInteger("line_item_id").unsigned().notNullable().references("id").inTable("order_line_items").onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("RESTRICT");
            table.bigInteger("variation_id").unsigned().nullable().references("id").inTable("product_variations").onDelete("SET NULL");
            table.bigInteger("reference_price_minor").notNullable();
            table.bigInteger("resolved_price_minor").notNullable();
            table.string("currency", 3).notNullable();
            table.bigInteger("policy_id").unsigned().nullable().references("id").inTable("pricing_policies").onDelete("SET NULL");
            table.bigInteger("policy_version_id").unsigned().nullable().references("id").inTable("pricing_policy_versions").onDelete("SET NULL");
            table.jsonb("coupon_ids").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("guardrail_result").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "order_id", "line_item_id"], { indexName: "pricing_order_snapshots_line_unique" });
            table.index(["tenant_id", "policy_version_id", "created_at"], "pricing_order_snapshots_policy_idx");
        });

        for (const table of RLS_TABLES) {
            this.schema.raw(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
            this.schema.raw(
                `CREATE POLICY "tenant_isolation" ON "${table}" ` +
                    `USING (tenant_id = current_setting('app.current_tenant', true)::bigint) ` +
                    `WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::bigint)`,
            );
        }
    }

    async down() {
        for (const table of [...RLS_TABLES].reverse()) {
            this.schema.dropTable(table);
        }
    }
}
