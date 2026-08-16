import db from "@adonisjs/lucid/services/db";
import { Job } from "@adonisjs/queue";

import { reconcileCustomerEventDrivenSegments } from "#services/customer_intelligence_segments_service";
import { refreshCustomerIntelligence } from "#services/customer_intelligence_service";
import { maybeTenantContext, runWithTenant } from "#services/tenant_context";

interface RefreshCustomerIntelligencePayload {
    tenantId: string;
    customerId: number;
}

async function refreshCustomerAndSegments(customerId: number): Promise<void> {
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
