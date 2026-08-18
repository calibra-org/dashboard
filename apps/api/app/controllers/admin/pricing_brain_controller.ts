import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { simulatePricing, viewPricingBrain } from "#abilities/main";
import { pricingBrainOverview, simulatePricingCandidate } from "#services/pricing_brain_service";
import { requirePricingPermission, type PricingPermission } from "#services/pricing_permissions";
import { pricingPolicyService, type PricingLifecycleAction } from "#services/pricing_policy_service";
import {
    createPricingPolicyValidator,
    createPricingProposalValidator,
    createPricingVersionValidator,
    freezePricingPolicyValidator,
    simulatePricingCandidateValidator,
    transitionPricingPolicyValidator,
} from "#validators/admin/pricing_brain_validator";

const ACTIONS = new Set<PricingLifecycleAction>(["submit", "approve", "schedule", "activate", "pause", "stop", "rollback"]);

function permissionForAction(action: PricingLifecycleAction): PricingPermission {
    if (action === "submit") return "pricing.propose";
    if (action === "approve") return "pricing.approve";
    if (action === "rollback") return "pricing.rollback";
    return "pricing.activate";
}

export default class AdminPricingBrainController {
    async overview({ bouncer, auth }: HttpContext) {
        await bouncer.authorize(viewPricingBrain);
        const user = await auth.authenticate();
        await requirePricingPermission(user, "pricing.view");
        const [overview, policies, proposals] = await Promise.all([
            pricingBrainOverview(),
            pricingPolicyService.listPolicies(),
            pricingPolicyService.listProposals(),
        ]);
        return { data: { ...overview, policies: policies.data, proposals: proposals.data } };
    }

    async policies({ auth }: HttpContext) {
        const user = await auth.authenticate();
        await requirePricingPermission(user, "pricing.view");
        return pricingPolicyService.listPolicies();
    }

    async proposals({ auth }: HttpContext) {
        const user = await auth.authenticate();
        await requirePricingPermission(user, "pricing.view");
        return pricingPolicyService.listProposals();
    }

    async createPolicy({ request, auth }: HttpContext) {
        const user = await auth.authenticate();
        await requirePricingPermission(user, "pricing.propose");
        const payload = await request.validateUsing(createPricingPolicyValidator);
        return pricingPolicyService.createPolicy(payload, user);
    }

    async createVersion({ request, params, auth }: HttpContext) {
        const user = await auth.authenticate();
        await requirePricingPermission(user, "pricing.propose");
        const payload = await request.validateUsing(createPricingVersionValidator);
        return pricingPolicyService.createVersion(Number(params.id), payload, user);
    }

    async createProposal({ request, auth }: HttpContext) {
        const user = await auth.authenticate();
        await requirePricingPermission(user, "pricing.propose");
        const payload = await request.validateUsing(createPricingProposalValidator);
        return pricingPolicyService.createProposal(payload, user);
    }

    async transition({ request, params, auth }: HttpContext) {
        const action = String(params.action) as PricingLifecycleAction;
        if (!ACTIONS.has(action)) {
            throw new Exception("Unknown pricing lifecycle action", { status: 404, code: "E_PRICING_ACTION_NOT_FOUND" });
        }
        const user = await auth.authenticate();
        await requirePricingPermission(user, permissionForAction(action));
        const payload = await request.validateUsing(transitionPricingPolicyValidator);
        return pricingPolicyService.transition(Number(params.id), action, payload, user);
    }

    async freeze({ request, params, auth }: HttpContext) {
        const user = await auth.authenticate();
        await requirePricingPermission(user, "pricing.freeze");
        const payload = await request.validateUsing(freezePricingPolicyValidator);
        return pricingPolicyService.freeze(Number(params.id), payload.frozen, payload.reason, user, payload.idempotency_key);
    }

    async simulate({ request, bouncer, auth }: HttpContext) {
        await bouncer.authorize(simulatePricing);
        const user = await auth.authenticate();
        await requirePricingPermission(user, "pricing.simulate");
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
