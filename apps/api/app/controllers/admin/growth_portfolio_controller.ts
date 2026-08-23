import type { HttpContext } from "@adonisjs/core/http";

import * as portfolio from "#services/phase25_growth_portfolio_service";
import {
    addGrowthPortfolioCandidateValidator,
    createGrowthPortfolioPlanValidator,
    measureGrowthPortfolioRunValidator,
} from "#validators/admin/phase25_growth_portfolio_validator";

export default class GrowthPortfolioController {
    async overview({ response }: HttpContext) {
        return response.ok({ data: await portfolio.overview() });
    }

    async plans({ response }: HttpContext) {
        return response.ok({ data: await portfolio.listPlans() });
    }

    async createPlan({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(createGrowthPortfolioPlanValidator);
        return response.created({ data: await portfolio.createPlan(payload, auth.user!) });
    }

    async candidates({ params, response }: HttpContext) {
        return response.ok({ data: await portfolio.listCandidates(params.publicId) });
    }

    async addCandidate({ params, request, response }: HttpContext) {
        const payload = await request.validateUsing(addGrowthPortfolioCandidateValidator);
        return response.created({ data: await portfolio.addCandidate(params.publicId, payload) });
    }

    async runPlan({ params, auth, response }: HttpContext) {
        return response.created({ data: await portfolio.runPlan(params.publicId, auth.user!) });
    }

    async runs({ response }: HttpContext) {
        return response.ok({ data: await portfolio.listRuns() });
    }

    async run({ params, response }: HttpContext) {
        return response.ok({ data: await portfolio.runDetail(params.publicId) });
    }

    async measureRun({ params, request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(measureGrowthPortfolioRunValidator);
        return response.created({ data: await portfolio.measureRun(params.publicId, payload, auth.user!) });
    }
}
