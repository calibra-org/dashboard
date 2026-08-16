import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT_DEFAULT = "NULLIF(current_setting('app.current_tenant', true), '')::bigint";
const TENANT_PREDICATE = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("customer_intelligence_profiles", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("customer_id").unsigned().notNullable().references("id").inTable("customers").onDelete("CASCADE");
            table.string("lifecycle_state", 32).notNullable().defaultTo("never_purchased");
            table.string("lifecycle_reason", 80).notNullable().defaultTo("no_counted_orders");
            table.integer("recency_days").nullable();
            table.integer("frequency_365d").notNullable().defaultTo(0);
            table.bigInteger("monetary_365d_minor").notNullable().defaultTo(0);
            table.smallint("rfm_recency_score").nullable();
            table.smallint("rfm_frequency_score").nullable();
            table.smallint("rfm_monetary_score").nullable();
            table.smallint("rfm_score").nullable();
            table.string("value_band", 24).notNullable().defaultTo("unknown");
            table.string("risk_band", 24).notNullable().defaultTo("unknown");
            table.bigInteger("historical_revenue_ltv_minor").nullable();
            table.bigInteger("historical_contribution_ltv_minor").nullable();
            table.timestamp("expected_next_purchase_from", { useTz: true }).nullable();
            table.timestamp("expected_next_purchase_to", { useTz: true }).nullable();
            table.jsonb("signals").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("prediction_meta").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("nba_candidates").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("quality_status", 32).notNullable().defaultTo("limited_history");
            table.string("engine_version", 64).notNullable();
            table.timestamp("calculated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("stale_at", { useTz: true }).nullable();
            table.timestamps(true, true);

            table.unique(["tenant_id", "customer_id"], { indexName: "customer_intelligence_tenant_customer_unique" });
            table.index(["tenant_id", "lifecycle_state"], "customer_intelligence_lifecycle_idx");
            table.index(["tenant_id", "risk_band"], "customer_intelligence_risk_idx");
            table.index(["tenant_id", "value_band"], "customer_intelligence_value_idx");
            table.index(["tenant_id", "calculated_at"], "customer_intelligence_calculated_idx");
        });

        this.schema.createTable("customer_segment_definitions", (table) => {
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("segment_id").unsigned().primary().references("id").inTable("customer_segments").onDelete("CASCADE");
            table.string("kind", 24).notNullable().defaultTo("rule_based");
            table.jsonb("definition").notNullable().defaultTo(this.raw("'{\"version\":1,\"op\":\"and\",\"conditions\":[]}'::jsonb"));
            table.string("refresh_policy", 24).notNullable().defaultTo("manual");
            table.integer("definition_version").notNullable().defaultTo(1);
            table.string("status", 24).notNullable().defaultTo("draft");
            table.bigInteger("member_count").notNullable().defaultTo(0);
            table.timestamp("last_evaluated_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.index(["tenant_id", "kind", "status"], "customer_segment_definitions_kind_idx");
        });

        this.schema.createTable("customer_segment_memberships", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("segment_id").unsigned().notNullable().references("id").inTable("customer_segments").onDelete("CASCADE");
            table.bigInteger("customer_id").unsigned().notNullable().references("id").inTable("customers").onDelete("CASCADE");
            table.timestamp("matched_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("evaluated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "segment_id", "customer_id"], { indexName: "customer_segment_memberships_unique" });
            table.index(["tenant_id", "customer_id"], "customer_segment_memberships_customer_idx");
        });

        this.schema.createTable("customer_lifecycle_history", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("customer_id").unsigned().notNullable().references("id").inTable("customers").onDelete("CASCADE");
            table.string("previous_state", 32).nullable();
            table.string("new_state", 32).notNullable();
            table.string("reason_code", 80).notNullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("engine_version", 64).notNullable();
            table.timestamp("effective_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("calculated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "customer_id", "effective_at"], "customer_lifecycle_history_customer_idx");
        });

        const tenantTables = [
            "customer_intelligence_profiles",
            "customer_segment_definitions",
            "customer_segment_memberships",
            "customer_lifecycle_history",
        ];
        for (const table of tenantTables) {
            this.schema.raw(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT ${TENANT_DEFAULT}`);
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(
                `CREATE POLICY tenant_isolation ON ${table} USING (${TENANT_PREDICATE}) WITH CHECK (${TENANT_PREDICATE})`,
            );
        }

        this.schema.raw(
            "ALTER TABLE customer_segment_definitions ADD CONSTRAINT customer_segment_definitions_kind_check CHECK (kind IN ('rule_based','rfm','cohort','lifecycle','predictive'))",
        );
        this.schema.raw(
            "ALTER TABLE customer_segment_definitions ADD CONSTRAINT customer_segment_definitions_refresh_check CHECK (refresh_policy IN ('manual','event_driven'))",
        );
        this.schema.raw(
            "ALTER TABLE customer_segment_definitions ADD CONSTRAINT customer_segment_definitions_status_check CHECK (status IN ('draft','ready','evaluating','error'))",
        );
    }

    async down() {
        this.schema.dropTable("customer_lifecycle_history");
        this.schema.dropTable("customer_segment_memberships");
        this.schema.dropTable("customer_segment_definitions");
        this.schema.dropTable("customer_intelligence_profiles");
    }
}
