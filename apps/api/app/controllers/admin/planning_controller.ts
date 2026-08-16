import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { phase13PlanningService } from "#services/phase13_planning_service";
import {
    createPlanningCycleValidator,
    createPlanningOverrideValidator,
    createPlanningScenarioValidator,
    reviewPlanningOverrideValidator,
    runPlanningForecastValidator,
    transitionPlanningCycleValidator,
} from "#validators/admin/phase13_planning_validator";

function id(value: unknown, code: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Exception("Invalid identifier", { status: 422, code });
    return parsed;
}

export default class PlanningController {
    async overview() {
        return phase13PlanningService.overview();
    }

    async forecast({ request }: HttpContext) {
        const runIdRaw = request.input("run_id");
        const runId = runIdRaw === undefined || runIdRaw === null || runIdRaw === "" ? null : id(runIdRaw, "E_PLANNING_RUN_ID");
        return phase13PlanningService.forecast(runId);
    }

    async runForecast(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(runPlanningForecastValidator);
        const actor = await ctx.auth.authenticate();
        const result = await phase13PlanningService.runForecast(payload, actor);
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "planning.forecast.run",
            entityKind: "planning_forecast_run",
            entityId: Number(result.data.run?.id ?? 0),
            payload: { history_days: payload.history_days ?? 56, horizon_days: payload.horizon_days ?? 14 },
        });
        return result;
    }

    async risks() {
        return phase13PlanningService.inventoryRisks();
    }

    async cycles() {
        return phase13PlanningService.cycles();
    }

    async createCycle(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createPlanningCycleValidator);
        const result = await phase13PlanningService.createCycle(payload, await ctx.auth.authenticate());
        ctx.response.status(201);
        await recordAudit({ ctx, action: "planning.cycle.create", entityKind: "planning_cycle", entityId: result.data.id, payload: { title: payload.title } });
        return result;
    }

    async transitionCycle(ctx: HttpContext) {
        const cycleId = id(ctx.params.id, "E_PLANNING_CYCLE_ID");
        const payload = await ctx.request.validateUsing(transitionPlanningCycleValidator);
        const result = await phase13PlanningService.transitionCycle(cycleId, payload, await ctx.auth.authenticate());
        await recordAudit({
            ctx,
            action: `planning.cycle.${payload.status}`,
            entityKind: "planning_cycle",
            entityId: cycleId,
            payload: { expected_version: payload.expected_version, note: payload.note ?? null },
        });
        return result;
    }

    async scenarios() {
        return phase13PlanningService.scenarios();
    }

    async createScenario(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createPlanningScenarioValidator);
        const result = await phase13PlanningService.createScenario(payload, await ctx.auth.authenticate());
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "planning.scenario.create",
            entityKind: "planning_scenario",
            entityId: result.data.id,
            payload: { demand_multiplier: payload.demand_multiplier, lead_time_days: payload.lead_time_days ?? 0 },
        });
        return result;
    }

    async scenarioResult(ctx: HttpContext) {
        return phase13PlanningService.scenarioResult(id(ctx.params.id, "E_PLANNING_SCENARIO_ID"));
    }

    async overrides() {
        return phase13PlanningService.overrides();
    }

    async createOverride(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createPlanningOverrideValidator);
        const result = await phase13PlanningService.createOverride(payload, await ctx.auth.authenticate());
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "planning.override.create",
            entityKind: "planning_override",
            entityId: result.data.id,
            payload: { forecast_point_id: payload.forecast_point_id, override_quantity: payload.override_quantity },
        });
        return result;
    }

    async reviewOverride(ctx: HttpContext) {
        const overrideId = id(ctx.params.id, "E_PLANNING_OVERRIDE_ID");
        const payload = await ctx.request.validateUsing(reviewPlanningOverrideValidator);
        const result = await phase13PlanningService.reviewOverride(overrideId, payload.decision, await ctx.auth.authenticate());
        await recordAudit({
            ctx,
            action: `planning.override.${payload.decision}`,
            entityKind: "planning_override",
            entityId: overrideId,
            payload: {},
        });
        return result;
    }

    async health() {
        return phase13PlanningService.health();
    }
}
