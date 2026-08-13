import { beforeSave, belongsTo, column } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";
import type { DateTime } from "luxon";

import { PaymentAttemptSchema } from "#database/schema";
import type { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import Order from "#models/order";
import PaymentGateway from "#models/payment_gateway";

export type PaymentReconciliationStatus = "unchecked" | "matched" | "mismatch" | "unsupported" | "error";

/**
 * Polymorphic ledger of every payment attempt against an order — one row per init/verify cycle.
 * UNIQUE `(gateway_id, gateway_transaction_id)` is the anti-double-credit guarantee enforced at the
 * database layer; controllers never have to reason about PSP retries. `idempotencyKey` is never
 * echoed to clients.
 */
export default class PaymentAttempt extends PaymentAttemptSchema {
    static table = "payment_attempts";

    @column()
    declare status: PaymentAttemptStatus;

    @column({ serializeAs: null })
    declare idempotencyKey: string | null;

    @column()
    declare reconciliationStatus: PaymentReconciliationStatus;

    @column()
    declare reconciliationProviderStatus: string | null;

    @column.dateTime()
    declare reconciliationCheckedAt: DateTime | null;

    @column()
    declare reconciliationCheckedByUserId: bigint | number | null;

    @column()
    declare reconciliationErrorCode: string | null;

    @column()
    declare reconciliationEvidence: Record<string, unknown>;

    /** A payment-state mutation makes any prior provider comparison stale until it is checked again. */
    @beforeSave()
    static invalidateStaleReconciliation(attempt: PaymentAttempt): void {
        const paymentFactsChanged =
            attempt.$dirty.status !== undefined ||
            attempt.$dirty.gatewayTransactionId !== undefined ||
            attempt.$dirty.amountMinor !== undefined;
        if (!paymentFactsChanged) return;
        attempt.reconciliationStatus = "unchecked";
        attempt.reconciliationProviderStatus = null;
        attempt.reconciliationCheckedAt = null;
        attempt.reconciliationCheckedByUserId = null;
        attempt.reconciliationErrorCode = null;
        attempt.reconciliationEvidence = {};
    }

    @belongsTo(() => Order, { foreignKey: "orderId" })
    declare order: BelongsTo<typeof Order>;

    @belongsTo(() => PaymentGateway, { foreignKey: "gatewayId" })
    declare gateway: BelongsTo<typeof PaymentGateway>;
}
