import type { HttpContext } from "@adonisjs/core/http";

import {
    backfillEconomics,
    correctLineCost,
    createCostLayer,
    createCostPolicy,
    orderEconomics,
    productEconomics,
    profitabilityCube,
    profitabilityOverview,
    reconcileSettlement,
    workingCapital,
} from "#services/economics_service";

function idempotencyKey(ctx: HttpContext): string {
    const key = ctx.request.header("idempotency-key")?.trim();
    if (!key) throw new Error("Idempotency-Key header is required");
    return key;
}

function conflictAware(ctx: HttpContext, error: unknown) {
    const err = error as Error & { code?: string };
    if (err.code === "ECONOMICS_IDEMPOTENCY_CONFLICT") {
        return ctx.response.conflict({ error: { code: err.code, message: err.message } });
    }
    throw error;
}

export default class AdminEconomicsController {
    async overview({ request }: HttpContext) {
        return { data: await profitabilityOverview({ from: request.input("from"), to: request.input("to"), currency: request.input("currency") }) };
    }

    async cube({ request }: HttpContext) {
        return { data: await profitabilityCube({ dimension: request.input("dimension"), currency: request.input("currency"), limit: request.input("limit") }) };
    }

    async workingCapital() {
        return { data: await workingCapital() };
    }

    async order({ params, response }: HttpContext) {
        const data = await orderEconomics(Number(params.id));
        if (!data) return response.notFound({ error: { code: "ECONOMICS_ORDER_NOT_FOUND" } });
        return { data };
    }

    async product({ params, response }: HttpContext) {
        const data = await productEconomics(Number(params.id));
        if (!data) return response.notFound({ error: { code: "ECONOMICS_PRODUCT_NOT_FOUND" } });
        return { data };
    }

    async createPolicy(ctx: HttpContext) {
        try {
            const body = ctx.request.body();
            const actor = await ctx.auth.authenticate();
            const data = await createCostPolicy({
                idempotencyKey: idempotencyKey(ctx),
                inventoryMethod: body.inventory_method,
                packagingMinor: body.packaging_minor,
                fulfillmentMinor: body.fulfillment_minor,
                paymentFeeBps: body.payment_fee_bps,
                channelFeeBps: body.channel_fee_bps,
                promotionMinor: body.promotion_minor,
                affiliateMinor: body.affiliate_minor,
                currency: body.currency,
                effectiveFrom: body.effective_from,
                userId: Number(actor.id),
            });
            return ctx.response.created({ data });
        } catch (error) {
            return conflictAware(ctx, error);
        }
    }

    async createLayer(ctx: HttpContext) {
        try {
            const body = ctx.request.body();
            const actor = await ctx.auth.authenticate();
            const data = await createCostLayer({
                idempotencyKey: idempotencyKey(ctx),
                productId: body.product_id,
                variationId: body.variation_id,
                quantity: body.quantity,
                unitPurchaseCostMinor: body.unit_purchase_cost_minor,
                unitLandedCostMinor: body.unit_landed_cost_minor,
                currency: body.currency,
                sourceKind: body.source_kind,
                sourceRef: body.source_ref,
                effectiveAt: body.effective_at,
                userId: Number(actor.id),
            });
            return ctx.response.created({ data });
        } catch (error) {
            return conflictAware(ctx, error);
        }
    }

    async correctCost(ctx: HttpContext) {
        try {
            const body = ctx.request.body();
            const actor = await ctx.auth.authenticate();
            const data = await correctLineCost({
                idempotencyKey: idempotencyKey(ctx),
                orderLineItemId: Number(ctx.params.id),
                unitCostMinor: body.unit_cost_minor,
                reason: body.reason,
                userId: Number(actor.id),
            });
            return { data };
        } catch (error) {
            return conflictAware(ctx, error);
        }
    }

    async reconcileSettlement(ctx: HttpContext) {
        try {
            const body = ctx.request.body();
            const actor = await ctx.auth.authenticate();
            const data = await reconcileSettlement({
                idempotencyKey: idempotencyKey(ctx),
                provider: body.provider,
                settlementKey: body.settlement_key,
                status: body.status,
                currency: body.currency,
                grossMinor: body.gross_minor,
                feeMinor: body.fee_minor ?? 0,
                refundMinor: body.refund_minor ?? 0,
                expectedAt: body.expected_at,
                settledAt: body.settled_at,
                evidence: body.evidence,
                userId: Number(actor.id),
            });
            return { data };
        } catch (error) {
            return conflictAware(ctx, error);
        }
    }

    async backfill(ctx: HttpContext) {
        const data = await backfillEconomics({ offset: ctx.request.input("offset"), limit: ctx.request.input("limit") });
        return { data };
    }
}
