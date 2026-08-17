import { createHash } from "node:crypto";
import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import ProcessedWebhookEvent from "#models/processed_webhook_event";
import { maybeTenantContext } from "#services/tenant_context";

export interface WebhookEventInput {
    provider: string;
    eventId: string;
    eventKind: string;
    paymentAttemptId?: number | bigint | null;
    orderId?: number | bigint | null;
    rawBody: string;
}

export interface WebhookEventReplay {
    replayed: true;
    existing: ProcessedWebhookEvent;
    payloadChanged: boolean;
}

export interface WebhookEventInserted {
    replayed: false;
    inserted: ProcessedWebhookEvent;
}

export type RecordOutcome = WebhookEventInserted | WebhookEventReplay;

/**
 * Idempotency ledger for inbound PSP callbacks. Identity is
 * `(tenant_id, provider, event_id, event_kind)`: the PSP authority identifies the payment while
 * event_kind identifies the delivered state. Therefore an identical success retry replays, but a
 * legitimate failed -> success evolution for the same authority is processed as a new event.
 *
 * Tenant-scoped callers stay on the active request transaction. The INSERT names the canonical
 * conflict target explicitly so an unrelated/stale unique constraint can never be silently
 * misclassified as a replay; schema drift must fail loudly instead.
 */
export class WebhookIdempotencyService {
    async record(input: WebhookEventInput, trx?: TransactionClientContract): Promise<RecordOutcome> {
        const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
        const scopedTrx = trx ?? maybeTenantContext()?.trx;
        const client = scopedTrx ?? db.connection();
        const paymentAttemptId =
            input.paymentAttemptId !== undefined && input.paymentAttemptId !== null ? Number(input.paymentAttemptId) : null;
        const orderId = input.orderId !== undefined && input.orderId !== null ? Number(input.orderId) : null;
        const insert = await client.rawQuery<{ rows: Array<{ id: string | number }> }>(
            `
            INSERT INTO processed_webhook_events
                (provider, event_id, event_kind, payment_attempt_id, order_id, payload_hash, outcome, received_at, created_at, updated_at)
            VALUES (:provider, :event_id, :event_kind, :payment_attempt_id, :order_id, :payload_hash, 'pending', now(), now(), now())
            ON CONFLICT (tenant_id, provider, event_id, event_kind) DO NOTHING
            RETURNING id
            `,
            {
                provider: input.provider,
                event_id: input.eventId,
                event_kind: input.eventKind,
                payment_attempt_id: paymentAttemptId as number,
                order_id: orderId as number,
                payload_hash: payloadHash,
            },
        );

        const firstRow = insert.rows[0];
        if (firstRow) {
            const inserted = await ProcessedWebhookEvent.query({ client: scopedTrx })
                .where("id", String(firstRow.id))
                .firstOrFail();
            return { replayed: false, inserted };
        }

        const existing = await ProcessedWebhookEvent.query({ client: scopedTrx })
            .where("provider", input.provider)
            .where("event_id", input.eventId)
            .where("event_kind", input.eventKind)
            .firstOrFail();
        return { replayed: true, existing, payloadChanged: existing.payloadHash !== payloadHash };
    }

    async finalize(
        row: ProcessedWebhookEvent,
        outcome: string,
        opts: {
            trx?: TransactionClientContract;
            paymentAttemptId?: number | bigint | null;
            orderId?: number | bigint | null;
        } = {},
    ): Promise<void> {
        if (opts.trx) row.useTransaction(opts.trx);
        row.outcome = outcome;
        row.processedAt = DateTime.utc();
        if (opts.paymentAttemptId !== undefined && opts.paymentAttemptId !== null)
            row.paymentAttemptId = Number(opts.paymentAttemptId);
        if (opts.orderId !== undefined && opts.orderId !== null) row.orderId = Number(opts.orderId);
        await row.save();
    }
}

export const webhookIdempotencyService = new WebhookIdempotencyService();
