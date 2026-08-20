import { randomUUID } from "node:crypto";

import { currentTenantId, currentTrx } from "#services/tenant_context";

import { SOCIAL_EVENT_SCHEMA_VERSION, socialEventDefinition } from "#services/social/social_event_registry";

export interface SocialEventEnvelopeInput {
    customerId?: number | null;
    anonymousId?: string | null;
    contentId?: number | null;
    productId?: number | null;
    markerId?: number | null;
    eventType: string;
    sourceSurface: string;
    positionMs?: number | null;
    watchMs?: number | null;
    metadata?: Record<string, unknown>;
    eventId?: string;
    occurredAt?: Date;
    actorType?: "customer" | "staff" | "agent" | "system" | "anonymous";
    actorRef?: string | null;
    sessionId?: string | null;
    correlationId?: string | null;
    causationId?: string | null;
    consentContext?: string | null;
    privacyClassification?: "public" | "internal" | "personal" | "sensitive";
    dedupeKey?: string | null;
}

export class SocialEventService {
    eventName(eventType: string): string {
        return socialEventDefinition(eventType)?.name ?? `social.interaction.${eventType}`;
    }

    async record(input: SocialEventEnvelopeInput) {
        const eventId = input.eventId ?? randomUUID();
        const actorType = input.actorType ?? (input.customerId ? "customer" : "anonymous");
        const actorRef = input.actorRef ?? (input.customerId ? String(input.customerId) : (input.anonymousId ?? null));
        const definition = socialEventDefinition(input.eventType);
        const aggregateType = input.contentId
            ? "social_content"
            : input.productId
              ? "product"
              : (definition?.aggregate ?? "social_interaction");
        const aggregateRef = String(input.contentId ?? input.productId ?? eventId);
        const payload = {
            position_ms: input.positionMs ?? null,
            watch_ms: input.watchMs ?? null,
            ...(input.metadata ?? {}),
        };
        if (input.eventId) {
            const existingByEventId = await currentTrx()
                .from("social_interaction_events")
                .where("event_id", input.eventId)
                .first();
            if (existingByEventId) return { data: existingByEventId, replayed: true };
        }
        if (input.dedupeKey) {
            const existing = await currentTrx().from("social_interaction_events").where("dedupe_key", input.dedupeKey).first();
            if (existing) return { data: existing, replayed: true };
        }
        const occurredAt = input.occurredAt ?? new Date();
        const [row] = await currentTrx()
            .table("social_interaction_events")
            .insert({
                tenant_id: currentTenantId(),
                customer_id: input.customerId ?? null,
                anonymous_id: input.anonymousId ?? null,
                content_id: input.contentId ?? null,
                product_id: input.productId ?? null,
                marker_id: input.markerId ?? null,
                event_type: input.eventType,
                source_surface: input.sourceSurface,
                position_ms: input.positionMs ?? null,
                watch_ms: input.watchMs ?? null,
                metadata: JSON.stringify(input.metadata ?? {}),
                occurred_at: occurredAt,
                event_id: eventId,
                schema_version: SOCIAL_EVENT_SCHEMA_VERSION,
                event_name: this.eventName(input.eventType),
                received_at: new Date(),
                aggregate_type: aggregateType,
                aggregate_ref: aggregateRef,
                actor_type: actorType,
                actor_ref: actorRef,
                session_id: input.sessionId ?? null,
                correlation_id: input.correlationId ?? null,
                causation_id: input.causationId ?? null,
                consent_context: input.consentContext ?? null,
                privacy_classification: input.privacyClassification ?? definition?.privacy ?? "personal",
                dedupe_key: input.dedupeKey ?? null,
            })
            .returning("*");
        return {
            data: row,
            replayed: false,
            envelope: {
                event_id: eventId,
                schema_version: SOCIAL_EVENT_SCHEMA_VERSION,
                tenant_id: currentTenantId(),
                type: this.eventName(input.eventType),
                occurred_at: occurredAt.toISOString(),
                aggregate_type: aggregateType,
                aggregate_id: aggregateRef,
                actor: { type: actorType, id: actorRef },
                session_id: input.sessionId ?? null,
                correlation_id: input.correlationId ?? null,
                causation_id: input.causationId ?? null,
                source: input.sourceSurface,
                consent_context: input.consentContext ?? null,
                privacy_classification: input.privacyClassification ?? definition?.privacy ?? "personal",
                payload,
            },
        };
    }
}

export const socialEventService = new SocialEventService();
