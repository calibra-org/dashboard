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

async function collectIneligibleCustomerIds(table: string, alias: string): Promise<number[]> {
    const rows = await currentTrx()
        .from(`${table} as ${alias}`)
        .whereNotExists((sub) =>
            sub
                .select("c.id")
                .from("customers as c")
                .leftJoin("users as u", "u.id", "c.user_id")
                .whereRaw(`c.id = ${alias}.customer_id`)
                .whereNull("c.deleted_at")
                .where((query) => query.whereNull("c.user_id").orWhere("u.role", "customer")),
        )
        .select(`${alias}.customer_id`);

    return rows.map((row) => Number(row.customer_id)).filter((id) => Number.isSafeInteger(id) && id > 0);
}

/**
 * Remove rebuildable Phase 15 projections for rows that are no longer eligible customers.
 * Canonical customer/order/support data is untouched. This covers soft deletes, Customer→admin
 * role changes, hard-delete leftovers, and historical orphan rows created before reconciliation.
 */
export async function purgeIneligibleCustomerIntelligence(): Promise<number> {
    const ids = new Set<number>();
    for (const [table, alias] of [
        ["customer_intelligence_profiles", "cip"],
        ["customer_segment_memberships", "csm"],
        ["customer_lifecycle_history", "clh"],
    ] as const) {
        for (const id of await collectIneligibleCustomerIds(table, alias)) ids.add(id);
    }

    if (ids.size === 0) return 0;
    const customerIds = [...ids];

    await currentTrx().from("customer_segment_memberships").whereIn("customer_id", customerIds).delete();
    await currentTrx().from("customer_lifecycle_history").whereIn("customer_id", customerIds).delete();
    await currentTrx().from("customer_intelligence_profiles").whereIn("customer_id", customerIds).delete();
    return customerIds.length;
}
