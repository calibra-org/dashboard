import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";

import { currentTenantId, currentTrx } from "#services/tenant_context";

export type EconomicQuality = "estimated" | "realized" | "forecast" | "incomplete";
export type InventoryCostMethod = "fifo" | "weighted_average" | "manual";

function number(value: unknown): number {
    const parsed = Number(value ?? 0);
    if (!Number.isSafeInteger(parsed)) throw new Error(`Unsafe minor-unit integer: ${String(value)}`);
    return parsed;
}

function positiveInt(value: unknown, field: string): number {
    const parsed = number(value);
    if (parsed <= 0) throw new Error(`${field} must be a positive integer`);
    return parsed;
}

function nullableMinor(value: unknown): number | null {
    if (value === undefined || value === null || value === "") return null;
    return number(value);
}

function normalizedCurrency(value: unknown): string {
    const currency = String(value ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be a 3-letter ISO-style code");
    return currency;
}

function requestHash(payload: unknown): string {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function idempotent<T>(scope: string, key: string, payload: unknown, work: () => Promise<T>): Promise<T> {
    if (!key || key.length < 8 || key.length > 190) throw new Error("Idempotency-Key must be between 8 and 190 characters");
    const trx = currentTrx();
    const hash = requestHash(payload);
    const existing = await trx.from("economic_mutation_receipts").where({ scope, idempotency_key: key }).first();
    if (existing) {
        if (String(existing.request_hash) !== hash) {
            const error = new Error("Idempotency key reused with a different payload") as Error & { code?: string };
            error.code = "ECONOMICS_IDEMPOTENCY_CONFLICT";
            throw error;
        }
        if (existing.response_payload !== null) return existing.response_payload as T;
    } else {
        await trx.table("economic_mutation_receipts").insert({ scope, idempotency_key: key, request_hash: hash });
    }
    const result = await work();
    await trx
        .from("economic_mutation_receipts")
        .where({ scope, idempotency_key: key, request_hash: hash })
        .update({ response_payload: JSON.stringify(result) });
    return result;
}

export async function createCostPolicy(input: {
    idempotencyKey: string;
    inventoryMethod: InventoryCostMethod;
    packagingMinor?: number | null;
    fulfillmentMinor?: number | null;
    paymentFeeBps?: number | null;
    channelFeeBps?: number | null;
    promotionMinor?: number | null;
    affiliateMinor?: number | null;
    currency: string;
    effectiveFrom: string;
    userId?: number | null;
}) {
    return idempotent("cost_policy.create", input.idempotencyKey, input, async () => {
        const trx = currentTrx();
        await trx.rawQuery("SELECT pg_advisory_xact_lock(?, ?)", [Number(currentTenantId()), 1201]);
        const last = await trx.from("economic_cost_policies").max("version as version").first();
        const version = Number(last?.version ?? 0) + 1;
        const [row] = await trx
            .table("economic_cost_policies")
            .insert({
                version,
                inventory_method: input.inventoryMethod,
                packaging_minor: nullableMinor(input.packagingMinor),
                fulfillment_minor: nullableMinor(input.fulfillmentMinor),
                payment_fee_bps: nullableMinor(input.paymentFeeBps),
                channel_fee_bps: nullableMinor(input.channelFeeBps),
                promotion_minor: nullableMinor(input.promotionMinor),
                affiliate_minor: nullableMinor(input.affiliateMinor),
                currency: normalizedCurrency(input.currency),
                effective_from: DateTime.fromISO(input.effectiveFrom).toUTC().toSQL(),
                created_by_user_id: input.userId ?? null,
            })
            .returning("*");
        return row;
    });
}

export async function createCostLayer(input: {
    idempotencyKey: string;
    productId: number;
    variationId?: number | null;
    quantity: number;
    unitPurchaseCostMinor?: number | null;
    unitLandedCostMinor?: number | null;
    currency: string;
    sourceKind?: string;
    sourceRef?: string | null;
    effectiveAt: string;
    userId?: number | null;
}) {
    return idempotent("cost_layer.create", input.idempotencyKey, input, async () => {
        const trx = currentTrx();
        const quantity = positiveInt(input.quantity, "quantity");
        const [row] = await trx
            .table("economic_cost_layers")
            .insert({
                product_id: positiveInt(input.productId, "productId"),
                variation_id: input.variationId ? positiveInt(input.variationId, "variationId") : null,
                quantity_initial: quantity,
                quantity_remaining: quantity,
                unit_purchase_cost_minor: nullableMinor(input.unitPurchaseCostMinor),
                unit_landed_cost_minor: nullableMinor(input.unitLandedCostMinor),
                currency: normalizedCurrency(input.currency),
                source_kind: String(input.sourceKind || "manual").slice(0, 48),
                source_ref: input.sourceRef ? String(input.sourceRef).slice(0, 190) : null,
                effective_at: DateTime.fromISO(input.effectiveAt).toUTC().toSQL(),
                created_by_user_id: input.userId ?? null,
            })
            .returning("*");
        return row;
    });
}

async function activePolicy(trx: TransactionClientContract, currency: string, effectiveAt: string) {
    return trx
        .from("economic_cost_policies")
        .where("currency", currency)
        .where("effective_from", "<=", effectiveAt)
        .orderBy("effective_from", "desc")
        .orderBy("version", "desc")
        .first();
}

async function layerConsumed(trx: TransactionClientContract, layerId: number): Promise<number> {
    const row = await trx
        .from("economic_line_cost_snapshots as s")
        .crossJoin(trx.raw("jsonb_array_elements(s.layer_breakdown) AS elem"))
        .whereRaw("(elem->>'layer_id')::bigint = ?", [layerId])
        .whereNot("s.quality", "incomplete")
        .sum(trx.raw("COALESCE((elem->>'quantity')::int, 0) AS consumed"))
        .first();
    return Number(row?.consumed ?? 0);
}

async function resolveLineCost(
    trx: TransactionClientContract,
    line: Record<string, any>,
    currency: string,
    effectiveAt: string,
    method: InventoryCostMethod,
) {
    if (!line.product_id) {
        return { quality: "incomplete" as const, unitCostMinor: null, totalCostMinor: null, breakdown: [] as any[] };
    }
    const lockKey = Number(line.variation_id ?? line.product_id) % 2147483647;
    await trx.rawQuery("SELECT pg_advisory_xact_lock(?, ?)", [Number(currentTenantId()) % 2147483647, lockKey]);
    const layers = await trx
        .from("economic_cost_layers")
        .where("product_id", Number(line.product_id))
        .where("currency", currency)
        .where("effective_at", "<=", effectiveAt)
        .modify((q) => {
            if (line.variation_id) q.where("variation_id", Number(line.variation_id));
            else q.whereNull("variation_id");
        })
        .orderBy("effective_at", "asc")
        .orderBy("id", "asc");
    if (layers.length === 0) return { quality: "incomplete" as const, unitCostMinor: null, totalCostMinor: null, breakdown: [] as any[] };

    const candidates: Array<{ row: any; available: number; unit: number | null }> = [];
    for (const layer of layers) {
        const consumed = await layerConsumed(trx, Number(layer.id));
        const available = Math.max(0, Number(layer.quantity_initial) - consumed);
        candidates.push({ row: layer, available, unit: layer.unit_landed_cost_minor === null ? null : number(layer.unit_landed_cost_minor) });
    }
    const quantity = Number(line.quantity);
    if (method === "weighted_average") {
        const usable = candidates.filter((c) => c.available > 0);
        const available = usable.reduce((sum, c) => sum + c.available, 0);
        if (available < quantity || usable.some((c) => c.unit === null)) {
            return { quality: "incomplete" as const, unitCostMinor: null, totalCostMinor: null, breakdown: usable.map((c) => ({ layer_id: Number(c.row.id), quantity: 0, unit_cost_minor: c.unit })) };
        }
        const weighted = Math.round(usable.reduce((sum, c) => sum + c.available * (c.unit ?? 0), 0) / available);
        return {
            quality: "realized" as const,
            unitCostMinor: weighted,
            totalCostMinor: weighted * quantity,
            breakdown: [{ layer_id: Number(usable[0].row.id), quantity, unit_cost_minor: weighted, method: "weighted_average" }],
        };
    }

    let remaining = quantity;
    let total = 0;
    const breakdown: any[] = [];
    for (const candidate of candidates) {
        if (remaining <= 0) break;
        if (candidate.available <= 0) continue;
        if (candidate.unit === null) return { quality: "incomplete" as const, unitCostMinor: null, totalCostMinor: null, breakdown };
        const take = Math.min(remaining, candidate.available);
        breakdown.push({ layer_id: Number(candidate.row.id), quantity: take, unit_cost_minor: candidate.unit });
        total += take * candidate.unit;
        remaining -= take;
    }
    if (remaining > 0) return { quality: "incomplete" as const, unitCostMinor: null, totalCostMinor: null, breakdown };
    return { quality: "realized" as const, unitCostMinor: Math.round(total / quantity), totalCostMinor: total, breakdown };
}

async function insertLedger(trx: TransactionClientContract, row: Record<string, unknown>) {
    await trx.table("economic_ledger_entries").insert(row).onConflict(["tenant_id", "entry_kind", "source_kind", "source_id", "order_line_item_id"]).ignore();
}

function allocate(total: number | null, lineTotals: number[]): number[] {
    if (total === null) return lineTotals.map(() => 0);
    const denominator = lineTotals.reduce((a, b) => a + Math.max(0, b), 0);
    if (denominator <= 0 || lineTotals.length === 0) return lineTotals.map(() => 0);
    let assigned = 0;
    return lineTotals.map((line, index) => {
        if (index === lineTotals.length - 1) return total - assigned;
        const share = Math.floor((total * Math.max(0, line)) / denominator);
        assigned += share;
        return share;
    });
}

export async function captureOrderEconomics(input: { orderId: number; effectiveAt?: string; trx?: TransactionClientContract }) {
    const trx = input.trx ?? currentTrx();
    const order = await trx.from("orders").where("id", input.orderId).first();
    if (!order) return null;
    const currency = normalizedCurrency(order.currency);
    const effectiveAt = input.effectiveAt ?? order.date_paid_at ?? order.created_at ?? DateTime.utc().toSQL()!;
    const policy = await activePolicy(trx, currency, String(effectiveAt));
    const lines = await trx.from("order_line_items").where("order_id", input.orderId).orderBy("id", "asc");
    if (lines.length === 0) return { order_id: input.orderId, captured: 0 };
    const method: InventoryCostMethod = (policy?.inventory_method as InventoryCostMethod | undefined) ?? "fifo";
    const lineTotals = lines.map((line) => number(line.total));
    const shippingShares = allocate(number(order.shipping_total ?? 0), lineTotals);
    const packagingShares = allocate(policy?.packaging_minor === null || policy?.packaging_minor === undefined ? null : number(policy.packaging_minor), lineTotals);
    const fulfillmentShares = allocate(policy?.fulfillment_minor === null || policy?.fulfillment_minor === undefined ? null : number(policy.fulfillment_minor), lineTotals);
    const promotionShares = allocate(policy?.promotion_minor === null || policy?.promotion_minor === undefined ? null : number(policy.promotion_minor), lineTotals);
    const affiliateShares = allocate(policy?.affiliate_minor === null || policy?.affiliate_minor === undefined ? null : number(policy.affiliate_minor), lineTotals);

    let captured = 0;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const existing = await trx.from("economic_line_cost_snapshots").where("order_line_item_id", Number(line.id)).orderBy("version", "desc").first();
        if (existing) continue;
        const resolved = await resolveLineCost(trx, line, currency, String(effectiveAt), method);
        const [snapshot] = await trx
            .table("economic_line_cost_snapshots")
            .insert({
                order_id: input.orderId,
                order_line_item_id: Number(line.id),
                product_id: line.product_id ?? null,
                variation_id: line.variation_id ?? null,
                version: 1,
                quantity: Number(line.quantity),
                unit_cost_minor: resolved.unitCostMinor,
                total_cost_minor: resolved.totalCostMinor,
                currency,
                quality: resolved.quality,
                method,
                policy_id: policy?.id ?? null,
                layer_breakdown: JSON.stringify(resolved.breakdown),
                effective_at: effectiveAt,
            })
            .returning("*");

        await insertLedger(trx, {
            order_id: input.orderId,
            order_line_item_id: Number(line.id),
            product_id: line.product_id ?? null,
            variation_id: line.variation_id ?? null,
            entry_kind: "revenue",
            quality: order.date_paid_at ? "realized" : "estimated",
            amount_minor: number(line.total) + number(line.total_tax ?? 0),
            currency,
            source_kind: "order_line",
            source_id: String(line.id),
            metadata: JSON.stringify({ order_number: String(order.order_number) }),
            effective_at: effectiveAt,
        });
        await insertLedger(trx, {
            order_id: input.orderId,
            order_line_item_id: Number(line.id),
            product_id: line.product_id ?? null,
            variation_id: line.variation_id ?? null,
            entry_kind: "cogs",
            quality: resolved.quality,
            amount_minor: resolved.totalCostMinor === null ? null : -resolved.totalCostMinor,
            currency,
            source_kind: "cost_snapshot",
            source_id: String(snapshot.id),
            metadata: JSON.stringify({ method }),
            effective_at: effectiveAt,
        });
        const policyCosts: Array<[string, number | null, number]> = [
            ["shipping_cost", number(order.shipping_total ?? 0), shippingShares[index]],
            ["packaging_cost", policy?.packaging_minor ?? null, packagingShares[index]],
            ["fulfillment_cost", policy?.fulfillment_minor ?? null, fulfillmentShares[index]],
            ["promotion_cost", policy?.promotion_minor ?? null, promotionShares[index]],
            ["affiliate_cost", policy?.affiliate_minor ?? null, affiliateShares[index]],
        ];
        for (const [kind, configured, share] of policyCosts) {
            await insertLedger(trx, {
                order_id: input.orderId,
                order_line_item_id: Number(line.id),
                product_id: line.product_id ?? null,
                variation_id: line.variation_id ?? null,
                entry_kind: kind,
                quality: configured === null ? "incomplete" : kind === "shipping_cost" ? "realized" : "estimated",
                amount_minor: configured === null ? null : -share,
                currency,
                source_kind: kind === "shipping_cost" ? "order" : "cost_policy",
                source_id: `${input.orderId}:${policy?.id ?? "none"}:${kind}`,
                metadata: JSON.stringify({ policy_id: policy?.id ?? null }),
                effective_at: effectiveAt,
            });
        }
        const paymentFeeBps = policy?.payment_fee_bps === null || policy?.payment_fee_bps === undefined ? null : number(policy.payment_fee_bps);
        const channelFeeBps = policy?.channel_fee_bps === null || policy?.channel_fee_bps === undefined ? null : number(policy.channel_fee_bps);
        for (const [kind, bps] of [["payment_fee", paymentFeeBps], ["channel_fee", channelFeeBps]] as const) {
            const fee = bps === null ? null : Math.round((number(line.total) * bps) / 10000);
            await insertLedger(trx, {
                order_id: input.orderId,
                order_line_item_id: Number(line.id),
                product_id: line.product_id ?? null,
                variation_id: line.variation_id ?? null,
                entry_kind: kind,
                quality: fee === null ? "incomplete" : "estimated",
                amount_minor: fee === null ? null : -fee,
                currency,
                source_kind: "cost_policy",
                source_id: `${input.orderId}:${policy?.id ?? "none"}:${kind}`,
                metadata: JSON.stringify({ bps }),
                effective_at: effectiveAt,
            });
        }
        captured += 1;
    }
    return { order_id: input.orderId, captured };
}

export async function captureRefundEconomics(refundId: number, trx: TransactionClientContract = currentTrx()) {
    const refund = await trx.from("order_refunds").where("id", refundId).first();
    if (!refund) return null;
    const order = await trx.from("orders").where("id", Number(refund.order_id)).first();
    if (!order) return null;
    const currency = normalizedCurrency(order.currency);
    const lines = await trx.from("order_refund_line_items").where("refund_id", refundId);
    for (const refundLine of lines) {
        const sourceLine = await trx.from("order_line_items").where("id", Number(refundLine.order_line_item_id)).first();
        if (!sourceLine) continue;
        const snapshot = await trx.from("economic_line_cost_snapshots").where("order_line_item_id", Number(sourceLine.id)).orderBy("version", "desc").first();
        await insertLedger(trx, {
            order_id: Number(refund.order_id),
            order_line_item_id: Number(sourceLine.id),
            product_id: sourceLine.product_id ?? null,
            variation_id: sourceLine.variation_id ?? null,
            entry_kind: "refund_revenue_reversal",
            quality: "realized",
            amount_minor: -number(refundLine.refund_amount_minor) - number(refundLine.refund_tax_minor ?? 0),
            currency,
            source_kind: "refund_line",
            source_id: String(refundLine.id),
            metadata: JSON.stringify({ refund_id: refundId }),
            effective_at: refund.processed_at ?? refund.created_at,
        });
        const recovered = snapshot?.total_cost_minor === null || !snapshot ? null : Math.round((number(snapshot.total_cost_minor) * Number(refundLine.quantity)) / Number(snapshot.quantity));
        await insertLedger(trx, {
            order_id: Number(refund.order_id),
            order_line_item_id: Number(sourceLine.id),
            product_id: sourceLine.product_id ?? null,
            variation_id: sourceLine.variation_id ?? null,
            entry_kind: "refund_cogs_recovery",
            quality: recovered === null ? "incomplete" : "realized",
            amount_minor: recovered,
            currency,
            source_kind: "refund_line",
            source_id: String(refundLine.id),
            metadata: JSON.stringify({ refund_id: refundId, restock_requested: Boolean(refund.restock_requested) }),
            effective_at: refund.processed_at ?? refund.created_at,
        });
    }
    return { refund_id: refundId, captured: lines.length };
}

export async function correctLineCost(input: {
    idempotencyKey: string;
    orderLineItemId: number;
    unitCostMinor: number;
    reason: string;
    userId?: number | null;
}) {
    return idempotent("line_cost.correct", input.idempotencyKey, input, async () => {
        const trx = currentTrx();
        await trx.rawQuery("SELECT pg_advisory_xact_lock(?, ?)", [Number(currentTenantId()) % 2147483647, input.orderLineItemId % 2147483647]);
        const line = await trx.from("order_line_items").where("id", input.orderLineItemId).first();
        if (!line) throw new Error("Order line not found");
        const previous = await trx.from("economic_line_cost_snapshots").where("order_line_item_id", input.orderLineItemId).orderBy("version", "desc").first();
        if (!previous) throw new Error("No economic snapshot exists for this line");
        const total = positiveInt(input.unitCostMinor, "unitCostMinor") * Number(line.quantity);
        const version = Number(previous.version) + 1;
        const [snapshot] = await trx.table("economic_line_cost_snapshots").insert({
            order_id: Number(line.order_id),
            order_line_item_id: input.orderLineItemId,
            product_id: line.product_id ?? null,
            variation_id: line.variation_id ?? null,
            version,
            quantity: Number(line.quantity),
            unit_cost_minor: input.unitCostMinor,
            total_cost_minor: total,
            currency: previous.currency,
            quality: "realized",
            method: "manual",
            policy_id: previous.policy_id ?? null,
            layer_breakdown: JSON.stringify([]),
            reason: String(input.reason).slice(0, 500),
            replaces_snapshot_id: Number(previous.id),
            effective_at: DateTime.utc().toSQL(),
            created_by_user_id: input.userId ?? null,
        }).returning("*");
        const oldLedger = await trx.from("economic_ledger_entries").where({ entry_kind: "cogs", source_kind: "cost_snapshot", source_id: String(previous.id) }).first();
        if (oldLedger && oldLedger.amount_minor !== null) {
            await insertLedger(trx, {
                order_id: Number(line.order_id), order_line_item_id: input.orderLineItemId, product_id: line.product_id ?? null, variation_id: line.variation_id ?? null,
                entry_kind: "cogs_reversal", quality: "realized", amount_minor: -number(oldLedger.amount_minor), currency: previous.currency,
                source_kind: "cost_correction", source_id: `${snapshot.id}:reversal`, reversal_of_id: Number(oldLedger.id), metadata: JSON.stringify({ reason: input.reason }), effective_at: DateTime.utc().toSQL(),
            });
        }
        await insertLedger(trx, {
            order_id: Number(line.order_id), order_line_item_id: input.orderLineItemId, product_id: line.product_id ?? null, variation_id: line.variation_id ?? null,
            entry_kind: "cogs", quality: "realized", amount_minor: -total, currency: previous.currency,
            source_kind: "cost_snapshot", source_id: String(snapshot.id), metadata: JSON.stringify({ corrected: true, reason: input.reason }), effective_at: DateTime.utc().toSQL(),
        });
        return snapshot;
    });
}

export async function reconcileSettlement(input: {
    idempotencyKey: string;
    provider: string;
    settlementKey: string;
    status: "forecast" | "pending" | "settled" | "reversed";
    currency: string;
    grossMinor: number;
    feeMinor: number;
    refundMinor: number;
    expectedAt?: string | null;
    settledAt?: string | null;
    evidence?: Record<string, unknown>;
    userId?: number | null;
}) {
    return idempotent("settlement.reconcile", input.idempotencyKey, input, async () => {
        const trx = currentTrx();
        const provider = String(input.provider).slice(0, 80);
        const key = String(input.settlementKey).slice(0, 190);
        await trx.rawQuery("SELECT pg_advisory_xact_lock(?, hashtext(?))", [Number(currentTenantId()) % 2147483647, `${provider}:${key}`]);
        const previous = await trx.from("economic_settlements").where({ provider, settlement_key: key }).orderBy("revision", "desc").first();
        const revision = Number(previous?.revision ?? 0) + 1;
        const gross = number(input.grossMinor);
        const fee = number(input.feeMinor);
        const refund = number(input.refundMinor);
        const [row] = await trx.table("economic_settlements").insert({
            provider, settlement_key: key, revision, status: input.status, currency: normalizedCurrency(input.currency), gross_minor: gross,
            fee_minor: fee, refund_minor: refund, net_minor: gross - fee - refund,
            expected_at: input.expectedAt ? DateTime.fromISO(input.expectedAt).toUTC().toSQL() : null,
            settled_at: input.settledAt ? DateTime.fromISO(input.settledAt).toUTC().toSQL() : null,
            evidence: JSON.stringify(input.evidence ?? {}), replaces_settlement_id: previous?.id ?? null, created_by_user_id: input.userId ?? null,
        }).returning("*");
        return row;
    });
}

export async function profitabilityOverview(input: { from?: string; to?: string; currency?: string }) {
    const trx = currentTrx();
    const query = trx.from("economic_ledger_entries");
    if (input.from) query.where("effective_at", ">=", DateTime.fromISO(input.from).toUTC().toSQL()!);
    if (input.to) query.where("effective_at", "<=", DateTime.fromISO(input.to).toUTC().endOf("day").toSQL()!);
    if (input.currency) query.where("currency", normalizedCurrency(input.currency));
    const rows = await query
        .select("currency")
        .sum(trx.raw("CASE WHEN amount_minor IS NOT NULL THEN amount_minor ELSE 0 END AS contribution_minor"))
        .sum(trx.raw("CASE WHEN entry_kind='revenue' THEN COALESCE(amount_minor,0) ELSE 0 END AS revenue_minor"))
        .sum(trx.raw("CASE WHEN entry_kind IN ('cogs','cogs_reversal','refund_cogs_recovery') THEN COALESCE(amount_minor,0) ELSE 0 END AS cogs_minor"))
        .sum(trx.raw("CASE WHEN entry_kind LIKE 'refund_%' THEN COALESCE(amount_minor,0) ELSE 0 END AS refunds_minor"))
        .count(trx.raw("DISTINCT order_id AS orders"))
        .sum(trx.raw("CASE WHEN quality='incomplete' THEN 1 ELSE 0 END AS incomplete_entries"))
        .groupBy("currency");
    const settlements = await trx.from("economic_settlements").select("currency", "status").sum("net_minor as net_minor").groupBy("currency", "status");
    return { currencies: rows, settlements };
}

export async function profitabilityCube(input: { dimension?: "product" | "order"; currency?: string; limit?: number }) {
    const trx = currentTrx();
    const dimension = input.dimension ?? "product";
    const limit = Math.min(200, Math.max(1, Number(input.limit ?? 50)));
    const q = trx.from("economic_ledger_entries as e").leftJoin("products as p", "p.id", "e.product_id").leftJoin("orders as o", "o.id", "e.order_id");
    if (input.currency) q.where("e.currency", normalizedCurrency(input.currency));
    if (dimension === "order") {
        return q.select("e.order_id as id", "o.order_number as label", "e.currency").sum("e.amount_minor as contribution_minor").sum(trx.raw("CASE WHEN e.quality='incomplete' THEN 1 ELSE 0 END AS incomplete_entries")).groupBy("e.order_id", "o.order_number", "e.currency").orderBy("contribution_minor", "desc").limit(limit);
    }
    return q.select("e.product_id as id", "p.name as label", "e.currency").sum("e.amount_minor as contribution_minor").sum(trx.raw("CASE WHEN e.quality='incomplete' THEN 1 ELSE 0 END AS incomplete_entries")).whereNotNull("e.product_id").groupBy("e.product_id", "p.name", "e.currency").orderBy("contribution_minor", "desc").limit(limit);
}

export async function orderEconomics(orderId: number) {
    const trx = currentTrx();
    const order = await trx.from("orders").where("id", orderId).first();
    if (!order) return null;
    const ledger = await trx.from("economic_ledger_entries").where("order_id", orderId).orderBy("effective_at", "asc").orderBy("id", "asc");
    const snapshots = await trx.from("economic_line_cost_snapshots").where("order_id", orderId).orderBy("order_line_item_id", "asc").orderBy("version", "asc");
    return { order, ledger, snapshots };
}

export async function productEconomics(productId: number) {
    const trx = currentTrx();
    const product = await trx.from("products").where("id", productId).first();
    if (!product) return null;
    const ledger = await trx.from("economic_ledger_entries").where("product_id", productId).orderBy("effective_at", "desc").limit(500);
    const layers = await trx.from("economic_cost_layers").where("product_id", productId).orderBy("effective_at", "desc").limit(100);
    return { product, ledger, layers };
}

export async function workingCapital() {
    const trx = currentTrx();
    const tenant = await trx.from("tenants").select("default_currency").first();
    const currency = normalizedCurrency(tenant?.default_currency ?? "IRR");
    const layers = await trx.from("economic_cost_layers").where("currency", currency).orderBy("effective_at", "asc");
    let inventoryCapitalMinor = 0;
    let unvaluedUnits = 0;
    for (const layer of layers) {
        const consumed = await layerConsumed(trx, Number(layer.id));
        const remaining = Math.max(0, Number(layer.quantity_initial) - consumed);
        if (layer.unit_landed_cost_minor === null) unvaluedUnits += remaining;
        else inventoryCapitalMinor += remaining * number(layer.unit_landed_cost_minor);
    }
    const pending = await trx.from("economic_settlements").whereIn("status", ["forecast", "pending"]).where("currency", currency).sum("net_minor as amount").first();
    return { currency, inventory_capital_minor: inventoryCapitalMinor, unvalued_units: unvaluedUnits, expected_cash_minor: Number(pending?.amount ?? 0) };
}

export async function backfillEconomics(input: { offset?: number; limit?: number }) {
    const trx = currentTrx();
    const limit = Math.min(5000, Math.max(1, Number(input.limit ?? 500)));
    const offset = Math.max(0, Number(input.offset ?? 0));
    const orders = await trx.from("orders").whereNot("status", "draft").orderByRaw("COALESCE(date_paid_at, created_at) ASC").orderBy("id", "asc").offset(offset).limit(limit);
    let captured = 0;
    for (const order of orders) {
        const result = await captureOrderEconomics({ orderId: Number(order.id), effectiveAt: order.date_paid_at ?? order.created_at, trx });
        captured += Number(result?.captured ?? 0);
    }
    return { offset, limit, orders: orders.length, lines_captured: captured, next_offset: offset + orders.length };
}
