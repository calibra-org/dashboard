import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { phase17ExperimentationService } from "#services/phase17_experimentation_service";
import {
    createExperimentValidator,
    createHoldoutValidator,
    transitionExperimentValidator,
} from "#validators/admin/phase17_experiment_validator";

function id(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1)
        throw new Exception("Invalid experiment identifier", { status: 422, code: "E_EXPERIMENT_ID" });
    return parsed;
}

export default class ExperimentationController {
    async overview() {
        return phase17ExperimentationService.overview();
    }

    async index() {
        return phase17ExperimentationService.list();
    }

    async show(ctx: HttpContext) {
        return phase17ExperimentationService.show(id(ctx.params.id));
    }

    async collisions() {
        return phase17ExperimentationService.collisions();
    }

    async knowledge() {
        return phase17ExperimentationService.knowledge();
    }

    async holdouts() {
        return phase17ExperimentationService.holdouts();
    }

    async create(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createExperimentValidator);
        const actor = await ctx.auth.authenticate();
        const result = await phase17ExperimentationService.create(payload, Number(actor.id));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "experiments.create",
            entityKind: "experiment",
            entityId: result.data.id,
            payload: {
                key: payload.experiment_key,
                surface: payload.surface,
                randomization_unit: payload.randomization_unit,
            },
        });
        return result;
    }

    async transition(ctx: HttpContext) {
        const experimentId = id(ctx.params.id);
        const payload = await ctx.request.validateUsing(transitionExperimentValidator);
        const actor = await ctx.auth.authenticate();
        const result = await phase17ExperimentationService.transition(experimentId, payload, Number(actor.id));
        await recordAudit({
            ctx,
            action: `experiments.${payload.status}`,
            entityKind: "experiment",
            entityId: experimentId,
            payload: {
                expected_version: payload.expected_version,
                reason: payload.reason ?? null,
                approval_reference: payload.approval_reference ?? null,
            },
        });
        return result;
    }

    async analyze(ctx: HttpContext) {
        const experimentId = id(ctx.params.id);
        const result = await phase17ExperimentationService.analyze(experimentId);
        await recordAudit({
            ctx,
            action: "experiments.analyze",
            entityKind: "experiment",
            entityId: experimentId,
            payload: {
                status: result.data.status,
                causal_strength: result.data.causal_strength,
                automatic_action: result.data.automatic_action,
            },
        });
        return result;
    }

    async createHoldout(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createHoldoutValidator);
        const actor = await ctx.auth.authenticate();
        const result = await phase17ExperimentationService.createHoldout(payload, Number(actor.id));
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "experiments.holdout.create",
            entityKind: "experiment_holdout",
            entityId: result.data.id,
            payload: { scope: payload.scope, allocation_bps: payload.allocation_bps },
        });
        return result;
    }
}
