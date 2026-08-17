import type { HttpContext } from "@adonisjs/core/http";

import { evaluatePricingCandidate, type PricingGuardrails } from "#services/pricing_decision_engine";
import { maybeTenantContext } from "#services/tenant_context";

interface SimulationPayload {
    reference_price?: number;
    candidate_price?: number;
    quantity?: number;
    floor_price?: number | null;
    cogs?: number | null;
    minimum_margin_percent?: number | null;
    maximum_discount_percent?: number | null;
}

/**
 * Phase 18 control-plane endpoints. The controller intentionally reads the existing catalog and
 * coupon domains instead of introducing a second pricing or promotion source of truth.
 */
export default class AdminPricingBrainController {
    async overview({ response }: HttpContext) {
        const trx = maybeTenantContext()?.trx;
        if (!trx) return response.internalServerError({ error: { code: "tenant_context_missing" } });

        const [productsRow, pricedProductsRow, saleProductsRow, couponsRow, activeCouponsRow] = await Promise.all([
            trx.from("products").whereNull("deleted_at").count<{ count: string }>("id as count").first(),
            trx.from("products").whereNull("deleted_at").whereNotNull("regular_price").count<{ count: string }>("id as count").first(),
            trx.from("products").whereNull("deleted_at").whereNotNull("sale_price").count<{ count: string }>("id as count").first(),
            trx.from("coupons").whereNull("deleted_at").count<{ count: string }>("id as count").first(),
            trx.from("coupons").whereNull("deleted_at").where("status", "active").count<{ count: string }>("id as count").first(),
        ]);

        const productCount = Number(productsRow?.count ?? 0);
        const pricedProductCount = Number(pricedProductsRow?.count ?? 0);
        const saleProductCount = Number(saleProductsRow?.count ?? 0);
        const couponCount = Number(couponsRow?.count ?? 0);
        const activeCouponCount = Number(activeCouponsRow?.count ?? 0);

        return {
            data: {
                catalog: {
                    products: productCount,
                    priced_products: pricedProductCount,
                    sale_products: saleProductCount,
                    pricing_coverage_percent: productCount > 0 ? roundMetric((pricedProductCount / productCount) * 100) : 0,
                },
                promotions: {
                    coupons: couponCount,
                    active_coupons: activeCouponCount,
                },
                intelligence: {
                    elasticity: {
                        status: "insufficient_evidence",
                        reason: "No approved elasticity evidence source is connected to Phase 18 yet.",
                    },
                    economics: {
                        status: "insufficient_evidence",
                        reason: "COGS coverage has not been proven for the current catalog, so margin recommendations are not fabricated.",
                    },
                },
                runtime: {
                    base_price_resolver: "existing_price_resolver",
                    promotion_engine: "existing_discounter",
                    simulation_engine: "pricing_decision_engine",
                },
            },
        };
    }

    async simulate({ request, response }: HttpContext) {
        const payload = request.only([
            "reference_price",
            "candidate_price",
            "quantity",
            "floor_price",
            "cogs",
            "minimum_margin_percent",
            "maximum_discount_percent",
        ]) as SimulationPayload;

        if (!isFiniteNumber(payload.reference_price) || !isFiniteNumber(payload.candidate_price)) {
            return response.unprocessableEntity({
                error: {
                    code: "invalid_simulation_input",
                    message: "reference_price and candidate_price must be finite numbers.",
                },
            });
        }

        const guardrails: PricingGuardrails = {
            floorPrice: nullableNumber(payload.floor_price),
            cogs: nullableNumber(payload.cogs),
            minimumMarginPercent: nullableNumber(payload.minimum_margin_percent),
            maximumDiscountPercent: nullableNumber(payload.maximum_discount_percent),
        };

        const decision = evaluatePricingCandidate({
            referencePrice: payload.reference_price,
            candidatePrice: payload.candidate_price,
            quantity: payload.quantity,
            guardrails,
        });

        return { data: decision };
    }
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function nullableNumber(value: unknown): number | null {
    return isFiniteNumber(value) ? value : null;
}

function roundMetric(value: number): number {
    return Math.round(value * 100) / 100;
}
