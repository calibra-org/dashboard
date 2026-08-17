import { randomUUID } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";
import hash from "@adonisjs/core/services/hash";
import { DateTime } from "luxon";

import User from "#models/user";
import { consumeRecoveryCode, verifyTotpForUser } from "#services/identity/credentials";
import { recordIdentitySecurityEvent } from "#services/identity/security";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export type StepUpMethod = "password" | "totp" | "recovery_code";

const DEFAULT_FRESHNESS_SECONDS = 600;

export async function satisfyIdentityStepUp(input: {
    ctx: HttpContext;
    user: User;
    method: StepUpMethod;
    proof: string;
    actionScope: string;
    freshnessSeconds?: number;
}) {
    let valid = false;
    if (input.method === "password" && input.user.passwordHash) valid = await hash.verify(input.user.passwordHash, input.proof);
    if (input.method === "totp") valid = await verifyTotpForUser(Number(input.user.id), input.proof);
    if (input.method === "recovery_code") valid = await consumeRecoveryCode(Number(input.user.id), input.proof);
    if (!valid) {
        await recordIdentitySecurityEvent({
            ctx: input.ctx,
            userId: Number(input.user.id),
            actorUserId: Number(input.user.id),
            eventType: "identity.step_up.failed",
            outcome: "failed",
            severity: "warning",
            metadata: { method: input.method, action_scope: input.actionScope },
        });
        throw Object.assign(new Error("Step-up proof is invalid"), { status: 422, code: "E_IDENTITY_STEP_UP_INVALID" });
    }

    const now = DateTime.utc();
    const freshness = Math.max(60, Math.min(3600, input.freshnessSeconds ?? DEFAULT_FRESHNESS_SECONDS));
    const rows = await currentTrx()
        .table("identity_verifications")
        .insert({
            public_id: randomUUID(),
            tenant_id: Number(currentTenantId()),
            user_id: Number(input.user.id),
            purpose: "step_up",
            method: input.method,
            status: "verified",
            action_scope: input.actionScope,
            expires_at: now.plus({ seconds: freshness }).toSQL(),
            verified_at: now.toSQL(),
            created_at: now.toSQL(),
            updated_at: now.toSQL(),
        })
        .returning(["id", "public_id", "expires_at"]);

    await recordIdentitySecurityEvent({
        ctx: input.ctx,
        userId: Number(input.user.id),
        actorUserId: Number(input.user.id),
        eventType: "identity.step_up.satisfied",
        outcome: "success",
        metadata: { method: input.method, action_scope: input.actionScope, verification_id: Number(rows[0].id) },
    });

    return { verification_id: rows[0].public_id, expires_at: rows[0].expires_at, action_scope: input.actionScope };
}

export async function hasRecentIdentityStepUp(userId: number, actionScope: string) {
    const now = DateTime.utc().toSQL();
    const row = await currentTrx()
        .from("identity_verifications")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", userId)
        .where("purpose", "step_up")
        .where("status", "verified")
        .where("expires_at", ">", now)
        .where((query) => query.where("action_scope", actionScope).orWhere("action_scope", "*"))
        .orderBy("verified_at", "desc")
        .first();
    return Boolean(row);
}

export async function requireRecentIdentityStepUp(userId: number, actionScope: string) {
    if (await hasRecentIdentityStepUp(userId, actionScope)) return;
    throw Object.assign(new Error("Recent step-up authentication is required"), {
        status: 403,
        code: "E_IDENTITY_STEP_UP_REQUIRED",
        meta: { action_scope: actionScope },
    });
}
