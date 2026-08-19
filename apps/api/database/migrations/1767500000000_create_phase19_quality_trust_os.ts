import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("quality_reason_definitions", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("code", 96).notNullable();
            table.string("category", 64).notNullable();
            table.string("label_fa", 190).notNullable();
            table.string("label_en", 190).nullable();
            table.text("description_fa").nullable();
            table.string("default_severity", 16).notNullable().defaultTo("medium");
            table.integer("version").notNullable().defaultTo(1);
            table.boolean("is_active").notNullable().defaultTo(true);
            table.timestamp("valid_from", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("valid_to", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "code", "version"], { indexName: "quality_reason_version_unique" });
        });

        this.schema.createTable("return_item_inspections", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("return_item_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("order_return_items")
                .onDelete("CASCADE");
            table
                .bigInteger("reason_definition_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("quality_reason_definitions")
                .onDelete("SET NULL");
            table.string("condition", 32).notNullable();
            table.string("disposition", 48).notNullable();
            table.integer("inspected_quantity").notNullable();
            table.integer("defect_quantity").notNullable().defaultTo(0);
            table.text("note").nullable();
            table.jsonb("evidence_refs").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("idempotency_key", 96).nullable();
            table.string("idempotency_fingerprint", 64).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "return_item_id", "idempotency_key"], {
                indexName: "return_inspection_idempotency_unique",
            });
        });

        this.schema.createTable("quality_cases", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("reference", 48).notNullable();
            table.string("status", 32).notNullable().defaultTo("open");
            table.string("severity", 16).notNullable().defaultTo("medium");
            table.string("case_type", 64).notNullable();
            table.string("title", 255).notNullable();
            table.text("summary").nullable();
            table.bigInteger("owner_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table
                .bigInteger("variation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("SET NULL");
            table
                .bigInteger("reason_definition_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("quality_reason_definitions")
                .onDelete("SET NULL");
            table.timestamp("detected_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("due_at", { useTz: true }).nullable();
            table.text("resolution_summary").nullable();
            table.string("verification_status", 24).notNullable().defaultTo("not_started");
            table.text("closure_waiver_reason").nullable();
            table
                .bigInteger("closure_waived_by_user_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("users")
                .onDelete("SET NULL");
            table.timestamp("closure_waived_at", { useTz: true }).nullable();
            table.string("idempotency_key", 96).nullable();
            table.string("idempotency_fingerprint", 64).nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "reference"], { indexName: "quality_case_reference_unique" });
            table.unique(["tenant_id", "idempotency_key"], { indexName: "quality_case_idempotency_unique" });
            table.index(["tenant_id", "status", "severity", "updated_at"], "quality_case_queue_idx");
        });

        this.schema.createTable("quality_case_sources", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("quality_case_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("quality_cases")
                .onDelete("CASCADE");
            table
                .bigInteger("return_item_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("order_return_items")
                .onDelete("CASCADE");
            table
                .bigInteger("product_review_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_reviews")
                .onDelete("CASCADE");
            table
                .bigInteger("support_ticket_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("support_tickets")
                .onDelete("CASCADE");
            table.bigInteger("refund_id").unsigned().nullable().references("id").inTable("order_refunds").onDelete("SET NULL");
            table.string("source_role", 48).notNullable().defaultTo("signal");
            table.bigInteger("linked_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
        });

        this.schema.createTable("quality_evidence", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("quality_case_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("quality_cases")
                .onDelete("CASCADE");
            table.string("evidence_type", 64).notNullable();
            table.string("source_system", 96).notNullable();
            table.string("source_ref", 190).nullable();
            table.string("provenance_type", 24).notNullable();
            table.text("summary").notNullable();
            table.string("content_hash", 64).notNullable();
            table.jsonb("ai_provenance").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("captured_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "quality_case_id", "content_hash"], { indexName: "quality_evidence_hash_unique" });
        });

        this.schema.createTable("quality_findings", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("quality_case_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("quality_cases")
                .onDelete("CASCADE");
            table.string("truth_state", 24).notNullable().defaultTo("observed");
            table.string("finding_type", 64).notNullable();
            table.text("statement").notNullable();
            table.decimal("confidence", 5, 4).nullable();
            table.text("evidence_summary").nullable();
            table.string("idempotency_key", 96).nullable();
            table.string("idempotency_fingerprint", 64).nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("validated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("validated_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "quality_case_id", "idempotency_key"], {
                indexName: "quality_finding_idempotency_unique",
            });
        });

        this.schema.createTable("quality_signals", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("signal_type", 64).notNullable();
            table.string("status", 24).notNullable().defaultTo("open");
            table.string("severity", 16).notNullable();
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table.string("metric_key", 96).notNullable();
            table.bigInteger("numerator").notNullable();
            table.bigInteger("denominator").notNullable();
            table.decimal("rate", 12, 8).notNullable();
            table.decimal("threshold_rate", 12, 8).notNullable();
            table.string("detector_version", 48).notNullable();
            table.text("explanation").notNullable();
            table.timestamp("window_start", { useTz: true }).notNullable();
            table.timestamp("window_end", { useTz: true }).notNullable();
            table.string("dedupe_key", 190).notNullable();
            table
                .bigInteger("acknowledged_by_user_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("users")
                .onDelete("SET NULL");
            table.timestamp("acknowledged_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "dedupe_key"], { indexName: "quality_signal_dedupe_unique" });
        });

        this.schema.createTable("feedback_classifications", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("return_item_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("order_return_items")
                .onDelete("CASCADE");
            table
                .bigInteger("product_review_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_reviews")
                .onDelete("CASCADE");
            table
                .bigInteger("support_ticket_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("support_tickets")
                .onDelete("CASCADE");
            table.string("theme_code", 96).notNullable();
            table.string("sentiment", 24).nullable();
            table.decimal("confidence", 5, 4).nullable();
            table.string("provenance_type", 24).notNullable().defaultTo("operator");
            table.jsonb("ai_provenance").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("idempotency_key", 96).nullable();
            table.string("idempotency_fingerprint", 64).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "idempotency_key"], { indexName: "feedback_classification_idempotency_unique" });
        });

        this.schema.createTable("quality_actions", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("quality_case_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("quality_cases")
                .onDelete("CASCADE");
            table.string("action_type", 64).notNullable();
            table.string("status", 32).notNullable().defaultTo("proposed");
            table.string("title", 255).notNullable();
            table.text("description").nullable();
            table.bigInteger("owner_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("due_at", { useTz: true }).nullable();
            table.string("verification_metric_key", 96).nullable();
            table.string("idempotency_key", 96).nullable();
            table.string("idempotency_fingerprint", 64).nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);
            table.unique(["tenant_id", "quality_case_id", "idempotency_key"], { indexName: "quality_action_idempotency_unique" });
        });

        this.schema.createTable("quality_outcomes", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("quality_case_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("quality_cases")
                .onDelete("CASCADE");
            table
                .bigInteger("quality_action_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("quality_actions")
                .onDelete("SET NULL");
            table.string("metric_key", 96).notNullable();
            table.string("unit", 32).notNullable();
            table.decimal("baseline_value", 20, 8).nullable();
            table.decimal("actual_value", 20, 8).nullable();
            table.text("assessment").notNullable();
            table.string("idempotency_key", 96).nullable();
            table.string("idempotency_fingerprint", 64).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "quality_case_id", "idempotency_key"], {
                indexName: "quality_outcome_idempotency_unique",
            });
        });

        const checks = [
            `ALTER TABLE quality_reason_definitions ADD CONSTRAINT quality_reason_severity_check CHECK (default_severity IN ('low','medium','high','critical'))`,
            `ALTER TABLE return_item_inspections ADD CONSTRAINT return_inspection_quantity_check CHECK (inspected_quantity > 0 AND defect_quantity >= 0 AND defect_quantity <= inspected_quantity)`,
            `ALTER TABLE return_item_inspections ADD CONSTRAINT return_inspection_condition_check CHECK (condition IN ('sealed','unused','used','damaged','defective','incomplete','unknown'))`,
            `ALTER TABLE return_item_inspections ADD CONSTRAINT return_inspection_disposition_check CHECK (disposition IN ('restock','quarantine','refurbish','scrap','return_to_supplier','hold_for_investigation'))`,
            `ALTER TABLE quality_cases ADD CONSTRAINT quality_case_status_check CHECK (status IN ('open','triaged','investigating','action_required','verifying','resolved','closed'))`,
            `ALTER TABLE quality_cases ADD CONSTRAINT quality_case_severity_check CHECK (severity IN ('low','medium','high','critical'))`,
            `ALTER TABLE quality_case_sources ADD CONSTRAINT quality_case_source_exactly_one_check CHECK (num_nonnulls(return_item_id, product_review_id, support_ticket_id, refund_id) = 1)`,
            `ALTER TABLE quality_evidence ADD CONSTRAINT quality_evidence_provenance_check CHECK (provenance_type IN ('operator','customer','system','rule','ai','external'))`,
            `ALTER TABLE quality_findings ADD CONSTRAINT quality_finding_truth_check CHECK (truth_state IN ('observed','inferred','validated','disproven'))`,
            `ALTER TABLE quality_signals ADD CONSTRAINT quality_signal_status_check CHECK (status IN ('open','acknowledged','resolved'))`,
            `ALTER TABLE feedback_classifications ADD CONSTRAINT feedback_source_exactly_one_check CHECK (num_nonnulls(return_item_id, product_review_id, support_ticket_id) = 1)`,
            `ALTER TABLE quality_actions ADD CONSTRAINT quality_action_status_check CHECK (status IN ('proposed','accepted','in_progress','verification_pending','completed','rejected','cancelled'))`,
        ];
        for (const sql of checks) this.schema.raw(sql);

        const tenantTables = [
            "quality_reason_definitions",
            "return_item_inspections",
            "quality_cases",
            "quality_case_sources",
            "quality_evidence",
            "quality_findings",
            "quality_signals",
            "feedback_classifications",
            "quality_actions",
            "quality_outcomes",
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
            `CREATE UNIQUE INDEX quality_source_return_unique ON quality_case_sources (tenant_id, quality_case_id, return_item_id) WHERE return_item_id IS NOT NULL`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX quality_source_review_unique ON quality_case_sources (tenant_id, quality_case_id, product_review_id) WHERE product_review_id IS NOT NULL`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX quality_source_ticket_unique ON quality_case_sources (tenant_id, quality_case_id, support_ticket_id) WHERE support_ticket_id IS NOT NULL`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX quality_source_refund_unique ON quality_case_sources (tenant_id, quality_case_id, refund_id) WHERE refund_id IS NOT NULL`,
        );
    }

    async down() {
        for (const table of [
            "quality_outcomes",
            "quality_actions",
            "feedback_classifications",
            "quality_signals",
            "quality_findings",
            "quality_evidence",
            "quality_case_sources",
            "quality_cases",
            "return_item_inspections",
            "quality_reason_definitions",
        ])
            this.schema.dropTable(table);
    }
}
