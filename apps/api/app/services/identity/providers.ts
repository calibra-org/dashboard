import { randomUUID } from "node:crypto";
import encryption from "@adonisjs/core/services/encryption";
import mail from "@adonisjs/mail/services/main";
import { DateTime } from "luxon";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export type IdentityProviderChannel = "sms" | "email";
export type IdentityDeliveryState = "accepted" | "sent" | "delivered" | "delivery_unknown" | "failed";

interface ProviderSendInput {
    verificationId: number;
    generation: number;
    to: string;
    message: string;
    templateCode?: string | null;
    templateParams?: Record<string, string>;
    idempotencyKey?: string;
}

interface ProviderSendResult {
    state: IdentityDeliveryState;
    providerMessageId: string | null;
    latencyMs: number;
    costMinor: number | null;
    evidence: Record<string, unknown>;
}

interface ProviderRow {
    id: number;
    provider_key: string;
    channel: IdentityProviderChannel;
    driver: string;
    enabled: boolean;
    is_primary: boolean;
    priority: number;
    sender_id: string | null;
    base_url: string | null;
    secret_ciphertext: string | null;
    configuration: Record<string, unknown> | string;
    capabilities: Record<string, unknown> | string;
    health_state: string;
    consecutive_failures: number;
    last_health_checked_at: string | null;
    last_success_at: string | null;
    circuit_open_until: string | null;
}

function asObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value !== "string") return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function normalizedProviderBaseUrl(driver: ProviderRow["driver"] | "ippanel" | "log" | "mail", baseUrl?: string | null) {
    if (driver !== "ippanel") return baseUrl ?? null;
    const candidate = (baseUrl || "https://edge.ippanel.com").replace(/\/+$/, "");
    if (candidate !== "https://edge.ippanel.com") {
        throw Object.assign(new Error("IPPanel base URL is not allowed"), { status: 422, code: "E_IDENTITY_PROVIDER_BASE_URL" });
    }
    return candidate;
}

function providerPurpose(key: string) {
    return `identity-provider:${key}:credentials:v1`;
}

function decryptSecret(row: ProviderRow): Record<string, string> {
    if (!row.secret_ciphertext) return {};
    const value = encryption.decrypt(row.secret_ciphertext, providerPurpose(row.provider_key));
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
    );
}

function safeProvider(row: ProviderRow) {
    return {
        id: Number(row.id),
        provider_key: row.provider_key,
        channel: row.channel,
        driver: row.driver,
        enabled: Boolean(row.enabled),
        is_primary: Boolean(row.is_primary),
        priority: Number(row.priority),
        sender_id: row.sender_id,
        base_url: row.base_url,
        configuration: asObject(row.configuration),
        capabilities: asObject(row.capabilities),
        health_state: row.secret_ciphertext ? row.health_state : "unconfigured",
        credential_configured: Boolean(row.secret_ciphertext),
        circuit_open_until: row.circuit_open_until,
    };
}

export async function listIdentityProviders(channel?: IdentityProviderChannel) {
    let query = currentTrx()
        .from("identity_provider_configs")
        .where("tenant_id", Number(currentTenantId()))
        .orderBy("priority", "asc");
    if (channel) query = query.where("channel", channel);
    const rows = (await query) as ProviderRow[];
    return rows.map(safeProvider);
}

export async function upsertIdentityProvider(input: {
    providerKey: string;
    channel: IdentityProviderChannel;
    driver: "ippanel" | "log" | "mail";
    enabled: boolean;
    isPrimary: boolean;
    priority: number;
    senderId?: string | null;
    baseUrl?: string | null;
    secret?: Record<string, string> | null;
    configuration?: Record<string, unknown>;
}) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const baseUrl = normalizedProviderBaseUrl(input.driver, input.baseUrl);
    const existing = (await trx
        .from("identity_provider_configs")
        .where("tenant_id", tenantId)
        .where("provider_key", input.providerKey)
        .first()) as ProviderRow | undefined;
    const secretCiphertext =
        input.secret && Object.keys(input.secret).length > 0
            ? encryption.encrypt(input.secret, { purpose: providerPurpose(input.providerKey) })
            : (existing?.secret_ciphertext ?? null);
    const capabilities =
        input.driver === "ippanel"
            ? { send: true, pattern: true, delivery_lookup: true }
            : input.driver === "mail"
              ? { send: true, delivery_lookup: false }
              : { send: true, simulated: true, delivery_lookup: false };

    if (input.isPrimary) {
        await trx
            .from("identity_provider_configs")
            .where("tenant_id", tenantId)
            .where("channel", input.channel)
            .update({ is_primary: false });
    }

    await trx
        .table("identity_provider_configs")
        .insert({
            tenant_id: tenantId,
            provider_key: input.providerKey,
            channel: input.channel,
            driver: input.driver,
            enabled: input.enabled,
            is_primary: input.isPrimary,
            priority: input.priority,
            sender_id: input.senderId ?? null,
            base_url: baseUrl,
            secret_ciphertext: secretCiphertext,
            configuration: JSON.stringify(input.configuration ?? {}),
            capabilities: JSON.stringify(capabilities),
            health_state: secretCiphertext || input.driver === "log" ? "unknown" : "unconfigured",
            updated_at: DateTime.utc().toSQL(),
        })
        .onConflict(["tenant_id", "provider_key"])
        .merge([
            "channel",
            "driver",
            "enabled",
            "is_primary",
            "priority",
            "sender_id",
            "base_url",
            "secret_ciphertext",
            "configuration",
            "capabilities",
            "health_state",
            "updated_at",
        ]);

    const row = (await trx
        .from("identity_provider_configs")
        .where("tenant_id", tenantId)
        .where("provider_key", input.providerKey)
        .first()) as ProviderRow;
    return safeProvider(row);
}

async function sendWithIpPanel(row: ProviderRow, input: ProviderSendInput): Promise<ProviderSendResult> {
    const secret = decryptSecret(row);
    const apiToken = secret.api_token ?? secret.apiToken ?? secret.token;
    if (!apiToken || !row.sender_id)
        throw Object.assign(new Error("IPPanel credentials or sender are not configured"), { code: "E_PROVIDER_UNCONFIGURED" });
    const configuration = asObject(row.configuration);
    const started = Date.now();
    const body = input.templateCode
        ? {
              sending_type: "pattern",
              from_number: row.sender_id,
              code: input.templateCode,
              recipients: [input.to],
              params: input.templateParams ?? {},
          }
        : {
              sending_type: "webservice",
              from_number: row.sender_id,
              message: input.message,
              params: { recipients: [input.to] },
          };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(configuration.timeout_ms ?? 5000)));
    try {
        const response = await fetch(`${row.base_url || "https://edge.ippanel.com"}/v1/api/send`, {
            method: "POST",
            headers: { Authorization: apiToken, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        const text = await response.text();
        let payload: Record<string, unknown> = {};
        try {
            payload = JSON.parse(text) as Record<string, unknown>;
        } catch {
            payload = {};
        }
        if (!response.ok) {
            const message = typeof payload.message === "string" ? payload.message : `Provider HTTP ${response.status}`;
            throw Object.assign(new Error(message), { code: `E_IPPANEL_${response.status}` });
        }
        const data = asObject(payload.data);
        const messageId =
            String(data.bulk_id ?? data.message_outbox_id ?? payload.bulk_id ?? payload.message_outbox_id ?? "") || null;
        return {
            state: "accepted",
            providerMessageId: messageId,
            latencyMs: Date.now() - started,
            costMinor: null,
            evidence: { http_status: response.status, accepted: true },
        };
    } finally {
        clearTimeout(timeout);
    }
}

async function sendWithLog(row: ProviderRow): Promise<ProviderSendResult> {
    return {
        state: "delivery_unknown",
        providerMessageId: `log-${randomUUID()}`,
        latencyMs: 0,
        costMinor: 0,
        evidence: { simulated: true, driver: row.driver },
    };
}

async function sendWithMail(row: ProviderRow, input: ProviderSendInput): Promise<ProviderSendResult> {
    const started = Date.now();
    await mail.send((message) => {
        message.to(input.to).subject("Calibra verification").text(input.message);
    });
    return {
        state: "accepted",
        providerMessageId: null,
        latencyMs: Date.now() - started,
        costMinor: null,
        evidence: { accepted: true, driver: row.driver },
    };
}

async function deliver(row: ProviderRow, input: ProviderSendInput) {
    if (row.driver === "ippanel") return sendWithIpPanel(row, input);
    if (row.driver === "mail") return sendWithMail(row, input);
    return sendWithLog(row);
}

export async function sendIdentityMessage(channel: IdentityProviderChannel, input: ProviderSendInput) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const now = DateTime.utc();
    const rows = (await trx
        .from("identity_provider_configs")
        .where("tenant_id", tenantId)
        .where("channel", channel)
        .where("enabled", true)
        .orderBy("is_primary", "desc")
        .orderBy("priority", "asc")) as ProviderRow[];
    const eligible = rows.filter(
        (row) => !row.circuit_open_until || DateTime.fromJSDate(new Date(row.circuit_open_until)) <= now,
    );
    if (eligible.length === 0)
        throw Object.assign(new Error("No configured identity provider is available"), {
            code: "E_IDENTITY_PROVIDER_UNAVAILABLE",
        });

    let lastError: unknown = null;
    for (const [index, row] of eligible.entries()) {
        const idempotencyKey =
            input.idempotencyKey ?? `${input.verificationId}:${input.generation}:${channel}:${row.provider_key}`;
        const inserted = await trx
            .table("identity_provider_attempts")
            .insert({
                tenant_id: tenantId,
                verification_id: input.verificationId,
                generation: input.generation,
                provider_key: row.provider_key,
                channel,
                state: "created",
                idempotency_key: idempotencyKey,
            })
            .onConflict(["tenant_id", "idempotency_key"])
            .ignore()
            .returning(["id"]);
        const existing = inserted[0]
            ? null
            : await trx
                  .from("identity_provider_attempts")
                  .where("tenant_id", tenantId)
                  .where("idempotency_key", idempotencyKey)
                  .first();
        const attemptId = Number(inserted[0]?.id ?? existing?.id);
        if (existing && ["accepted", "sent", "delivered", "delivery_unknown"].includes(String(existing.state))) return existing;
        try {
            const result = await deliver(row, input);
            await trx
                .from("identity_provider_attempts")
                .where("id", attemptId)
                .update({
                    state: result.state,
                    provider_message_id: result.providerMessageId,
                    latency_ms: result.latencyMs,
                    cost_minor: result.costMinor,
                    evidence: JSON.stringify(result.evidence),
                    accepted_at: ["accepted", "sent", "delivered", "delivery_unknown"].includes(result.state)
                        ? now.toSQL()
                        : null,
                    delivered_at: result.state === "delivered" ? now.toSQL() : null,
                    updated_at: now.toSQL(),
                });
            await trx
                .from("identity_provider_configs")
                .where("id", row.id)
                .update({
                    health_state: row.driver === "log" ? "unknown" : "healthy",
                    consecutive_failures: 0,
                    last_success_at: now.toSQL(),
                    last_health_checked_at: now.toSQL(),
                    last_error: null,
                    updated_at: now.toSQL(),
                });
            return { id: attemptId, ...result, provider_key: row.provider_key };
        } catch (error) {
            lastError = error;
            const code =
                error instanceof Error && "code" in error
                    ? String((error as Error & { code?: unknown }).code)
                    : "E_PROVIDER_SEND";
            const message = error instanceof Error ? error.message : "Provider send failed";
            await trx
                .from("identity_provider_attempts")
                .where("id", attemptId)
                .update({
                    state: "failed",
                    error_code: code,
                    error_message: message.slice(0, 500),
                    failed_at: now.toSQL(),
                    updated_at: now.toSQL(),
                });
            const failures = Number(row.consecutive_failures ?? 0) + 1;
            await trx
                .from("identity_provider_configs")
                .where("id", row.id)
                .update({
                    health_state: failures >= 3 ? "circuit_open" : "degraded",
                    consecutive_failures: failures,
                    circuit_open_until: failures >= 3 ? now.plus({ minutes: 5 }).toSQL() : null,
                    last_health_checked_at: now.toSQL(),
                    last_error: message.slice(0, 500),
                    updated_at: now.toSQL(),
                });
            if (index === eligible.length - 1) break;
        }
    }
    throw lastError instanceof Error ? lastError : new Error("Identity provider delivery failed");
}

export async function testIdentityProvider(providerKey: string) {
    const row = (await currentTrx()
        .from("identity_provider_configs")
        .where("tenant_id", Number(currentTenantId()))
        .where("provider_key", providerKey)
        .first()) as ProviderRow | undefined;
    if (!row) throw Object.assign(new Error("Provider not found"), { status: 404, code: "E_IDENTITY_PROVIDER_NOT_FOUND" });
    const now = DateTime.utc();
    if (row.driver === "log") {
        await currentTrx()
            .from("identity_provider_configs")
            .where("id", row.id)
            .update({ health_state: "unknown", last_health_checked_at: now.toSQL(), last_error: null });
        return { ok: true, health_state: "unknown", simulated: true };
    }
    if (row.driver !== "ippanel") return { ok: false, health_state: "unconfigured", reason: "Unsupported provider probe" };
    const secret = decryptSecret(row);
    const apiToken = secret.api_token ?? secret.apiToken ?? secret.token;
    if (!apiToken) return { ok: false, health_state: "unconfigured", reason: "Credential not configured" };
    try {
        const response = await fetch(`${row.base_url || "https://edge.ippanel.com"}/v1/api/report/new_list?page=1&per_page=1`, {
            headers: { Authorization: apiToken, Accept: "application/json" },
        });
        const health = response.ok ? "healthy" : "degraded";
        await currentTrx()
            .from("identity_provider_configs")
            .where("id", row.id)
            .update({
                health_state: health,
                last_health_checked_at: now.toSQL(),
                last_success_at: response.ok ? now.toSQL() : row.last_success_at,
                last_error: response.ok ? null : `Provider HTTP ${response.status}`,
                updated_at: now.toSQL(),
            });
        return { ok: response.ok, health_state: health, http_status: response.status };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Provider probe failed";
        await currentTrx()
            .from("identity_provider_configs")
            .where("id", row.id)
            .update({
                health_state: "degraded",
                last_health_checked_at: now.toSQL(),
                last_error: message.slice(0, 500),
                updated_at: now.toSQL(),
            });
        return { ok: false, health_state: "degraded", reason: message };
    }
}

export async function refreshIdentityDelivery(attemptId: number) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const attempt = await trx.from("identity_provider_attempts").where("tenant_id", tenantId).where("id", attemptId).first();
    if (!attempt)
        throw Object.assign(new Error("Provider attempt not found"), { status: 404, code: "E_IDENTITY_ATTEMPT_NOT_FOUND" });
    const row = (await trx
        .from("identity_provider_configs")
        .where("tenant_id", tenantId)
        .where("provider_key", attempt.provider_key)
        .first()) as ProviderRow | undefined;
    if (!row || row.driver !== "ippanel" || !attempt.provider_message_id) return attempt;
    const secret = decryptSecret(row);
    const apiToken = secret.api_token ?? secret.apiToken ?? secret.token;
    if (!apiToken) return attempt;
    const response = await fetch(
        `${row.base_url || "https://edge.ippanel.com"}/v1/api/report/recipients?page=1&per_page=10&bulk_id=${encodeURIComponent(String(attempt.provider_message_id))}`,
        {
            headers: { Authorization: apiToken, Accept: "application/json" },
        },
    );
    if (!response.ok) return attempt;
    const payload = (await response.json()) as Record<string, unknown>;
    const data = asObject(payload.data);
    const rows = Array.isArray(data.data) ? data.data : Array.isArray(payload.data) ? payload.data : [];
    const recipient = rows[0] && typeof rows[0] === "object" ? (rows[0] as Record<string, unknown>) : {};
    const status = Number(recipient.status ?? -1);
    const state: IdentityDeliveryState =
        status === 2
            ? "delivered"
            : status === 3 || status === 4
              ? "failed"
              : status === 0 || status === 1
                ? "sent"
                : "delivery_unknown";
    const now = DateTime.utc();
    await trx
        .from("identity_provider_attempts")
        .where("id", attemptId)
        .update({
            state,
            delivered_at: state === "delivered" ? now.toSQL() : null,
            failed_at: state === "failed" ? now.toSQL() : null,
            evidence: JSON.stringify({ recipient_status: status, source: "ippanel_recipient_report" }),
            updated_at: now.toSQL(),
        });
    if (state === "delivered") {
        await trx
            .from("identity_verifications")
            .where("id", attempt.verification_id)
            .whereIn("status", ["provider_accepted", "sent", "delivery_unknown"])
            .update({ status: "delivered", updated_at: now.toSQL() });
    } else if (state === "failed") {
        const viable = await trx
            .from("identity_provider_attempts")
            .where("verification_id", attempt.verification_id)
            .where("generation", attempt.generation)
            .whereIn("state", ["accepted", "sent", "delivered", "delivery_unknown"])
            .count("id as count")
            .first();
        if (Number(viable?.count ?? 0) === 0)
            await trx
                .from("identity_verifications")
                .where("id", attempt.verification_id)
                .whereNotIn("status", ["verified", "consumed", "cancelled", "blocked"])
                .update({ status: "delivery_failed", updated_at: now.toSQL() });
    }
    return await trx.from("identity_provider_attempts").where("id", attemptId).first();
}

export async function estimateIdentityProviderCost(providerKey: string) {
    const row = await currentTrx()
        .from("identity_provider_configs")
        .where("tenant_id", Number(currentTenantId()))
        .where("provider_key", providerKey)
        .first();
    const config = asObject(row?.configuration);
    const value = Number(config.estimated_cost_minor ?? 0);
    return Number.isFinite(value) && value >= 0 ? value : 0;
}
