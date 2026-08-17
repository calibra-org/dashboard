import { createHash, createPublicKey, randomBytes, randomUUID, verify as verifySignature } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";
import encryption from "@adonisjs/core/services/encryption";
import { DateTime } from "luxon";

import { requireIdentityFeature } from "#services/identity/features";
import { recordIdentitySecurityEvent } from "#services/identity/security";
import { currentTenantId, currentTrx } from "#services/tenant_context";

interface CeremonyPayload {
    challenge: string;
    rpId: string;
    origin: string;
    userId?: number;
}

function base64url(buffer: Buffer): string {
    return buffer.toString("base64url");
}

function decode(value: string): Buffer {
    return Buffer.from(value, "base64url");
}

async function rpContext(): Promise<{ rpId: string; origin: string }> {
    const row = await currentTrx()
        .from("tenant_domains")
        .where("tenant_id", Number(currentTenantId()))
        .where("is_primary", true)
        .where("tls_status", "active")
        .whereNotNull("verified_at")
        .first();
    if (!row)
        throw Object.assign(new Error("A verified primary domain is required for Passkeys"), {
            status: 422,
            code: "E_WEBAUTHN_DOMAIN_NOT_READY",
        });
    const rpId = String(row.domain).toLowerCase();
    return { rpId, origin: `https://${rpId}` };
}

function ceremonyPurpose(id: number) {
    return `identity-webauthn-challenge:${currentTenantId().toString()}:${id}:v1`;
}

async function createCeremony(input: { purpose: "passkey_register" | "passkey_auth"; challengeType: string; userId?: number }) {
    const { rpId, origin } = await rpContext();
    const challenge = base64url(randomBytes(32));
    const now = DateTime.utc();
    const trx = currentTrx();
    const verificationRows = await trx
        .table("identity_verifications")
        .insert({
            public_id: randomUUID(),
            tenant_id: Number(currentTenantId()),
            user_id: input.userId ?? null,
            purpose: input.purpose,
            method: "passkey",
            status: "challenge_created",
            expires_at: now.plus({ minutes: 5 }).toSQL(),
            created_at: now.toSQL(),
            updated_at: now.toSQL(),
        })
        .returning(["id", "public_id"]);
    const verification = verificationRows[0];
    const payload: CeremonyPayload = { challenge, rpId, origin, userId: input.userId };
    const ciphertext = encryption.encrypt(payload, { purpose: ceremonyPurpose(Number(verification.id)) });
    await trx.table("identity_verification_challenges").insert({
        tenant_id: Number(currentTenantId()),
        verification_id: Number(verification.id),
        generation: 1,
        challenge_type: input.challengeType,
        payload_ciphertext: ciphertext,
        state: "active",
        attempts: 0,
        max_attempts: 5,
        expires_at: now.plus({ minutes: 5 }).toSQL(),
        created_at: now.toSQL(),
    });
    return { verificationId: Number(verification.id), publicId: String(verification.public_id), challenge, rpId, origin };
}

async function loadCeremony(publicId: string, challengeType: string) {
    const trx = currentTrx();
    const verification = await trx
        .from("identity_verifications")
        .where("tenant_id", Number(currentTenantId()))
        .where("public_id", publicId)
        .forUpdate()
        .first();
    if (!verification || DateTime.fromJSDate(new Date(verification.expires_at)) <= DateTime.utc())
        throw Object.assign(new Error("Passkey challenge is invalid or expired"), { status: 422, code: "E_WEBAUTHN_CHALLENGE" });
    const challenge = await trx
        .from("identity_verification_challenges")
        .where("verification_id", verification.id)
        .where("challenge_type", challengeType)
        .where("state", "active")
        .whereNull("consumed_at")
        .forUpdate()
        .first();
    if (!challenge || !challenge.payload_ciphertext || DateTime.fromJSDate(new Date(challenge.expires_at)) <= DateTime.utc())
        throw Object.assign(new Error("Passkey challenge is invalid or expired"), { status: 422, code: "E_WEBAUTHN_CHALLENGE" });
    const payload = encryption.decrypt(String(challenge.payload_ciphertext), ceremonyPurpose(Number(verification.id)));
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw Object.assign(new Error("Passkey challenge cannot be read"), { status: 422, code: "E_WEBAUTHN_CHALLENGE" });
    return { verification, challenge, payload: payload as unknown as CeremonyPayload };
}

function validateClientData(clientDataJson: string, payload: CeremonyPayload, expectedType: "webauthn.create" | "webauthn.get") {
    const raw = decode(clientDataJson);
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
    } catch {
        throw Object.assign(new Error("Invalid WebAuthn client data"), { status: 422, code: "E_WEBAUTHN_CLIENT_DATA" });
    }
    if (data.type !== expectedType || data.challenge !== payload.challenge || data.origin !== payload.origin)
        throw Object.assign(new Error("WebAuthn ceremony validation failed"), { status: 422, code: "E_WEBAUTHN_CLIENT_DATA" });
    return raw;
}

function validateAuthenticatorData(value: string, rpId: string, requireUv = false) {
    const data = decode(value);
    if (data.length < 37)
        throw Object.assign(new Error("Authenticator data is too short"), { status: 422, code: "E_WEBAUTHN_AUTH_DATA" });
    const expectedRpIdHash = createHash("sha256").update(rpId).digest();
    if (!data.subarray(0, 32).equals(expectedRpIdHash))
        throw Object.assign(new Error("WebAuthn RP ID mismatch"), { status: 422, code: "E_WEBAUTHN_RP_ID" });
    const flags = data[32];
    if ((flags & 0x01) === 0)
        throw Object.assign(new Error("WebAuthn user presence is required"), { status: 422, code: "E_WEBAUTHN_USER_PRESENCE" });
    if (requireUv && (flags & 0x04) === 0)
        throw Object.assign(new Error("WebAuthn user verification is required"), {
            status: 422,
            code: "E_WEBAUTHN_USER_VERIFICATION",
        });
    return {
        data,
        flags,
        signCount: data.readUInt32BE(33),
        backupEligible: Boolean(flags & 0x08),
        backedUp: Boolean(flags & 0x10),
    };
}

async function consumeCeremony(verificationId: number, challengeId: number, userId?: number | null) {
    const now = DateTime.utc().toSQL();
    const consumed = await currentTrx()
        .from("identity_verification_challenges")
        .where("id", challengeId)
        .where("state", "active")
        .whereNull("consumed_at")
        .update({ state: "consumed", consumed_at: now });
    if (Number(Array.isArray(consumed) ? consumed.length : consumed) !== 1)
        throw Object.assign(new Error("Passkey challenge was already consumed"), { status: 422, code: "E_WEBAUTHN_REPLAY" });
    await currentTrx()
        .from("identity_verifications")
        .where("id", verificationId)
        .update({ status: "consumed", verified_at: now, consumed_at: now, user_id: userId ?? null, updated_at: now });
}

export async function beginPasskeyRegistration(userId: number) {
    await requireIdentityFeature("passkeys");
    const ceremony = await createCeremony({ purpose: "passkey_register", challengeType: "webauthn_registration", userId });
    const existing = await currentTrx()
        .from("identity_credentials")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", userId)
        .where("credential_type", "passkey")
        .whereNull("revoked_at")
        .select("credential_key");
    return {
        public_id: ceremony.publicId,
        publicKey: {
            challenge: ceremony.challenge,
            rp: { id: ceremony.rpId, name: "Calibra" },
            user: { id: base64url(Buffer.from(`user:${userId}`)), name: `user-${userId}`, displayName: `User ${userId}` },
            pubKeyCredParams: [
                { type: "public-key", alg: -7 },
                { type: "public-key", alg: -257 },
            ],
            timeout: 300000,
            attestation: "none",
            authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
            excludeCredentials: existing.map((row) => ({ type: "public-key", id: String(row.credential_key) })),
        },
    };
}

export async function finishPasskeyRegistration(input: {
    ctx: HttpContext;
    userId: number;
    publicId: string;
    credentialId: string;
    clientDataJson: string;
    authenticatorData: string;
    publicKeySpki: string;
    label?: string | null;
    transports?: string[];
}) {
    await requireIdentityFeature("passkeys");
    const ceremony = await loadCeremony(input.publicId, "webauthn_registration");
    if (Number(ceremony.payload.userId) !== input.userId || Number(ceremony.verification.user_id) !== input.userId)
        throw Object.assign(new Error("Passkey registration subject mismatch"), { status: 422, code: "E_WEBAUTHN_SUBJECT" });
    validateClientData(input.clientDataJson, ceremony.payload, "webauthn.create");
    const authData = validateAuthenticatorData(input.authenticatorData, ceremony.payload.rpId);
    let jwk: Record<string, unknown>;
    try {
        jwk = createPublicKey({ key: decode(input.publicKeySpki), format: "der", type: "spki" }).export({
            format: "jwk",
        }) as Record<string, unknown>;
    } catch {
        throw Object.assign(new Error("Passkey public key is invalid"), { status: 422, code: "E_WEBAUTHN_PUBLIC_KEY" });
    }
    const now = DateTime.utc().toSQL();
    const rows = await currentTrx()
        .table("identity_credentials")
        .insert({
            tenant_id: Number(currentTenantId()),
            user_id: input.userId,
            credential_type: "passkey",
            credential_key: input.credentialId,
            label: input.label?.slice(0, 200) ?? "Passkey",
            public_jwk: JSON.stringify(jwk),
            sign_count: authData.signCount,
            backup_eligible: authData.backupEligible,
            backed_up: authData.backedUp,
            metadata: JSON.stringify({
                rp_id: ceremony.payload.rpId,
                transports: input.transports ?? [],
                registration_public_key_source: "browser_getPublicKey",
            }),
            verified_at: now,
            created_at: now,
            updated_at: now,
        })
        .returning(["id"]);
    await consumeCeremony(Number(ceremony.verification.id), Number(ceremony.challenge.id), input.userId);
    await recordIdentitySecurityEvent({
        ctx: input.ctx,
        userId: input.userId,
        actorUserId: input.userId,
        eventType: "identity.passkey.registered",
        outcome: "success",
        metadata: { credential_id: Number(rows[0].id), rp_id: ceremony.payload.rpId },
    });
    return { id: Number(rows[0].id), label: input.label ?? "Passkey" };
}

export async function beginPasskeyAuthentication() {
    await requireIdentityFeature("passkeys");
    const ceremony = await createCeremony({ purpose: "passkey_auth", challengeType: "webauthn_authentication" });
    return {
        public_id: ceremony.publicId,
        publicKey: {
            challenge: ceremony.challenge,
            rpId: ceremony.rpId,
            timeout: 300000,
            userVerification: "preferred",
        },
    };
}

export async function finishPasskeyAuthentication(input: {
    ctx: HttpContext;
    publicId: string;
    credentialId: string;
    clientDataJson: string;
    authenticatorData: string;
    signature: string;
}) {
    await requireIdentityFeature("passkeys");
    const ceremony = await loadCeremony(input.publicId, "webauthn_authentication");
    const clientDataRaw = validateClientData(input.clientDataJson, ceremony.payload, "webauthn.get");
    const authData = validateAuthenticatorData(input.authenticatorData, ceremony.payload.rpId);
    const credential = await currentTrx()
        .from("identity_credentials")
        .where("tenant_id", Number(currentTenantId()))
        .where("credential_type", "passkey")
        .where("credential_key", input.credentialId)
        .whereNull("revoked_at")
        .whereNotNull("verified_at")
        .forUpdate()
        .first();
    if (!credential || !credential.public_jwk)
        throw Object.assign(new Error("Passkey credential is unknown"), { status: 422, code: "E_WEBAUTHN_CREDENTIAL" });
    const metadata =
        credential.metadata && typeof credential.metadata === "object" ? (credential.metadata as Record<string, unknown>) : {};
    if (metadata.rp_id !== ceremony.payload.rpId)
        throw Object.assign(new Error("Passkey RP binding mismatch"), { status: 422, code: "E_WEBAUTHN_RP_ID" });
    const publicKey = createPublicKey({ key: credential.public_jwk as Record<string, unknown>, format: "jwk" });
    const signed = Buffer.concat([authData.data, createHash("sha256").update(clientDataRaw).digest()]);
    const valid = verifySignature("sha256", signed, publicKey, decode(input.signature));
    if (!valid) throw Object.assign(new Error("Passkey signature is invalid"), { status: 422, code: "E_WEBAUTHN_SIGNATURE" });
    const previousCount = Number(credential.sign_count ?? 0);
    if (authData.signCount !== 0 && previousCount !== 0 && authData.signCount <= previousCount)
        throw Object.assign(new Error("Passkey signature counter did not advance"), { status: 422, code: "E_WEBAUTHN_COUNTER" });
    const now = DateTime.utc().toSQL();
    await currentTrx().from("identity_credentials").where("id", credential.id).update({
        sign_count: authData.signCount,
        backup_eligible: authData.backupEligible,
        backed_up: authData.backedUp,
        last_used_at: now,
        updated_at: now,
    });
    await consumeCeremony(Number(ceremony.verification.id), Number(ceremony.challenge.id), Number(credential.user_id));
    await recordIdentitySecurityEvent({
        ctx: input.ctx,
        userId: Number(credential.user_id),
        eventType: "identity.passkey.authenticated",
        outcome: "success",
        metadata: { rp_id: ceremony.payload.rpId },
    });
    return { userId: Number(credential.user_id), verificationId: Number(ceremony.verification.id) };
}
