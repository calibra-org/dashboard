import { BaseSchema } from "@adonisjs/lucid/schema";

const NETWORK_MIN_COHORT_FLOOR = 5;

export default class extends BaseSchema {
    private readonly tenantTables = [
        "network_participation_policies",
        "network_metric_definitions",
        "network_contributions",
        "network_benchmark_publications",
        "network_export_requests",
        "network_security_reviews",
    ] as const;

    async up() {
        this.schema.createTable("network_participation_policies", (table) => {
            table.increments("id");
            table.uuid("public_id").notNullable().unique();
            table.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.integer("version").notNullable();
            table.boolean("opted_in").notNullable().defaultTo(false);
            table.string("legal_basis", 96).nullable();
            table.string("terms_version", 96).nullable();
            table.jsonb("purpose_scopes").notNullable().defaultTo("[]");
            table.integer("minimum_cohort_size").notNullable().defaultTo(20);
            table.string("privacy_method", 48).notNullable().defaultTo("aggregate_threshold");
            table.jsonb("privacy_parameters").notNullable().defaultTo("{}");
            table.string("policy_digest", 64).notNullable();
            table.text("reason").notNullable();
            table.integer("created_by_user_id").unsigned().nullable();
            table.timestamp("effective_at", { useTz: true }).notNullable();
            table.timestamp("created_at", { useTz: true }).notNullable();
            table.unique(["tenant_id", "version"]);
            table.index(["tenant_id", "effective_at"]);
        });

        this.schema.createTable("network_metric_definitions", (table) => {
            table.increments("id");
            table.uuid("public_id").notNullable().unique();
            table.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("metric_key", 120).notNullable();
            table.integer("version").notNullable();
            table.string("unit", 48).notNullable();
            table.text("numerator_definition").notNullable();
            table.text("denominator_definition").nullable();
            table.string("aggregation", 32).notNullable();
            table.string("period_grain", 32).notNullable();
            table.integer("minimum_records_per_contribution").notNullable().defaultTo(5);
            table.decimal("value_min", 28, 8).notNullable();
            table.decimal("value_max", 28, 8).notNullable();
            table.string("privacy_class", 32).notNullable().defaultTo("aggregate");
            table.string("definition_digest", 64).notNullable();
            table.boolean("active").notNullable().defaultTo(true);
            table.text("reason").notNullable();
            table.integer("created_by_user_id").unsigned().nullable();
            table.timestamp("created_at", { useTz: true }).notNullable();
            table.unique(["tenant_id", "metric_key", "version"]);
            table.index(["tenant_id", "metric_key", "active"]);
        });

        this.schema.createTable("network_contributions", (table) => {
            table.increments("id");
            table.uuid("public_id").notNullable().unique();
            table.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("metric_key", 120).notNullable();
            table.integer("metric_version").notNullable();
            table.string("definition_digest", 64).notNullable();
            table.string("period_key", 64).notNullable();
            table.string("segment_key", 96).notNullable().defaultTo("all");
            table.decimal("aggregate_value", 28, 8).notNullable();
            table.decimal("numerator", 28, 8).nullable();
            table.decimal("denominator", 28, 8).nullable();
            table.integer("record_count").notNullable();
            table.string("contribution_digest", 64).notNullable();
            table.jsonb("source_aggregate_refs").notNullable().defaultTo("[]");
            table.timestamp("created_at", { useTz: true }).notNullable();
            table.timestamp("updated_at", { useTz: true }).notNullable();
            table.unique(["tenant_id", "metric_key", "metric_version", "period_key", "segment_key"]);
            table.index(["tenant_id", "period_key"]);
        });

        this.schema.createTable("network_benchmark_publications", (table) => {
            table.increments("id");
            table.uuid("public_id").notNullable().unique();
            table.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("metric_key", 120).notNullable();
            table.integer("metric_version").notNullable();
            table.string("definition_digest", 64).notNullable();
            table.string("period_key", 64).notNullable();
            table.string("segment_key", 96).notNullable().defaultTo("all");
            table.integer("cohort_size").notNullable();
            table.integer("minimum_cohort_size").notNullable();
            table.string("privacy_method", 48).notNullable();
            table.string("algorithm_version", 64).notNullable();
            table.decimal("benchmark_value", 28, 8).notNullable();
            table.jsonb("distribution_summary").notNullable().defaultTo("{}");
            table.jsonb("privacy_parameters").notNullable().defaultTo("{}");
            table.string("publication_digest", 64).notNullable();
            table.string("source_batch_ref", 160).notNullable();
            table.timestamp("published_at", { useTz: true }).notNullable();
            table.unique(["tenant_id", "metric_key", "metric_version", "period_key", "segment_key", "publication_digest"]);
            table.index(["tenant_id", "published_at"]);
        });

        this.schema.createTable("network_export_requests", (table) => {
            table.increments("id");
            table.uuid("public_id").notNullable().unique();
            table.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("scope", 64).notNullable();
            table.string("status", 24).notNullable();
            table.jsonb("manifest").notNullable().defaultTo("{}");
            table.string("manifest_digest", 64).nullable();
            table.integer("requested_by_user_id").unsigned().nullable();
            table.timestamp("created_at", { useTz: true }).notNullable();
            table.timestamp("completed_at", { useTz: true }).nullable();
            table.index(["tenant_id", "created_at"]);
        });

        this.schema.createTable("network_security_reviews", (table) => {
            table.increments("id");
            table.uuid("public_id").notNullable().unique();
            table.integer("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("review_type", 64).notNullable();
            table.string("status", 24).notNullable();
            table.string("artifact_ref", 220).notNullable();
            table.jsonb("findings").notNullable().defaultTo("[]");
            table.text("decision").notNullable();
            table.integer("reviewed_by_user_id").unsigned().nullable();
            table.timestamp("reviewed_at", { useTz: true }).notNullable();
            table.index(["tenant_id", "reviewed_at"]);
        });

        this.defer(async (db) => {
            await db.rawQuery(
                `ALTER TABLE network_participation_policies ADD CONSTRAINT network_min_cohort_check CHECK (minimum_cohort_size >= ${NETWORK_MIN_COHORT_FLOOR})`,
            );
            await db.rawQuery(
                "ALTER TABLE network_metric_definitions ADD CONSTRAINT network_metric_bounds_check CHECK (value_min < value_max)",
            );
            await db.rawQuery(
                "ALTER TABLE network_contributions ADD CONSTRAINT network_record_count_check CHECK (record_count >= 1)",
            );
            await db.rawQuery(
                `ALTER TABLE network_benchmark_publications ADD CONSTRAINT network_publication_cohort_check CHECK (cohort_size >= minimum_cohort_size AND minimum_cohort_size >= ${NETWORK_MIN_COHORT_FLOOR})`,
            );
        });

        for (const table of this.tenantTables) {
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
        for (const table of [...this.tenantTables].reverse()) this.schema.dropTable(table);
    }
}
