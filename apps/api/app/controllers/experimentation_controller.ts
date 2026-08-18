import type { HttpContext } from "@adonisjs/core/http";

import { phase17ExperimentationService } from "#services/phase17_experimentation_service";
import {
    assignExperimentValidator,
    exposureValidator,
    observationValidator,
} from "#validators/admin/phase17_experiment_validator";

export default class ExperimentationController {
    async assign(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(assignExperimentValidator);
        return phase17ExperimentationService.assign(payload);
    }

    async exposure(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(exposureValidator);
        return phase17ExperimentationService.logExposure(payload);
    }

    async observation(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(observationValidator);
        return phase17ExperimentationService.logObservation(payload);
    }
}
