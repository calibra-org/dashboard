import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.alterTable("deal_campaigns", (table) => {
            table.string("deal_type", 32).notNullable().defaultTo("flash");
            table.string("benefit_type", 32).notNullable().defaultTo("percent_product");
            table.bigInteger("benefit_value").notNullable().defaultTo(0);
            table.integer("priority").notNullable().defaultTo(0);
            table.boolean("exclusive").notNullable().defaultTo(false);
            table.integer("max_applications").nullable();
            table.integer("usage_count").notNullable().defaultTo(0);
            table.integer("quantity_limit").nullable();
            table.bigInteger("min_selling_price").nullable();
            table.integer("max_discount_percent").nullable();
            table.jsonb("policy_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("cancelled_at", { useTz: true }).nullable();
            table.timestamp("ended_at", { useTz: true }).nullable();
        });
        this.schema.raw(`ALTER TABLE deal_campaigns DROP CONSTRAINT IF EXISTS deal_campaigns_status_check`);
        this.schema.raw(
            `ALTER TABLE deal_campaigns ADD CONSTRAINT deal_campaigns_status_check CHECK (status IN ('draft','scheduled','active','paused','cancelled','ended','expired','archived'))`,
        );
        this.schema.raw(
            `ALTER TABLE deal_campaigns ADD CONSTRAINT deal_campaigns_master_bounds_check CHECK (benefit_value >= 0 AND priority BETWEEN -100000 AND 100000 AND (max_applications IS NULL OR max_applications > 0) AND usage_count >= 0 AND (quantity_limit IS NULL OR quantity_limit > 0) AND (min_selling_price IS NULL OR min_selling_price >= 0) AND (max_discount_percent IS NULL OR max_discount_percent BETWEEN 0 AND 100))`,
        );

        this.schema.createTable("personalization_feature_registry", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("feature_key", 96).notNullable();
            table.string("source", 96).notNullable();
            table.integer("freshness_seconds").nullable();
            table.boolean("sensitive").notNullable().defaultTo(false);
            table.boolean("enabled").notNullable().defaultTo(true);
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamps(true, true);
            table.unique(["tenant_id", "feature_key"], { indexName: "personalization_feature_registry_unique" });
        });

        this.schema.createTable("personalization_policies", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("policy_key", 64).notNullable();
            table.integer("version").notNullable();
            table.string("status", 16).notNullable().defaultTo("draft");
            table.jsonb("config").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("reason_code_version", 32).notNullable().defaultTo("v1");
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("activated_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "policy_key", "version"], { indexName: "personalization_policies_key_version_unique" });
            table.index(["tenant_id", "policy_key", "status"], "personalization_policies_active_idx");
        });

        this.schema.createTable("personalization_models", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("model_key", 64).notNullable();
            table.string("version", 64).notNullable();
            table.string("status", 16).notNullable().defaultTo("draft");
            table.jsonb("config").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("rollout_percent").notNullable().defaultTo(0);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("activated_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "model_key", "version"], { indexName: "personalization_models_key_version_unique" });
        });

        this.schema.createTable("personalization_rollouts", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("kind", 16).notNullable();
            table.string("registry_key", 64).notNullable();
            table.string("from_version", 64).nullable();
            table.string("to_version", 64).notNullable();
            table.integer("percentage").notNullable().defaultTo(0);
            table.string("status", 16).notNullable().defaultTo("draft");
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("started_at", { useTz: true }).nullable();
            table.timestamp("ended_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "kind", "registry_key", "status"], "personalization_rollouts_lookup_idx");
        });

        this.schema.createTable("personalization_preferences", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("subject_type", 16).notNullable();
            table.string("subject_id", 96).notNullable();
            table.jsonb("hidden_product_ids").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("hidden_category_ids").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("show_less_topics").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.timestamps(true, true);
            table.unique(["tenant_id", "subject_type", "subject_id"], { indexName: "personalization_preferences_subject_unique" });
        });

        this.schema.createTable("personalization_identity_merges", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("visitor_id", 96).notNullable();
            table.bigInteger("customer_id").unsigned().notNullable().references("id").inTable("customers").onDelete("CASCADE");
            table.string("merge_version", 32).notNullable().defaultTo("phase9-v1");
            table.timestamp("merged_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "visitor_id", "customer_id"], { indexName: "personalization_identity_merges_unique" });
        });

        this.schema.createTable("personalization_projection_cursors", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("projection", 64).notNullable();
            table.bigInteger("cursor_event_row_id").unsigned().nullable();
            table.bigInteger("replay_from_event_row_id").unsigned().nullable();
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "projection"], { indexName: "personalization_projection_cursors_unique" });
        });

        this.schema.createTable("deal_reservations", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("reservation_id").notNullable();
            table.bigInteger("campaign_id").unsigned().notNullable().references("id").inTable("deal_campaigns").onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table.bigInteger("order_id").unsigned().nullable().references("id").inTable("orders").onDelete("SET NULL");
            table.string("subject_type", 16).nullable();
            table.string("subject_id", 96).nullable();
            table.integer("quantity").notNullable().defaultTo(1);
            table.string("status", 16).notNullable().defaultTo("reserved");
            table.string("idempotency_key", 96).notNullable();
            table.timestamp("expires_at", { useTz: true }).notNullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "reservation_id"], { indexName: "deal_reservations_reservation_unique" });
            table.unique(["tenant_id", "idempotency_key"], { indexName: "deal_reservations_idempotency_unique" });
            table.index(["tenant_id", "campaign_id", "status", "expires_at"], "deal_reservations_capacity_idx");
            table.index(["tenant_id", "order_id", "status"], "deal_reservations_order_idx");
        });

        this.schema.createTable("deal_redemptions", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("campaign_id").unsigned().notNullable().references("id").inTable("deal_campaigns").onDelete("RESTRICT");
            table.uuid("reservation_id").nullable();
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("RESTRICT");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table.integer("quantity").notNullable().defaultTo(1);
            table.bigInteger("benefit_minor").notNullable().defaultTo(0);
            table.integer("campaign_version").notNullable();
            table.jsonb("policy_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("idempotency_key", 96).notNullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "idempotency_key"], { indexName: "deal_redemptions_idempotency_unique" });
            table.index(["tenant_id", "campaign_id", "created_at"], "deal_redemptions_campaign_idx");
        });

        this.schema.raw(`ALTER TABLE personalization_preferences ADD CONSTRAINT personalization_preferences_subject_type_check CHECK (subject_type IN ('visitor','customer'))`);
        this.schema.raw(`ALTER TABLE personalization_policies ADD CONSTRAINT personalization_policies_status_check CHECK (status IN ('draft','active','retired'))`);
        this.schema.raw(`ALTER TABLE personalization_models ADD CONSTRAINT personalization_models_status_check CHECK (status IN ('draft','active','retired') AND rollout_percent BETWEEN 0 AND 100)`);
        this.schema.raw(`ALTER TABLE personalization_rollouts ADD CONSTRAINT personalization_rollouts_check CHECK (kind IN ('policy','model') AND status IN ('draft','active','rolled_back','completed') AND percentage BETWEEN 0 AND 100)`);
        this.schema.raw(`ALTER TABLE deal_reservations ADD CONSTRAINT deal_reservations_check CHECK (quantity > 0 AND status IN ('reserved','consumed','released','expired') AND (subject_type IS NULL OR subject_type IN ('visitor','customer')))`);
        this.schema.raw(`ALTER TABLE deal_redemptions ADD CONSTRAINT deal_redemptions_check CHECK (quantity > 0 AND benefit_minor >= 0 AND campaign_version >= 1)`);

        for (const table of [
            "personalization_feature_registry",
            "personalization_policies",
            "personalization_models",
            "personalization_rollouts",
            "personalization_preferences",
            "personalization_identity_merges",
            "personalization_projection_cursors",
            "deal_reservations",
            "deal_redemptions",
        ]) {
            this.schema.raw(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT ${TENANT.split(" = ")[1]}`);
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY tenant_isolation ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
        }
    }

    async down() {
        for (const table of [
            "deal_redemptions",
            "deal_reservations",
            "personalization_projection_cursors",
            "personalization_identity_merges",
            "personalization_preferences",
            "personalization_rollouts",
            "personalization_models",
            "personalization_policies",
            "personalization_feature_registry",
        ]) {
            this.schema.dropTable(table);
        }
        this.schema.raw(`ALTER TABLE deal_campaigns DROP CONSTRAINT IF EXISTS deal_campaigns_master_bounds_check`);
        this.schema.raw(`ALTER TABLE deal_campaigns DROP CONSTRAINT IF EXISTS deal_campaigns_status_check`);
        this.schema.raw(`ALTER TABLE deal_campaigns ADD CONSTRAINT deal_campaigns_status_check CHECK (status IN ('draft','scheduled','active','paused','expired','archived'))`);
        this.schema.alterTable("deal_campaigns", (table) => {
            for (const column of [
                "deal_type",
                "benefit_type",
                "benefit_value",
                "priority",
                "exclusive",
                "max_applications",
                "usage_count",
                "quantity_limit",
                "min_selling_price",
                "max_discount_percent",
                "policy_snapshot",
                "cancelled_at",
                "ended_at",
            ]) table.dropColumn(column);
        });
    }
}
