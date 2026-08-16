import { Exception } from "@adonisjs/core/exceptions";

import { currentTrx } from "#services/tenant_context";

export async function assertCustomerIntelligenceEligible(customerId: number): Promise<void> {
    const row = await currentTrx()
        .from("customers as c")
        .leftJoin("users as u", "u.id", "c.user_id")
        .where("c.id", customerId)
        .whereNull("c.deleted_at")
        .where((query) => query.whereNull("c.user_id").orWhere("u.role", "customer"))
        .select("c.id")
        .first();

    if (!row) {
        throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
    }
}

/**
 * Remove rebuildable Phase 15 projections for rows that are no longer eligible customers.
 * Canonical customer/order/support data is untouched. This covers soft deletes, Customer→admin
 * role changes, and historical rows left behind before event-driven reconciliation was enabled.
 */
export async function purgeIneligibleCustomerIntelligence(): Promise<number> {
    const staleRows = await currentTrx()
        .from("customer_intelligence_profiles as cip")
        .whereNotExists((sub) =>
            sub
                .select("c.id")
                .from("customers as c")
                .leftJoin("users as u", "u.id", "c.user_id")
                .whereRaw("c.id = cip.customer_id")
                .whereNull("c.deleted_at")
                .where((query) => query.whereNull("c.user_id").orWhere("u.role", "customer")),
        )
        .select("cip.customer_id");

    const ids = staleRows.map((row) => Number(row.customer_id)).filter((id) => Number.isSafeInteger(id) && id > 0);
    if (ids.length === 0) return 0;

    await currentTrx().from("customer_segment_memberships").whereIn("customer_id", ids).delete();
    await currentTrx().from("customer_intelligence_profiles").whereIn("customer_id", ids).delete();
    return ids.length;
}
