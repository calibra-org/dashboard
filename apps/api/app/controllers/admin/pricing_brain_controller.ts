import type { HttpContext } from "@adonisjs/core/http";

import { pricingBrainOverview, simulatePricingCandidate } from "#services/pricing_brain_service";
import { simulatePricingCandidateValidator } from "#validators/admin/pricing_brain_validator";

export default class AdminPricingBrainController {
    async overview() {
        return { data: await pricingBrainOverview() };
    }

    async simulate({ request }: HttpContext) {
        const payload = await request.validateUsing(simulatePricingCandidateValidator);
        const result = await simulatePricingCandidate({
            referencePrice: payload.reference_price,
            candidatePrice: payload.candidate_price,
            quantity: payload.quantity,
            productId: payload.product_id,
            variationId: payload.variation_id,
            floorPrice: payload.floor_price,
            cogs: payload.cogs,
            minimumMarginPercent: payload.minimum_margin_percent,
            maximumDiscountPercent: payload.maximum_discount_percent,
        });
        return { data: result };
    }
}
