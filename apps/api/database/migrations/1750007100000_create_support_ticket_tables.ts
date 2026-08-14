import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT_PREDICATE = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("support_ticket_settings", (table) => {
            table.bigInteger("tenant_id").unsigned().primary().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("reference_prefix", 12).notNullable().defaultTo("TKT");
            table.integer("first_response_minutes").notNullable().defaultTo(60);
            table.integer("resolution_minutes").notNullable().defaultTo(1440);
            table.string("default_priority", 16).notNullable().defaultTo("normal");
            table
                .bigInteger("default_assignee_user_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("users")
                .onDelete("SET NULL");
            table.timestamps(true, true);
        });

        this.schema.createTable("support_tickets", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("ticket_number").notNullable();
            table.string("reference", 32).notNullable();
            table.bigInteger("customer_id").unsigned().nullable().references("id").inTable("customers").onDelete("SET NULL");
            table.string("requester_name", 180).notNullable();
            table.string("requester_email", 254).nullable();
            table.string("requester_phone", 32).nullable();
            table.string("subject", 255).notNullable();
            table.string("status", 24).notNullable().defaultTo("open");
            table.string("priority", 16).notNullable().defaultTo("normal");
            table.string("channel", 16).notNullable().defaultTo("admin");
            table.string("category", 80).nullable();
            table.jsonb("tags").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.bigInteger("assigned_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.integer("version").notNullable().defaultTo(1);
            table.timestamp("first_response_due_at", { useTz: true }).nullable();
            table.timestamp("resolution_due_at", { useTz: true }).nullable();
            table.timestamp("first_response_at", { useTz: true }).nullable();
            table.timestamp("resolved_at", { useTz: true }).nullable();
            table.timestamp("closed_at", { useTz: true }).nullable();
            table.timestamp("last_message_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamps(true, true);
            table.unique(["tenant_id", "ticket_number"], { indexName: "support_tickets_number_unique" });
            table.unique(["tenant_id", "reference"], { indexName: "support_tickets_reference_unique" });
            table.index(["tenant_id", "status", "priority", "last_message_at"], "support_tickets_queue_idx");
            table.index(["tenant_id", "assigned_user_id", "status"], "support_tickets_assignee_idx");
            table.index(["tenant_id", "customer_id", "created_at"], "support_tickets_customer_idx");
            table.index(["tenant_id", "first_response_due_at"], "support_tickets_first_response_sla_idx");
            table.index(["tenant_id", "resolution_due_at"], "support_tickets_resolution_sla_idx");
        });

        this.schema.createTable("support_ticket_messages", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("ticket_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("support_tickets")
                .onDelete("CASCADE");
            table.bigInteger("author_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table
                .bigInteger("author_customer_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("customers")
                .onDelete("SET NULL");
            table.string("kind", 24).notNullable().defaultTo("requester_message");
            table.text("body").notNullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "ticket_id", "created_at"], "support_ticket_messages_thread_idx");
        });

        this.schema.createTable("support_ticket_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("ticket_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("support_tickets")
                .onDelete("CASCADE");
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("event_type", 48).notNullable();
            table.jsonb("payload").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "ticket_id", "created_at"], "support_ticket_events_timeline_idx");
        });

        const checks = [
            `ALTER TABLE support_ticket_settings ADD CONSTRAINT support_settings_prefix_check CHECK (reference_prefix ~ '^[A-Za-z0-9-]{1,12}$')`,
            `ALTER TABLE support_ticket_settings ADD CONSTRAINT support_settings_sla_check CHECK (first_response_minutes BETWEEN 1 AND 10080 AND resolution_minutes BETWEEN 1 AND 43200)`,
            `ALTER TABLE support_ticket_settings ADD CONSTRAINT support_settings_priority_check CHECK (default_priority IN ('low','normal','high','urgent'))`,
            `ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_status_check CHECK (status IN ('open','pending','waiting_customer','resolved','closed'))`,
            `ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_priority_check CHECK (priority IN ('low','normal','high','urgent'))`,
            `ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_channel_check CHECK (channel IN ('admin','web','email','phone','api'))`,
            `ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_version_check CHECK (version >= 1)`,
            `ALTER TABLE support_ticket_messages ADD CONSTRAINT support_ticket_messages_kind_check CHECK (kind IN ('requester_message','reply','internal_note','system'))`,
        ];
        for (const sql of checks) this.schema.raw(sql);

        const tenantTables = ["support_ticket_settings", "support_tickets", "support_ticket_messages", "support_ticket_events"];
        for (const table of tenantTables) {
            this.schema.raw(
                `ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`,
            );
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(
                `CREATE POLICY tenant_isolation ON ${table} USING (${TENANT_PREDICATE}) WITH CHECK (${TENANT_PREDICATE})`,
            );
        }
    }

    async down() {
        this.schema.dropTable("support_ticket_events");
        this.schema.dropTable("support_ticket_messages");
        this.schema.dropTable("support_tickets");
        this.schema.dropTable("support_ticket_settings");
    }
}
