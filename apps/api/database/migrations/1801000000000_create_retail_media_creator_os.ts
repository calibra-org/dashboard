import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";
const TABLES = [
    "retail_media_advertisers",
    "retail_media_campaigns",
    "retail_media_campaign_products",
    "retail_media_placements",
    "retail_media_campaign_placements",
    "retail_media_budget_ledger",
    "retail_media_delivery_events",
    "retail_media_creators",
    "retail_media_affiliate_links",
    "retail_media_commission_ledger",
] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("retail_media_advertisers", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.string("name", 190).notNullable();
            table.string("kind", 24).notNullable().defaultTo("brand");
            table.bigInteger("supplier_id").unsigned().nullable().references("id").inTable("suppliers").onDelete("SET NULL");
            table.string("status", 16).notNullable().defaultTo("active");
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "retail_media_advertisers_public_unique" });
            table.index(["tenant_id", "status", "updated_at"], "retail_media_advertisers_status_idx");
        });

        this.schema.createTable("retail_media_campaigns", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table
                .bigInteger("advertiser_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("retail_media_advertisers")
                .onDelete("RESTRICT");
            table.string("name", 190).notNullable();
            table.string("objective", 48).notNullable().defaultTo("incremental_contribution");
            table.string("status", 16).notNullable().defaultTo("draft");
            table.string("bid_model", 12).notNullable().defaultTo("cpc");
            table.bigInteger("default_bid_minor").notNullable().defaultTo(0);
            table.bigInteger("budget_total_minor").notNullable();
            table.bigInteger("daily_pacing_cap_minor").nullable();
            table.string("currency", 3).notNullable().defaultTo("IRR");
            table.integer("attribution_window_days").notNullable().defaultTo(7);
            table.bigInteger("experiment_id").unsigned().nullable().references("id").inTable("experiments").onDelete("SET NULL");
            table
                .bigInteger("holdout_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("experiment_holdouts")
                .onDelete("SET NULL");
            table.timestamp("starts_at", { useTz: true }).nullable();
            table.timestamp("ends_at", { useTz: true }).nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "retail_media_campaigns_public_unique" });
            table.index(["tenant_id", "status", "starts_at", "ends_at"], "retail_media_campaigns_delivery_idx");
        });

        this.schema.createTable("retail_media_campaign_products", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("campaign_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("retail_media_campaigns")
                .onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("CASCADE");
            table
                .bigInteger("variation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("CASCADE");
            table.integer("relevance_bps").notNullable();
            table.integer("quality_bps").notNullable();
            table.string("safety_status", 16).notNullable().defaultTo("review");
            table.bigInteger("custom_bid_minor").nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "campaign_id", "product_id", "variation_id"], {
                indexName: "retail_media_campaign_products_unique",
            });
            table.index(["tenant_id", "product_id", "campaign_id"], "retail_media_campaign_products_product_idx");
        });

        this.schema.createTable("retail_media_placements", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.string("placement_key", 120).notNullable();
            table.string("name", 190).notNullable();
            table.string("surface", 24).notNullable();
            table.string("status", 16).notNullable().defaultTo("active");
            table.string("disclosure_text", 80).notNullable().defaultTo("تبلیغ");
            table.integer("minimum_relevance_bps").notNullable().defaultTo(5000);
            table.integer("minimum_quality_bps").notNullable().defaultTo(5000);
            table.integer("privacy_min_cohort").notNullable().defaultTo(20);
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "retail_media_placements_public_unique" });
            table.unique(["tenant_id", "placement_key"], { indexName: "retail_media_placements_key_unique" });
        });

        this.schema.createTable("retail_media_campaign_placements", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("campaign_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("retail_media_campaigns")
                .onDelete("CASCADE");
            table
                .bigInteger("placement_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("retail_media_placements")
                .onDelete("CASCADE");
            table.string("status", 16).notNullable().defaultTo("active");
            table.integer("bid_multiplier_bps").notNullable().defaultTo(10000);
            table.jsonb("creative").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("creative_source_ref", 190).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "campaign_id", "placement_id"], { indexName: "retail_media_campaign_placements_unique" });
        });

        this.schema.createTable("retail_media_budget_ledger", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("campaign_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("retail_media_campaigns")
                .onDelete("CASCADE");
            table.string("entry_kind", 24).notNullable();
            table.bigInteger("amount_minor").notNullable();
            table.string("currency", 3).notNullable();
            table.string("funding_source", 24).nullable();
            table.string("source_ref", 190).nullable();
            table.string("idempotency_key", 190).notNullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "idempotency_key"], { indexName: "retail_media_budget_idempotency_unique" });
            table.index(["tenant_id", "campaign_id", "occurred_at"], "retail_media_budget_campaign_idx");
        });

        this.schema.createTable("retail_media_delivery_events", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("event_id").notNullable();
            table.uuid("parent_event_id").nullable();
            table
                .bigInteger("campaign_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("retail_media_campaigns")
                .onDelete("CASCADE");
            table
                .bigInteger("placement_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("retail_media_placements")
                .onDelete("SET NULL");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table
                .bigInteger("variation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("SET NULL");
            table.string("event_type", 20).notNullable();
            table.string("subject_hash", 64).nullable();
            table.string("consent_context", 32).nullable();
            table.bigInteger("revenue_minor").nullable();
            table.bigInteger("contribution_minor").nullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("occurred_at", { useTz: true }).notNullable();
            table.timestamp("received_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "event_id"], { indexName: "retail_media_delivery_event_unique" });
            table.unique(["tenant_id", "parent_event_id", "event_type"], {
                indexName: "retail_media_delivery_parent_event_unique",
            });
            table.index(["tenant_id", "campaign_id", "event_type", "occurred_at"], "retail_media_delivery_campaign_idx");
        });

        this.schema.createTable("retail_media_creators", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.string("display_name", 190).notNullable();
            table.string("handle", 120).nullable();
            table.string("status", 16).notNullable().defaultTo("active");
            table.integer("holding_days").notNullable().defaultTo(30);
            table.string("disclosure_text", 120).notNullable().defaultTo("همکاری تبلیغاتی");
            table.string("payout_ref", 190).nullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "retail_media_creators_public_unique" });
            table.index(["tenant_id", "status", "updated_at"], "retail_media_creators_status_idx");
        });

        this.schema.createTable("retail_media_affiliate_links", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table
                .bigInteger("creator_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("retail_media_creators")
                .onDelete("CASCADE");
            table
                .bigInteger("campaign_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("retail_media_campaigns")
                .onDelete("SET NULL");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table
                .bigInteger("variation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("SET NULL");
            table.string("code", 96).notNullable();
            table.integer("commission_bps").notNullable().defaultTo(0);
            table.bigInteger("fixed_commission_minor").nullable();
            table.integer("attribution_window_days").notNullable().defaultTo(7);
            table.string("status", 16).notNullable().defaultTo("active");
            table.timestamp("starts_at", { useTz: true }).nullable();
            table.timestamp("ends_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "public_id"], { indexName: "retail_media_affiliate_public_unique" });
            table.unique(["tenant_id", "code"], { indexName: "retail_media_affiliate_code_unique" });
        });

        this.schema.createTable("retail_media_commission_ledger", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("creator_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("retail_media_creators")
                .onDelete("RESTRICT");
            table
                .bigInteger("affiliate_link_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("retail_media_affiliate_links")
                .onDelete("SET NULL");
            table.bigInteger("order_id").unsigned().nullable().references("id").inTable("orders").onDelete("SET NULL");
            table
                .bigInteger("order_line_item_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("order_line_items")
                .onDelete("SET NULL");
            table.bigInteger("refund_id").unsigned().nullable().references("id").inTable("order_refunds").onDelete("SET NULL");
            table.string("entry_kind", 24).notNullable();
            table.bigInteger("amount_minor").notNullable();
            table.string("currency", 3).notNullable();
            table.string("idempotency_key", 190).notNullable();
            table.string("source_ref", 190).nullable();
            table.timestamp("available_at", { useTz: true }).nullable();
            table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "idempotency_key"], { indexName: "retail_media_commission_idempotency_unique" });
            table.index(["tenant_id", "creator_id", "occurred_at"], "retail_media_commission_creator_idx");
            table.index(["tenant_id", "order_id", "order_line_item_id"], "retail_media_commission_order_idx");
        });

        const checks = [
            `ALTER TABLE retail_media_advertisers ADD CONSTRAINT retail_media_advertisers_kind_check CHECK (kind IN ('brand','supplier','merchant','agency'))`,
            `ALTER TABLE retail_media_advertisers ADD CONSTRAINT retail_media_advertisers_status_check CHECK (status IN ('active','paused','archived'))`,
            `ALTER TABLE retail_media_campaigns ADD CONSTRAINT retail_media_campaigns_status_check CHECK (status IN ('draft','review','active','paused','ended','archived'))`,
            `ALTER TABLE retail_media_campaigns ADD CONSTRAINT retail_media_campaigns_bid_model_check CHECK (bid_model IN ('cpc','cpm'))`,
            `ALTER TABLE retail_media_campaigns ADD CONSTRAINT retail_media_campaigns_money_check CHECK (default_bid_minor >= 0 AND budget_total_minor > 0 AND (daily_pacing_cap_minor IS NULL OR daily_pacing_cap_minor > 0))`,
            `ALTER TABLE retail_media_campaigns ADD CONSTRAINT retail_media_campaigns_window_check CHECK (attribution_window_days BETWEEN 1 AND 90 AND version >= 1 AND (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at))`,
            `ALTER TABLE retail_media_campaign_products ADD CONSTRAINT retail_media_campaign_products_scores_check CHECK (relevance_bps BETWEEN 0 AND 10000 AND quality_bps BETWEEN 0 AND 10000 AND (custom_bid_minor IS NULL OR custom_bid_minor >= 0))`,
            `ALTER TABLE retail_media_campaign_products ADD CONSTRAINT retail_media_campaign_products_safety_check CHECK (safety_status IN ('review','approved','blocked'))`,
            `ALTER TABLE retail_media_placements ADD CONSTRAINT retail_media_placements_surface_check CHECK (surface IN ('search','category','product','story','video','collection','live','email','push'))`,
            `ALTER TABLE retail_media_placements ADD CONSTRAINT retail_media_placements_status_check CHECK (status IN ('active','paused','archived'))`,
            `ALTER TABLE retail_media_placements ADD CONSTRAINT retail_media_placements_threshold_check CHECK (minimum_relevance_bps BETWEEN 0 AND 10000 AND minimum_quality_bps BETWEEN 0 AND 10000 AND privacy_min_cohort >= 20)`,
            `ALTER TABLE retail_media_campaign_placements ADD CONSTRAINT retail_media_campaign_placements_status_check CHECK (status IN ('active','paused'))`,
            `ALTER TABLE retail_media_campaign_placements ADD CONSTRAINT retail_media_campaign_placements_multiplier_check CHECK (bid_multiplier_bps BETWEEN 0 AND 50000)`,
            `ALTER TABLE retail_media_budget_ledger ADD CONSTRAINT retail_media_budget_kind_check CHECK (entry_kind IN ('funding','spend','refund','adjustment'))`,
            `ALTER TABLE retail_media_budget_ledger ADD CONSTRAINT retail_media_budget_amount_check CHECK (amount_minor <> 0 AND ((entry_kind IN ('funding','spend') AND amount_minor > 0) OR (entry_kind = 'refund' AND amount_minor < 0) OR entry_kind = 'adjustment'))`,
            `ALTER TABLE retail_media_delivery_events ADD CONSTRAINT retail_media_delivery_type_check CHECK (event_type IN ('impression','click','conversion'))`,
            `ALTER TABLE retail_media_creators ADD CONSTRAINT retail_media_creators_status_check CHECK (status IN ('active','paused','archived'))`,
            `ALTER TABLE retail_media_creators ADD CONSTRAINT retail_media_creators_holding_check CHECK (holding_days BETWEEN 1 AND 90)`,
            `ALTER TABLE retail_media_affiliate_links ADD CONSTRAINT retail_media_affiliate_status_check CHECK (status IN ('active','paused','archived'))`,
            `ALTER TABLE retail_media_affiliate_links ADD CONSTRAINT retail_media_affiliate_commission_check CHECK (commission_bps BETWEEN 0 AND 10000 AND (fixed_commission_minor IS NULL OR fixed_commission_minor >= 0) AND (commission_bps > 0 OR fixed_commission_minor IS NOT NULL))`,
            `ALTER TABLE retail_media_affiliate_links ADD CONSTRAINT retail_media_affiliate_window_check CHECK (attribution_window_days BETWEEN 1 AND 90 AND (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at))`,
            `ALTER TABLE retail_media_commission_ledger ADD CONSTRAINT retail_media_commission_kind_check CHECK (entry_kind IN ('commission','refund_adjustment','payout','manual_adjustment'))`,
            `ALTER TABLE retail_media_commission_ledger ADD CONSTRAINT retail_media_commission_amount_check CHECK (amount_minor <> 0 AND ((entry_kind = 'commission' AND amount_minor > 0) OR (entry_kind IN ('refund_adjustment','payout') AND amount_minor < 0) OR entry_kind = 'manual_adjustment'))`,
        ];
        for (const sql of checks) this.schema.raw(sql);

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
        for (const table of [...TABLES].reverse()) this.schema.dropTable(table);
    }
}
