import type { HttpContext } from "@adonisjs/core/http";

import {
    deliveryHealth,
    identityAnalytics,
    identityMethods,
    identityOverview,
    identitySettings,
    identitySmsSettings,
    listIdentityPolicies,
    listIdentityVerifications,
    listRiskEvents,
    listSecurityEvents,
    updateIdentitySettings,
    updateIdentitySmsSettings,
    verificationDetail,
} from "#services/identity/admin";
import { listIdentityCredentials, revokeIdentityCredential } from "#services/identity/credentials";
import { applyIdentityPreset, listIdentityAccess, requireIdentityPermission } from "#services/identity/permissions";
import { createIdentityPolicy } from "#services/identity/policy";
import {
    listIdentityProviders,
    refreshIdentityDelivery,
    testIdentityProvider,
    upsertIdentityProvider,
} from "#services/identity/providers";
import { recordIdentitySecurityEvent } from "#services/identity/security";
import { listIdentitySessions, revokeIdentitySession } from "#services/identity/sessions";
import { requireRecentIdentityStepUp, satisfyIdentityStepUp } from "#services/identity/step_up";
import IdentityRecordTransformer from "#transformers/identity_record_transformer";
import {
    identityAccessPresetValidator,
    identityCredentialRevokeValidator,
    identityPolicyValidator,
    identityProviderValidator,
    identitySessionRevokeValidator,
    identitySettingsValidator,
    identitySmsSettingsValidator,
    identityStepUpValidator,
} from "#validators/identity/identity_validator";

function data(value: unknown) {
    if (Array.isArray(value))
        return { data: value.map((row) => new IdentityRecordTransformer(row as Record<string, unknown>).toObject()) };
    return { data: new IdentityRecordTransformer(value as Record<string, unknown>).toObject() };
}

export default class AdminIdentityController {
    async overview(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.view");
        return data(await identityOverview());
    }

    async verifications(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.verifications.view");
        return data(await listIdentityVerifications(Number(ctx.request.input("limit", 100))));
    }

    async verification(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.verifications.view");
        return data(await verificationDetail(String(ctx.params.publicId)));
    }

    async methods(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.view");
        return data(await identityMethods());
    }

    async policies(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.view");
        return data(await listIdentityPolicies());
    }

    async createPolicy(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.policies.manage");
        await requireRecentIdentityStepUp(Number(user.id), "identity.policy.manage");
        const payload = await ctx.request.validateUsing(identityPolicyValidator);
        const row = await createIdentityPolicy({
            actorUserId: Number(user.id),
            policyKey: payload.policy_key,
            purpose: payload.purpose,
            methods: payload.methods,
            enabled: payload.enabled,
            config: {
                code_length: payload.code_length,
                ttl_seconds: payload.ttl_seconds,
                max_attempts: payload.max_attempts,
                resend_cooldown_seconds: payload.resend_cooldown_seconds,
                risk_block_score: payload.risk_block_score,
                step_up_freshness_seconds: payload.step_up_freshness_seconds,
            },
        });
        await recordIdentitySecurityEvent({
            ctx,
            actorUserId: Number(user.id),
            eventType: "identity.policy.version_created",
            outcome: "success",
            severity: "warning",
            metadata: { policy_key: payload.policy_key, version: row.version, reason: payload.reason },
        });
        return data(row as Record<string, unknown>);
    }

    async providers(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.providers.view");
        return data(await listIdentityProviders());
    }

    async updateProvider(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.providers.manage");
        await requireRecentIdentityStepUp(Number(user.id), "identity.provider.manage");
        const payload = await ctx.request.validateUsing(identityProviderValidator);
        const provider = await upsertIdentityProvider({
            providerKey: payload.provider_key,
            channel: payload.channel,
            driver: payload.driver,
            enabled: payload.enabled,
            isPrimary: payload.is_primary,
            priority: payload.priority,
            senderId: payload.sender_id,
            baseUrl: payload.base_url,
            secret: payload.api_token ? { api_token: payload.api_token } : null,
            configuration: payload.timeout_ms ? { timeout_ms: payload.timeout_ms } : {},
        });
        await recordIdentitySecurityEvent({
            ctx,
            actorUserId: Number(user.id),
            eventType: "identity.provider.updated",
            outcome: "success",
            severity: "warning",
            metadata: { provider_key: payload.provider_key, reason: payload.reason },
        });
        return data(provider as Record<string, unknown>);
    }

    async testProvider(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.sms.test");
        const result = await testIdentityProvider(String(ctx.params.providerKey));
        await recordIdentitySecurityEvent({
            ctx,
            actorUserId: Number(user.id),
            eventType: "identity.provider.tested",
            outcome: result.ok ? "success" : "failed",
            metadata: { provider_key: ctx.params.providerKey, health_state: result.health_state },
        });
        return data(result as Record<string, unknown>);
    }

    async refreshDelivery(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.providers.view");
        return data((await refreshIdentityDelivery(Number(ctx.params.attemptId))) as Record<string, unknown>);
    }

    async delivery(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.providers.view");
        return data(await deliveryHealth());
    }

    async risk(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.risk.view");
        return data(await listRiskEvents(Number(ctx.request.input("limit", 100))));
    }

    async credentials(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.credentials.view");
        return data((await listIdentityCredentials(Number(ctx.params.userId))) as Array<Record<string, unknown>>);
    }

    async revokeCredential(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.credentials.revoke");
        await requireRecentIdentityStepUp(Number(user.id), "identity.credential.revoke");
        const payload = await ctx.request.validateUsing(identityCredentialRevokeValidator);
        await revokeIdentityCredential({
            actorUserId: Number(user.id),
            userId: Number(ctx.params.userId),
            credentialId: Number(ctx.params.credentialId),
            reason: payload.reason,
        });
        await recordIdentitySecurityEvent({
            ctx,
            userId: Number(ctx.params.userId),
            actorUserId: Number(user.id),
            eventType: "identity.admin.credential_revoked",
            outcome: "success",
            severity: "warning",
            metadata: { credential_id: Number(ctx.params.credentialId), reason: payload.reason },
        });
        return { data: { revoked: true } };
    }

    async sessions(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.sessions.view");
        return data((await listIdentitySessions(Number(ctx.params.userId))) as Array<Record<string, unknown>>);
    }

    async revokeSession(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.sessions.revoke");
        const payload = await ctx.request.validateUsing(identitySessionRevokeValidator);
        await revokeIdentitySession({
            ctx,
            actorUserId: Number(user.id),
            targetUserId: Number(ctx.params.userId),
            sessionId: Number(ctx.params.sessionId),
            reason: payload.reason,
        });
        await recordIdentitySecurityEvent({
            ctx,
            userId: Number(ctx.params.userId),
            actorUserId: Number(user.id),
            eventType: "identity.admin.session_revoked",
            outcome: "success",
            severity: "warning",
            metadata: { session_id: Number(ctx.params.sessionId), reason: payload.reason },
        });
        return { data: { revoked: true } };
    }

    async audit(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.audit.view");
        return data(await listSecurityEvents(Number(ctx.request.input("limit", 100))));
    }

    async analytics(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.analytics.view");
        return data(await identityAnalytics());
    }

    async settings(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.settings.view");
        return data(await identitySettings());
    }

    async updateSettings(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.settings.manage");
        await requireRecentIdentityStepUp(Number(user.id), "identity.settings.manage");
        const payload = await ctx.request.validateUsing(identitySettingsValidator);
        const updated = await updateIdentitySettings(payload);
        await recordIdentitySecurityEvent({
            ctx,
            actorUserId: Number(user.id),
            eventType: "identity.settings.updated",
            outcome: "success",
            severity: "warning",
            metadata: { reason: payload.reason },
        });
        return data(updated);
    }

    async smsSettings(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.sms.view");
        return data(await identitySmsSettings());
    }

    async updateSmsSettings(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.sms.manage");
        await requireRecentIdentityStepUp(Number(user.id), "identity.sms.manage");
        const payload = await ctx.request.validateUsing(identitySmsSettingsValidator);
        const updated = await updateIdentitySmsSettings(payload);
        await recordIdentitySecurityEvent({
            ctx,
            actorUserId: Number(user.id),
            eventType: "identity.sms.settings_updated",
            outcome: "success",
            severity: "warning",
            metadata: { reason: payload.reason },
        });
        return data(updated);
    }

    async access(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.settings.view");
        return data(await listIdentityAccess());
    }

    async applyAccessPreset(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.settings.manage");
        await requireRecentIdentityStepUp(Number(user.id), "identity.access.manage");
        const payload = await ctx.request.validateUsing(identityAccessPresetValidator);
        await applyIdentityPreset(Number(user.id), payload.user_id, payload.preset);
        await recordIdentitySecurityEvent({
            ctx,
            userId: payload.user_id,
            actorUserId: Number(user.id),
            eventType: "identity.access.preset_applied",
            outcome: "success",
            severity: "high",
            metadata: { preset: payload.preset, reason: payload.reason },
        });
        return { data: { updated: true } };
    }

    async stepUp(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireIdentityPermission(user, "identity.view");
        const payload = await ctx.request.validateUsing(identityStepUpValidator);
        return data(
            await satisfyIdentityStepUp({
                ctx,
                user,
                method: payload.method,
                proof: payload.proof,
                actionScope: payload.action_scope,
            }),
        );
    }
}
