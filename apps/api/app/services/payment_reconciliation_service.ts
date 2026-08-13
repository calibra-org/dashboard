import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import lock from "@adonisjs/lock/services/main";
import { DateTime } from "luxon";

import { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import { ResourceConflictException } from "#exceptions/domain_exceptions";
import PaymentAttempt, { type PaymentReconciliationStatus } from "#models/payment_attempt";
import PaymentGateway from "#models/payment_gateway";
import type { ProviderPaymentStatus, ReconcileResult } from "#services/adapters/base_redirect_gateway";
import { recordAudit } from "#services/admin_audit_log_service";
import { paymentAdapterRegistry } from "#services/payment_adapter_registry";
import { paymentGatewayCredentialsService } from "#services/payment_gateway_credentials_service";
import { withTenantTransaction } from "#services/tenant_context";

interface Projection {
    status: PaymentReconciliationStatus;
    providerStatus: ProviderPaymentStatus | "unsupported";
    evidence: Record<string, unknown>;
    errorCode: string | null;
    providerTransactionId?: string;
    providerAmountMinor?: number;
}

/**
 * Provider-aware payment reconciliation. A provider is queried only when its adapter exposes an
 * explicitly safe `reconcile` operation; unsupported providers are recorded truthfully instead of
 * replaying capture/settlement calls. Every check updates the latest projection on the attempt and
 * writes an immutable admin-audit event.
 */
export class PaymentReconciliationService {
    async reconcile(id: number, ctx: HttpContext): Promise<PaymentAttempt> {
        if (!Number.isSafeInteger(id) || id <= 0) {
            throw new Exception("Payment attempt not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const candidate = await PaymentAttempt.find(id);
        if (!candidate) throw new Exception("Payment attempt not found", { status: 404, code: "E_NOT_FOUND" });

        const [acquired, result] = await lock.createLock(`order:${Number(candidate.orderId)}`, "30s").runImmediately(async () => {
            const attempt = await PaymentAttempt.findOrFail(id);
            const gateway = await PaymentGateway.find(Number(attempt.gatewayId));
            if (!gateway) {
                return this.persist(attempt.id, Number(ctx.auth.user!.id), ctx, {
                    status: "error",
                    providerStatus: "unknown",
                    evidence: { gateway_id: Number(attempt.gatewayId), reason: "gateway_row_missing" },
                    errorCode: "gateway_row_missing",
                });
            }

            let adapter;
            try {
                adapter = paymentAdapterRegistry.get(gateway.code);
            } catch {
                return this.persist(attempt.id, Number(ctx.auth.user!.id), ctx, {
                    status: "unsupported",
                    providerStatus: "unsupported",
                    evidence: { gateway: gateway.code, reason: "adapter_reconciliation_unsupported" },
                    errorCode: "reconciliation_unsupported",
                });
            }

            const actorUserId = Number(ctx.auth.user!.id);
            if (!adapter.reconcile) {
                return this.persist(attempt.id, actorUserId, ctx, {
                    status: "unsupported",
                    providerStatus: "unsupported",
                    evidence: { gateway: gateway.code, reason: "adapter_reconciliation_unsupported" },
                    errorCode: "reconciliation_unsupported",
                });
            }

            let providerResult: ReconcileResult;
            try {
                providerResult = await adapter.reconcile({
                    attempt,
                    settings: paymentGatewayCredentialsService.runtimeSettings(gateway),
                });
            } catch (error) {
                return this.persist(attempt.id, actorUserId, ctx, {
                    status: "error",
                    providerStatus: "unknown",
                    evidence: { gateway: gateway.code, exception: (error as Error).message || "unknown" },
                    errorCode: "provider_probe_exception",
                });
            }

            if (!providerResult.ok) {
                return this.persist(attempt.id, actorUserId, ctx, {
                    status: "error",
                    providerStatus: "unknown",
                    evidence: this.asRecord(providerResult.payload),
                    errorCode: providerResult.error_code,
                });
            }

            return this.persist(attempt.id, actorUserId, ctx, {
                status: this.classify(attempt, providerResult),
                providerStatus: providerResult.provider_status,
                evidence: this.asRecord(providerResult.payload),
                errorCode: null,
                providerTransactionId: providerResult.transaction_id,
                providerAmountMinor: providerResult.amount_minor,
            });
        });

        if (!acquired) {
            throw new ResourceConflictException("order is being processed concurrently", {
                resource: "payment_attempts",
                id,
                code: "E_CONCURRENT_PROCESSING",
            });
        }
        return result;
    }

    private classify(attempt: PaymentAttempt, result: Extract<ReconcileResult, { ok: true }>): PaymentReconciliationStatus {
        if (result.provider_status === "verified") {
            if (attempt.status !== PaymentAttemptStatus.Verified) return "mismatch";
            if (
                result.transaction_id &&
                attempt.gatewayTransactionId &&
                String(result.transaction_id) !== String(attempt.gatewayTransactionId)
            ) {
                return "mismatch";
            }
            if (result.amount_minor !== undefined && Number(result.amount_minor) !== Number(attempt.amountMinor)) return "mismatch";
            return "matched";
        }
        if (result.provider_status === "pending") {
            return attempt.status === PaymentAttemptStatus.Initiated || attempt.status === PaymentAttemptStatus.AwaitingCallback
                ? "matched"
                : "mismatch";
        }
        if (result.provider_status === "failed") return attempt.status === PaymentAttemptStatus.Failed ? "matched" : "mismatch";
        if (result.provider_status === "cancelled") {
            return attempt.status === PaymentAttemptStatus.Cancelled ? "matched" : "mismatch";
        }
        if (result.provider_status === "refunded") return attempt.status === PaymentAttemptStatus.Refunded ? "matched" : "mismatch";
        return "error";
    }

    private async persist(
        attemptId: bigint | number,
        actorUserId: number,
        ctx: HttpContext,
        projection: Projection,
    ): Promise<PaymentAttempt> {
        return withTenantTransaction(async (trx) => {
            const attempt = await PaymentAttempt.query({ client: trx }).where("id", Number(attemptId)).forUpdate().firstOrFail();
            const previous = {
                reconciliation_status: attempt.reconciliationStatus,
                provider_status: attempt.reconciliationProviderStatus,
                error_code: attempt.reconciliationErrorCode,
            };
            const checkedAt = DateTime.utc();
            attempt.reconciliationStatus = projection.status;
            attempt.reconciliationProviderStatus = projection.providerStatus;
            attempt.reconciliationCheckedAt = checkedAt;
            attempt.reconciliationCheckedByUserId = actorUserId;
            attempt.reconciliationErrorCode = projection.errorCode;
            attempt.reconciliationEvidence = {
                ...projection.evidence,
                provider_transaction_id: projection.providerTransactionId ?? null,
                provider_amount_minor: projection.providerAmountMinor ?? null,
            };
            await attempt.save();

            await recordAudit({
                ctx,
                actorUserId,
                action: "payment.reconciliation.checked",
                entityKind: "payment_attempt",
                entityId: attempt.id,
                trx,
                strict: true,
                payload: {
                    previous,
                    current: {
                        reconciliation_status: projection.status,
                        provider_status: projection.providerStatus,
                        error_code: projection.errorCode,
                    },
                    internal_status: attempt.status,
                    provider_transaction_id: projection.providerTransactionId ?? null,
                    provider_amount_minor: projection.providerAmountMinor ?? null,
                    evidence: projection.evidence,
                    checked_at: checkedAt.toISO(),
                },
            });
            return attempt;
        });
    }

    private asRecord(value: unknown): Record<string, unknown> {
        return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    }
}

export const paymentReconciliationService = new PaymentReconciliationService();
