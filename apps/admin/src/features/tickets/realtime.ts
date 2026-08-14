"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { usePathname } from "#/lib/i18n/navigation";
import { getTransmit } from "#/lib/transmit";

interface TicketRealtimeEvent {
    type: "created" | "updated" | "transitioned" | "message" | "public_message" | "csat";
    ticketId: number;
    at: string;
}

function storageKey(userId: number): string {
    return `calibra:tickets:unread:${userId}`;
}

export function useTicketRealtime(userId: number): number {
    const pathname = usePathname();
    const ticketActive = pathname === "/tickets" || pathname.startsWith("/tickets/");
    const client = useQueryClient();
    const seen = useRef(new Set<string>());
    const [unread, setUnread] = useState(0);

    useEffect(() => {
        try {
            setUnread(Number(window.localStorage.getItem(storageKey(userId)) ?? 0) || 0);
        } catch {
            setUnread(0);
        }
    }, [userId]);

    useEffect(() => {
        if (!ticketActive) return;
        setUnread(0);
        try {
            window.localStorage.setItem(storageKey(userId), "0");
        } catch {
            // Storage is an enhancement only; realtime invalidation must keep working without it.
        }
    }, [ticketActive, userId]);

    useEffect(() => {
        const subscription = getTransmit().subscription(`ticket-inbox/users/${userId}`);
        let disposed = false;

        subscription.onMessage((payload) => {
            if (disposed || typeof payload !== "object" || payload === null) return;
            const event = payload as TicketRealtimeEvent;
            const eventKey = `${event.type}:${event.ticketId}:${event.at}`;
            if (seen.current.has(eventKey)) return;
            seen.current.add(eventKey);
            if (seen.current.size > 250) seen.current.clear();

            void Promise.all([
                client.invalidateQueries({ queryKey: ["admin", "tickets", "list"] }),
                client.invalidateQueries({ queryKey: ["admin", "tickets", "summary"] }),
                client.invalidateQueries({ queryKey: ["admin", "tickets", "trends"] }),
                client.invalidateQueries({ queryKey: ["admin", "tickets", "detail", event.ticketId] }),
            ]);

            if (!ticketActive && (event.type === "created" || event.type === "message" || event.type === "public_message")) {
                setUnread((current) => {
                    const next = Math.min(999, current + 1);
                    try {
                        window.localStorage.setItem(storageKey(userId), String(next));
                    } catch {
                        // Keep the in-memory badge even when browser storage is unavailable.
                    }
                    return next;
                });
            }
        });

        void subscription.create().catch(() => {
            // Transmit owns reconnect/backoff. Queries retain their normal fetch behavior if SSE is unavailable.
        });

        return () => {
            disposed = true;
            void subscription.delete().catch(() => undefined);
        };
    }, [client, ticketActive, userId]);

    return unread;
}
