import type { HttpContext } from "@adonisjs/core/http";
import transmit from "@adonisjs/transmit/services/main";

import { currentTrx } from "#services/tenant_context";

export type TicketRealtimeEventType = "created" | "updated" | "transitioned" | "message" | "public_message" | "csat";

export interface TicketRealtimeEvent {
    type: TicketRealtimeEventType;
    ticketId: number;
    at: string;
}

/**
 * Schedules a tenant-scoped ticket invalidation after the HTTP response has finished. User ids are
 * captured while the request transaction (and therefore tenant RLS context) is active; broadcasting
 * happens after response completion so subscribers never race a transaction that may still roll back.
 * The payload intentionally carries only the ticket id + event kind; the database remains source of truth.
 */
export async function scheduleTicketRealtime(ctx: HttpContext, event: Omit<TicketRealtimeEvent, "at">): Promise<void> {
    const rows = await currentTrx().from("users").select("id");
    const userIds = rows.map((row) => Number(row.id)).filter((id) => Number.isSafeInteger(id) && id > 0);
    if (userIds.length === 0) return;

    const payload: TicketRealtimeEvent = { ...event, at: new Date().toISOString() };
    ctx.response.onFinish(() => {
        for (const userId of userIds) {
            transmit.broadcast(`ticket-inbox/users/${userId}`, payload as never);
        }
    });
}
