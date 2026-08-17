import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";

export default class extends BaseSchema {
    async up() {
        this.schema.raw(`ALTER TABLE deal_campaigns DROP CONSTRAINT IF EXISTS deal_campaigns_status_check`);
        this.schema.raw(
            `ALTER TABLE deal_campaigns ADD CONSTRAINT deal_campaigns_status_check CHECK (status IN ('draft','scheduled','preheat','active','paused','sold_out','cancelled','ended','expired','archived'))`,
        );

        this.schema.createTable("deal_allocations", (table) => {
            table.bigIncrements("id");
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("campaign_id").unsigned().notNullable().references("id").inTable("deal_campaigns").onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("CASCADE");
            table.bigInteger("variant_id").unsigned().nullable().references("id").inTable("product_variations").onDelete("CASCADE");
            table.integer("allocated_quantity").notNullable();
            table.integer("reserved_quantity").notNullable().defaultTo(0);
            table.integer("consumed_quantity").notNullable().defaultTo(0);
            table.integer("version").notNullable().defaultTo(1);
            table.timestamps(true, true);
            table.index(["tenant_id", "campaign_id", "product_id", "variant_id"], "deal_allocations_lookup_idx");
        });
        this.schema.raw(
            `ALTER TABLE deal_allocations ADD CONSTRAINT deal_allocations_capacity_check CHECK (allocated_quantity > 0 AND reserved_quantity >= 0 AND consumed_quantity >= 0 AND reserved_quantity + consumed_quantity <= allocated_quantity AND version >= 1)`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX deal_allocations_scope_unique ON deal_allocations (tenant_id, campaign_id, COALESCE(product_id, 0), COALESCE(variant_id, 0))`,
        );
        this.schema.raw(`ALTER TABLE deal_allocations ALTER COLUMN tenant_id SET DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::bigint`);
        this.schema.raw(`ALTER TABLE deal_allocations ENABLE ROW LEVEL SECURITY`);
        this.schema.raw(`ALTER TABLE deal_allocations FORCE ROW LEVEL SECURITY`);
        this.schema.raw(`CREATE POLICY tenant_isolation ON deal_allocations USING (${TENANT}) WITH CHECK (${TENANT})`);
    }

    async down() {
        this.schema.dropTable("deal_allocations");
        this.schema.raw(`ALTER TABLE deal_campaigns DROP CONSTRAINT IF EXISTS deal_campaigns_status_check`);
        this.schema.raw(
            `ALTER TABLE deal_campaigns ADD CONSTRAINT deal_campaigns_status_check CHECK (status IN ('draft','scheduled','active','paused','cancelled','ended','expired','archived'))`,
        );
    }
}
