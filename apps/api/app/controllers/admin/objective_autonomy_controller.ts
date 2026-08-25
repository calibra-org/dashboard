import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { hasRecentIdentityStepUp, requireRecentIdentityStepUp } from "#services/identity/step_up";
import * as autonomy from "#services/objective_autonomy/objective_autonomy_service";
import {
    applyObjectiveAutonomyAccessPreset,
    listObjectiveAutonomyAccess,
    requireObjectiveAutonomyPermission,
} from "#services/objective_autonomy/permissions";
import {
    autonomyAccessPresetValidator,
    checkpointValidator,
    cycleValidator,
    executeObjectiveStepValidator,
    objectiveStateValidator,
    objectiveValidator,
    postmortemValidator,
} from "#validators/objective_autonomy/objective_autonomy_validator";

export default class ObjectiveAutonomyController {
    async overview(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireObjectiveAutonomyPermission(user, "objective_autonomy.view");
        return { data: await autonomy.overview() };
    }

    async objectives(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireObjectiveAutonomyPermission(user, "objective_autonomy.view");
        return { data: await autonomy.listObjectives() };
    }

    async objective(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireObjectiveAutonomyPermission(user, "objective_autonomy.view");
        return { data: await autonomy.objectiveDetail(ctx.params.publicId) };
    }

    async createObjective(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireObjectiveAutonomyPermission(user, "objective_autonomy.objectives.manage");
        const payload = await ctx.request.validateUsing(objectiveValidator);
        const data = await autonomy.createObjective(payload, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "objective_autonomy.objective.create",
            entityKind: "autonomy_objective",
            entityId: data.id,
            payload: { public_id: data.public_id, target_metric: data.target_metric, reason: payload.reason },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async activate(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireObjectiveAutonomyPermission(user, "objective_autonomy.objectives.manage");
        await requireRecentIdentityStepUp(Number(user.id), "objective.autonomy.activate");
        const payload = await ctx.request.validateUsing(objectiveStateValidator);
        const data = await autonomy.activateObjective(ctx.params.publicId, user, payload.reason);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "objective_autonomy.objective.activate",
            entityKind: "autonomy_objective",
            entityId: data.id,
            payload: { reason: payload.reason },
            strict: true,
        });
        return { data };
    }

    async halt(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireObjectiveAutonomyPermission(user, "objective_autonomy.kill_switch");
        await requireRecentIdentityStepUp(Number(user.id), "objective.autonomy.halt");
        const payload = await ctx.request.validateUsing(objectiveStateValidator);
        const data = await autonomy.haltObjective(ctx.params.publicId, user, payload.reason);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "objective_autonomy.objective.halt",
            entityKind: "autonomy_objective",
            entityId: data.id,
            payload: { reason: payload.reason },
            strict: true,
        });
        return { data };
    }

    async startCycle(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireObjectiveAutonomyPermission(user, "objective_autonomy.cycles.run");
        const payload = await ctx.request.validateUsing(cycleValidator);
        const data = await autonomy.startCycle(ctx.params.publicId, payload.seed, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "objective_autonomy.cycle.start",
            entityKind: "autonomy_cycle",
            entityId: data.id,
            payload: { objective_public_id: ctx.params.publicId, seed: payload.seed ?? null },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async executeStep(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireObjectiveAutonomyPermission(user, "objective_autonomy.execute");
        const payload = await ctx.request.validateUsing(executeObjectiveStepValidator);
        const stepUpSatisfied = await hasRecentIdentityStepUp(Number(user.id), "agent.action.execute");
        const data = await autonomy.executeObjectiveStep({
            objectivePublicId: ctx.params.publicId,
            cyclePublicId: ctx.params.cyclePublicId,
            stepPublicId: payload.step_public_id,
            dryRun: false,
            actor: user,
            stepUpSatisfied,
        });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "objective_autonomy.step.execute",
            entityKind: "agent_tool_run",
            entityId: data?.id ?? null,
            payload: {
                objective_public_id: ctx.params.publicId,
                cycle_public_id: ctx.params.cyclePublicId,
                step_public_id: payload.step_public_id,
                dry_run: false,
            },
            strict: true,
        });
        return { data };
    }

    async checkpoint(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireObjectiveAutonomyPermission(user, "objective_autonomy.checkpoint");
        const payload = await ctx.request.validateUsing(checkpointValidator);
        const data = await autonomy.recordCheckpoint(ctx.params.publicId, payload, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "objective_autonomy.checkpoint.record",
            entityKind: "autonomy_checkpoint",
            entityId: data.checkpoint.id,
            payload: { decision: data.control.decision, evidence_count: payload.evidence_refs.length, reason: payload.reason },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async postmortem(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireObjectiveAutonomyPermission(user, "objective_autonomy.postmortem");
        const payload = await ctx.request.validateUsing(postmortemValidator);
        const data = await autonomy.createPostmortem(ctx.params.publicId, payload, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "objective_autonomy.postmortem.create",
            entityKind: "autonomy_postmortem",
            entityId: data.postmortem.id,
            payload: { memory_public_id: data.memory.public_id, evidence_count: payload.evidence_refs.length },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async access(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireObjectiveAutonomyPermission(user, "objective_autonomy.access.manage");
        return { data: await listObjectiveAutonomyAccess() };
    }

    async accessPreset(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireObjectiveAutonomyPermission(user, "objective_autonomy.access.manage");
        await requireRecentIdentityStepUp(Number(user.id), "objective.autonomy.access");
        const payload = await ctx.request.validateUsing(autonomyAccessPresetValidator);
        const data = await applyObjectiveAutonomyAccessPreset(Number(user.id), payload.user_id, payload.preset);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "objective_autonomy.access.preset.apply",
            entityKind: "admin_user",
            entityId: payload.user_id,
            payload: { preset: payload.preset, reason: payload.reason },
            strict: true,
        });
        return { data };
    }
}
