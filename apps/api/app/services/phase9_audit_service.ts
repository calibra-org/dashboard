import { DateTime } from "luxon";

import { currentTenantId, currentTrx } from "#services/tenant_context";

export async function auditPhase9(
    action: string,
    entityKind: string,
    entityId: number | null,
    actorUserId: number | null,
    payload: Record<string, unknown>,
    ipAddress?: string | null,
) {
    await currentTrx()
        .table("admin_audit_log")
        .insert({
            tenant_id: currentTenantId(),
            actor_user_id: actorUserId,
            action: action.slice(0, 64),
            entity_kind: entityKind.slice(0, 32),
            entity_id: entityId,
            payload: JSON.stringify(payload),
            ip_address: ipAddress ?? null,
            occurred_at: DateTime.utc().toSQL(),
        });
}
