import type { HttpContext } from "@adonisjs/core/http";

import * as twin from "#services/phase23_digital_twin_service";
import {
    createDigitalTwinScenarioValidator,
    runDigitalTwinValidator,
    updateDigitalTwinScenarioValidator,
} from "#validators/admin/phase23_digital_twin_validator";

export default class DigitalTwinController {
    async overview({ response }: HttpContext) {
        return response.ok({ data: await twin.overview() });
    }
    async scenarios({ response }: HttpContext) {
        return response.ok({ data: await twin.listScenarios() });
    }
    async createScenario({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(createDigitalTwinScenarioValidator);
        return response.created({ data: await twin.createScenario(payload, auth.user!) });
    }
    async updateScenario({ request, params, response }: HttpContext) {
        const payload = await request.validateUsing(updateDigitalTwinScenarioValidator);
        return response.ok({ data: await twin.updateScenario(params.publicId, payload) });
    }
    async runScenario({ request, params, auth, response }: HttpContext) {
        const payload = await request.validateUsing(runDigitalTwinValidator);
        return response.created({ data: await twin.runScenario(params.publicId, payload.seed, auth.user!) });
    }
    async run({ params, response }: HttpContext) {
        return response.ok({ data: await twin.runDetail(params.publicId) });
    }
    async compare({ request, response }: HttpContext) {
        const ids = String(request.input("runs", ""))
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
        return response.ok({ data: await twin.compareRuns(ids) });
    }
    async sensitivity({ params, response }: HttpContext) {
        return response.ok({ data: await twin.sensitivity(params.publicId) });
    }
    async brief({ params, response }: HttpContext) {
        return response.ok({ data: await twin.decisionBrief(params.publicId) });
    }
}
