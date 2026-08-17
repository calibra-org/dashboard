import { DateTime } from "luxon";

import { identityFeatureEnabled } from "#services/identity/features";
import { listIdentityProviders } from "#services/identity/providers";
import SettingsService from "#services/settings_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

const SMS_DEFAULTS = {
    sms_enabled: true,
    daily_send_limit: 5000,
    daily_spend_limit_minor: 0,
    per_identifier_10m_limit: 5,
    per_ip_10m_limit: 20,
    per_device_10m_limit: 10,
    resend_10m_limit: 3,
    resend_cooldown_seconds: 60,
} as const;

const IDENTITY_DEFAULTS = {
    passkeys: true,
    totp_enrollment: true,
    recovery_codes_generation: true,
} as const;

function numeric(value: unknown) {
    const result = Number(value ?? 0);
    return Number.isFinite(result) ? result : 0;
}

function jsonObject(value: unknown) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value !== "string") return {};
    try {
        const parsed = JSON.parse(value) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

export async function identityOverview() {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const since = DateTime.utc().minus({ hours: 24 }).toSQL();
    const [requested, verified, blocked, sessions, providerAttempts, riskEvents] = await Promise.all([
        trx
            .from("identity_verifications")
            .where("tenant_id", tenantId)
            .where("created_at", ">=", since)
            .count("id as count")
            .first(),
        trx
            .from("identity_verifications")
            .where("tenant_id", tenantId)
            .where("verified_at", ">=", since)
            .count("id as count")
            .first(),
        trx
            .from("identity_verifications")
            .where("tenant_id", tenantId)
            .where("blocked_at", ">=", since)
            .count("id as count")
            .first(),
        trx
            .from("identity_sessions")
            .where("tenant_id", tenantId)
            .whereNull("revoked_at")
            .where("expires_at", ">", DateTime.utc().toSQL())
            .count("id as count")
            .first(),
        trx.from("identity_provider_attempts").where("tenant_id", tenantId).where("created_at", ">=", since),
        trx
            .from("identity_risk_events")
            .where("tenant_id", tenantId)
            .where("created_at", ">=", since)
            .orderBy("created_at", "desc")
            .limit(8),
    ]);
    const attemptRows = providerAttempts as Array<Record<string, unknown>>;
    const delivered = attemptRows.filter((row) => row.state === "delivered").length;
    const failed = attemptRows.filter((row) => row.state === "failed").length;
    const costs = attemptRows.reduce((sum, row) => sum + numeric(row.cost_minor), 0);
    const requestedCount = numeric(requested?.count);
    const verifiedCount = numeric(verified?.count);
    return {
        window: "24h",
        kpis: {
            requested: requestedCount,
            verified: verifiedCount,
            success_rate: requestedCount > 0 ? Number(((verifiedCount / requestedCount) * 100).toFixed(1)) : null,
            blocked: numeric(blocked?.count),
            active_sessions: numeric(sessions?.count),
            provider_attempts: attemptRows.length,
            delivered,
            failed,
            cost_minor: costs,
        },
        recent_risk_events: riskEvents.map((row) => ({
            id: Number(row.id),
            event_type: row.event_type,
            score: Number(row.score),
            decision: row.decision,
            reasons: Array.isArray(row.reasons) ? row.reasons : [],
            created_at: row.created_at,
        })),
    };
}

export async function listIdentityVerifications(limit = 100) {
    const rows = await currentTrx()
        .from("identity_verifications")
        .where("tenant_id", Number(currentTenantId()))
        .orderBy("created_at", "desc")
        .limit(Math.max(1, Math.min(250, limit)));
    return rows.map((row) => ({
        id: Number(row.id),
        public_id: row.public_id,
        purpose: row.purpose,
        method: row.method,
        channel: row.channel,
        identifier: row.identifier_masked,
        status: row.status,
        risk_score: Number(row.risk_score),
        action_scope: row.action_scope,
        expires_at: row.expires_at,
        verified_at: row.verified_at,
        created_at: row.created_at,
    }));
}

export async function verificationDetail(publicId: string) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const verification = await trx
        .from("identity_verifications")
        .where("tenant_id", tenantId)
        .where("public_id", publicId)
        .first();
    if (!verification)
        throw Object.assign(new Error("Verification not found"), { status: 404, code: "E_IDENTITY_VERIFICATION_NOT_FOUND" });
    const [challenges, attempts] = await Promise.all([
        trx
            .from("identity_verification_challenges")
            .where("tenant_id", tenantId)
            .where("verification_id", verification.id)
            .orderBy("generation", "asc"),
        trx
            .from("identity_provider_attempts")
            .where("tenant_id", tenantId)
            .where("verification_id", verification.id)
            .orderBy("created_at", "asc"),
    ]);
    return {
        verification: (await listIdentityVerifications(250)).find((row) => row.public_id === publicId) ?? null,
        challenges: challenges.map((row) => ({
            generation: Number(row.generation),
            type: row.challenge_type,
            state: row.state,
            attempts: Number(row.attempts),
            max_attempts: Number(row.max_attempts),
            expires_at: row.expires_at,
            consumed_at: row.consumed_at,
        })),
        provider_attempts: attempts.map((row) => ({
            id: Number(row.id),
            provider_key: row.provider_key,
            channel: row.channel,
            state: row.state,
            provider_message_id: row.provider_message_id,
            latency_ms: row.latency_ms === null ? null : Number(row.latency_ms),
            cost_minor: row.cost_minor === null ? null : Number(row.cost_minor),
            error_code: row.error_code,
            evidence: jsonObject(row.evidence),
            accepted_at: row.accepted_at,
            delivered_at: row.delivered_at,
            failed_at: row.failed_at,
            created_at: row.created_at,
        })),
    };
}

export async function identityMethods() {
    const [passkeys, totp, recovery, smsProviders, emailProviders] = await Promise.all([
        identityFeatureEnabled("passkeys"),
        identityFeatureEnabled("totp_enrollment"),
        identityFeatureEnabled("recovery_codes_generation"),
        listIdentityProviders("sms"),
        listIdentityProviders("email"),
    ]);
    const smsSettings = await identitySmsSettings();
    return [
        {
            key: "sms_otp",
            label: "SMS OTP",
            enabled: Boolean(smsSettings.sms_enabled),
            phishing_resistant: false,
            providers: smsProviders.length,
        },
        {
            key: "email_otp",
            label: "Email OTP",
            enabled: emailProviders.some((row) => row.enabled),
            phishing_resistant: false,
            providers: emailProviders.length,
        },
        { key: "passkey", label: "Passkey / WebAuthn", enabled: passkeys, phishing_resistant: true },
        { key: "totp", label: "TOTP", enabled: totp, phishing_resistant: false },
        { key: "recovery_code", label: "Recovery Code", enabled: recovery, phishing_resistant: false },
    ];
}

export async function listIdentityPolicies() {
    const rows = await currentTrx()
        .from("identity_policies")
        .where("tenant_id", Number(currentTenantId()))
        .orderBy("policy_key", "asc")
        .orderBy("version", "desc");
    return rows.map((row) => ({
        id: Number(row.id),
        policy_key: row.policy_key,
        purpose: row.purpose,
        version: Number(row.version),
        enabled: Boolean(row.enabled),
        methods: Array.isArray(row.methods) ? row.methods : [],
        config: jsonObject(row.config),
        created_by: row.created_by ? Number(row.created_by) : null,
        created_at: row.created_at,
    }));
}

export async function deliveryHealth() {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const since = DateTime.utc().minus({ hours: 24 }).toSQL();
    const providers = await listIdentityProviders();
    const attempts = await trx.from("identity_provider_attempts").where("tenant_id", tenantId).where("created_at", ">=", since);
    return providers.map((provider) => {
        const rows = attempts.filter((row) => row.provider_key === provider.provider_key);
        const delivered = rows.filter((row) => row.state === "delivered").length;
        const failed = rows.filter((row) => row.state === "failed").length;
        const latencies = rows.map((row) => numeric(row.latency_ms)).filter((value) => value > 0);
        return {
            ...provider,
            attempts_24h: rows.length,
            delivered_24h: delivered,
            failed_24h: failed,
            delivery_rate: rows.length > 0 ? Number(((delivered / rows.length) * 100).toFixed(1)) : null,
            average_latency_ms:
                latencies.length > 0 ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
            cost_minor_24h: rows.reduce((sum, row) => sum + numeric(row.cost_minor), 0),
        };
    });
}

export async function listRiskEvents(limit = 100) {
    const rows = await currentTrx()
        .from("identity_risk_events")
        .where("tenant_id", Number(currentTenantId()))
        .orderBy("created_at", "desc")
        .limit(Math.max(1, Math.min(250, limit)));
    return rows.map((row) => ({
        id: Number(row.id),
        event_type: row.event_type,
        subject_hash: row.subject_hash ? `${String(row.subject_hash).slice(0, 8)}…` : null,
        score: Number(row.score),
        decision: row.decision,
        reasons: Array.isArray(row.reasons) ? row.reasons : [],
        metadata: jsonObject(row.metadata),
        created_at: row.created_at,
    }));
}

export async function listSecurityEvents(limit = 100) {
    const rows = await currentTrx()
        .from("identity_security_events")
        .where("tenant_id", Number(currentTenantId()))
        .orderBy("created_at", "desc")
        .limit(Math.max(1, Math.min(250, limit)));
    return rows.map((row) => ({
        id: Number(row.id),
        user_id: row.user_id ? Number(row.user_id) : null,
        actor_user_id: row.actor_user_id ? Number(row.actor_user_id) : null,
        event_type: row.event_type,
        outcome: row.outcome,
        severity: row.severity,
        request_id: row.request_id,
        ip: row.ip_masked,
        metadata: jsonObject(row.metadata),
        created_at: row.created_at,
    }));
}

export async function identityAnalytics() {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const since = DateTime.utc().minus({ days: 30 }).toSQL();
    const [verifications, attempts, credentials] = await Promise.all([
        trx.from("identity_verifications").where("tenant_id", tenantId).where("created_at", ">=", since),
        trx.from("identity_provider_attempts").where("tenant_id", tenantId).where("created_at", ">=", since),
        trx.from("identity_credentials").where("tenant_id", tenantId).whereNull("revoked_at"),
    ]);
    const byMethod = new Map<string, { requested: number; verified: number }>();
    for (const row of verifications) {
        const key = String(row.method);
        const current = byMethod.get(key) ?? { requested: 0, verified: 0 };
        current.requested += 1;
        if (row.verified_at) current.verified += 1;
        byMethod.set(key, current);
    }
    return {
        window: "30d",
        verification_methods: [...byMethod.entries()].map(([method, value]) => ({
            method,
            ...value,
            success_rate: value.requested > 0 ? Number(((value.verified / value.requested) * 100).toFixed(1)) : null,
        })),
        provider_attempts: attempts.length,
        delivery_confirmed: attempts.filter((row) => row.state === "delivered").length,
        provider_cost_minor: attempts.reduce((sum, row) => sum + numeric(row.cost_minor), 0),
        active_credentials: {
            passkeys: credentials.filter((row) => row.credential_type === "passkey").length,
            totp: credentials.filter((row) => row.credential_type === "totp" && row.verified_at).length,
            recovery_codes: credentials.filter((row) => row.credential_type === "recovery_code").length,
        },
    };
}

export async function identitySettings() {
    const service = new SettingsService();
    const stored = await service.all("identity");
    return Object.fromEntries(
        Object.entries(IDENTITY_DEFAULTS).map(([key, fallback]) => [
            key,
            Object.hasOwn(stored, key) ? Boolean(stored[key]) : fallback,
        ]),
    );
}

export async function updateIdentitySettings(input: Partial<Record<keyof typeof IDENTITY_DEFAULTS, boolean>>) {
    const service = new SettingsService();
    for (const key of Object.keys(IDENTITY_DEFAULTS) as Array<keyof typeof IDENTITY_DEFAULTS>) {
        if (input[key] === undefined) continue;
        await service.set("identity", key, Boolean(input[key]), "boolean");
    }
    return identitySettings();
}

export async function identitySmsSettings() {
    const service = new SettingsService();
    const stored = await service.all("identity_sms");
    const values: Record<string, boolean | number> = {};
    for (const [key, fallback] of Object.entries(SMS_DEFAULTS)) {
        const current = stored[key];
        values[key] =
            typeof fallback === "boolean"
                ? current === undefined
                    ? fallback
                    : Boolean(current)
                : current === undefined
                  ? fallback
                  : numeric(current);
    }
    return values as typeof SMS_DEFAULTS;
}

export async function updateIdentitySmsSettings(input: Partial<Record<keyof typeof SMS_DEFAULTS, boolean | number>>) {
    const service = new SettingsService();
    for (const key of Object.keys(SMS_DEFAULTS) as Array<keyof typeof SMS_DEFAULTS>) {
        if (input[key] === undefined) continue;
        const fallback = SMS_DEFAULTS[key];
        if (typeof fallback === "boolean") await service.set("identity_sms", key, Boolean(input[key]), "boolean");
        else await service.set("identity_sms", key, Math.max(0, Math.round(Number(input[key]))), "number");
    }
    return identitySmsSettings();
}
