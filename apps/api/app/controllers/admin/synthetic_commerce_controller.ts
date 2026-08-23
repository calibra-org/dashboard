import type { HttpContext } from "@adonisjs/core/http";

import * as synthetic from "#services/phase24_synthetic_commerce_service";
import {
    createSyntheticEnvironmentValidator,
    createSyntheticPersonaValidator,
    createSyntheticScenarioValidator,
    createSyntheticSeedValidator,
    reportSyntheticRunValidator,
} from "#validators/admin/phase24_synthetic_commerce_validator";

export default class SyntheticCommerceController {
    async overview({ response }: HttpContext) {
        return response.ok({ data: await synthetic.overview() });
    }
    async environments({ response }: HttpContext) {
        return response.ok({ data: await synthetic.listEnvironments() });
    }
    async createEnvironment({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(createSyntheticEnvironmentValidator);
        return response.created({ data: await synthetic.createEnvironment(payload, auth.user!) });
    }
    async personas({ response }: HttpContext) {
        return response.ok({ data: await synthetic.listPersonas() });
    }
    async createPersona({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(createSyntheticPersonaValidator);
        return response.created({ data: await synthetic.createPersona(payload, auth.user!) });
    }
    async seeds({ response }: HttpContext) {
        return response.ok({ data: await synthetic.listSeeds() });
    }
    async createSeed({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(createSyntheticSeedValidator);
        return response.created({ data: await synthetic.createSeed(payload, auth.user!) });
    }
    async freezeSeed({ params, response }: HttpContext) {
        return response.ok({ data: await synthetic.freezeSeed(params.publicId) });
    }
    async scenarios({ response }: HttpContext) {
        return response.ok({ data: await synthetic.listScenarios() });
    }
    async createScenario({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(createSyntheticScenarioValidator);
        return response.created({ data: await synthetic.createScenario(payload, auth.user!) });
    }
    async runs({ response }: HttpContext) {
        return response.ok({ data: await synthetic.listRuns() });
    }
    async queueRun({ params, auth, response }: HttpContext) {
        return response.created({ data: await synthetic.queueRun(params.publicId, auth.user!) });
    }
    async run({ params, response }: HttpContext) {
        return response.ok({ data: await synthetic.runDetail(params.publicId) });
    }
    async reportRun({ params, request, response }: HttpContext) {
        const payload = await request.validateUsing(reportSyntheticRunValidator);
        return response.ok({ data: await synthetic.reportRun(params.publicId, payload) });
    }
}
