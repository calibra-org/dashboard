import type { HttpContext } from "@adonisjs/core/http";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import AdminAuditLog from "#models/admin_audit_log";
import { captureConfigurationRevisionForAuditAction } from "#services/configuration_revision_service";

export interface RecordAuditOptions {
    ctx?: HttpContext;
    actorUserId?: bigint | number | null;
    action: string;
    entityKind: string;
    entityId: bigint | number | null;
    payload?: Record<string, unknown>;
    trx?: TransactionClientContract;
    strict?: boolean;
}

export async function recordAudit(options: RecordAuditOptions): Promise<void> {
    const { ctx, actorUserId, action, entityKind, entityId, payload, trx, strict = false } = options;
    let resolvedActor: bigint | number | null = actorUserId ?? null;
    if (resolvedActor === null && ctx) {
        try {
            const user = await ctx.auth.authenticate();
            resolvedActor = Number(user.id);
        } catch {
            resolvedActor = null;
        }
    }

    await captureConfigurationRevisionForAuditAction(action, resolvedActor);

    try {
        const row = new AdminAuditLog();
        row.actorUserId = resolvedActor;
        row.action = action;
        row.entityKind = entityKind;
        row.entityId = entityId;
        row.payload = payload ?? {};
        row.ipAddress = ctx?.request.ip() ?? null;
        row.occurredAt = DateTime.utc();
        if (trx) row.useTransaction(trx);
        await row.save();
    } catch (error) {
        ctx?.logger.warn({ err: error }, "admin_audit_log_write_failed");
        if (strict) throw error;
    }
}
