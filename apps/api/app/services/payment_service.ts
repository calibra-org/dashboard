import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import emitter from "@adonisjs/core/services/emitter";
import lock from "@adonisjs/lock/services/main";
import * as Sentry from "@sentry/node";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import { ResourceConflictException } from "#exceptions/domain_exceptions";
import { GatewayNotConfiguredException } from "#exceptions/payment_exceptions";
import Order from "#models/order";
import PaymentAttempt from "#models/payment_attempt";
import { recordPaymentAttempt, recordPaymentPhase } from "#services/metrics/domain_metrics";
import { orderStateMachine } from "#services/order_state_machine";
import { paymentAdapterRegistry } from "#services/payment_adapter_registry";
import { paymentGatewayCredentialsService } from "#services/payment_gateway_credentials_service";
import SettingsService from "#services/settings_service";
import { withTenantTransaction } from "#services/tenant_context";
import { webhookIdempotencyService } from "#services/webhook_idempotency_service";

const DEFAULT_RETURN_SUCCESS = "http://localhost:3000/checkout/success";
const DEFAULT_RETURN_FAILED = "http://localhost:3000/checkout/failed";
const DEFAULT_CALLBACK_BASE = "http://localhost:3333";

export interface PaymentInitResult {
    attempt: PaymentAttempt;
    redirect_url: string | null;
}

export interface PaymentCallbackResult {
    order: Order;
    attempt: PaymentAttempt | null;
    redirect: string;
}

export interface PaymentRefundResult {
    ok: boolean;
    gateway_refund_id?: string;
    error_code?: string;
    error_message?: string;
}

export class PaymentService {
    constructor(private readonly settings = new SettingsService()) {}

    async init(order: Order, gatewayId: number | bigint, idempotencyKey: string | null): Promise<PaymentInitResult> {
        const initStartedAt = process.hrtime.bigint();
        const normalizedIdempotencyKey = idempotencyKey?.trim() || null;
        if (normalizedIdempotencyKey && normalizedIdempotencyKey.length > 64) {
            throw new Exception("Idempotency-Key must be at most 64 characters", { status: 422, code: "E_PAYMENT_IDEMPOTENCY_KEY_INVALID" });
        }
        if (normalizedIdempotencyKey) {
            const existing = await PaymentAttempt.query().where("order_id", Number(order.id)).where("idempotency_key", normalizedIdempotencyKey).first();
            if (existing) return { attempt: existing, redirect_url: this.redirectUrlFromAttemptPayload(existing) };
        }
        const { adapter, gateway } = await paymentAdapterRegistry.resolveForGatewayId(gatewayId);
        const runtimeSettings = paymentGatewayCredentialsService.runtimeSettings(gateway);
        const claim = await withTenantTransaction(async (trx) => {
            const lockedOrder = await Order.query({ client: trx }).where("id", Number(order.id)).forUpdate().firstOrFail();
            if (normalizedIdempotencyKey) {
                const existing = await PaymentAttempt.query({ client: trx }).where("order_id", Number(lockedOrder.id)).where("idempotency_key", normalizedIdempotencyKey).first();
                if (existing) return { order: lockedOrder, attempt: existing, created: false as const };
            }
            const active = await PaymentAttempt.query({ client: trx })
                .where("order_id", Number(lockedOrder.id)).where("gateway_id", Number(gateway.id))
                .whereIn("status", [PaymentAttemptStatus.Initiated, PaymentAttemptStatus.AwaitingCallback])
                .orderBy("initiated_at", "desc").first();
            if (active) return { order: lockedOrder, attempt: active, created: false as const };
            if (lockedOrder.status !== OrderStatus.Pending && lockedOrder.status !== OrderStatus.OnHold) {
                throw new Exception("Order is no longer payable", { status: 409, code: "E_ORDER_NOT_PAYABLE" });
            }
            const row = new PaymentAttempt();
            row.useTransaction(trx);
            row.orderId = lockedOrder.id;
            row.gatewayId = gateway.id;
            row.gatewayCodeSnapshot = gateway.code;
            row.status = PaymentAttemptStatus.Initiated;
            row.amountMinor = Number(lockedOrder.grandTotal);
            row.currency = lockedOrder.currency;
            row.idempotencyKey = normalizedIdempotencyKey;
            row.gatewayPayload = {};
            row.initiatedAt = DateTime.utc();
            await row.save();
            return { order: lockedOrder, attempt: row, created: true as const };
        });
        if (!claim.created) return { attempt: claim.attempt, redirect_url: this.redirectUrlFromAttemptPayload(claim.attempt) };
        const lockedOrder = claim.order;
        const attempt = claim.attempt;
        const returnUrl = await this.buildCallbackUrl(gateway.code, lockedOrder);
        recordPaymentAttempt(gateway.code, PaymentAttemptStatus.Initiated);
        let initResult: Awaited<ReturnType<typeof adapter.init>>;
        try {
            initResult = await adapter.init({ order: lockedOrder, attempt, settings: runtimeSettings, return_url: returnUrl });
        } catch (error) {
            attempt.status = PaymentAttemptStatus.Failed;
            attempt.errorCode = this.errorCodeFromException(error);
            attempt.errorMessage = (error as Error).message ?? "init threw";
            attempt.gatewayPayload = { error: String((error as Error).message ?? error) };
            await attempt.save();
            await this.linkLatest(lockedOrder, attempt);
            recordPaymentAttempt(gateway.code, PaymentAttemptStatus.Failed);
            recordPaymentPhase(gateway.code, "init", Number(process.hrtime.bigint() - initStartedAt) / 1e9);
            paymentGatewayCredentialsService.markError(gateway, this.errorCodeFromException(error));
            await gateway.save();
            throw error;
        }
        await withTenantTransaction(async (trx) => {
            attempt.useTransaction(trx);
            attempt.gatewayPayload = { ...(((initResult.payload as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>), redirect_url: initResult.redirect_url };
            if (initResult.authority) attempt.gatewayAuthority = initResult.authority;
            if (adapter.capabilities.redirect) {
                if (!initResult.redirect_url) {
                    attempt.status = PaymentAttemptStatus.Failed;
                    attempt.errorCode = "init_no_redirect";
                    attempt.errorMessage = "Adapter returned no redirect_url despite capabilities.redirect";
                } else attempt.status = PaymentAttemptStatus.AwaitingCallback;
                await attempt.save();
            } else {
                attempt.status = PaymentAttemptStatus.Verified;
                attempt.verifiedAt = DateTime.utc();
                await attempt.save();
                if (lockedOrder.status === OrderStatus.Pending) await orderStateMachine.transition(lockedOrder, OrderStatus.OnHold, { reason: `payment.${gateway.code}.no_redirect`, trx });
            }
        });
        await this.linkLatest(lockedOrder, attempt);
        recordPaymentAttempt(gateway.code, attempt.status);
        recordPaymentPhase(gateway.code, "init", Number(process.hrtime.bigint() - initStartedAt) / 1e9);
        return { attempt, redirect_url: initResult.redirect_url };
    }

    async verifyCallback(gatewayCode: string, request: HttpContext["request"]): Promise<PaymentCallbackResult> {
        const callbackStartedAt = process.hrtime.bigint();
        const successUrl = await this.settings.get<string>("general", "checkout_return_url_success", DEFAULT_RETURN_SUCCESS);
        const failedUrl = await this.settings.get<string>("general", "checkout_return_url_failed", DEFAULT_RETURN_FAILED);
        const { adapter, gateway } = await paymentAdapterRegistry.resolveForCallbackCode(gatewayCode);
        const runtimeSettings = paymentGatewayCredentialsService.runtimeSettings(gateway);
        if (!adapter.parseCallback || !adapter.verify) throw new GatewayNotConfiguredException(gatewayCode, `Gateway "${gatewayCode}" does not support callbacks`);
        const parsed = adapter.parseCallback({ request, settings: runtimeSettings });
        if (!parsed.authority) return { order: undefined as unknown as Order, attempt: null, redirect: this.attachReason(failedUrl, "missing_authority") };
        const rawBody = request.raw() ?? JSON.stringify(request.all() ?? {});
        const eventId = String(parsed.authority);
        const candidate = await PaymentAttempt.query().where("gateway_id", Number(gateway.id)).where("gateway_authority", eventId).first();
        if (!candidate) throw new Exception("No matching payment attempt found for callback", { status: 404, code: "E_PAYMENT_ATTEMPT_NOT_FOUND" });
        const [acquired, lockedResult] = await lock.createLock(`order:${Number(candidate.orderId)}`, "30s").runImmediately(async () =>
            withTenantTransaction(async (trx) => {
                const attempt = await PaymentAttempt.query({ client: trx }).where("gateway_id", Number(gateway.id)).where("gateway_authority", eventId).forUpdate().first();
                if (!attempt) throw new Exception("No matching payment attempt found for callback", { status: 404, code: "E_PAYMENT_ATTEMPT_NOT_FOUND" });
                const order = await Order.query({ client: trx }).where("id", Number(attempt.orderId)).forUpdate().firstOrFail();
                const ledger = await webhookIdempotencyService.record({ provider: gatewayCode, eventId, eventKind: `payment.callback.${parsed.status}`, paymentAttemptId: attempt.id, orderId: order.id, rawBody }, trx);
                if (ledger.replayed) {
                    if (ledger.payloadChanged) Sentry.captureMessage("webhook_replay_payload_changed", { level: "warning", tags: { gateway: gatewayCode, order_id: String(order.id), attempt_id: String(attempt.id), event_kind: ledger.existing.eventKind } });
                    const replayedRedirect = ledger.existing.outcome === "verified" || ledger.existing.outcome === "verified_out_of_order"
                        ? this.attachOrderKey(successUrl, order)
                        : this.attachReason(failedUrl, `replayed_${ledger.existing.outcome}`);
                    return { order, attempt, redirect: replayedRedirect };
                }
                const ledgerRow = ledger.inserted;
                if (parsed.status === "cancelled" || parsed.status === "failed") {
                    if (attempt.status !== PaymentAttemptStatus.Verified) {
                        attempt.status = parsed.status === "cancelled" ? PaymentAttemptStatus.Cancelled : PaymentAttemptStatus.Failed;
                        attempt.gatewayPayload = (parsed.payload as Record<string, unknown>) ?? {};
                        attempt.errorCode = parsed.status === "cancelled" ? "psp_cancelled" : "psp_failed";
                        await attempt.save();
                    }
                    if (order.status === OrderStatus.Pending) await orderStateMachine.transition(order, OrderStatus.Failed, { reason: `payment.${gatewayCode}.${parsed.status}`, trx });
                    await webhookIdempotencyService.finalize(ledgerRow, parsed.status, { trx });
                    return { order, attempt, redirect: this.attachReason(failedUrl, `psp_${parsed.status}`) };
                }
                if (attempt.status === PaymentAttemptStatus.Verified) {
                    await webhookIdempotencyService.finalize(ledgerRow, "verified_out_of_order", { trx });
                    return { order, attempt, redirect: this.attachOrderKey(successUrl, order) };
                }
                const verifyResult = await adapter.verify({ attempt, callback: parsed, settings: runtimeSettings });
                const amountMismatch = verifyResult.ok && verifyResult.amount_minor !== undefined && verifyResult.amount_minor !== Number(attempt.amountMinor);
                if (!verifyResult.ok || amountMismatch) {
                    if (amountMismatch) Sentry.captureMessage("payment_amount_mismatch", { level: "error", tags: { gateway: gatewayCode, order_id: String(order.id), attempt_id: String(attempt.id) }, extra: { expected_minor: Number(attempt.amountMinor), received_minor: (verifyResult as { amount_minor: number }).amount_minor } });
                    attempt.status = PaymentAttemptStatus.Failed;
                    attempt.errorCode = amountMismatch ? "amount_mismatch" : (verifyResult as { error_code: string }).error_code;
                    attempt.errorMessage = amountMismatch ? `expected ${attempt.amountMinor}, got ${(verifyResult as { amount_minor: number }).amount_minor}` : (verifyResult as { error_message: string }).error_message;
                    attempt.gatewayPayload = (verifyResult.payload as Record<string, unknown>) ?? {};
                    await attempt.save();
                    if (order.status === OrderStatus.Pending) await orderStateMachine.transition(order, OrderStatus.Failed, { reason: amountMismatch ? `payment.${gatewayCode}.amount_mismatch` : `payment.${gatewayCode}.verify_failed`, trx });
                    await webhookIdempotencyService.finalize(ledgerRow, amountMismatch ? "amount_mismatch" : "verify_failed", { trx });
                    return { order, attempt, redirect: this.attachReason(failedUrl, amountMismatch ? "amount_mismatch" : "verify_failed") };
                }
                attempt.status = PaymentAttemptStatus.Verified;
                attempt.gatewayTransactionId = verifyResult.transaction_id;
                attempt.verifiedAt = DateTime.utc();
                attempt.errorCode = null;
                attempt.errorMessage = null;
                attempt.gatewayPayload = (verifyResult.payload as Record<string, unknown>) ?? {};
                await attempt.save();
                order.useTransaction(trx);
                order.transactionId = verifyResult.transaction_id;
                await order.save();
                if ([OrderStatus.Pending, OrderStatus.OnHold, OrderStatus.Failed].includes(order.status)) {
                    await orderStateMachine.transition(order, OrderStatus.Processing, { reason: "payment_verified", trx });
                }
                await webhookIdempotencyService.finalize(ledgerRow, "verified", { trx });
                return { order, attempt, redirect: this.attachOrderKey(successUrl, order) };
            }),
        );
        if (!acquired) throw new ResourceConflictException("order is being processed concurrently", { resource: "orders", id: Number(candidate.orderId), code: "E_CONCURRENT_PROCESSING" });
        const result = lockedResult;
        if (result.attempt) { await this.linkLatest(result.order, result.attempt); recordPaymentAttempt(gatewayCode, result.attempt.status); }
        recordPaymentPhase(gatewayCode, "callback", Number(process.hrtime.bigint() - callbackStartedAt) / 1e9);
        if (result.attempt?.status === PaymentAttemptStatus.Verified) {
            paymentGatewayCredentialsService.markHealthy(gateway, DateTime.utc().toISO() ?? new Date().toISOString());
            await gateway.save();
            await emitter.emit("payment:verified", { orderId: Number(result.order.id), attemptId: Number(result.attempt.id), transactionId: result.attempt.gatewayTransactionId ?? "" });
        }
        return result;
    }

    async refund(order: Order, amountMinor: number, reason?: string): Promise<PaymentRefundResult> {
        const refundStartedAt = process.hrtime.bigint();
        const attempt = await PaymentAttempt.query().where("order_id", Number(order.id)).where("status", PaymentAttemptStatus.Verified).orderBy("verified_at", "desc").first();
        if (!attempt) return { ok: false, error_code: "no_verified_attempt", error_message: "Order has no verified payment to refund" };
        const { adapter, gateway } = await paymentAdapterRegistry.resolveForHistoricalGatewayId(attempt.gatewayId);
        if (!adapter.refund || !adapter.capabilities.refunds) return { ok: false, error_code: "refunds_unsupported", error_message: `Gateway "${gateway.code}" does not support refunds` };
        const result = await adapter.refund({ attempt, amount_minor: amountMinor, reason, settings: paymentGatewayCredentialsService.runtimeSettings(gateway) });
        if (result.ok) recordPaymentAttempt(gateway.code, PaymentAttemptStatus.Refunded);
        recordPaymentPhase(gateway.code, "refund", Number(process.hrtime.bigint() - refundStartedAt) / 1e9);
        return result;
    }

    async failureRedirect(reason: string): Promise<string> {
        const failedUrl = await this.settings.get<string>("general", "checkout_return_url_failed", DEFAULT_RETURN_FAILED);
        return this.attachReason(failedUrl, reason);
    }
    private redirectUrlFromAttemptPayload(attempt: PaymentAttempt): string | null { const payload = attempt.gatewayPayload as Record<string, unknown> | null; const value = payload?.redirect_url ?? null; return typeof value === "string" ? value : null; }
    private async buildCallbackUrl(gatewayCode: string, _order: Order): Promise<string> { const base = await this.settings.get<string>("payments", "callback_base_url", DEFAULT_CALLBACK_BASE); return `${base.replace(/\/+$/, "")}/api/v1/payment/callback/${gatewayCode}`; }
    private attachReason(url: string, reason: string): string { try { const u = new URL(url); u.searchParams.set("reason", reason); return u.toString(); } catch { const sep = url.includes("?") ? "&" : "?"; return `${url}${sep}reason=${encodeURIComponent(reason)}`; } }
    private attachOrderKey(url: string, order: Order): string { try { const u = new URL(url); if (order.orderKey) u.searchParams.set("order_key", order.orderKey); return u.toString(); } catch { const sep = url.includes("?") ? "&" : "?"; return order.orderKey ? `${url}${sep}order_key=${encodeURIComponent(order.orderKey)}` : url; } }
    private async linkLatest(order: Order, attempt: PaymentAttempt): Promise<void> { if (!order || !attempt?.id) return; order.lastPaymentAttemptId = attempt.id; await order.save(); }
    private errorCodeFromException(error: unknown): string { const message = (error as Error)?.message ?? ""; if (/abort|timeout|TimeoutError/i.test(message) || (error as { name?: string })?.name === "TimeoutError") return "gateway_timeout"; if (/ENETUNREACH|ECONNREFUSED|EAI_AGAIN|fetch failed/i.test(message)) return "gateway_unreachable"; return "gateway_error"; }
}

export const paymentService = new PaymentService();

declare module "@adonisjs/core/types" { interface EventsList { "payment:verified": { orderId: number; attemptId: number; transactionId: string }; } }
