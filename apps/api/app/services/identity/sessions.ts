import type { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

import User from "#models/user";
import { identityHash, maskIp, recordIdentitySecurityEvent, requestDeviceHash } from "#services/identity/security";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export async function registerIdentitySession(input: {
    ctx: HttpContext;
    userId: number;
    tokenIdentifier: number;
    expiresAt?: Date | string | null;
    authMethod: string;
}) {
    const now = DateTime.utc();
    await currentTrx()
        .table("identity_sessions")
        .insert({
            tenant_id: Number(currentTenantId()),
            user_id: input.userId,
            token_identifier: input.tokenIdentifier,
            device_hash: requestDeviceHash(input.ctx),
            device_label: input.ctx.request.header("x-calibra-device-label")?.slice(0, 200) ?? null,
            user_agent: input.ctx.request.header("user-agent")?.slice(0, 500) ?? null,
            ip_hash: identityHash(`ip:${input.ctx.request.ip()}`),
            ip_masked: maskIp(input.ctx.request.ip()),
            auth_method: input.authMethod,
            last_seen_at: now.toSQL(),
            expires_at: input.expiresAt ? DateTime.fromJSDate(new Date(input.expiresAt)).toSQL() : null,
            created_at: now.toSQL(),
            updated_at: now.toSQL(),
        })
        .onConflict(["tenant_id", "token_identifier"])
        .merge([
            "device_hash",
            "device_label",
            "user_agent",
            "ip_hash",
            "ip_masked",
            "auth_method",
            "last_seen_at",
            "expires_at",
            "updated_at",
        ]);
    await recordIdentitySecurityEvent({
        ctx: input.ctx,
        userId: input.userId,
        eventType: "identity.session.created",
        outcome: "success",
        metadata: { auth_method: input.authMethod },
    });
}

export async function listIdentitySessions(userId: number, currentTokenIdentifier?: number | null) {
    const tenantId = Number(currentTenantId());
    const rows = await currentTrx()
        .from("identity_sessions as s")
        .leftJoin("auth_access_tokens as t", "t.id", "s.token_identifier")
        .where("s.tenant_id", tenantId)
        .where("s.user_id", userId)
        .select(
            "s.id",
            "s.device_label",
            "s.user_agent",
            "s.ip_masked",
            "s.risk_score",
            "s.auth_method",
            "s.created_at",
            "s.last_seen_at",
            "s.expires_at",
            "s.revoked_at",
            "s.token_identifier",
            "t.last_used_at as token_last_used_at",
            "t.expires_at as token_expires_at",
        )
        .orderBy("s.created_at", "desc");
    return rows.map((row) => ({
        id: Number(row.id),
        device_label: row.device_label,
        user_agent: row.user_agent,
        ip_masked: row.ip_masked,
        risk_score: Number(row.risk_score ?? 0),
        auth_method: row.auth_method,
        created_at: row.created_at,
        last_seen_at: row.token_last_used_at ?? row.last_seen_at,
        expires_at: row.token_expires_at ?? row.expires_at,
        revoked_at: row.revoked_at,
        current:
            currentTokenIdentifier !== undefined &&
            currentTokenIdentifier !== null &&
            Number(row.token_identifier) === Number(currentTokenIdentifier),
        active:
            !row.revoked_at &&
            Boolean(
                (row.token_expires_at ?? row.expires_at) ? new Date(row.token_expires_at ?? row.expires_at) > new Date() : true,
            ),
    }));
}

export async function revokeIdentitySession(input: {
    ctx: HttpContext;
    actorUserId: number;
    targetUserId: number;
    sessionId: number;
    reason?: string;
}) {
    const trx = currentTrx();
    const row = await trx
        .from("identity_sessions")
        .where("tenant_id", Number(currentTenantId()))
        .where("id", input.sessionId)
        .where("user_id", input.targetUserId)
        .forUpdate()
        .first();
    if (!row) throw Object.assign(new Error("Session not found"), { status: 404, code: "E_IDENTITY_SESSION_NOT_FOUND" });
    const user = await User.findOrFail(input.targetUserId, { client: trx });
    await User.accessTokens.delete(user, Number(row.token_identifier));
    await trx
        .from("identity_sessions")
        .where("id", row.id)
        .update({ revoked_at: DateTime.utc().toSQL(), updated_at: DateTime.utc().toSQL() });
    await recordIdentitySecurityEvent({
        ctx: input.ctx,
        userId: input.targetUserId,
        actorUserId: input.actorUserId,
        eventType: "identity.session.revoked",
        outcome: "success",
        severity: "warning",
        metadata: { session_id: input.sessionId, ...(input.reason ? { reason: input.reason } : {}) },
    });
}

export async function revokeOtherIdentitySessions(input: {
    ctx: HttpContext;
    userId: number;
    currentTokenIdentifier: number | null;
    reason?: string;
}) {
    const trx = currentTrx();
    const rows = await trx
        .from("identity_sessions")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", input.userId)
        .whereNull("revoked_at");
    const user = await User.findOrFail(input.userId, { client: trx });
    let revoked = 0;
    for (const row of rows) {
        if (input.currentTokenIdentifier !== null && Number(row.token_identifier) === Number(input.currentTokenIdentifier))
            continue;
        await User.accessTokens.delete(user, Number(row.token_identifier));
        await trx
            .from("identity_sessions")
            .where("id", row.id)
            .update({ revoked_at: DateTime.utc().toSQL(), updated_at: DateTime.utc().toSQL() });
        revoked += 1;
    }
    await recordIdentitySecurityEvent({
        ctx: input.ctx,
        userId: input.userId,
        actorUserId: input.userId,
        eventType: "identity.sessions.others_revoked",
        outcome: "success",
        severity: "warning",
        metadata: { count: revoked, ...(input.reason ? { reason: input.reason } : {}) },
    });
    return revoked;
}

export async function markIdentitySessionRevoked(tokenIdentifier: number) {
    await currentTrx()
        .from("identity_sessions")
        .where("tenant_id", Number(currentTenantId()))
        .where("token_identifier", tokenIdentifier)
        .whereNull("revoked_at")
        .update({ revoked_at: DateTime.utc().toSQL(), updated_at: DateTime.utc().toSQL() });
}
