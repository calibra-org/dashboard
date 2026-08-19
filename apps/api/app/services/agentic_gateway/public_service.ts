import { createHash, timingSafeEqual } from "node:crypto";
import encryption from "@adonisjs/core/services/encryption";

import { authorizeAgenticAction } from "#services/agentic_gateway/gateway_service";
import { assertAgenticTrustAllowed } from "#services/agentic_gateway/risk_bridge";
import { currentTenantId, currentTrx } from "#services/tenant_context";

const CAPABILITY_PURPOSE = "calibra.agentic.capability.v1";
const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|session|email|phone|otp|totp|recovery|credential)/i;

function digest(value: unknown) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeEqualHex(a: string, b: string) {
    if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function sanitize(value: unknown, depth = 0): unknown {
    if (depth > 4) return "[truncated]";
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
    if (!value || typeof value !== "object") {
        if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 497)}...` : value;
        return value;
    }
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .slice(0, 80)
            .map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? "[redacted]" : sanitize(item, depth + 1)]),
    );
}

function capabilityMetadata(row: Record<string, any>, channel: Record<string, any>) {
    return {
        channel_key: channel.channel_key,
        adapter_key: channel.adapter_key,
        capability_key: row.capability_key,
        version: Number(row.version),
        protocol_version: row.protocol_version ?? channel.protocol_version ?? null,
        transport: row.transport,
        endpoint_path: row.endpoint_path ?? null,
        input_schema: row.input_schema,
        output_schema: row.output_schema,
        required_scopes: row.required_scopes,
        risk_class: row.risk_class,
    };
}

function capabilitySignatureValid(row: Record<string, any>, channel: Record<string, any>, tenantId: number) {
    if (!row.signature || !row.metadata_digest) return false;
    const metadataDigest = digest(capabilityMetadata(row, channel));
    if (metadataDigest !== String(row.metadata_digest)) return false;
    const signed = encryption.getMessageVerifier().unsign<Record<string, unknown>>(String(row.signature), CAPABILITY_PURPOSE);
    if (!signed) return false;
    return (
        String(signed.metadataDigest ?? "") === metadataDigest &&
        Number(signed.tenantId) === tenantId &&
        Number(signed.channelId) === Number(channel.id) &&
        String(signed.capabilityKey ?? "") === String(row.capability_key) &&
        Number(signed.version) === Number(row.version)
    );
}

export async function authenticateAgentPrincipal(principalPublicId: string, credential: string) {
    const tenantId = Number(currentTenantId());
    const trx = currentTrx();
    const principal = await trx
        .from("agentic_principals")
        .where({ tenant_id: tenantId, public_id: principalPublicId, status: "active" })
        .first();
    if (!principal || !principal.credential_fingerprint) {
        throw Object.assign(new Error("Active agent principal credential is required"), {
            status: 401,
            code: "E_AGENTIC_PRINCIPAL_AUTH_REQUIRED",
        });
    }

    const presented = createHash("sha256").update(credential).digest("hex");
    const stored = String(principal.credential_fingerprint)
        .replace(/^sha256:/i, "")
        .toLowerCase();
    if (!safeEqualHex(presented, stored)) {
        throw Object.assign(new Error("Agent principal credential is invalid"), {
            status: 401,
            code: "E_AGENTIC_PRINCIPAL_AUTH_INVALID",
        });
    }

    await trx.from("agentic_principals").where("id", principal.id).update({ last_seen_at: new Date(), updated_at: new Date() });
    return {
        id: Number(principal.id),
        public_id: String(principal.public_id),
        principal_key: String(principal.principal_key),
        principal_type: String(principal.principal_type),
        scopes: Array.isArray(principal.scopes) ? principal.scopes : JSON.parse(principal.scopes ?? "[]"),
    };
}

export async function publicCapabilityProfile() {
    const tenantId = Number(currentTenantId());
    const trx = currentTrx();
    const channels = await trx
        .from("agentic_channels")
        .where("tenant_id", tenantId)
        .whereIn("mode", ["read_only", "live"])
        .where("kill_switch", false)
        .orderBy("channel_key", "asc");

    const data = [];
    for (const channel of channels) {
        const rows = await trx
            .from("agentic_capability_versions")
            .where("tenant_id", tenantId)
            .where("channel_id", channel.id)
            .whereIn("status", ["verified", "active"])
            .orderBy("capability_key", "asc")
            .orderBy("version", "desc");
        const seen = new Set<string>();
        const capabilities = rows
            .filter((row) => {
                const key = String(row.capability_key);
                if (seen.has(key) || !capabilitySignatureValid(row, channel, tenantId)) return false;
                seen.add(key);
                return true;
            })
            .map((row) => ({
                ...capabilityMetadata(row, channel),
                metadata_digest: row.metadata_digest,
                signature: row.signature,
                verified_at: row.verified_at,
            }));
        if (!capabilities.length) continue;
        data.push({
            channel_public_id: channel.public_id,
            channel_key: channel.channel_key,
            adapter_key: channel.adapter_key,
            mode: channel.mode,
            protocol_version: channel.protocol_version,
            capabilities,
        });
    }

    return {
        schema: "calibra.agentic-commerce.v1",
        generated_at: new Date().toISOString(),
        channels: data,
        endpoints: {
            product_graph: "/api/v1/agentic/products/{productId}",
            authorize: "/api/v1/agentic/actions/authorize",
            events: "/api/v1/agentic/events",
        },
    };
}

export async function authorizeGovernedAgenticAction(input: {
    channelPublicId: string;
    principalPublicId: string;
    capabilityKey: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
}) {
    await assertAgenticTrustAllowed({
        principalPublicId: input.principalPublicId,
        capabilityKey: input.capabilityKey,
        idempotencyKey: input.idempotencyKey,
    });
    return authorizeAgenticAction(input);
}

export async function recordAgenticChannelEvent(input: {
    eventId: string;
    eventType: string;
    channelPublicId?: string | null;
    principalPublicId: string;
    aggregateType: string;
    aggregateId: string;
    sessionId?: string | null;
    correlationId?: string | null;
    causationId?: string | null;
    payload?: Record<string, unknown>;
    occurredAt: Date;
}) {
    const tenantId = Number(currentTenantId());
    const trx = currentTrx();
    const existing = await trx.from("agentic_channel_events").where({ tenant_id: tenantId, event_id: input.eventId }).first();
    const sanitizedPayload = sanitize(input.payload ?? {}) as Record<string, unknown>;
    if (existing) {
        const same =
            String(existing.event_type) === input.eventType &&
            String(existing.aggregate_type) === input.aggregateType &&
            String(existing.aggregate_id) === input.aggregateId &&
            digest(existing.payload ?? {}) === digest(sanitizedPayload);
        if (!same) {
            throw Object.assign(new Error("Agentic event id was already used for a different event"), {
                status: 409,
                code: "E_AGENTIC_EVENT_IDEMPOTENCY_CONFLICT",
            });
        }
        return existing;
    }

    const principal = await trx
        .from("agentic_principals")
        .where({ tenant_id: tenantId, public_id: input.principalPublicId })
        .first();
    if (!principal)
        throw Object.assign(new Error("Agent principal not found"), { status: 404, code: "E_AGENTIC_PRINCIPAL_NOT_FOUND" });
    const channel = input.channelPublicId
        ? await trx.from("agentic_channels").where({ tenant_id: tenantId, public_id: input.channelPublicId }).first()
        : null;
    if (input.channelPublicId && !channel)
        throw Object.assign(new Error("Agentic channel not found"), { status: 404, code: "E_AGENTIC_CHANNEL_NOT_FOUND" });

    const [row] = await trx
        .table("agentic_channel_events")
        .insert({
            event_id: input.eventId,
            schema_version: 1,
            tenant_id: tenantId,
            event_type: input.eventType,
            channel_id: channel?.id ?? null,
            principal_id: principal.id,
            aggregate_type: input.aggregateType,
            aggregate_id: input.aggregateId,
            session_id: input.sessionId ?? null,
            correlation_id: input.correlationId ?? null,
            causation_id: input.causationId ?? null,
            source: "agent",
            privacy_classification: "internal",
            payload: sanitizedPayload,
            occurred_at: input.occurredAt,
            received_at: new Date(),
        })
        .returning("*");
    return row;
}
