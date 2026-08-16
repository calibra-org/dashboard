import { createHash, randomBytes } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";

import { supportChannelCredentialsService } from "#services/support/support_channel_credentials_service";
import { currentTrx } from "#services/tenant_context";

type Scope = "tickets.read" | "tickets.write" | "messages.read" | "messages.send" | "webhooks.manage";
const SCOPES = new Set<Scope>(["tickets.read", "tickets.write", "messages.read", "messages.send", "webhooks.manage"]);
function hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
}
function parseJsonArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {}
    }
    return [];
}
function numberValue(value: unknown) {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : 0;
}

export class SupportApiKeyService {
    async list() {
        const rows = await currentTrx().from("support_api_keys").orderBy("created_at", "desc");
        return {
            data: rows.map((row) => ({
                id: numberValue(row.id),
                name: row.name,
                key_prefix: row.key_prefix,
                scopes: parseJsonArray(row.scopes),
                allowed_ips: parseJsonArray(row.allowed_ips),
                rate_limit_per_minute: numberValue(row.rate_limit_per_minute),
                expires_at: row.expires_at,
                last_used_at: row.last_used_at,
                revoked_at: row.revoked_at,
                created_by_user_id: row.created_by_user_id ? numberValue(row.created_by_user_id) : null,
                created_at: row.created_at,
            })),
        };
    }

    async create(
        input: {
            name: string;
            scopes: Scope[];
            allowed_ips?: string[];
            rate_limit_per_minute?: number;
            expires_at?: Date | null;
        },
        actorUserId: number,
    ) {
        if (input.scopes.some((scope) => !SCOPES.has(scope)))
            throw new Exception("Unsupported API key scope", { status: 422, code: "E_SUPPORT_API_SCOPE" });
        const secret = randomBytes(32).toString("base64url");
        const prefix = `cal_sk_${secret.slice(0, 8)}`;
        const token = `${prefix}.${secret}`;
        const [row] = await currentTrx()
            .table("support_api_keys")
            .insert({
                name: input.name,
                key_prefix: prefix,
                key_hash: hash(token),
                scopes: JSON.stringify([...new Set(input.scopes)]),
                allowed_ips: JSON.stringify(input.allowed_ips ?? []),
                rate_limit_per_minute: input.rate_limit_per_minute ?? 120,
                expires_at: input.expires_at ?? null,
                created_by_user_id: actorUserId,
            })
            .returning("*");
        return {
            data: {
                id: numberValue(row.id),
                name: row.name,
                key_prefix: prefix,
                scopes: input.scopes,
                allowed_ips: input.allowed_ips ?? [],
                rate_limit_per_minute: input.rate_limit_per_minute ?? 120,
                expires_at: input.expires_at ?? null,
                secret: token,
            },
        };
    }

    async revoke(id: number) {
        const [row] = await currentTrx()
            .from("support_api_keys")
            .where("id", id)
            .whereNull("revoked_at")
            .update({ revoked_at: new Date(), updated_at: new Date() })
            .returning("*");
        if (!row)
            throw new Exception("API key not found or already revoked", { status: 404, code: "E_SUPPORT_API_KEY_NOT_FOUND" });
        return { data: { id, revoked_at: row.revoked_at } };
    }

    async rotate(id: number, actorUserId: number) {
        const row = await currentTrx().from("support_api_keys").where("id", id).whereNull("revoked_at").forUpdate().first();
        if (!row)
            throw new Exception("API key not found or already revoked", { status: 404, code: "E_SUPPORT_API_KEY_NOT_FOUND" });
        const created = await this.create(
            {
                name: String(row.name),
                scopes: parseJsonArray(row.scopes) as Scope[],
                allowed_ips: parseJsonArray(row.allowed_ips),
                rate_limit_per_minute: numberValue(row.rate_limit_per_minute),
                expires_at: row.expires_at ? new Date(String(row.expires_at)) : null,
            },
            actorUserId,
        );
        await currentTrx().from("support_api_keys").where("id", id).update({ revoked_at: new Date(), updated_at: new Date() });
        return created;
    }

    async authenticate(token: string, requiredScope: Scope, ip: string) {
        if (!SCOPES.has(requiredScope))
            throw new Exception("Unsupported API scope", { status: 500, code: "E_SUPPORT_API_SCOPE" });
        const row = await currentTrx().from("support_api_keys").where("key_hash", hash(token)).whereNull("revoked_at").first();
        if (!row || (row.expires_at && new Date(String(row.expires_at)).getTime() <= Date.now()))
            throw new Exception("Invalid or expired API key", { status: 401, code: "E_SUPPORT_API_KEY" });
        const scopes = parseJsonArray(row.scopes);
        if (!scopes.includes(requiredScope))
            throw new Exception("API key scope is insufficient", { status: 403, code: "E_SUPPORT_API_SCOPE" });
        const allowed = parseJsonArray(row.allowed_ips);
        if (allowed.length && !allowed.includes(ip))
            throw new Exception("API key is not allowed from this IP", { status: 403, code: "E_SUPPORT_API_IP" });
        const since = new Date(Date.now() - 60_000);
        const countRow = await currentTrx()
            .from("support_api_request_logs")
            .where("api_key_id", row.id)
            .where("created_at", ">=", since)
            .count("id as total")
            .first();
        if (numberValue(countRow?.total) >= numberValue(row.rate_limit_per_minute))
            throw new Exception("API key rate limit reached", { status: 429, code: "E_SUPPORT_API_RATE_LIMIT" });
        await currentTrx()
            .from("support_api_keys")
            .where("id", row.id)
            .update({ last_used_at: new Date(), updated_at: new Date() });
        return { id: numberValue(row.id), scopes };
    }

    async log(
        apiKeyId: number | null,
        input: {
            request_id?: string | null;
            method: string;
            path: string;
            status_code: number;
            ip?: string | null;
            error_code?: string | null;
            duration_ms?: number | null;
        },
    ) {
        await currentTrx()
            .table("support_api_request_logs")
            .insert({
                api_key_id: apiKeyId,
                request_id: input.request_id ?? null,
                method: input.method.slice(0, 12),
                path: input.path.slice(0, 512),
                status_code: input.status_code,
                ip: input.ip ?? null,
                error_code: input.error_code ?? null,
                duration_ms: input.duration_ms ?? null,
            });
    }

    async webhookSubscriptions() {
        const rows = await currentTrx().from("support_api_webhook_subscriptions").orderBy("created_at", "desc");
        return {
            data: rows.map((row) => ({
                id: numberValue(row.id),
                name: row.name,
                url: row.url,
                events: parseJsonArray(row.events),
                secret_prefix: row.secret_prefix,
                active: Boolean(row.active),
                last_delivery_at: row.last_delivery_at,
                last_error: row.last_error,
                created_at: row.created_at,
            })),
        };
    }

    async requestLogs(limit = 100) {
        const rows = await currentTrx()
            .from("support_api_request_logs")
            .orderBy("created_at", "desc")
            .limit(Math.min(250, Math.max(1, limit)));
        return {
            data: rows.map((row) => ({
                id: numberValue(row.id),
                api_key_id: row.api_key_id ? numberValue(row.api_key_id) : null,
                request_id: row.request_id,
                method: row.method,
                path: row.path,
                status_code: numberValue(row.status_code),
                ip: row.ip,
                error_code: row.error_code,
                duration_ms: row.duration_ms === null ? null : numberValue(row.duration_ms),
                created_at: row.created_at,
            })),
        };
    }

    async rotateWebhookSecret(id: number) {
        const row = await currentTrx().from("support_api_webhook_subscriptions").where("id", id).where("active", true).first();
        if (!row)
            throw new Exception("API webhook subscription not found", { status: 404, code: "E_SUPPORT_API_WEBHOOK_NOT_FOUND" });
        const secret = `whsec_${randomBytes(32).toString("base64url")}`;
        const ciphertext = supportChannelCredentialsService.encryptApiWebhookSecret(secret, id);
        await currentTrx()
            .from("support_api_webhook_subscriptions")
            .where("id", id)
            .update({
                signing_secret_ciphertext: ciphertext,
                secret_prefix: secret.slice(0, 14),
                last_error: null,
                updated_at: new Date(),
            });
        return { data: { id, secret_prefix: secret.slice(0, 14), signing_secret: secret } };
    }

    async revokeWebhook(id: number) {
        const [row] = await currentTrx()
            .from("support_api_webhook_subscriptions")
            .where("id", id)
            .where("active", true)
            .update({ active: false, updated_at: new Date() })
            .returning("*");
        if (!row)
            throw new Exception("API webhook subscription not found", { status: 404, code: "E_SUPPORT_API_WEBHOOK_NOT_FOUND" });
        return { data: { id, active: false } };
    }

    async createWebhook(input: { name: string; url: string; events: string[] }, actorUserId: number) {
        const url = new URL(input.url);
        if (url.protocol !== "https:")
            throw new Exception("Webhook URL must use HTTPS", { status: 422, code: "E_SUPPORT_API_WEBHOOK_URL" });
        const secret = `whsec_${randomBytes(32).toString("base64url")}`;
        const [placeholder] = await currentTrx()
            .table("support_api_webhook_subscriptions")
            .insert({
                name: input.name,
                url: url.toString(),
                events: JSON.stringify([...new Set(input.events)]),
                signing_secret_ciphertext: "pending",
                secret_prefix: secret.slice(0, 14),
                active: true,
                created_by_user_id: actorUserId,
            })
            .returning("*");
        const ciphertext = supportChannelCredentialsService.encryptApiWebhookSecret(secret, numberValue(placeholder.id));
        await currentTrx()
            .from("support_api_webhook_subscriptions")
            .where("id", placeholder.id)
            .update({ signing_secret_ciphertext: ciphertext, updated_at: new Date() });
        return {
            data: {
                id: numberValue(placeholder.id),
                name: input.name,
                url: url.toString(),
                events: input.events,
                signing_secret: secret,
            },
        };
    }
}

export const supportApiKeyService = new SupportApiKeyService();
