import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import PaymentAttempt from "#models/payment_attempt";
import type PaymentGateway from "#models/payment_gateway";
import { paymentAdapterRegistry } from "#services/payment_adapter_registry";
import { gatewayDefinition } from "#services/payment_gateway_catalog";
import { paymentGatewayCredentialsService } from "#services/payment_gateway_credentials_service";
import SettingsService from "#services/settings_service";
import { readImplementationStatus } from "#transformers/payment_gateway_transformer";

const DEFAULT_CALLBACK_BASE = "http://localhost:3333";
const CONNECTION_PROBE_AMOUNT_MINOR = 100_000;

/**
 * Performs a real provider handshake before an online gateway may become active.
 *
 * Redirect PSPs do not expose a universal read-only credential endpoint. The least-invasive
 * provider-backed proof available across Mellat, Parsian and ZarinPal is therefore a payment-init
 * handshake with a small probe amount. The returned authority is never presented to a shopper and
 * no capture/verify call is made, so the probe cannot debit a card. Offline methods are verified
 * locally because they have no remote PSP connection.
 */
export class PaymentGatewayConnectionVerifier {
    constructor(private readonly settings = new SettingsService()) {}

    async verify(gateway: PaymentGateway): Promise<void> {
        if (readImplementationStatus(gateway) === "stub") {
            throw new Exception(`Payment gateway "${gateway.code}" has no live provider adapter`, {
                status: 422,
                code: "E_PAYMENT_GATEWAY_NOT_IMPLEMENTED",
            });
        }

        const missing = paymentGatewayCredentialsService.missingRequired(gateway);
        if (missing.length > 0) {
            throw new Exception(`Payment gateway "${gateway.code}" is missing required credentials`, {
                status: 422,
                code: "E_PAYMENT_GATEWAY_CREDENTIALS_REQUIRED",
                cause: { gateway: gateway.code, missing },
            });
        }

        const definition = gatewayDefinition(gateway.code);
        if (definition?.category === "offline") {
            paymentGatewayCredentialsService.markHealthy(gateway, this.nowIso());
            return;
        }

        const adapter = paymentAdapterRegistry.get(gateway.code);
        if (!adapter.capabilities.redirect) {
            paymentGatewayCredentialsService.markHealthy(gateway, this.nowIso());
            return;
        }

        const callbackBase = await this.settings.get<string>("payments", "callback_base_url", DEFAULT_CALLBACK_BASE);
        const probeId = Date.now();
        const attempt = new PaymentAttempt();
        attempt.orderId = probeId;
        attempt.amountMinor = CONNECTION_PROBE_AMOUNT_MINOR;

        try {
            const result = await adapter.init({
                order: { id: probeId, orderNumber: `gateway-check-${probeId}` } as never,
                attempt,
                settings: (gateway.settings as Record<string, unknown>) ?? {},
                return_url: `${callbackBase.replace(/\/+$/, "")}/api/v1/payment/callback/${gateway.code}`,
            });

            if (!result.authority || !result.redirect_url) {
                throw new Error("provider did not return a payment authority");
            }

            paymentGatewayCredentialsService.markHealthy(gateway, this.nowIso());
        } catch (error) {
            const reason = this.safeReason(error);
            paymentGatewayCredentialsService.markError(gateway, reason);
            throw new Exception(`Payment gateway "${gateway.code}" connection verification failed`, {
                status: 422,
                code: "E_PAYMENT_GATEWAY_CONNECTION_FAILED",
                cause: { gateway: gateway.code, reason },
            });
        }
    }

    private safeReason(error: unknown): string {
        const raw = error instanceof Error ? error.message : String(error);
        if (/abort|timeout|TimeoutError/i.test(raw)) return "gateway_timeout";
        if (/ENETUNREACH|ECONNREFUSED|EAI_AGAIN|fetch failed/i.test(raw)) return "gateway_unreachable";
        const status = raw.match(/\((-?\d{1,6}|unknown)\)/)?.[1];
        return status ? `provider_rejected_${status}` : "provider_connection_rejected";
    }

    private nowIso(): string {
        return DateTime.utc().toISO() ?? new Date().toISOString();
    }
}

export const paymentGatewayConnectionVerifier = new PaymentGatewayConnectionVerifier();
