import { currentTenantId, currentTrx } from "#services/tenant_context";

/**
 * Per-tenant monotonic numbering for business documents and support tickets. Every counter restarts
 * independently per tenant and advances inside the request transaction under a row lock.
 */
export type CounterKind = "order" | "refund" | "invoice" | "proforma" | "credit_note" | "ticket";

/** First number handed out for a kind when its counter row does not exist yet. */
const COUNTER_START: Record<CounterKind, number> = {
    order: 1000,
    refund: 1000,
    invoice: 1000,
    proforma: 1000,
    credit_note: 1000,
    ticket: 1000,
};

/**
 * Allocate and return the next number for `kind` within the current tenant. The allocation belongs
 * to the caller transaction, so rollbacks revert it and concurrent committed allocations serialize.
 */
export async function nextNumber(kind: CounterKind): Promise<number> {
    const tenantId = currentTenantId();
    const trx = currentTrx();
    const start = COUNTER_START[kind];

    await trx
        .table("tenant_number_counters")
        .insert({ tenant_id: tenantId, kind, next_value: start })
        .onConflict(["tenant_id", "kind"])
        .ignore();

    const result = await trx.rawQuery(
        "UPDATE tenant_number_counters SET next_value = next_value + 1, updated_at = now() WHERE tenant_id = ? AND kind = ? RETURNING next_value - 1 AS allocated",
        [String(tenantId), kind],
    );

    return Number(result.rows[0].allocated);
}

/**
 * Reserve a contiguous block of `count` numbers for `kind` and return the first number in the block.
 * One atomic update advances the counter while holding the row lock.
 */
export async function reserveNumberBlock(kind: CounterKind, count: number): Promise<number> {
    const tenantId = currentTenantId();
    const trx = currentTrx();
    const start = COUNTER_START[kind];

    await trx
        .table("tenant_number_counters")
        .insert({ tenant_id: tenantId, kind, next_value: start })
        .onConflict(["tenant_id", "kind"])
        .ignore();

    if (count <= 0) {
        const row = await trx.from("tenant_number_counters").where("tenant_id", String(tenantId)).where("kind", kind).first();
        return Number(row.next_value);
    }

    const result = await trx.rawQuery(
        "UPDATE tenant_number_counters SET next_value = next_value + ?, updated_at = now() WHERE tenant_id = ? AND kind = ? RETURNING next_value - ? AS base",
        [count, String(tenantId), kind, count],
    );

    return Number(result.rows[0].base);
}
