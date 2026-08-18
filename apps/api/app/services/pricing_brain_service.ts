import { currentTrx } from "#services/tenant_context";
import { evaluatePricingCandidate, type PricingDecision, type PricingGuardrails } from "#services/pricing_decision_engine";

export interface PricingSimulationInput {
    referencePrice: number;
    candidatePrice: number;
    quantity?: number;
    productId?: number;
    variationId?: number | null;
    floorPrice?: number | null;
    cogs?: number | null;
    minimumMarginPercent?: number | null;
    maximumDiscountPercent?: number | null;
}

interface CogsEvidence {
    value: number | null;
    source: "explicit" | "realized_snapshot" | "cost_layer" | "unavailable";
    quality: "operator_input" | "realized" | "inventory_evidence" | "unavailable";
    observedAt: string | null;
}

export async function pricingBrainOverview() {
    const trx = currentTrx();
    const [productsRow, pricedProductsRow, saleProductsRow, couponsRow, activeCouponsRow, costCoverageRow, latestCostRow] =
        await Promise.all([
            trx.from("products").whereNull("deleted_at").count<{ count: string }>("id as count").first(),
            trx.from("products").whereNull("deleted_at").whereNotNull("regular_price").count<{ count: string }>("id as count").first(),
            trx.from("products").whereNull("deleted_at").whereNotNull("sale_price").count<{ count: string }>("id as count").first(),
            trx.from("coupons").whereNull("deleted_at").count<{ count: string }>("id as count").first(),
            trx.from("coupons").whereNull("deleted_at").where("status", "active").count<{ count: string }>("id as count").first(),
            trx
                .from("economic_cost_layers")
                .whereNotNull("unit_landed_cost_minor")
                .countDistinct<{ count: string }>("product_id as count")
                .first(),
            trx.from("economic_cost_layers").whereNotNull("unit_landed_cost_minor").max("effective_at as effective_at").first(),
        ]);

    const products = count(productsRow?.count);
    const pricedProducts = count(pricedProductsRow?.count);
    const economicsCoveredProducts = count(costCoverageRow?.count);

    return {
        catalog: {
            products,
            priced_products: pricedProducts,
            sale_products: count(saleProductsRow?.count),
            pricing_coverage_percent: ratio(pricedProducts, products),
        },
        promotions: {
            coupons: count(couponsRow?.count),
            active_coupons: count(activeCouponsRow?.count),
            authority: "shared_discounter",
        },
        economics: {
            covered_products: economicsCoveredProducts,
            coverage_percent: ratio(economicsCoveredProducts, products),
            latest_cost_evidence_at: latestCostRow?.effective_at ? String(latestCostRow.effective_at) : null,
            status: economicsCoveredProducts > 0 ? "available" : "unavailable",
            authority: "phase12_economics",
        },
        evidence: {
            elasticity: {
                status: "insufficient_evidence",
                reason: "No approved elasticity evidence source is connected to the Phase 18 serving path yet.",
            },
            experimentation: {
                status: "unavailable",
                reason: "Phase 17 is not part of the current main runtime, so attributed outcomes are not presented as causal lift.",
            },
        },
        runtime: {
            base_price_resolver: "existing_price_resolver",
            promotion_engine: "existing_discounter",
            economics_source: "phase12_economics",
            simulation_engine: "phase18_pricing_decision_engine",
            autonomy_level: 1,
            activation_enabled: false,
        },
    };
}

export async function simulatePricingCandidate(input: PricingSimulationInput): Promise<{
    decision: PricingDecision;
    economics: CogsEvidence;
}> {
    const economics = await resolveCogsEvidence(input);
    const guardrails: PricingGuardrails = {
        floorPrice: input.floorPrice ?? null,
        cogs: economics.value,
        minimumMarginPercent: input.minimumMarginPercent ?? null,
        maximumDiscountPercent: input.maximumDiscountPercent ?? null,
    };

    return {
        decision: evaluatePricingCandidate({
            referencePrice: input.referencePrice,
            candidatePrice: input.candidatePrice,
            quantity: input.quantity,
            guardrails,
        }),
        economics,
    };
}

async function resolveCogsEvidence(input: PricingSimulationInput): Promise<CogsEvidence> {
    if (input.cogs !== undefined && input.cogs !== null) {
        return { value: input.cogs, source: "explicit", quality: "operator_input", observedAt: null };
    }
    if (!input.productId) {
        return { value: null, source: "unavailable", quality: "unavailable", observedAt: null };
    }

    const trx = currentTrx();
    const snapshotQuery = trx
        .from("economic_line_cost_snapshots")
        .where("product_id", input.productId)
        .whereNotNull("unit_cost_minor")
        .whereNot("quality", "incomplete");
    applyVariation(snapshotQuery, input.variationId);
    const snapshot = await snapshotQuery.orderBy("effective_at", "desc").orderBy("id", "desc").first();
    if (snapshot?.unit_cost_minor !== null && snapshot?.unit_cost_minor !== undefined) {
        return {
            value: safeMinor(snapshot.unit_cost_minor),
            source: "realized_snapshot",
            quality: "realized",
            observedAt: snapshot.effective_at ? String(snapshot.effective_at) : null,
        };
    }

    const layerQuery = trx
        .from("economic_cost_layers")
        .where("product_id", input.productId)
        .whereNotNull("unit_landed_cost_minor");
    applyVariation(layerQuery, input.variationId);
    const layer = await layerQuery.orderBy("effective_at", "desc").orderBy("id", "desc").first();
    if (layer?.unit_landed_cost_minor !== null && layer?.unit_landed_cost_minor !== undefined) {
        return {
            value: safeMinor(layer.unit_landed_cost_minor),
            source: "cost_layer",
            quality: "inventory_evidence",
            observedAt: layer.effective_at ? String(layer.effective_at) : null,
        };
    }

    return { value: null, source: "unavailable", quality: "unavailable", observedAt: null };
}

function applyVariation(query: any, variationId: number | null | undefined) {
    if (variationId === undefined || variationId === null) query.whereNull("variation_id");
    else query.where("variation_id", variationId);
}

function safeMinor(value: unknown): number {
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < 0) throw new Error(`Unsafe economic minor-unit value: ${String(value)}`);
    return result;
}

function count(value: unknown): number {
    const result = Number(value ?? 0);
    return Number.isSafeInteger(result) && result >= 0 ? result : 0;
}

function ratio(part: number, total: number): number {
    if (total <= 0) return 0;
    return Math.round((part / total) * 10_000) / 100;
}
