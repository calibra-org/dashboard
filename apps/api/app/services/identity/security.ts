import { createHmac } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";

import { currentTenantId, currentTrx } from "#services/tenant_context";
import env from "#start/env";

/** Canonicalize user identifiers before hashing, lookup, and verification. */
export function normalizeIdentityIdentifier(value: string): string {
    const input = value.trim();
    if (input.includes("@")) return input.toLowerCase();
    const digits = input.replace(/[^0-9+]/g, "");
    if (/^09\d{9}$/.test(digits)) return `+98${digits.slice(1)}`;
    if (/^989\d{9}$/.test(digits)) return `+${digits}`;
    return digits;
}

/** Tenant-bound keyed hash for PII/risk keys; raw identifiers are never persisted in the new ledger. */
export function identityHash(value: string): string {
    return createHmac("sha256", env.get("APP_KEY")).update(`${currentTenantId().toString()}:${value}`).digest("hex");
}

export function maskIdentifier(value: string): string {
    if (value.includes("@")) {
        const [local, domain] = value.split("@", 2);
        const visible = local.slice(0, Math.min(2, local.length));
        return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
    }
    const normalized = normalizeIdentityIdentifier(value);
    if (normalized.length < 7) return "••••••";
    return `${normalized.slice(0, 4)}${"•".repeat(Math.max(4, normalized.length - 7))}${normalized.slice(-3)}`;
}

export function maskIp(ip: string | null | undefined): string | null {
    if (!ip) return null;
    if (ip.includes(":")) {
        const parts = ip.split(":");
        return `${parts.slice(0, 2).join(":")}:…`;
    }
    const parts = ip.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : "masked";
}

export function requestDeviceHash(ctx: HttpContext): string | null {
    const explicit = ctx.request.header("x-calibra-device-id")?.trim();
    const source = explicit || ctx.request.header("user-agent")?.trim();
    return source ? identityHash(`device:${source}`) : null;
}

export async function recordIdentitySecurityEvent(input: {
    ctx?: HttpContext;
    userId?: number | null;
    actorUserId?: number | null;
    verificationId?: number | null;
    eventType: string;
    outcome: string;
    severity?: "info" | "warning" | "high" | "critical";
    metadata?: Record<string, unknown>;
}): Promise<void> {
    const tenantId = Number(currentTenantId());
    await currentTrx()
        .table("identity_security_events")
        .insert({
            tenant_id: tenantId,
            user_id: input.userId ?? null,
            actor_user_id: input.actorUserId ?? null,
            verification_id: input.verificationId ?? null,
            event_type: input.eventType,
            outcome: input.outcome,
            severity: input.severity ?? "info",
            request_id: input.ctx?.request.header("x-request-id") ?? null,
            ip_masked: maskIp(input.ctx?.request.ip()),
            metadata: JSON.stringify(input.metadata ?? {}),
        });
}

export async function recordIdentityRiskEvent(input: {
    verificationId?: number | null;
    userId?: number | null;
    eventType: string;
    subjectHash?: string | null;
    score: number;
    decision: string;
    reasons: string[];
}): Promise<void> {
    await currentTrx()
        .table("identity_risk_events")
        .insert({
            tenant_id: Number(currentTenantId()),
            verification_id: input.verificationId ?? null,
            user_id: input.userId ?? null,
            event_type: input.eventType,
            subject_hash: input.subjectHash ?? null,
            score: input.score,
            decision: input.decision,
            reasons: JSON.stringify(input.reasons),
        });
}
