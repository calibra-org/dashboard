import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { requireRecentIdentityStepUp } from "#services/identity/step_up";
import { requireLiteCashPermission } from "#services/lite_cash/permissions";
import * as liteCash from "#services/lite_cash/lite_cash_service";
import {
    liteCashActionValidator,
    liteCashImportValidator,
    liteCashObservationValidator,
    liteCashPolicyCreateValidator,
    liteCashPolicyUpdateValidator,
    liteCashProfileCreateValidator,
    liteCashProfileUpdateValidator,
    liteCashPurgeValidator,
    liteCashSettingsValidator,
    liteCashSnapshotValidator,
    liteCashWarmJobCreateValidator,
    liteCashWarmJobObservationValidator,
} from "#validators/lite_cash/lite_cash_validator";

function entityId(value: unknown): number | null {
    if (!value || typeof value !== "object") return null;
    const id = Number((value as Record<string, unknown>).id);
    return Number.isFinite(id) && id > 0 ? id : null;
}

function changedPayload(value: unknown): { data: unknown; changed: boolean } {
    if (!value || typeof value !== "object") return { data: value, changed: true };
    const record = value as Record<string, unknown>;
    return { data: record.data ?? value, changed: record.changed !== false };
}

export default class LiteCashController {
    async overview(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.view");
        return { data: await liteCash.overview() };
    }

    async topology(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.view");
        return { data: await liteCash.topology() };
    }

    async policies(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.view");
        return {
            data: await liteCash.listPolicies(Number(ctx.request.input("limit", 250)), String(ctx.request.input("q", ""))),
        };
    }

    async policy(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.view");
        return { data: await liteCash.getPolicy(ctx.params.publicId) };
    }

    async createPolicy(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.policy.manage");
        const payload = await ctx.request.validateUsing(liteCashPolicyCreateValidator);
        const data = await liteCash.createPolicy(payload, Number(user.id));
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "lite_cash.policy.create",
            entityKind: "lite_cash_policy",
            entityId: entityId(data),
            payload: { policy_key: payload.policy_key, kind: payload.kind, status: payload.status, reason: payload.reason },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async updatePolicy(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.policy.manage");
        const payload = await ctx.request.validateUsing(liteCashPolicyUpdateValidator);
        const result = await liteCash.updatePolicy(ctx.params.publicId, payload, Number(user.id));
        if (result.changed) {
            await recordAudit({
                ctx,
                actorUserId: Number(user.id),
                action: "lite_cash.policy.update",
                entityKind: "lite_cash_policy",
                entityId: entityId(result.data),
                payload: { public_id: ctx.params.publicId, reason: payload.reason },
                strict: true,
            });
        }
        return { data: result.data, changed: result.changed, validation: result.validation };
    }

    async validatePolicy(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.policy.manage");
        const data = await liteCash.validatePolicy(ctx.params.publicId);
        return { data };
    }

    async purgeRegistry(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.view");
        return { data: liteCash.purgeRegistry() };
    }

    async purges(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.view");
        return { data: await liteCash.listPurges(Number(ctx.request.input("limit", 200))) };
    }

    async planPurge(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.purge.execute");
        const payload = await ctx.request.validateUsing(liteCashPurgeValidator);
        if (payload.scope === "full_tenant") await requireLiteCashPermission(user, "lite_cash.purge.broad");
        const data = await liteCash.planPurge(payload, Number(user.id));
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "lite_cash.purge.plan",
            entityKind: "lite_cash_purge_event",
            entityId: entityId(data),
            payload: { scope: payload.scope, target: payload.target ?? null, reason: payload.reason },
            strict: true,
        });
        return { data };
    }

    async executePurge(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.purge.execute");
        const payload = await ctx.request.validateUsing(liteCashPurgeValidator);
        if (payload.scope === "full_tenant") {
            await requireLiteCashPermission(user, "lite_cash.purge.broad");
            if (await liteCash.broadPurgeRequiresStepUp(payload)) {
                await requireRecentIdentityStepUp(Number(user.id), "lite_cash.purge.broad");
            }
        }
        const data = await liteCash.executePurge(payload, Number(user.id));
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "lite_cash.purge.execute",
            entityKind: "lite_cash_purge_event",
            entityId: entityId(data),
            payload: {
                scope: payload.scope,
                target: payload.target ?? null,
                status: (data as Record<string, unknown>).status,
                reason: payload.reason,
            },
            strict: true,
        });
        return { data };
    }

    async warmJobs(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.view");
        return { data: await liteCash.listWarmJobs(Number(ctx.request.input("limit", 200))) };
    }

    async warmJob(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.view");
        return { data: await liteCash.getWarmJob(ctx.params.publicId) };
    }

    async createWarmJob(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.warm.manage");
        const payload = await ctx.request.validateUsing(liteCashWarmJobCreateValidator);
        const data = await liteCash.createWarmJob(payload, Number(user.id));
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "lite_cash.warm.create",
            entityKind: "lite_cash_warm_job",
            entityId: entityId(data),
            payload: { scope: payload.scope, strategy: payload.strategy, priority: payload.priority, reason: payload.reason },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async cancelWarmJob(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.warm.manage");
        const payload = await ctx.request.validateUsing(liteCashActionValidator);
        const result = await liteCash.cancelWarmJob(ctx.params.publicId);
        if (result.changed) {
            await recordAudit({
                ctx,
                actorUserId: Number(user.id),
                action: "lite_cash.warm.cancel",
                entityKind: "lite_cash_warm_job",
                entityId: entityId(result.data),
                payload: { public_id: ctx.params.publicId, reason: payload.reason },
                strict: true,
            });
        }
        return { data: result.data, changed: result.changed };
    }

    async observeWarmJob(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.observation.write");
        const payload = await ctx.request.validateUsing(liteCashWarmJobObservationValidator);
        const data = await liteCash.observeWarmJob(ctx.params.publicId, payload);
        return { data };
    }

    async profiles(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.view");
        return { data: await liteCash.listProfiles(Number(ctx.request.input("limit", 100))) };
    }

    async profile(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.view");
        return { data: await liteCash.getProfile(ctx.params.publicId) };
    }

    async createProfile(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.profile.manage");
        const payload = await ctx.request.validateUsing(liteCashProfileCreateValidator);
        const data = await liteCash.createProfile(payload, Number(user.id));
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "lite_cash.profile.create",
            entityKind: "lite_cash_profile",
            entityId: entityId(data),
            payload: { profile_key: payload.profile_key, mode: payload.mode, reason: payload.reason },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async updateProfile(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.profile.manage");
        const payload = await ctx.request.validateUsing(liteCashProfileUpdateValidator);
        const result = await liteCash.updateProfile(ctx.params.publicId, payload, Number(user.id));
        if (result.changed) {
            await recordAudit({
                ctx,
                actorUserId: Number(user.id),
                action: "lite_cash.profile.update",
                entityKind: "lite_cash_profile",
                entityId: entityId(result.data),
                payload: { public_id: ctx.params.publicId, reason: payload.reason },
                strict: true,
            });
        }
        return { data: result.data, changed: result.changed };
    }

    async activateProfile(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.profile.manage");
        await requireRecentIdentityStepUp(Number(user.id), "lite_cash.profile.manage");
        const payload = await ctx.request.validateUsing(liteCashActionValidator);
        const result = await liteCash.activateProfile(ctx.params.publicId, Number(user.id), payload.reason);
        if (result.changed) {
            await recordAudit({
                ctx,
                actorUserId: Number(user.id),
                action: "lite_cash.profile.activate",
                entityKind: "lite_cash_profile",
                entityId: entityId(result.data),
                payload: { public_id: ctx.params.publicId, reason: payload.reason },
                strict: true,
            });
        }
        return { data: result.data, changed: result.changed };
    }

    async observations(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.view");
        return { data: await liteCash.listObservations(Number(ctx.request.input("limit", 400))) };
    }

    async createObservation(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.observation.write");
        const payload = await ctx.request.validateUsing(liteCashObservationValidator);
        const data = await liteCash.recordObservation(payload);
        return ctx.response.created({ data });
    }

    async settings(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.view");
        return { data: await liteCash.getSettings() };
    }

    async updateSettings(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.settings.manage");
        const payload = await ctx.request.validateUsing(liteCashSettingsValidator);
        const { reason, ...input } = payload;
        const result = await liteCash.updateSettings(input, Number(user.id), reason);
        if (result.changed) {
            await recordAudit({
                ctx,
                actorUserId: Number(user.id),
                action: "lite_cash.settings.update",
                entityKind: "lite_cash_settings",
                entityId: entityId(result.data),
                payload: { reason },
                strict: true,
            });
        }
        return { data: result.data, changed: result.changed };
    }

    async snapshots(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.view");
        return { data: await liteCash.listSnapshots(Number(ctx.request.input("limit", 100))) };
    }

    async createSnapshot(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.snapshot.manage");
        const payload = await ctx.request.validateUsing(liteCashSnapshotValidator);
        const data = await liteCash.createSnapshot(payload.snapshot_kind, payload.reason, Number(user.id));
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "lite_cash.snapshot.create",
            entityKind: "lite_cash_snapshot",
            entityId: entityId(data),
            payload: { snapshot_kind: payload.snapshot_kind, reason: payload.reason },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async exportConfiguration(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.view");
        return { data: await liteCash.exportConfiguration() };
    }

    async validateImport(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.snapshot.manage");
        const payload = await ctx.request.validateUsing(liteCashImportValidator);
        return { data: await liteCash.validateImport(payload.document) };
    }

    async applyImport(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireLiteCashPermission(user, "lite_cash.snapshot.manage");
        await requireLiteCashPermission(user, "lite_cash.settings.manage");
        await requireLiteCashPermission(user, "lite_cash.policy.manage");
        await requireLiteCashPermission(user, "lite_cash.profile.manage");
        await requireRecentIdentityStepUp(Number(user.id), "lite_cash.snapshot.manage");
        const payload = await ctx.request.validateUsing(liteCashImportValidator);
        const data = await liteCash.applyImport(payload.document, payload.reason, Number(user.id));
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "lite_cash.import.apply",
            entityKind: "lite_cash_import",
            entityId: null,
            payload: { fingerprint: data.validation.fingerprint, reason: payload.reason },
            strict: true,
        });
        return { data };
    }
}
