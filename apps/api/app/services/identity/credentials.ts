import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import encryption from "@adonisjs/core/services/encryption";
import hash from "@adonisjs/core/services/hash";
import { DateTime } from "luxon";

import { requireIdentityFeature } from "#services/identity/features";
import { recordIdentitySecurityEvent } from "#services/identity/security";
import { currentTenantId, currentTrx } from "#services/tenant_context";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
    let bits = "";
    for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
    let output = "";
    for (let index = 0; index < bits.length; index += 5) {
        const chunk = bits.slice(index, index + 5).padEnd(5, "0");
        output += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
    }
    return output;
}

function base32Decode(value: string): Buffer {
    let bits = "";
    for (const char of value.replace(/=+$/g, "").toUpperCase()) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index < 0) throw new Error("Invalid base32 secret");
        bits += index.toString(2).padStart(5, "0");
    }
    const bytes: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
    return Buffer.from(bytes);
}

function totpCode(secret: string, timestamp = Date.now(), step = 30): string {
    const counter = Math.floor(timestamp / 1000 / step);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
        ((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff);
    return String(binary % 1_000_000).padStart(6, "0");
}

function safeEqualCode(left: string, right: string) {
    if (left.length !== right.length) return false;
    return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function credentialPurpose(userId: number, kind: string) {
    return `identity:${kind}:${currentTenantId().toString()}:${userId}:v1`;
}

export async function listIdentityCredentials(userId: number) {
    const rows = await currentTrx()
        .from("identity_credentials")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", userId)
        .orderBy("created_at", "desc");
    return rows.map((row) => ({
        id: Number(row.id),
        type: row.credential_type,
        key: row.credential_type === "passkey" ? row.credential_key : undefined,
        label: row.label,
        verified_at: row.verified_at,
        last_used_at: row.last_used_at,
        revoked_at: row.revoked_at,
        backup_eligible: Boolean(row.backup_eligible),
        backed_up: Boolean(row.backed_up),
        metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    }));
}

export async function beginTotpEnrollment(userId: number) {
    await requireIdentityFeature("totp_enrollment");
    const now = DateTime.utc().toSQL();
    await currentTrx()
        .from("identity_credentials")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", userId)
        .where("credential_type", "totp")
        .whereNull("verified_at")
        .whereNull("revoked_at")
        .update({ revoked_at: now, updated_at: now });
    const secret = base32Encode(randomBytes(20));
    const ciphertext = encryption.encrypt({ secret }, { purpose: credentialPurpose(userId, "totp") });
    const key = `totp:${userId}:${Date.now()}`;
    await currentTrx()
        .table("identity_credentials")
        .insert({
            tenant_id: Number(currentTenantId()),
            user_id: userId,
            credential_type: "totp",
            credential_key: key,
            label: "Authenticator app",
            secret_ciphertext: ciphertext,
            metadata: JSON.stringify({ pending: true }),
        });
    return { secret, otpauth_uri: `otpauth://totp/Calibra:${userId}?secret=${secret}&issuer=Calibra&digits=6&period=30` };
}

function decryptTotp(row: { secret_ciphertext?: string | null; user_id: number | string }) {
    if (!row.secret_ciphertext) return null;
    const value = encryption.decrypt(row.secret_ciphertext, credentialPurpose(Number(row.user_id), "totp"));
    return value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof (value as Record<string, unknown>).secret === "string"
        ? String((value as Record<string, unknown>).secret)
        : null;
}

export async function verifyTotpForUser(userId: number, code: string, pendingOnly = false) {
    const query = currentTrx()
        .from("identity_credentials")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", userId)
        .where("credential_type", "totp")
        .whereNull("revoked_at")
        .orderBy("id", "desc");
    if (!pendingOnly) query.whereNotNull("verified_at");
    const row = await query.first();
    if (!row) return false;
    const secret = decryptTotp(row);
    if (!secret) return false;
    const now = Date.now();
    for (const offset of [-1, 0, 1]) if (safeEqualCode(totpCode(secret, now + offset * 30_000), code)) return true;
    return false;
}

export async function confirmTotpEnrollment(userId: number, code: string) {
    if (!(await verifyTotpForUser(userId, code, true))) return false;
    const row = await currentTrx()
        .from("identity_credentials")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", userId)
        .where("credential_type", "totp")
        .whereNull("verified_at")
        .whereNull("revoked_at")
        .orderBy("id", "desc")
        .first();
    if (!row) return false;
    const now = DateTime.utc().toSQL();
    await currentTrx()
        .from("identity_credentials")
        .where("id", row.id)
        .update({ verified_at: now, metadata: JSON.stringify({ pending: false }), updated_at: now });
    await recordIdentitySecurityEvent({ userId, actorUserId: userId, eventType: "identity.totp.enrolled", outcome: "success" });
    return true;
}

export async function generateRecoveryCodes(userId: number, count = 10) {
    await requireIdentityFeature("recovery_codes_generation");
    const trx = currentTrx();
    const now = DateTime.utc().toSQL();
    await trx
        .from("identity_credentials")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", userId)
        .where("credential_type", "recovery_code")
        .whereNull("revoked_at")
        .update({ revoked_at: now, updated_at: now });
    const codes = Array.from(
        { length: Math.max(5, Math.min(20, count)) },
        () => `${randomBytes(3).toString("hex")}-${randomBytes(3).toString("hex")}`,
    );
    for (const code of codes) {
        await trx.table("identity_credentials").insert({
            tenant_id: Number(currentTenantId()),
            user_id: userId,
            credential_type: "recovery_code",
            credential_key: `recovery:${randomBytes(12).toString("hex")}`,
            secret_hash: await hash.make(code),
            label: "Recovery code",
            verified_at: now,
        });
    }
    await recordIdentitySecurityEvent({
        userId,
        actorUserId: userId,
        eventType: "identity.recovery_codes.rotated",
        outcome: "success",
        severity: "warning",
        metadata: { count: codes.length },
    });
    return codes;
}

export async function consumeRecoveryCode(userId: number, code: string) {
    const trx = currentTrx();
    const rows = await trx
        .from("identity_credentials")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", userId)
        .where("credential_type", "recovery_code")
        .whereNull("revoked_at")
        .whereNotNull("verified_at")
        .forUpdate();
    for (const row of rows) {
        if (!row.secret_hash || !(await hash.verify(String(row.secret_hash), code))) continue;
        const now = DateTime.utc().toSQL();
        const updated = await trx
            .from("identity_credentials")
            .where("id", row.id)
            .whereNull("revoked_at")
            .update({ revoked_at: now, last_used_at: now, updated_at: now });
        if (Number(Array.isArray(updated) ? updated.length : updated) === 1) {
            await recordIdentitySecurityEvent({
                userId,
                actorUserId: userId,
                eventType: "identity.recovery_code.used",
                outcome: "success",
                severity: "warning",
            });
            return true;
        }
    }
    return false;
}

export async function revokeIdentityCredential(input: {
    actorUserId: number;
    userId: number;
    credentialId: number;
    reason?: string;
}) {
    const now = DateTime.utc().toSQL();
    const updated = await currentTrx()
        .from("identity_credentials")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", input.userId)
        .where("id", input.credentialId)
        .whereNull("revoked_at")
        .update({ revoked_at: now, updated_at: now });
    if (Number(Array.isArray(updated) ? updated.length : updated) !== 1)
        throw Object.assign(new Error("Credential not found"), { status: 404, code: "E_IDENTITY_CREDENTIAL_NOT_FOUND" });
    await recordIdentitySecurityEvent({
        userId: input.userId,
        actorUserId: input.actorUserId,
        eventType: "identity.credential.revoked",
        outcome: "success",
        severity: "warning",
        metadata: { credential_id: input.credentialId, ...(input.reason ? { reason: input.reason } : {}) },
    });
}
