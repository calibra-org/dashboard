import db from "@adonisjs/lucid/services/db";
import { Job } from "@adonisjs/queue";

import { reconcileCustomerEventDrivenSegments } from "#services/customer_intelligence_segments_service";
import { refreshCustomerIntelligence } from "#services/customer_intelligence_service";
import { currentTrx, maybeTenantContext, runWithTenant } from "#services/tenant_context";

interface RefreshCustomerIntelligencePayload {
    tenantId: string;
    customerId: number;
}

async function refreshCustomerAndSegments(customerId: number): Promise<void> {
    const customer = await currentTrx()
        .from("customers as c")
        .leftJoin("users as u", "u.id", "c.user_id")
        .where("c.id", customerId)
        .whereNull("c.deleted_at")
        .where((query) => query.whereNull("c.user_id").orWhere("u.role", "customer"))
        .select("c.id")
        .first();

    if (!customer) {
        await currentTrx().from("customer_segment_memberships").where("customer_id", customerId).delete();
        await currentTrx().from("customer_lifecycle_history").where("customer_id", customerId).delete();
        await currentTrx().from("customer_intelligence_profiles").where("customer_id", customerId).delete();
        return;
    }

    await refreshCustomerIntelligence(customerId);
    await reconcileCustomerEventDrivenSegments(customerId);
}

export default class RefreshCustomerIntelligenceJob extends Job<RefreshCustomerIntelligencePayload> {
    static options = {
        queue: "customer-intelligence",
        maxRetries: 2,
        timeout: "2m",
    };

    async execute() {
        const existing = maybeTenantContext();
        if (existing && existing.tenantId === BigInt(this.payload.tenantId)) {
            await refreshCustomerAndSegments(this.payload.customerId);
            return;
        }

        const tenantId = BigInt(this.payload.tenantId);
        await db.connection().transaction(async (trx) => {
            await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
            await runWithTenant(tenantId, trx, () => refreshCustomerAndSegments(this.payload.customerId));
        });
    }
}
