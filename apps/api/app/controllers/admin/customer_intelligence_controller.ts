import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import {
    assertCustomerIntelligenceEligible,
    purgeIneligibleCustomerIntelligence,
} from "#services/customer_intelligence_eligibility_service";
import {
    getCustomerIntelligence,
    getCustomerIntelligenceSummary,
    getLifecycleCohorts,
    refreshAllCustomerIntelligence,
    refreshCustomerIntelligence,
} from "#services/customer_intelligence_service";

function numericId(value: unknown): number {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
    return id;
}

export default class AdminCustomerIntelligenceController {
    async summary() {
        return { data: await getCustomerIntelligenceSummary() };
    }

    async cohorts() {
        return { data: await getLifecycleCohorts() };
    }

    async show(ctx: HttpContext) {
        const customerId = numericId(ctx.params.id);
        await assertCustomerIntelligenceEligible(customerId);
        return { data: await getCustomerIntelligence(customerId) };
    }

    async refresh(ctx: HttpContext) {
        const customerId = numericId(ctx.params.id);
        await assertCustomerIntelligenceEligible(customerId);
        const data = await refreshCustomerIntelligence(customerId);
        await recordAudit({
            ctx,
            action: "customer.intelligence.refresh",
            entityKind: "customer",
            entityId: customerId,
            payload: { engine_version: data.engine_version },
        });
        return { data };
    }

    async refreshAll(ctx: HttpContext) {
        const purged = await purgeIneligibleCustomerIntelligence();
        const refreshed = await refreshAllCustomerIntelligence();
        await recordAudit({
            ctx,
            action: "customer.intelligence.refresh_all",
            entityKind: "customer_intelligence",
            entityId: null,
            payload: { refreshed, purged },
        });
        return { data: { refreshed, purged } };
    }
}
