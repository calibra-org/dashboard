import { Exception } from "@adonisjs/core/exceptions";

import InventoryService from "#services/inventory_service";
import { currentTrx, withTenantTransaction } from "#services/tenant_context";

type Actor = { id?: number | string | bigint };
const n = (value: unknown) => Number(value ?? 0);
const inventory = new InventoryService();

function supplierScore(row: any) {
    const parts = {
        cost: row.cost_score == null ? null : n(row.cost_score),
        delivery: row.on_time_rate == null ? null : n(row.on_time_rate),
        fill: row.fill_rate == null ? null : n(row.fill_rate),
        quality: row.quality_rate == null ? null : n(row.quality_rate),
        responsiveness: row.responsiveness_score == null ? null : n(row.responsiveness_score),
        dependency: row.dependency_risk == null ? null : 1 - n(row.dependency_risk),
    };
    const weights: Record<string, number> = {
        cost: 0.18,
        delivery: 0.24,
        fill: 0.18,
        quality: 0.22,
        responsiveness: 0.08,
        dependency: 0.1,
    };
    const configured = Object.entries(parts).filter(([, value]) => value !== null) as Array<[string, number]>;
    if (!configured.length) return { composite: null, status: "not_configured", components: parts };
    const weight = configured.reduce((sum, [key]) => sum + weights[key], 0);
    const composite = configured.reduce((sum, [key, value]) => sum + value * weights[key], 0) / weight;
    return {
        composite: Math.round(composite * 1000) / 10,
        status: configured.length === 6 ? "complete" : "partial",
        components: Object.fromEntries(
            Object.entries(parts).map(([key, value]) => [key, value == null ? null : Math.round(value * 1000) / 10]),
        ),
    };
}

class Phase14ProcurementService {
    async overview() {
        const trx = currentTrx();
        const [suppliers, purchaseOrders, incidents] = await Promise.all([
            currentTrx().from("suppliers").select("*").orderBy("updated_at", "desc"),
            currentTrx()
                .from("purchase_orders as po")
                .leftJoin("suppliers as s", "s.id", "po.supplier_id")
                .select("po.*", "s.display_name as supplier_name")
                .orderBy("po.updated_at", "desc")
                .limit(50),
            currentTrx().from("supplier_incidents").where("status", "open").count("id as total").first(),
        ]);
        const scored = suppliers.map((supplier: any) => ({ ...supplier, score: supplierScore(supplier) }));
        const open = purchaseOrders.filter((po: any) => !["closed", "cancelled", "received"].includes(po.status));
        const configured = scored.filter((supplier: any) => supplier.score.composite !== null);
        return {
            data: {
                kpis: {
                    active_suppliers: scored.filter((supplier: any) => supplier.status === "active").length,
                    open_purchase_orders: open.length,
                    open_commitment_minor: open.reduce((sum: number, po: any) => sum + n(po.total_minor), 0),
                    open_incidents: n(incidents?.total),
                    average_supplier_score: configured.length
                        ? Math.round(
                              (configured.reduce((sum: number, supplier: any) => sum + supplier.score.composite, 0) /
                                  configured.length) *
                                  10,
                          ) / 10
                        : null,
                },
                suppliers: scored.slice(0, 12),
                purchase_orders: purchaseOrders.slice(0, 12),
            },
        };
    }

    async suppliers() {
        const rows = await currentTrx().from("suppliers").select("*").orderBy("display_name");
        return { data: rows.map((row: any) => ({ ...row, score: supplierScore(row) })) };
    }

    async createSupplier(payload: any) {
        const [row] = await currentTrx()
            .table("suppliers")
            .insert({ ...payload, currency: payload.currency ?? "IRR", criticality: payload.criticality ?? "normal" })
            .returning("*");
        return { data: row };
    }

    async purchaseOrders() {
        return {
            data: await currentTrx()
                .from("purchase_orders as po")
                .join("suppliers as s", "s.id", "po.supplier_id")
                .select("po.*", "s.display_name as supplier_name")
                .orderBy("po.updated_at", "desc"),
        };
    }

    async createPurchaseOrder(payload: any, actor: Actor, idempotencyKey: string | null) {
        return withTenantTransaction(async (trx) => {
            if (idempotencyKey) {
                const existing = await trx.from("purchase_orders").where("idempotency_key", idempotencyKey).first();
                if (existing) return { data: existing, replayed: true };
            }
            const supplier = await trx.from("suppliers").where("id", payload.supplier_id).where("status", "active").first();
            if (!supplier) throw new Exception("Active supplier not found", { status: 422, code: "E_PROCUREMENT_SUPPLIER" });
            if (payload.planning_recommendation_id) {
                const recommendation = await trx
                    .from("planning_replenishment_recommendations")
                    .where("id", payload.planning_recommendation_id)
                    .where("status", "ready")
                    .first();
                if (!recommendation)
                    throw new Exception("Planning recommendation is not ready", {
                        status: 422,
                        code: "E_PROCUREMENT_RECOMMENDATION",
                    });
            }
            const sequence = await trx.from("purchase_orders").count("id as total").first();
            const number = `PO-${new Date().getUTCFullYear()}-${String(n(sequence?.total) + 1).padStart(6, "0")}`;
            const subtotal = payload.lines.reduce(
                (sum: number, line: any) => sum + Math.round(line.quantity * line.unit_cost),
                0,
            );
            const [po] = await trx
                .table("purchase_orders")
                .insert({
                    supplier_id: payload.supplier_id,
                    number,
                    currency: payload.currency ?? supplier.currency ?? "IRR",
                    expected_date: payload.expected_date ?? null,
                    payment_terms: payload.payment_terms ?? supplier.payment_terms ?? null,
                    planning_recommendation_id: payload.planning_recommendation_id ?? null,
                    idempotency_key: idempotencyKey,
                    subtotal_minor: subtotal,
                    total_minor: subtotal,
                    created_by_user_id: actor.id ?? null,
                    impact_snapshot: {
                        cash_commitment_minor: subtotal,
                        source: payload.planning_recommendation_id ? "planning" : "manual",
                    },
                })
                .returning("*");
            await trx.table("purchase_order_lines").multiInsert(
                payload.lines.map((line: any) => ({
                    purchase_order_id: po.id,
                    product_id: line.product_id,
                    variation_id: line.variation_id ?? null,
                    sku_snapshot: line.sku ?? null,
                    name_snapshot: line.name,
                    ordered_quantity: line.quantity,
                    unit_cost: line.unit_cost,
                    line_total_minor: Math.round(line.quantity * line.unit_cost),
                    expected_date: line.expected_date ?? payload.expected_date ?? null,
                })),
            );
            return { data: po, replayed: false };
        });
    }

    async transition(id: number, payload: any, actor: Actor) {
        return withTenantTransaction(async (trx) => {
            const po = await trx.from("purchase_orders").where("id", id).forUpdate().first();
            if (!po) throw new Exception("Purchase order not found", { status: 404, code: "E_PROCUREMENT_PO" });
            if (n(po.version) !== payload.expected_version)
                throw new Exception("Purchase order changed", { status: 409, code: "E_PROCUREMENT_VERSION" });
            const allowed: Record<string, string[]> = {
                draft: ["approval", "cancelled"],
                approval: ["sent", "cancelled"],
                sent: ["acknowledged", "cancelled"],
                acknowledged: ["partially_shipped", "closed", "cancelled"],
                partially_shipped: ["closed", "cancelled"],
                partially_received: ["closed", "cancelled"],
            };
            if (!(allowed[po.status] ?? []).includes(payload.status))
                throw new Exception("Invalid purchase order transition", { status: 422, code: "E_PROCUREMENT_TRANSITION" });
            if (payload.status === "sent" && actor.id != null && String(actor.id) === String(po.created_by_user_id))
                throw new Exception("Purchase order creator cannot approve and send the same order", {
                    status: 403,
                    code: "E_PROCUREMENT_SEPARATION_OF_DUTIES",
                });
            const patch: any = { status: payload.status, version: n(po.version) + 1 };
            if (payload.status === "sent" && actor.id != null) {
                patch.approved_by_user_id = actor.id;
                patch.approved_at = new Date();
            }
            const [row] = await trx.from("purchase_orders").where("id", id).update(patch).returning("*");
            return { data: row };
        });
    }

    async receive(id: number, payload: any, actor: Actor, idempotencyKey: string | null) {
        return withTenantTransaction(async (trx) => {
            if (idempotencyKey) {
                const existing = await trx.from("purchase_order_receipts").where("idempotency_key", idempotencyKey).first();
                if (existing) return { data: existing, replayed: true };
            }
            const po = await trx.from("purchase_orders").where("id", id).forUpdate().first();
            if (!po || ["draft", "approval", "cancelled", "closed", "received"].includes(po.status))
                throw new Exception("Purchase order cannot be received", { status: 422, code: "E_PROCUREMENT_RECEIVE" });
            const [receipt] = await trx
                .table("purchase_order_receipts")
                .insert({
                    purchase_order_id: id,
                    number: `GRN-${id}-${Date.now()}`,
                    idempotency_key: idempotencyKey,
                    received_at: new Date(),
                    notes: payload.notes ?? null,
                    received_by_user_id: actor.id ?? null,
                })
                .returning("*");
            for (const input of payload.lines) {
                const line = await trx
                    .from("purchase_order_lines")
                    .where("id", input.purchase_order_line_id)
                    .where("purchase_order_id", id)
                    .forUpdate()
                    .first();
                if (!line) throw new Exception("PO line not found", { status: 422, code: "E_PROCUREMENT_LINE" });
                const rejected = n(input.rejected_quantity),
                    quarantine = n(input.quarantine_quantity),
                    accepted = n(input.accepted_quantity),
                    received = n(input.received_quantity);
                if (Math.abs(accepted + rejected + quarantine - received) > 0.0001)
                    throw new Exception("Receipt disposition must equal received quantity", {
                        status: 422,
                        code: "E_PROCUREMENT_DISPOSITION",
                    });
                if (n(line.received_quantity) + received > n(line.ordered_quantity))
                    throw new Exception("Receipt exceeds ordered quantity", { status: 422, code: "E_PROCUREMENT_OVER_RECEIPT" });
                await trx.table("purchase_order_receipt_lines").insert({
                    receipt_id: receipt.id,
                    purchase_order_line_id: line.id,
                    received_quantity: received,
                    accepted_quantity: accepted,
                    rejected_quantity: rejected,
                    quarantine_quantity: quarantine,
                    quality_reason: input.quality_reason ?? null,
                    lot_code: input.lot_code ?? null,
                    batch_code: input.batch_code ?? null,
                });
                await trx
                    .from("purchase_order_lines")
                    .where("id", line.id)
                    .update({
                        received_quantity: n(line.received_quantity) + received,
                        accepted_quantity: n(line.accepted_quantity) + accepted,
                        rejected_quantity: n(line.rejected_quantity) + rejected,
                        quarantine_quantity: n(line.quarantine_quantity) + quarantine,
                    });
                if (accepted > 0)
                    await inventory.increment(
                        { productId: line.product_id, variationId: line.variation_id ?? null },
                        accepted,
                        { kind: "manual", id: receipt.id },
                        trx,
                    );
                if (rejected > 0 || quarantine > 0)
                    await trx.table("supplier_incidents").insert({
                        supplier_id: po.supplier_id,
                        purchase_order_id: id,
                        type: "quality",
                        severity: rejected > 0 ? "high" : "medium",
                        summary: input.quality_reason ?? "Receiving quality exception",
                        evidence: { receipt_id: receipt.id, line_id: line.id, rejected, quarantine },
                    });
            }
            const remaining = await trx
                .from("purchase_order_lines")
                .where("purchase_order_id", id)
                .whereRaw("received_quantity < ordered_quantity")
                .count("id as total")
                .first();
            await trx
                .from("purchase_orders")
                .where("id", id)
                .update({ status: n(remaining?.total) > 0 ? "partially_received" : "received", version: n(po.version) + 1 });
            return { data: receipt, replayed: false };
        });
    }

    async recommendations() {
        const rows = await currentTrx()
            .from("planning_replenishment_recommendations as r")
            .leftJoin("supplier_products as sp", (join) =>
                join.on("sp.product_id", "=", "r.product_id").andOnVal("sp.active", "=", true),
            )
            .leftJoin("suppliers as s", "s.id", "sp.supplier_id")
            .where("r.status", "ready")
            .select(
                "r.*",
                "s.id as supplier_id",
                "s.display_name as supplier_name",
                "sp.unit_cost",
                "sp.moq",
                "sp.order_multiple",
                "sp.lead_time_days",
                "s.on_time_rate",
                "s.fill_rate",
                "s.dependency_risk",
            )
            .orderBy("r.suggested_quantity", "desc")
            .limit(100);
        return {
            data: rows.map((row: any) => {
                const quantity = n(row.suggested_quantity),
                    moq = row.moq == null ? 1 : Math.max(1, n(row.moq)),
                    multiple = row.order_multiple == null ? 1 : Math.max(1, n(row.order_multiple));
                const proposed = Math.max(moq, Math.ceil(quantity / multiple) * multiple);
                const reliability =
                    row.on_time_rate == null || row.fill_rate == null ? null : (n(row.on_time_rate) + n(row.fill_rate)) / 2;
                return {
                    ...row,
                    proposed_quantity: proposed,
                    expected_arrival_days: row.lead_time_days == null ? null : n(row.lead_time_days),
                    supplier_reliability: reliability == null ? null : Math.round(reliability * 1000) / 10,
                    cash_need_minor: row.unit_cost == null ? null : Math.round(proposed * n(row.unit_cost)),
                    risk_note:
                        row.dependency_risk == null
                            ? "not_configured"
                            : n(row.dependency_risk) > 0.65
                              ? "concentration-risk"
                              : "balanced",
                };
            }),
        };
    }

    async health() {
        const result = await currentTrx().rawQuery(
            `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('suppliers','purchase_orders','purchase_order_receipts','supplier_incidents')`,
        );
        return {
            data: {
                status: result.rows.length === 4 ? "ready" : "degraded",
                tables: result.rows.map((row: any) => row.table_name),
            },
        };
    }
}

export const phase14ProcurementService = new Phase14ProcurementService();
