import { BaseTransformer } from "@adonisjs/core/transformers";

import type PaymentAttempt from "#models/payment_attempt";

/**
 * Owns the `/api/v1/admin/payment-attempts/*` response shape. `idempotency_key` is never exposed.
 * List responses omit raw PSP payloads; detail includes both provider payload and reconciliation
 * evidence for incident response.
 */
export default class PaymentAttemptTransformer extends BaseTransformer<PaymentAttempt> {
    toObject() {
        return this.forList();
    }

    forList() {
        const attempt = this.resource;
        return {
            id: Number(attempt.id),
            order_id: Number(attempt.orderId),
            gateway_id: Number(attempt.gatewayId),
            gateway_code: attempt.gatewayCodeSnapshot,
            status: attempt.status,
            amount_minor: Number(attempt.amountMinor),
            currency: attempt.currency,
            gateway_authority: attempt.gatewayAuthority,
            gateway_transaction_id: attempt.gatewayTransactionId,
            error_code: attempt.errorCode,
            error_message: attempt.errorMessage,
            reconciliation_status: attempt.reconciliationStatus ?? "unchecked",
            reconciliation_provider_status: attempt.reconciliationProviderStatus ?? null,
            reconciliation_checked_at: attempt.reconciliationCheckedAt?.toISO() ?? null,
            reconciliation_checked_by_user_id:
                attempt.reconciliationCheckedByUserId === null || attempt.reconciliationCheckedByUserId === undefined
                    ? null
                    : Number(attempt.reconciliationCheckedByUserId),
            reconciliation_error_code: attempt.reconciliationErrorCode ?? null,
            initiated_at: attempt.initiatedAt?.toISO() ?? null,
            verified_at: attempt.verifiedAt?.toISO() ?? null,
            created_at: attempt.createdAt?.toISO() ?? null,
        };
    }

    forDetail() {
        const attempt = this.resource;
        return {
            ...this.forList(),
            gateway_payload: (attempt.gatewayPayload as Record<string, unknown>) ?? {},
            reconciliation_evidence: (attempt.reconciliationEvidence as Record<string, unknown>) ?? {},
        };
    }
}
