import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("personalization_events", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("event_id").notNullable();
            table.string("event_type", 64).notNullable();
            table.integer("schema_version").notNullable().defaultTo(1);
            table.string("visitor_id", 96).nullable();
            table.string("session_id", 96).nullable();
            table.bigInteger("customer_id").unsigned().nullable().references("id").inTable("customers").onDelete("SET NULL");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table.string("placement", 64).nullable();
            table.jsonb("payload").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("consent_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("occurred_at", { useTz: true }).notNullable();
            table.timestamp("received_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "event_id"], { indexName: "personalization_events_event_unique" });
            table.index(["tenant_id", "event_type", "occurred_at"], "personalization_events_type_time_idx");
            table.index(["tenant_id", "visitor_id", "occurred_at"], "personalization_events_visitor_time_idx");
            table.index(["tenant_id", "customer_id", "occurred_at"], "personalization_events_customer_time_idx");
        });

        this.schema.createTable("personalization_profiles", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("subject_type", 16).notNullable();
            table.string("subject_id", 96).notNullable();
            table.jsonb("recent_product_ids").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.jsonb("category_affinity").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("brand_affinity").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.unique(["tenant_id", "subject_type", "subject_id"], { indexName: "personalization_profiles_subject_unique" });
        });

        this.schema.createTable("personalization_consents", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("subject_type", 16).notNullable();
            table.string("subject_id", 96).notNullable();
            table.boolean("analytics").notNullable().defaultTo(false);
            table.boolean("personalization").notNullable().defaultTo(false);
            table.string("source", 64).notNullable().defaultTo("unknown");
            table.string("policy_version", 32).notNullable().defaultTo("v1");
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.unique(["tenant_id", "subject_type", "subject_id"], { indexName: "personalization_consents_subject_unique" });
        });

        this.schema.createTable("recommendation_exposures", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.uuid("exposure_id").notNullable();
            table.uuid("request_id").notNullable();
            table.string("subject_type", 16).notNullable();
            table.string("subject_id", 96).notNullable();
            table.string("placement", 64).notNullable();
            table.jsonb("product_ids").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("policy_version", 32).notNullable().defaultTo("phase9-v1");
            table.string("model_version", 32).notNullable().defaultTo("rules-v1");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "exposure_id"], { indexName: "recommendation_exposures_exposure_unique" });
            table.index(["tenant_id", "subject_type", "subject_id", "created_at"], "recommendation_exposures_subject_idx");
        });

        this.schema.createTable("deal_campaigns", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("name", 190).notNullable();
            table.string("status", 24).notNullable().defaultTo("draft");
            table.string("selection_mode", 32).notNullable().defaultTo("smart");
            table.integer("min_discount_percent").notNullable().defaultTo(10);
            table.integer("max_items").notNullable().defaultTo(8);
            table.integer("rotation_minutes").notNullable().defaultTo(60);
            table.jsonb("rules").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("starts_at", { useTz: true }).nullable();
            table.timestamp("ends_at", { useTz: true }).nullable();
            table.timestamp("published_at", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.index(["tenant_id", "status", "starts_at", "ends_at"], "deal_campaigns_status_window_idx");
        });

        this.schema.createTable("deal_campaign_products", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("campaign_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("deal_campaigns")
                .onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("CASCADE");
            table.boolean("pinned").notNullable().defaultTo(false);
            table.integer("position").notNullable().defaultTo(0);
            table.timestamps(true, true);
            table.unique(["tenant_id", "campaign_id", "product_id"], { indexName: "deal_campaign_products_unique" });
        });

        this.schema.createTable("personalization_placements", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("placement", 64).notNullable();
            table.boolean("enabled").notNullable().defaultTo(true);
            table.string("strategy", 32).notNullable().defaultTo("contextual");
            table.integer("max_items").notNullable().defaultTo(8);
            table.integer("exploration_percent").notNullable().defaultTo(5);
            table.jsonb("rules").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.unique(["tenant_id", "placement"], { indexName: "personalization_placements_unique" });
        });

        this.schema.raw(
            `ALTER TABLE personalization_profiles ADD CONSTRAINT personalization_profiles_subject_type_check CHECK (subject_type IN ('visitor','customer'))`,
        );
        this.schema.raw(
            `ALTER TABLE personalization_consents ADD CONSTRAINT personalization_consents_subject_type_check CHECK (subject_type IN ('visitor','customer'))`,
        );
        this.schema.raw(
            `ALTER TABLE recommendation_exposures ADD CONSTRAINT recommendation_exposures_subject_type_check CHECK (subject_type IN ('visitor','customer'))`,
        );
        this.schema.raw(
            `ALTER TABLE deal_campaigns ADD CONSTRAINT deal_campaigns_status_check CHECK (status IN ('draft','scheduled','active','paused','expired','archived'))`,
        );
        this.schema.raw(
            `ALTER TABLE deal_campaigns ADD CONSTRAINT deal_campaigns_selection_mode_check CHECK (selection_mode IN ('manual','smart','controlled_random','hybrid'))`,
        );
        this.schema.raw(
            `ALTER TABLE deal_campaigns ADD CONSTRAINT deal_campaigns_bounds_check CHECK (min_discount_percent BETWEEN 1 AND 100 AND max_items BETWEEN 1 AND 48 AND rotation_minutes BETWEEN 5 AND 10080 AND version >= 1)`,
        );
        this.schema.raw(
            `ALTER TABLE personalization_placements ADD CONSTRAINT personalization_placements_bounds_check CHECK (max_items BETWEEN 1 AND 48 AND exploration_percent BETWEEN 0 AND 50 AND version >= 1)`,
        );

        for (const table of [
            "personalization_events",
            "personalization_profiles",
            "personalization_consents",
            "recommendation_exposures",
            "deal_campaigns",
            "deal_campaign_products",
            "personalization_placements",
        ]) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY tenant_isolation ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
        }
    }

    async down() {
        this.schema.dropTable("personalization_placements");
        this.schema.dropTable("deal_campaign_products");
        this.schema.dropTable("deal_campaigns");
        this.schema.dropTable("recommendation_exposures");
        this.schema.dropTable("personalization_consents");
        this.schema.dropTable("personalization_profiles");
        this.schema.dropTable("personalization_events");
    }
}
