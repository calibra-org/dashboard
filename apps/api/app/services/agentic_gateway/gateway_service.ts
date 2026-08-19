import { createHash, randomUUID } from "node:crypto";
import encryption from "@adonisjs/core/services/encryption";
import { currentTenantId, currentTrx } from "#services/tenant_context";
import { isMutationCapability, type ChannelMode } from "#services/agentic_gateway/contracts";

const PURPOSE = "calibra.agentic.capability.v1";
const ACTION_PURPOSE = "calibra.agentic.action.v1";
const CONFORMANCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ACTION_AUTH_TTL_MS = 5 * 60 * 1000;

function digest(value: unknown) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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

function verifyCapabilitySignature(row: Record<string, any>, channel: Record<string, any>, tenantId: number) {
    if (!row.signature || !row.metadata_digest) return false;
    const expectedDigest = digest(capabilityMetadata(row, channel));
    if (expectedDigest !== row.metadata_digest) return false;
    const signed = encryption.getMessageVerifier().unsign<Record<string, unknown>>(String(row.signature), PURPOSE);
    if (!signed) return false;
    return (
        String(signed.metadataDigest ?? "") === expectedDigest &&
        Number(signed.tenantId) === tenantId &&
        Number(signed.channelId) === Number(channel.id) &&
        String(signed.capabilityKey ?? "") === String(row.capability_key) &&
        Number(signed.version) === Number(row.version)
    );
}

function parsePrincipalRateLimit(value: unknown) {
    const parsed = typeof value === "string" ? JSON.parse(value || "{}") : (value ?? {});
    const windowSeconds = Number((parsed as Record<string, unknown>).window_seconds ?? 0);
    const maxActions = Number((parsed as Record<string, unknown>).max_actions ?? 0);
    if (!Number.isFinite(windowSeconds) || !Number.isFinite(maxActions) || windowSeconds < 0 || maxActions < 0) {
        throw Object.assign(new Error("Invalid principal rate limit policy"), { status: 422, code: "E_AGENTIC_RATE_LIMIT_POLICY_INVALID" });
    }
    if ((windowSeconds === 0) !== (maxActions === 0)) {
        throw Object.assign(new Error("Rate limit policy requires both window_seconds and max_actions"), { status: 422, code: "E_AGENTIC_RATE_LIMIT_POLICY_INCOMPLETE" });
    }
    if (windowSeconds > 86400 || maxActions > 1000000) {
        throw Object.assign(new Error("Principal rate limit policy exceeds supported bounds"), { status: 422, code: "E_AGENTIC_RATE_LIMIT_POLICY_BOUNDS" });
    }
    return { windowSeconds: Math.floor(windowSeconds), maxActions: Math.floor(maxActions) };
}

export async function listChannels() {
    const tenantId = Number(currentTenantId());
    const trx = currentTrx();
    const channels = await trx.from("agentic_channels").where("tenant_id", tenantId).orderBy("updated_at", "desc");
    const principals = await trx.from("agentic_principals").where("tenant_id", tenantId).orderBy("updated_at", "desc");
    const conformance = await trx.from("agentic_conformance_runs").where("tenant_id", tenantId).orderBy("ran_at", "desc").limit(50);
    return { channels, principals, conformance };
}

export async function upsertChannel(input: { channelKey: string; displayName: string; adapterKey: string; mode: ChannelMode; protocolVersion?: string | null; eligibleProductScope?: unknown; policyBoundary?: unknown; actorUserId: number }) {
    const tenantId = Number(currentTenantId());
    const trx = currentTrx();
    const existing = await trx.from("agentic_channels").where("tenant_id", tenantId).where("channel_key", input.channelKey).first();
    const nextMode = input.mode;
    if (nextMode === "live") {
        const proposedProtocolVersion = input.protocolVersion ?? existing?.protocol_version ?? null;
        const pass = existing
            ? await trx
                  .from("agentic_conformance_runs")
                  .where("tenant_id", tenantId)
                  .where("channel_id", existing.id)
                  .where("status", "pass")
                  .where("adapter_key", input.adapterKey)
                  .where("ran_at", ">=", new Date(Date.now() - CONFORMANCE_MAX_AGE_MS))
                  .where((query) =>
                      proposedProtocolVersion === null
                          ? query.whereNull("protocol_version")
                          : query.where("protocol_version", proposedProtocolVersion),
                  )
                  .orderBy("ran_at", "desc")
                  .first()
            : null;
        if (!pass) throw Object.assign(new Error("Live mode requires a recent passing conformance run for the selected adapter/protocol"), { status: 422, code: "E_AGENTIC_CONFORMANCE_REQUIRED" });
    }
    const payload = {
        display_name: input.displayName,
        adapter_key: input.adapterKey,
        mode: nextMode,
        protocol_version: input.protocolVersion ?? null,
        eligible_product_scope: input.eligibleProductScope ?? {},
        policy_boundary: input.policyBoundary ?? {},
        updated_by_user_id: input.actorUserId,
        updated_at: new Date(),
    };
    if (existing) {
        await trx.from("agentic_channels").where("id", existing.id).update({ ...payload, version: Number(existing.version) + 1 });
        return trx.from("agentic_channels").where("id", existing.id).first();
    }
    const [row] = await trx.table("agentic_channels").insert({ public_id: randomUUID(), tenant_id: tenantId, channel_key: input.channelKey, ...payload }).returning("*");
    return row;
}

export async function createCapabilityVersion(input: { channelPublicId: string; capabilityKey: string; protocolVersion?: string | null; transport: string; endpointPath?: string | null; inputSchema: unknown; outputSchema: unknown; requiredScopes: string[]; riskClass: string; actorUserId: number }) {
    const tenantId = Number(currentTenantId());
    const trx = currentTrx();
    const channel = await trx.from("agentic_channels").where("tenant_id", tenantId).where("public_id", input.channelPublicId).first();
    if (!channel) throw Object.assign(new Error("Channel not found"), { status: 404, code: "E_AGENTIC_CHANNEL_NOT_FOUND" });
    if (isMutationCapability(input.capabilityKey) && input.riskClass === "read_only") throw Object.assign(new Error("Mutating capability cannot be classified read-only"), { status: 422, code: "E_AGENTIC_RISK_CLASS_INVALID" });
    const latest = await trx.from("agentic_capability_versions").where("tenant_id", tenantId).where("channel_id", channel.id).where("capability_key", input.capabilityKey).max("version as version").first();
    const version = Number(latest?.version ?? 0) + 1;
    const metadata = { channel_key: channel.channel_key, adapter_key: channel.adapter_key, capability_key: input.capabilityKey, version, protocol_version: input.protocolVersion ?? channel.protocol_version ?? null, transport: input.transport, endpoint_path: input.endpointPath ?? null, input_schema: input.inputSchema, output_schema: input.outputSchema, required_scopes: input.requiredScopes, risk_class: input.riskClass };
    const metadataDigest = digest(metadata);
    const signature = encryption.getMessageVerifier().sign({ metadataDigest, tenantId, channelId: channel.id, capabilityKey: input.capabilityKey, version }, undefined, PURPOSE);
    const [row] = await trx.table("agentic_capability_versions").insert({ public_id: randomUUID(), tenant_id: tenantId, channel_id: channel.id, capability_key: input.capabilityKey, version, status: "draft", protocol_version: metadata.protocol_version, transport: input.transport, endpoint_path: input.endpointPath ?? null, input_schema: input.inputSchema, output_schema: input.outputSchema, required_scopes: input.requiredScopes, risk_class: input.riskClass, metadata_digest: metadataDigest, signature, created_by_user_id: input.actorUserId }).returning("*");
    return row;
}

export async function runConformance(input: { channelPublicId: string; actorUserId: number }) {
    const tenantId = Number(currentTenantId());
    const trx = currentTrx();
    const channel = await trx.from("agentic_channels").where("tenant_id", tenantId).where("public_id", input.channelPublicId).first();
    if (!channel) throw Object.assign(new Error("Channel not found"), { status: 404, code: "E_AGENTIC_CHANNEL_NOT_FOUND" });
    const capabilities = await trx.from("agentic_capability_versions").where("tenant_id", tenantId).where("channel_id", channel.id).whereIn("status", ["draft", "verified", "active"]).orderBy("capability_key");
    const checks = [
        { key: "channel_not_killed", pass: !Boolean(channel.kill_switch) },
        { key: "capabilities_present", pass: capabilities.length > 0 },
        { key: "schemas_present", pass: capabilities.every((row) => row.input_schema && row.output_schema) },
        { key: "signed_metadata", pass: capabilities.every((row) => verifyCapabilitySignature(row, channel, tenantId)) },
        { key: "protocol_version_declared", pass: channel.adapter_key === "native" || Boolean(channel.protocol_version) },
    ];
    const status = checks.every((check) => check.pass) ? "pass" : "fail";
    const [run] = await trx.table("agentic_conformance_runs").insert({ public_id: randomUUID(), tenant_id: tenantId, channel_id: channel.id, adapter_key: channel.adapter_key, protocol_version: channel.protocol_version, status, checks, artifacts: [{ kind: "capability_manifest", capability_count: capabilities.length }], failure_summary: status === "pass" ? null : checks.filter((c) => !c.pass).map((c) => c.key).join(", "), ran_by_user_id: input.actorUserId }).returning("*");
    if (status === "pass") await trx.from("agentic_capability_versions").where("tenant_id", tenantId).where("channel_id", channel.id).where("status", "draft").update({ status: "verified", verified_at: new Date() });
    return run;
}

export async function gatewayOverview() {
    const tenantId = Number(currentTenantId());
    const trx = currentTrx();
    const [channels, live, principals, events, avgReadiness, blocked] = await Promise.all([
        trx.from("agentic_channels").where("tenant_id", tenantId).count("* as count").first(),
        trx.from("agentic_channels").where("tenant_id", tenantId).where("mode", "live").count("* as count").first(),
        trx.from("agentic_principals").where("tenant_id", tenantId).where("status", "active").count("* as count").first(),
        trx.from("agentic_channel_events").where("tenant_id", tenantId).where("occurred_at", ">=", new Date(Date.now() - 30 * 86400000)).count("* as count").first(),
        trx.from("agentic_product_readiness").where("tenant_id", tenantId).avg("score_bp as value").first(),
        trx.from("agentic_action_ledger").where("tenant_id", tenantId).where("status", "blocked").where("created_at", ">=", new Date(Date.now() - 30 * 86400000)).count("* as count").first(),
    ]);
    return { kpis: { channels: Number(channels?.count ?? 0), live_channels: Number(live?.count ?? 0), active_principals: Number(principals?.count ?? 0), events_30d: Number(events?.count ?? 0), avg_readiness_bp: avgReadiness?.value === null || avgReadiness?.value === undefined ? null : Math.round(Number(avgReadiness.value)), policy_blocks_30d: Number(blocked?.count ?? 0) }, freshness: { generated_at: new Date().toISOString(), sources: ["products", "product_translations", "product_variations", "inventory_items", "agentic_channel_events"] } };
}

export async function upsertPrincipal(input:{principalKey:string;displayName:string;principalType:string;status:string;scopes:string[];rateLimitPolicy:Record<string,unknown>;credentialFingerprint?:string|null;actorUserId:number}){parsePrincipalRateLimit(input.rateLimitPolicy);const tenantId=Number(currentTenantId()),trx=currentTrx(),existing=await trx.from("agentic_principals").where({tenant_id:tenantId,principal_key:input.principalKey}).first(),payload={display_name:input.displayName,principal_type:input.principalType,status:input.status,scopes:input.scopes,credential_fingerprint:input.credentialFingerprint??null,rate_limit_policy:input.rateLimitPolicy,updated_at:new Date()};if(existing){await trx.from("agentic_principals").where("id",existing.id).update(payload);return trx.from("agentic_principals").where("id",existing.id).first()}const [row]=await trx.table("agentic_principals").insert({public_id:randomUUID(),tenant_id:tenantId,principal_key:input.principalKey,...payload,created_by_user_id:input.actorUserId}).returning("*");return row}
export async function authorizeAgenticAction(input: {
    channelPublicId: string;
    principalPublicId: string;
    capabilityKey: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
}) {
    const tenantId = Number(currentTenantId());
    const trx = currentTrx();
    const inputHash = digest(input.payload);
    const prior = await trx.from("agentic_action_ledger").where({ tenant_id: tenantId, idempotency_key: input.idempotencyKey }).first();
    if (prior) {
        const sameRequest =
            String(prior.input_hash) === inputHash &&
            String(prior.capability_key) === input.capabilityKey;
        if (!sameRequest) {
            throw Object.assign(new Error("Idempotency key was already used for a different agentic action"), {
                status: 409,
                code: "E_AGENTIC_IDEMPOTENCY_CONFLICT",
            });
        }
        return prior;
    }

    const channel = await trx.from("agentic_channels").where({ tenant_id: tenantId, public_id: input.channelPublicId }).first();
    if (!channel) throw Object.assign(new Error("Channel not found"), { status: 404, code: "E_AGENTIC_CHANNEL_NOT_FOUND" });
    const principal = await trx.from("agentic_principals").where({ tenant_id: tenantId, public_id: input.principalPublicId, status: "active" }).first();
    if (!principal) throw Object.assign(new Error("Active principal not found"), { status: 404, code: "E_AGENTIC_PRINCIPAL_NOT_FOUND" });
    const cap = await trx
        .from("agentic_capability_versions")
        .where({ tenant_id: tenantId, channel_id: channel.id, capability_key: input.capabilityKey })
        .whereIn("status", ["verified", "active"])
        .orderBy("version", "desc")
        .first();
    if (!cap) throw Object.assign(new Error("Verified capability not found"), { status: 409, code: "E_AGENTIC_CAPABILITY_NOT_VERIFIED" });
    if (!verifyCapabilitySignature(cap, channel, tenantId)) {
        throw Object.assign(new Error("Capability metadata signature is invalid"), { status: 409, code: "E_AGENTIC_CAPABILITY_SIGNATURE_INVALID" });
    }

    const scopes = Array.isArray(principal.scopes) ? principal.scopes : JSON.parse(principal.scopes ?? "[]");
    const required = Array.isArray(cap.required_scopes) ? cap.required_scopes : JSON.parse(cap.required_scopes ?? "[]");
    const missing = required.filter((scope: string) => !scopes.includes(scope));
    const mutation = isMutationCapability(input.capabilityKey);
    const rateLimit = parsePrincipalRateLimit(principal.rate_limit_policy);
    let recentActionCount = 0;
    if (rateLimit.windowSeconds > 0 && rateLimit.maxActions > 0) {
        const since = new Date(Date.now() - rateLimit.windowSeconds * 1000);
        const countRow = await trx
            .from("agentic_action_ledger")
            .where({ tenant_id: tenantId, principal_id: principal.id })
            .where("created_at", ">=", since)
            .count("* as count")
            .first();
        recentActionCount = Number(countRow?.count ?? 0);
    }

    let allowed = true;
    let reason = "allowed";
    if (channel.kill_switch || channel.mode === "disabled" || channel.mode === "shadow") {
        allowed = false; reason = "channel_not_executable";
    } else if (mutation && channel.mode === "read_only") {
        allowed = false; reason = "read_only_channel";
    } else if (missing.length) {
        allowed = false; reason = "missing_scope";
    } else if (rateLimit.maxActions > 0 && recentActionCount >= rateLimit.maxActions) {
        allowed = false; reason = "principal_rate_limit_exceeded";
    } else if (["high", "critical"].includes(String(cap.risk_class))) {
        allowed = false; reason = "orchestrator_approval_required";
    }

    const authorization = allowed
        ? encryption.getMessageVerifier().sign(
              { tenantId, channelId: channel.id, principalId: principal.id, capabilityKey: input.capabilityKey, capabilityVersion: cap.version, idempotencyKey: input.idempotencyKey, inputHash },
              ACTION_AUTH_TTL_MS,
              ACTION_PURPOSE,
          )
        : null;
    const [row] = await trx.table("agentic_action_ledger").insert({
        public_id: randomUUID(),
        tenant_id: tenantId,
        channel_id: channel.id,
        principal_id: principal.id,
        capability_key: input.capabilityKey,
        action_type: mutation ? "mutation_authorization" : "read_authorization",
        idempotency_key: input.idempotencyKey,
        input_hash: inputHash,
        risk_class: cap.risk_class,
        status: allowed ? "approved" : "blocked",
        policy_result: { allowed, reason, missing_scopes: missing, rate_limit: { window_seconds: rateLimit.windowSeconds, max_actions: rateLimit.maxActions, recent_action_count: recentActionCount } },
        approval_ids: [],
        result: { authorization, capability_version: cap.version },
        external_refs: {},
        verification: { signature_issued: Boolean(authorization) },
    }).returning("*");
    return row;
}
