import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { isMutationCapability } from "#services/agentic_gateway/contracts";
import {
    createCapabilityVersion,
    gatewayOverview,
    listChannels,
    runConformance,
    upsertChannel,
    upsertPrincipal,
} from "#services/agentic_gateway/gateway_service";
import { requireAgenticGatewayPermission } from "#services/agentic_gateway/permissions";
import { evaluateProductReadiness, listReadiness, productGraph } from "#services/agentic_gateway/product_graph_service";
import { authorizeGovernedAgenticAction } from "#services/agentic_gateway/public_service";
import { requireRecentIdentityStepUp } from "#services/identity/step_up";
import {
    agenticActionValidator,
    agenticCapabilityValidator,
    agenticChannelValidator,
    agenticConformanceValidator,
    agenticPrincipalValidator,
    readinessRefreshValidator,
} from "#validators/agentic_gateway/agentic_gateway_validator";

export default class AdminAgenticGatewayController {
    async overview(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgenticGatewayPermission(user, "agentic_gateway.view");
        return { data: await gatewayOverview() };
    }

    async channels(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgenticGatewayPermission(user, "agentic_gateway.view");
        return { data: await listChannels() };
    }

    async saveChannel(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgenticGatewayPermission(user, "agentic_gateway.channels.manage");
        await requireRecentIdentityStepUp(Number(user.id), "agentic.channel.manage");
        const payload = await ctx.request.validateUsing(agenticChannelValidator);
        const data = await upsertChannel({
            channelKey: payload.channel_key,
            displayName: payload.display_name,
            adapterKey: payload.adapter_key,
            mode: payload.mode,
            protocolVersion: payload.protocol_version,
            eligibleProductScope: payload.eligible_product_scope,
            policyBoundary: payload.policy_boundary,
            actorUserId: Number(user.id),
        });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "agentic.channel.save",
            entityKind: "agentic_channel",
            entityId: data?.id ?? null,
            payload: {
                channel_key: payload.channel_key,
                adapter_key: payload.adapter_key,
                mode: payload.mode,
                reason: payload.reason,
            },
            strict: true,
        });
        return { data };
    }

    async savePrincipal(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgenticGatewayPermission(user, "agentic_gateway.principals.manage");
        await requireRecentIdentityStepUp(Number(user.id), "agentic.principal.manage");
        const payload = await ctx.request.validateUsing(agenticPrincipalValidator);
        const data = await upsertPrincipal({
            principalKey: payload.principal_key,
            displayName: payload.display_name,
            principalType: payload.principal_type,
            status: payload.status,
            scopes: payload.scopes,
            rateLimitPolicy: payload.rate_limit_policy,
            credentialFingerprint: payload.credential_fingerprint,
            actorUserId: Number(user.id),
        });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "agentic.principal.save",
            entityKind: "agentic_principal",
            entityId: data?.id ?? null,
            payload: { principal_key: payload.principal_key, status: payload.status, reason: payload.reason },
            strict: true,
        });
        return { data };
    }

    async authorizeAction(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgenticGatewayPermission(user, "agentic_gateway.view");
        const payload = await ctx.request.validateUsing(agenticActionValidator);
        if (isMutationCapability(payload.capability_key)) {
            await requireRecentIdentityStepUp(Number(user.id), "agentic.action.authorize");
        }
        const data = await authorizeGovernedAgenticAction({
            channelPublicId: payload.channel_public_id,
            principalPublicId: payload.principal_public_id,
            capabilityKey: payload.capability_key,
            idempotencyKey: payload.idempotency_key,
            payload: payload.payload,
        });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "agentic.action.authorize",
            entityKind: "agentic_action",
            entityId: data?.id ?? null,
            payload: { capability_key: payload.capability_key, status: data.status, idempotency_key: payload.idempotency_key },
            strict: true,
        });
        return { data };
    }

    async createCapability(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgenticGatewayPermission(user, "agentic_gateway.capabilities.manage");
        await requireRecentIdentityStepUp(Number(user.id), "agentic.capability.manage");
        const payload = await ctx.request.validateUsing(agenticCapabilityValidator);
        const data = await createCapabilityVersion({
            channelPublicId: payload.channel_public_id,
            capabilityKey: payload.capability_key,
            protocolVersion: payload.protocol_version,
            transport: payload.transport,
            endpointPath: payload.endpoint_path,
            inputSchema: payload.input_schema,
            outputSchema: payload.output_schema,
            requiredScopes: payload.required_scopes,
            riskClass: payload.risk_class,
            actorUserId: Number(user.id),
        });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "agentic.capability.version.create",
            entityKind: "agentic_capability",
            entityId: data?.id ?? null,
            payload: {
                capability_key: payload.capability_key,
                channel_public_id: payload.channel_public_id,
                reason: payload.reason,
            },
            strict: true,
        });
        return { data };
    }

    async conformance(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgenticGatewayPermission(user, "agentic_gateway.conformance.run");
        await requireRecentIdentityStepUp(Number(user.id), "agentic.conformance.run");
        const payload = await ctx.request.validateUsing(agenticConformanceValidator);
        const data = await runConformance({ channelPublicId: payload.channel_public_id, actorUserId: Number(user.id) });
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "agentic.conformance.run",
            entityKind: "agentic_channel",
            entityId: null,
            payload: { channel_public_id: payload.channel_public_id, status: data.status, reason: payload.reason },
            strict: true,
        });
        return { data };
    }

    async readiness(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgenticGatewayPermission(user, "agentic_gateway.view");
        return { data: await listReadiness(Math.min(Number(ctx.request.input("limit", 50)), 100)) };
    }

    async refreshReadiness(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgenticGatewayPermission(user, "agentic_gateway.readiness.refresh");
        const payload = await ctx.request.validateUsing(readinessRefreshValidator);
        return { data: await evaluateProductReadiness(payload.product_id, payload.locale ?? "fa") };
    }

    async graph(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgenticGatewayPermission(user, "agentic_gateway.view");
        const payload = await ctx.request.validateUsing(readinessRefreshValidator);
        return { data: await productGraph(payload.product_id, payload.locale ?? "fa") };
    }
}
