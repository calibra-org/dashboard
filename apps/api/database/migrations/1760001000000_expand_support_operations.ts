import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("support_ticket_workflow_statuses", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("code", 48).notNullable();
            table.string("label_fa", 120).notNullable();
            table.string("label_en", 120).notNullable();
            table.string("semantic_group", 24).notNullable().defaultTo("active");
            table.boolean("is_terminal").notNullable().defaultTo(false);
            table.boolean("is_customer_waiting").notNullable().defaultTo(false);
            table.boolean("is_enabled").notNullable().defaultTo(true);
            table.integer("sort_order").notNullable().defaultTo(0);
            table.timestamps(true, true);
            table.unique(["tenant_id", "code"], { indexName: "support_workflow_statuses_unique" });
        });

        this.schema.createTable("support_ticket_saved_views", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("owner_user_id").unsigned().notNullable().references("id").inTable("users").onDelete("CASCADE");
            table.string("name", 120).notNullable();
            table.jsonb("query").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.boolean("is_shared").notNullable().defaultTo(false);
            table.timestamps(true, true);
            table.unique(["tenant_id", "owner_user_id", "name"], { indexName: "support_ticket_saved_views_owner_name_unique" });
        });

        this.schema.createTable("support_ticket_attachments", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("ticket_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("support_tickets")
                .onDelete("CASCADE");
            table
                .bigInteger("message_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("support_ticket_messages")
                .onDelete("CASCADE");
            table.bigInteger("media_id").unsigned().notNullable().references("id").inTable("media").onDelete("RESTRICT");
            table.bigInteger("uploaded_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("filename", 512).notNullable();
            table.string("mime", 160).notNullable();
            table.bigInteger("size_bytes").unsigned().notNullable();
            table.string("sha256", 64).nullable();
            table.string("scan_status", 24).notNullable().defaultTo("pending");
            table.string("scan_evidence", 512).nullable();
            table.timestamp("scanned_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "ticket_id", "created_at"], "support_ticket_attachments_ticket_idx");
        });

        this.schema.createTable("support_ticket_merges", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("source_ticket_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("support_tickets")
                .onDelete("RESTRICT");
            table
                .bigInteger("target_ticket_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("support_tickets")
                .onDelete("RESTRICT");
            table.bigInteger("merged_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("reason", 500).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "source_ticket_id"], { indexName: "support_ticket_merges_source_unique" });
        });

        this.schema.createTable("support_agent_presence", (table) => {
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("user_id").unsigned().notNullable().references("id").inTable("users").onDelete("CASCADE");
            table.string("state", 24).notNullable().defaultTo("offline");
            table.integer("capacity").notNullable().defaultTo(10);
            table.integer("active_count").notNullable().defaultTo(0);
            table.timestamp("last_heartbeat_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.primary(["tenant_id", "user_id"]);
        });

        this.schema.createTable("support_channel_integrations", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("channel", 32).notNullable();
            table.string("status", 24).notNullable().defaultTo("disabled");
            table.string("credential_env_ref", 160).nullable();
            table.jsonb("configuration").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("last_error", 1000).nullable();
            table.timestamp("last_verified_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "channel"], { indexName: "support_channel_integrations_unique" });
        });

        this.schema.createTable("support_routing_rules", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("name", 140).notNullable();
            table.integer("priority").notNullable().defaultTo(100);
            table.boolean("enabled").notNullable().defaultTo(true);
            table.jsonb("conditions").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("actions").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.index(["tenant_id", "enabled", "priority"], "support_routing_rules_priority_idx");
        });

        this.schema.createTable("support_automation_rules", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("name", 140).notNullable();
            table.string("trigger", 48).notNullable();
            table.boolean("enabled").notNullable().defaultTo(true);
            table.jsonb("conditions").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("actions").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.index(["tenant_id", "enabled", "trigger"], "support_automation_rules_trigger_idx");
        });

        this.schema.createTable("support_campaigns", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("name", 180).notNullable();
            table.string("channel", 32).notNullable();
            table.string("status", 24).notNullable().defaultTo("draft");
            table.string("template_status", 24).notNullable().defaultTo("draft");
            table.text("template_body").notNullable();
            table.jsonb("quiet_hours").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("estimated_cost_minor").notNullable().defaultTo(0);
            table.integer("version").notNullable().defaultTo(1);
            table.timestamp("scheduled_at", { useTz: true }).nullable();
            table.timestamp("started_at", { useTz: true }).nullable();
            table.timestamp("completed_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.index(["tenant_id", "status", "scheduled_at"], "support_campaigns_schedule_idx");
        });

        this.schema.createTable("support_campaign_recipients", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("campaign_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("support_campaigns")
                .onDelete("CASCADE");
            table.string("recipient_key", 254).notNullable();
            table.string("status", 24).notNullable().defaultTo("pending");
            table.boolean("opted_out").notNullable().defaultTo(false);
            table.string("provider_message_id", 255).nullable();
            table.string("last_error", 1000).nullable();
            table.bigInteger("actual_cost_minor").notNullable().defaultTo(0);
            table.timestamp("sent_at", { useTz: true }).nullable();
            table.timestamp("delivered_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "campaign_id", "recipient_key"], { indexName: "support_campaign_recipients_dedupe" });
        });

        this.schema.createTable("support_csat_responses", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("ticket_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("support_tickets")
                .onDelete("CASCADE");
            table.smallint("score").notNullable();
            table.text("comment").nullable();
            table.string("response_token_hash", 64).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "ticket_id"], { indexName: "support_csat_ticket_unique" });
        });

        this.schema.createTable("support_public_tokens", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("ticket_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("support_tickets")
                .onDelete("CASCADE");
            table.string("token_hash", 64).notNullable();
            table.timestamp("expires_at", { useTz: true }).notNullable();
            table.timestamp("last_used_at", { useTz: true }).nullable();
            table.timestamp("revoked_at", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "token_hash"], { indexName: "support_public_tokens_hash_unique" });
        });

        const tenantTables = [
            "support_ticket_workflow_statuses",
            "support_ticket_saved_views",
            "support_ticket_attachments",
            "support_ticket_merges",
            "support_agent_presence",
            "support_channel_integrations",
            "support_routing_rules",
            "support_automation_rules",
            "support_campaigns",
            "support_campaign_recipients",
            "support_csat_responses",
            "support_public_tokens",
        ];
        for (const table of tenantTables) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY tenant_isolation ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
        }

        this.schema.raw(
            "ALTER TABLE support_ticket_attachments ADD CONSTRAINT support_ticket_attachment_scan_check CHECK (scan_status IN ('pending','clean','infected','error'))",
        );
        this.schema.raw(
            "ALTER TABLE support_ticket_merges ADD CONSTRAINT support_ticket_merge_distinct_check CHECK (source_ticket_id <> target_ticket_id)",
        );
        this.schema.raw(
            "ALTER TABLE support_agent_presence ADD CONSTRAINT support_presence_state_check CHECK (state IN ('offline','available','busy','away'))",
        );
        this.schema.raw(
            "ALTER TABLE support_agent_presence ADD CONSTRAINT support_presence_capacity_check CHECK (capacity BETWEEN 0 AND 500 AND active_count BETWEEN 0 AND 500)",
        );
        this.schema.raw(
            "ALTER TABLE support_channel_integrations ADD CONSTRAINT support_channel_name_check CHECK (channel IN ('web','email','phone','api','whatsapp','telegram','instagram','rubika','bale','eitaa','sms'))",
        );
        this.schema.raw(
            "ALTER TABLE support_channel_integrations ADD CONSTRAINT support_channel_status_check CHECK (status IN ('disabled','configured','connected','error'))",
        );
        this.schema.raw(
            "ALTER TABLE support_campaigns ADD CONSTRAINT support_campaign_status_check CHECK (status IN ('draft','scheduled','running','paused','completed','cancelled'))",
        );
        this.schema.raw(
            "ALTER TABLE support_campaigns ADD CONSTRAINT support_campaign_template_status_check CHECK (template_status IN ('draft','pending','approved','rejected'))",
        );
        this.schema.raw(
            "ALTER TABLE support_campaigns ADD CONSTRAINT support_campaign_cost_check CHECK (estimated_cost_minor >= 0)",
        );
        this.schema.raw(
            "ALTER TABLE support_campaign_recipients ADD CONSTRAINT support_campaign_recipient_status_check CHECK (status IN ('pending','skipped','queued','sent','delivered','failed'))",
        );
        this.schema.raw(
            "ALTER TABLE support_campaign_recipients ADD CONSTRAINT support_campaign_recipient_cost_check CHECK (actual_cost_minor >= 0)",
        );
        this.schema.raw(
            "ALTER TABLE support_csat_responses ADD CONSTRAINT support_csat_score_check CHECK (score BETWEEN 1 AND 5)",
        );
        this.schema.raw(
            "ALTER TABLE support_ticket_workflow_statuses ADD CONSTRAINT support_workflow_semantic_group_check CHECK (semantic_group IN ('active','waiting','resolved','closed'))",
        );

        this.schema.raw(`
            INSERT INTO support_ticket_workflow_statuses
                (tenant_id, code, label_fa, label_en, semantic_group, is_terminal, is_customer_waiting, is_enabled, sort_order, created_at, updated_at)
            SELECT t.id, v.code, v.label_fa, v.label_en, v.semantic_group, v.is_terminal, v.is_customer_waiting, true, v.sort_order, NOW(), NOW()
            FROM tenants t
            CROSS JOIN (VALUES
                ('open','باز','Open','active',false,false,10),
                ('pending','در انتظار','Pending','waiting',false,false,20),
                ('waiting_customer','منتظر مشتری','Waiting for customer','waiting',false,true,30),
                ('resolved','حل‌شده','Resolved','resolved',true,false,40),
                ('closed','بسته','Closed','closed',true,false,50)
            ) AS v(code,label_fa,label_en,semantic_group,is_terminal,is_customer_waiting,sort_order)
            ON CONFLICT (tenant_id, code) DO NOTHING
        `);
    }

    async down() {
        for (const table of [
            "support_public_tokens",
            "support_csat_responses",
            "support_campaign_recipients",
            "support_campaigns",
            "support_automation_rules",
            "support_routing_rules",
            "support_channel_integrations",
            "support_agent_presence",
            "support_ticket_merges",
            "support_ticket_attachments",
            "support_ticket_saved_views",
            "support_ticket_workflow_statuses",
        ])
            this.schema.dropTable(table);
    }
}
