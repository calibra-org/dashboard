import { randomInt, randomUUID } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";
import hash from "@adonisjs/core/services/hash";
import { DateTime } from "luxon";
import SettingsService from "#services/settings_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";
import { estimateIdentityProviderCost, sendIdentityMessage } from "#services/identity/providers";
import { resolveIdentityPolicy } from "#services/identity/policy";
import {
    identityHash,
    maskIdentifier,
    maskIp,
    normalizeIdentityIdentifier,
    recordIdentityRiskEvent,
    recordIdentitySecurityEvent,
    requestDeviceHash,
} from "#services/identity/security";

export type VerificationChannel = "sms" | "email";
export type VerificationPurpose = "login" | "verify" | "recovery" | "change_phone" | "change_email" | "step_up" | "diagnostic";

interface RequestVerificationInput {
    ctx: HttpContext;
    identifier: string;
    channel: VerificationChannel;
    purpose?: VerificationPurpose;
}

interface VerifyInput {
    ctx: HttpContext;
    identifier: string;
    code: string;
    purpose?: VerificationPurpose;
    publicId?: string;
}

interface SmsControls {
    sms_enabled: boolean;
    daily_send_limit: number;
    daily_spend_limit_minor: number;
    per_identifier_10m_limit: number;
    per_ip_10m_limit: number;
    per_device_10m_limit: number;
    resend_10m_limit: number;
    resend_cooldown_seconds: number;
}

function numberSetting(source: Record<string, unknown>, key: string, fallback: number, min = 0, max = 1_000_000) {
    const value = Number(source[key]);
    return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}

async function smsControls(): Promise<SmsControls> {
    const settings = await new SettingsService().all("identity_sms");
    return {
        sms_enabled: settings.sms_enabled !== false,
        daily_send_limit: numberSetting(settings, "daily_send_limit", 10_000, 1, 1_000_000),
        daily_spend_limit_minor: numberSetting(settings, "daily_spend_limit_minor", 0, 0, 10_000_000_000),
        per_identifier_10m_limit: numberSetting(settings, "per_identifier_10m_limit", 5, 1, 1000),
        per_ip_10m_limit: numberSetting(settings, "per_ip_10m_limit", 20, 1, 10_000),
        per_device_10m_limit: numberSetting(settings, "per_device_10m_limit", 10, 1, 10_000),
        resend_10m_limit: numberSetting(settings, "resend_10m_limit", 3, 1, 1000),
        resend_cooldown_seconds: numberSetting(settings, "resend_cooldown_seconds", 60, 10, 600),
    };
}

function generateCode(length: number): string {
    const ceiling = 10 ** length;
    return String(randomInt(0, ceiling)).padStart(length, "0");
}

function stateFromAttempt(value: unknown) {
    const state = String(value ?? "delivery_unknown");
    if (state === "delivered") return "delivered";
    if (state === "accepted") return "provider_accepted";
    if (state === "sent") return "sent";
    if (state === "failed") return "delivery_failed";
    return "delivery_unknown";
}

async function enforceSmsBudgets(ctx: HttpContext, identifierHash: string, deviceHash: string | null, isResend: boolean) {
    const controls = await smsControls();
    if (!controls.sms_enabled) {
        throw Object.assign(new Error("SMS verification is disabled for this tenant"), {
            status: 422,
            code: "E_IDENTITY_SMS_DISABLED",
        });
    }
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const since10m = DateTime.utc().minus({ minutes: 10 }).toSQL();
    const sinceDay = DateTime.utc().minus({ hours: 24 }).toSQL();
    const ipHash = identityHash(`ip:${ctx.request.ip()}`);
    const [subject, ip, device, resend, daily, spend] = await Promise.all([
        trx
            .from("identity_verifications")
            .where("tenant_id", tenantId)
            .where("identifier_hash", identifierHash)
            .where("created_at", ">=", since10m)
            .count("id as count")
            .first(),
        trx
            .from("identity_verifications")
            .where("tenant_id", tenantId)
            .where("request_ip_hash", ipHash)
            .where("created_at", ">=", since10m)
            .count("id as count")
            .first(),
        deviceHash
            ? trx
                  .from("identity_verifications")
                  .where("tenant_id", tenantId)
                  .where("device_hash", deviceHash)
                  .where("created_at", ">=", since10m)
                  .count("id as count")
                  .first()
            : Promise.resolve({ count: 0 }),
        isResend
            ? trx
                  .from("identity_verification_challenges as challenge")
                  .innerJoin("identity_verifications as verification", "verification.id", "challenge.verification_id")
                  .where("challenge.tenant_id", tenantId)
                  .where("verification.identifier_hash", identifierHash)
                  .where("challenge.created_at", ">=", since10m)
                  .where("challenge.generation", ">", 1)
                  .count("challenge.id as count")
                  .first()
            : Promise.resolve({ count: 0 }),
        trx
            .from("identity_provider_attempts")
            .where("tenant_id", tenantId)
            .where("channel", "sms")
            .where("created_at", ">=", sinceDay)
            .count("id as count")
            .first(),
        trx
            .from("identity_provider_attempts")
            .where("tenant_id", tenantId)
            .where("channel", "sms")
            .where("created_at", ">=", sinceDay)
            .sum("cost_minor as total")
            .first(),
    ]);

    const violations: string[] = [];
    if (Number(subject?.count ?? 0) >= controls.per_identifier_10m_limit) violations.push("identifier_velocity");
    if (Number(ip?.count ?? 0) >= controls.per_ip_10m_limit) violations.push("ip_velocity");
    if (deviceHash && Number(device?.count ?? 0) >= controls.per_device_10m_limit) violations.push("device_velocity");
    if (isResend && Number(resend?.count ?? 0) >= controls.resend_10m_limit) violations.push("resend_velocity");
    if (Number(daily?.count ?? 0) >= controls.daily_send_limit) violations.push("daily_send_budget");
    if (controls.daily_spend_limit_minor > 0 && Number(spend?.total ?? 0) >= controls.daily_spend_limit_minor)
        violations.push("daily_spend_budget");
    if (violations.length === 0) return controls;

    await recordIdentityRiskEvent({
        eventType: "verification_budget",
        subjectHash: identifierHash,
        score: 90,
        decision: "blocked",
        reasons: violations,
    });
    throw Object.assign(new Error("Verification temporarily unavailable"), { status: 429, code: "E_IDENTITY_RATE_LIMITED" });
}

async function dispatchChallenge(input: {
    verificationId: number;
    generation: number;
    identifier: string;
    channel: VerificationChannel;
    code: string;
}) {
    const provider = await sendIdentityMessage(input.channel, {
        verificationId: input.verificationId,
        generation: input.generation,
        to: input.identifier,
        message: `Calibra code: ${input.code}`,
        templateParams: { code: input.code },
    });
    await currentTrx()
        .from("identity_verifications")
        .where("id", input.verificationId)
        .update({ status: stateFromAttempt(provider.state), updated_at: DateTime.utc().toSQL() });
    return provider;
}

export async function requestVerification(input: RequestVerificationInput) {
    const purpose = input.purpose ?? "login";
    const identifier = normalizeIdentityIdentifier(input.identifier);
    const identifierHash = identityHash(identifier);
    const deviceHash = requestDeviceHash(input.ctx);
    const policy = await resolveIdentityPolicy(purpose);
    const method = input.channel === "sms" ? "sms_otp" : "email_otp";
    if (!policy.methods.includes(method)) {
        throw Object.assign(new Error("Verification method is not allowed for this purpose"), {
            status: 422,
            code: "E_IDENTITY_METHOD_NOT_ALLOWED",
        });
    }
    let controls: SmsControls | null = null;
    if (input.channel === "sms") controls = await enforceSmsBudgets(input.ctx, identifierHash, deviceHash, false);

    const now = DateTime.utc();
    const code = generateCode(policy.config.code_length);
    const secretHash = await hash.make(code);
    const publicId = randomUUID();
    const expiresAt = now.plus({ seconds: policy.config.ttl_seconds });
    const trx = currentTrx();
    const rows = await trx
        .table("identity_verifications")
        .insert({
            public_id: publicId,
            tenant_id: Number(currentTenantId()),
            purpose,
            method,
            channel: input.channel,
            identifier_hash: identifierHash,
            identifier_masked: maskIdentifier(identifier),
            status: "challenge_created",
            policy_key: policy.policy_key,
            policy_version: policy.version,
            request_ip_hash: identityHash(`ip:${input.ctx.request.ip()}`),
            request_ip_masked: maskIp(input.ctx.request.ip()),
            device_hash: deviceHash,
            expires_at: expiresAt.toSQL(),
            created_at: now.toSQL(),
            updated_at: now.toSQL(),
        })
        .returning(["id"]);
    const verificationId = Number(rows[0].id);
    await trx.table("identity_verification_challenges").insert({
        tenant_id: Number(currentTenantId()),
        verification_id: verificationId,
        generation: 1,
        challenge_type: "otp",
        secret_hash: secretHash,
        state: "active",
        attempts: 0,
        max_attempts: policy.config.max_attempts,
        expires_at: expiresAt.toSQL(),
        created_at: now.toSQL(),
    });

    try {
        if (input.channel === "sms" && controls?.daily_spend_limit_minor && controls.daily_spend_limit_minor > 0) {
            const providers = await currentTrx()
                .from("identity_provider_configs")
                .where("tenant_id", Number(currentTenantId()))
                .where("channel", "sms")
                .where("enabled", true)
                .orderBy("is_primary", "desc")
                .orderBy("priority", "asc")
                .first();
            if (providers) {
                const estimated = await estimateIdentityProviderCost(String(providers.provider_key));
                const spend = await currentTrx()
                    .from("identity_provider_attempts")
                    .where("tenant_id", Number(currentTenantId()))
                    .where("channel", "sms")
                    .where("created_at", ">=", now.minus({ hours: 24 }).toSQL())
                    .sum("cost_minor as total")
                    .first();
                if (Number(spend?.total ?? 0) + estimated > controls.daily_spend_limit_minor) {
                    await trx
                        .from("identity_verifications")
                        .where("id", verificationId)
                        .update({ status: "blocked", blocked_at: now.toSQL(), updated_at: now.toSQL() });
                    await recordIdentityRiskEvent({
                        verificationId,
                        eventType: "sms_spend_guard",
                        subjectHash: identifierHash,
                        score: 95,
                        decision: "blocked",
                        reasons: ["daily_spend_limit_minor"],
                    });
                    return { publicId, expiresIn: policy.config.ttl_seconds, delivery: "blocked" };
                }
            }
        }
        const provider = await dispatchChallenge({ verificationId, generation: 1, identifier, channel: input.channel, code });
        return { publicId, expiresIn: policy.config.ttl_seconds, delivery: provider.state };
    } catch (error) {
        await trx
            .from("identity_verifications")
            .where("id", verificationId)
            .update({ status: "delivery_failed", updated_at: DateTime.utc().toSQL() });
        input.ctx.logger.warn(
            { err: error, verification_id: verificationId, channel: input.channel },
            "identity_verification_delivery_failed",
        );
        return { publicId, expiresIn: policy.config.ttl_seconds, delivery: "failed" };
    }
}

export async function resendVerification(input: { ctx: HttpContext; publicId: string; identifier: string }) {
    const identifier = normalizeIdentityIdentifier(input.identifier);
    const identifierHash = identityHash(identifier);
    const trx = currentTrx();
    const verification = await trx
        .from("identity_verifications")
        .where("tenant_id", Number(currentTenantId()))
        .where("public_id", input.publicId)
        .where("identifier_hash", identifierHash)
        .forUpdate()
        .first();
    if (!verification || ["verified", "consumed", "cancelled", "blocked"].includes(String(verification.status))) {
        throw Object.assign(new Error("Verification is not available"), {
            status: 422,
            code: "E_IDENTITY_VERIFICATION_UNAVAILABLE",
        });
    }
    const channel = String(verification.channel) as VerificationChannel;
    const controls =
        channel === "sms" ? await enforceSmsBudgets(input.ctx, identifierHash, requestDeviceHash(input.ctx), true) : null;
    const latest = await trx
        .from("identity_verification_challenges")
        .where("verification_id", verification.id)
        .orderBy("generation", "desc")
        .forUpdate()
        .first();
    const policy = await resolveIdentityPolicy(String(verification.purpose));
    const cooldown = Math.max(policy.config.resend_cooldown_seconds, controls?.resend_cooldown_seconds ?? 0);
    if (latest?.created_at && DateTime.fromJSDate(new Date(latest.created_at)).plus({ seconds: cooldown }) > DateTime.utc()) {
        throw Object.assign(new Error("Please wait before requesting another code"), {
            status: 429,
            code: "E_IDENTITY_RESEND_COOLDOWN",
        });
    }
    if (latest)
        await trx
            .from("identity_verification_challenges")
            .where("id", latest.id)
            .where("state", "active")
            .update({ state: "superseded" });
    const generation = Number(latest?.generation ?? 0) + 1;
    const code = generateCode(policy.config.code_length);
    const now = DateTime.utc();
    const expiresAt = now.plus({ seconds: policy.config.ttl_seconds });
    await trx.table("identity_verification_challenges").insert({
        tenant_id: Number(currentTenantId()),
        verification_id: verification.id,
        generation,
        challenge_type: "otp",
        secret_hash: await hash.make(code),
        state: "active",
        attempts: 0,
        max_attempts: policy.config.max_attempts,
        expires_at: expiresAt.toSQL(),
        created_at: now.toSQL(),
    });
    await trx
        .from("identity_verifications")
        .where("id", verification.id)
        .update({ status: "challenge_created", expires_at: expiresAt.toSQL(), updated_at: now.toSQL() });
    try {
        const provider = await dispatchChallenge({
            verificationId: Number(verification.id),
            generation,
            identifier,
            channel,
            code,
        });
        return { publicId: input.publicId, expiresIn: policy.config.ttl_seconds, delivery: provider.state };
    } catch (error) {
        await trx
            .from("identity_verifications")
            .where("id", verification.id)
            .update({ status: "delivery_failed", updated_at: DateTime.utc().toSQL() });
        input.ctx.logger.warn(
            { err: error, verification_id: verification.id, channel },
            "identity_verification_resend_delivery_failed",
        );
        return { publicId: input.publicId, expiresIn: policy.config.ttl_seconds, delivery: "failed" };
    }
}

export async function verifyChallenge(input: VerifyInput) {
    const identifier = normalizeIdentityIdentifier(input.identifier);
    const identifierHash = identityHash(identifier);
    const purpose = input.purpose ?? "login";
    const trx = currentTrx();
    let query = trx
        .from("identity_verifications")
        .where("tenant_id", Number(currentTenantId()))
        .where("identifier_hash", identifierHash)
        .where("purpose", purpose);
    if (input.publicId) query = query.where("public_id", input.publicId);
    const verification = await query.orderBy("id", "desc").forUpdate().first();
    if (
        !verification ||
        ["blocked", "cancelled", "consumed", "expired"].includes(String(verification.status)) ||
        DateTime.fromJSDate(new Date(verification.expires_at)) <= DateTime.utc()
    ) {
        return { ok: false as const, reason: "invalid" };
    }
    const challenge = await trx
        .from("identity_verification_challenges")
        .where("verification_id", verification.id)
        .where("state", "active")
        .orderBy("generation", "desc")
        .forUpdate()
        .first();
    if (!challenge || challenge.consumed_at || DateTime.fromJSDate(new Date(challenge.expires_at)) <= DateTime.utc())
        return { ok: false as const, reason: "invalid" };
    const attempts = Number(challenge.attempts ?? 0) + 1;
    await trx.from("identity_verification_challenges").where("id", challenge.id).update({ attempts });
    if (attempts > Number(challenge.max_attempts ?? 5)) {
        await trx.from("identity_verification_challenges").where("id", challenge.id).update({ state: "failed" });
        await trx
            .from("identity_verifications")
            .where("id", verification.id)
            .update({ status: "failed", updated_at: DateTime.utc().toSQL() });
        await recordIdentityRiskEvent({
            verificationId: Number(verification.id),
            eventType: "otp_attempts_exceeded",
            subjectHash: identifierHash,
            score: 80,
            decision: "blocked",
            reasons: ["max_attempts"],
        });
        return { ok: false as const, reason: "invalid" };
    }
    const valid = typeof challenge.secret_hash === "string" && (await hash.verify(challenge.secret_hash, input.code));
    if (!valid) {
        await trx
            .from("identity_verifications")
            .where("id", verification.id)
            .update({ status: "proof_submitted", updated_at: DateTime.utc().toSQL() });
        return { ok: false as const, reason: "invalid" };
    }
    const now = DateTime.utc();
    const consumed = await trx
        .from("identity_verification_challenges")
        .where("id", challenge.id)
        .where("state", "active")
        .whereNull("consumed_at")
        .update({ state: "consumed", consumed_at: now.toSQL() });
    if (consumed !== 1) return { ok: false as const, reason: "consumed" };
    await trx
        .from("identity_verifications")
        .where("id", verification.id)
        .update({ status: "verified", verified_at: now.toSQL(), updated_at: now.toSQL() });
    await recordIdentitySecurityEvent({
        ctx: input.ctx,
        verificationId: Number(verification.id),
        eventType: "identity.verification.verified",
        outcome: "success",
        metadata: { purpose, method: verification.method },
    });
    return {
        ok: true as const,
        verificationId: Number(verification.id),
        publicId: String(verification.public_id),
        identifier,
        method: String(verification.method),
    };
}

export async function consumeVerifiedTransaction(verificationId: number, userId?: number | null) {
    const now = DateTime.utc();
    const updated = await currentTrx()
        .from("identity_verifications")
        .where("id", verificationId)
        .where("status", "verified")
        .whereNull("consumed_at")
        .update({ status: "consumed", consumed_at: now.toSQL(), user_id: userId ?? null, updated_at: now.toSQL() });
    return updated === 1;
}
