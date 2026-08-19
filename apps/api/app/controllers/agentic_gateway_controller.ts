import type { HttpContext } from "@adonisjs/core/http";

import { productGraph } from "#services/agentic_gateway/product_graph_service";
import {
    authenticateAgentPrincipal,
    authorizeGovernedAgenticAction,
    publicCapabilityProfile,
    recordAgenticChannelEvent,
} from "#services/agentic_gateway/public_service";
import { publicAgenticActionValidator, publicAgenticEventValidator } from "#validators/agentic_gateway/agentic_gateway_validator";

function presentedCredential(ctx: HttpContext) {
    const authorization = String(ctx.request.header("authorization") ?? "");
    if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, "").trim();
    return String(ctx.request.header("x-calibra-agent-credential") ?? "").trim();
}

async function authenticatedPrincipal(ctx: HttpContext) {
    const principalPublicId = String(ctx.request.header("x-calibra-agent-principal") ?? "").trim();
    const credential = presentedCredential(ctx);
    if (!principalPublicId || !credential) {
        throw Object.assign(new Error("Agent principal and credential headers are required"), {
            status: 401,
            code: "E_AGENTIC_PRINCIPAL_AUTH_REQUIRED",
        });
    }
    return authenticateAgentPrincipal(principalPublicId, credential);
}

export default class AgenticGatewayController {
    async profile() {
        return { data: await publicCapabilityProfile() };
    }

    async product(ctx: HttpContext) {
        const principal = await authenticatedPrincipal(ctx);
        const productId = Number(ctx.params.productId);
        if (!Number.isSafeInteger(productId) || productId <= 0) {
            throw Object.assign(new Error("A valid product id is required"), { status: 422, code: "E_AGENTIC_PRODUCT_ID" });
        }
        const channelPublicId = String(ctx.request.input("channel_public_id", "")).trim();
        const idempotencyKey = String(ctx.request.header("x-idempotency-key") ?? ctx.request.input("idempotency_key", "")).trim();
        if (!channelPublicId || idempotencyKey.length < 8) {
            throw Object.assign(new Error("channel_public_id and an idempotency key are required"), {
                status: 422,
                code: "E_AGENTIC_PRODUCT_REQUEST_CONTRACT",
            });
        }
        const authorization = await authorizeGovernedAgenticAction({
            channelPublicId,
            principalPublicId: principal.public_id,
            capabilityKey: "catalog.product_graph",
            idempotencyKey,
            payload: { product_id: productId, locale: String(ctx.request.input("locale", "fa")) },
        });
        if (authorization.status !== "approved") {
            throw Object.assign(new Error("Product graph request is not authorized"), {
                status: 403,
                code: "E_AGENTIC_PRODUCT_GRAPH_NOT_AUTHORIZED",
                meta: { reason: authorization.policy_result?.reason ?? "policy" },
            });
        }
        return {
            data: await productGraph(productId, String(ctx.request.input("locale", "fa"))),
            meta: { authorization_id: authorization.public_id, principal_id: principal.public_id },
        };
    }

    async authorize(ctx: HttpContext) {
        const principal = await authenticatedPrincipal(ctx);
        const payload = await ctx.request.validateUsing(publicAgenticActionValidator);
        const data = await authorizeGovernedAgenticAction({
            channelPublicId: payload.channel_public_id,
            principalPublicId: principal.public_id,
            capabilityKey: payload.capability_key,
            idempotencyKey: payload.idempotency_key,
            payload: payload.payload,
        });
        return { data };
    }

    async event(ctx: HttpContext) {
        const principal = await authenticatedPrincipal(ctx);
        const payload = await ctx.request.validateUsing(publicAgenticEventValidator);
        const occurredAt = new Date(payload.occurred_at);
        if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
            throw Object.assign(new Error("occurred_at must be a valid non-future timestamp"), {
                status: 422,
                code: "E_AGENTIC_EVENT_TIME_INVALID",
            });
        }
        const data = await recordAgenticChannelEvent({
            eventId: payload.event_id,
            eventType: payload.event_type,
            channelPublicId: payload.channel_public_id ?? null,
            principalPublicId: principal.public_id,
            aggregateType: payload.aggregate_type,
            aggregateId: payload.aggregate_id,
            sessionId: payload.session_id ?? null,
            correlationId: payload.correlation_id ?? null,
            causationId: payload.causation_id ?? null,
            payload: payload.payload ?? {},
            occurredAt,
        });
        return { data };
    }
}
