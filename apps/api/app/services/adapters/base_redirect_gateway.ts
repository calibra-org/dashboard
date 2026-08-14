import type { HttpContext } from "@adonisjs/core/http";

import type Order from "#models/order";
import type PaymentAttempt from "#models/payment_attempt";

/** Shared capabilities every payment adapter declares. */
export interface PaymentAdapterCapabilities {
    redirect: boolean;
    refunds: boolean;
    partial_refunds: boolean;
}

export interface InitArgs {
    order: Order;
    attempt: PaymentAttempt;
    settings: Record<string, unknown>;
    return_url: string;
}

export interface InitResult {
    authority?: string;
    redirect_url: string | null;
    payload?: unknown;
}

export interface ParsedCallback {
    authority?: string;
    transaction_id?: string;
    status: "success" | "failed" | "cancelled";
    payload: unknown;
}

export interface ParseCallbackArgs {
    request: HttpContext["request"];
    settings: Record<string, unknown>;
}

export interface VerifyArgs {
    attempt: PaymentAttempt;
    callback: ParsedCallback;
    settings: Record<string, unknown>;
}

export type VerifyResult =
    | { ok: true; transaction_id: string; amount_minor?: number; payload: unknown }
    | { ok: false; error_code: string; error_message: string; payload: unknown };

export interface RefundArgs {
    attempt: PaymentAttempt;
    amount_minor: number;
    reason?: string;
    settings: Record<string, unknown>;
}

export type RefundResult =
    | { ok: true; gateway_refund_id: string; payload?: unknown }
    | { ok: false; error_code: string; error_message: string; payload?: unknown };

export type ProviderPaymentStatus = "pending" | "verified" | "failed" | "cancelled" | "refunded" | "unknown";

export interface ReconcileArgs {
    attempt: PaymentAttempt;
    settings: Record<string, unknown>;
}

export type ReconcileResult =
    | {
          ok: true;
          provider_status: ProviderPaymentStatus;
          transaction_id?: string;
          amount_minor?: number;
          payload: unknown;
      }
    | {
          ok: false;
          provider_status: "unknown";
          error_code: string;
          error_message: string;
          payload?: unknown;
      };

/**
 * Adapter contract. Reconciliation is deliberately optional: a provider must only implement
 * `reconcile` when it has a safe, read-like status/verification operation. The operations center
 * reports `unsupported` rather than replaying a capture/settlement call with side effects.
 */
export interface PaymentAdapter {
    readonly code: string;
    readonly capabilities: PaymentAdapterCapabilities;

    init(args: InitArgs): Promise<InitResult>;
    parseCallback?(args: ParseCallbackArgs): ParsedCallback;
    verify?(args: VerifyArgs): Promise<VerifyResult>;
    refund?(args: RefundArgs): Promise<RefundResult>;
    reconcile?(args: ReconcileArgs): Promise<ReconcileResult>;
}

export async function timeoutFetch(
    url: string,
    init: RequestInit & { timeoutMs: number },
): Promise<{ status: number; body: unknown }> {
    const { timeoutMs, ...rest } = init;
    const response = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
    const status = response.status;
    const text = await response.text();
    let body: unknown;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    return { status, body };
}
