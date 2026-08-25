import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";
const TABLES = [
    "product_passports",
    "product_passport_versions",
    "product_passport_evidence",
    "product_passport_edges",
    "product_passport_regulatory_mappings",
] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("product_passports", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("RESTRICT");
            table.bigInteger("variation_id").unsigned().nullable().references("id").inTable("product_variations").onDelete("SET NULL");
            table.string("identity_level", 16).notNullable();
            table.string("batch_code", 120).nullable();
            table.string("serial_number", 190).nullable();
            table.string("resolver_key", 190).notNullable();
            table.string("status", 24).notNullable().defaultTo("draft");
            table.integer("current_version").notNullable().defaultTo(0);
            table.jsonb("identifiers").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("public_fields").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("private_fields").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("resolver_config").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("updated_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("published_at", { useTz: true }).nullable();
            table.timestamp("revoked_at", { useTz: true }).nullable();
            table.timestamps(true, true);

            table.unique(["public_id"], { indexName: "product_passports_public_id_unique" });
            table.unique(["tenant_id", "resolver_key"], { indexName: "product_passports_resolver_key_unique" });
            table.index(["tenant_id", "product_id", "variation_id"], "product_passports_product_idx");
            table.index(["tenant_id", "status", "identity_level"], "product_passports_status_idx");
        });

        this.schema.createTable("product_passport_versions", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("passport_id").unsigned().notNullable().references("id").inTable("product_passports").onDelete("CASCADE");
            table.integer("version").notNullable();
            table.string("schema_version", 48).notNullable().defaultTo("calibra-dpp-v1");
            table.jsonb("public_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("content_hash", 64).notNullable();
            table.bigInteger("published_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("published_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["public_id"], { indexName: "product_passport_versions_public_id_unique" });
            table.unique(["tenant_id", "passport_id", "version"], { indexName: "product_passport_versions_version_unique" });
            table.unique(["tenant_id", "passport_id", "content_hash"], { indexName: "product_passport_versions_hash_unique" });
        });

        this.schema.createTable("product_passport_evidence", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("passport_id").unsigned().notNullable().references("id").inTable("product_passports").onDelete("CASCADE");
            table.string("evidence_type", 48).notNullable();
            table.string("visibility", 16).notNullable().defaultTo("private");
            table.string("verification_status", 24).notNullable().defaultTo("unverified");
            table.string("source_kind", 64).notNullable();
            table.string("source_ref", 190).nullable();
            table.string("issuer", 190).nullable();
            table.text("summary").nullable();
            table.jsonb("payload").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.string("content_hash", 64).notNullable();
            table.timestamp("occurred_at", { useTz: true }).nullable();
            table.timestamp("verified_at", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["public_id"], { indexName: "product_passport_evidence_public_id_unique" });
            table.unique(["tenant_id", "passport_id", "content_hash"], { indexName: "product_passport_evidence_hash_unique" });
            table.index(["tenant_id", "passport_id", "evidence_type", "visibility"], "product_passport_evidence_query_idx");
        });

        this.schema.createTable("product_passport_edges", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("passport_id").unsigned().notNullable().references("id").inTable("product_passports").onDelete("CASCADE");
            table.string("from_node_type", 32).notNullable();
            table.string("from_node_ref", 190).notNullable();
            table.string("relation_type", 64).notNullable();
            table.string("to_node_type", 32).notNullable();
            table.string("to_node_ref", 190).notNullable();
            table.string("visibility", 16).notNullable().defaultTo("private");
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["public_id"], { indexName: "product_passport_edges_public_id_unique" });
            table.unique(
                ["tenant_id", "passport_id", "from_node_type", "from_node_ref", "relation_type", "to_node_type", "to_node_ref"],
                { indexName: "product_passport_edges_unique" },
            );
            table.index(["tenant_id", "passport_id", "visibility"], "product_passport_edges_query_idx");
        });

        this.schema.createTable("product_passport_regulatory_mappings", (table) => {
            table.bigIncrements("id");
            table.uuid("public_id").notNullable().defaultTo(this.raw("gen_random_uuid()"));
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.string("jurisdiction", 64).notNullable();
            table.string("framework", 120).notNullable();
            table.string("framework_version", 64).notNullable();
            table.integer("mapping_version").notNullable();
            table.string("status", 24).notNullable().defaultTo("draft");
            table.jsonb("field_mapping").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.text("conformance_note").notNullable();
            table.timestamp("effective_from", { useTz: true }).nullable();
            table.timestamp("effective_to", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamps(true, true);

            table.unique(["public_id"], { indexName: "product_passport_regulatory_mappings_public_id_unique" });
            table.unique(["tenant_id", "jurisdiction", "framework", "framework_version", "mapping_version"], {
                indexName: "product_passport_regulatory_mapping_version_unique",
            });
        });

        for (const sql of [
            `ALTER TABLE product_passports ADD CONSTRAINT product_passports_identity_level_check CHECK (identity_level IN ('product','model','batch','item'))`,
            `ALTER TABLE product_passports ADD CONSTRAINT product_passports_identity_required_check CHECK ((identity_level <> 'batch' OR batch_code IS NOT NULL) AND (identity_level <> 'item' OR serial_number IS NOT NULL))`,
            `ALTER TABLE product_passports ADD CONSTRAINT product_passports_status_check CHECK (status IN ('draft','published','revoked'))`,
            `ALTER TABLE product_passport_evidence ADD CONSTRAINT product_passport_evidence_visibility_check CHECK (visibility IN ('public','private'))`,
            `ALTER TABLE product_passport_evidence ADD CONSTRAINT product_passport_evidence_status_check CHECK (verification_status IN ('unverified','verified','rejected','expired'))`,
            `ALTER TABLE product_passport_edges ADD CONSTRAINT product_passport_edges_visibility_check CHECK (visibility IN ('public','private'))`,
            `ALTER TABLE product_passport_regulatory_mappings ADD CONSTRAINT product_passport_regulatory_status_check CHECK (status IN ('draft','active','retired'))`,
            `ALTER TABLE product_passport_regulatory_mappings ADD CONSTRAINT product_passport_regulatory_conformance_note_check CHECK (length(btrim(conformance_note)) > 0)`,
        ]) {
            this.schema.raw(sql);
        }

        for (const table of TABLES) this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
        for (const table of TABLES) this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
        for (const table of TABLES) {
            this.schema.raw(`CREATE POLICY ${table}_tenant_policy ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`);
        }
    }

    async down() {
        for (const table of [...TABLES].reverse()) this.schema.dropTable(table);
    }
}
