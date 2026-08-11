import type {
    InitArgs,
    InitResult,
    ParseCallbackArgs,
    ParsedCallback,
    PaymentAdapter,
    PaymentAdapterCapabilities,
    VerifyArgs,
    VerifyResult,
} from "#services/adapters/base_redirect_gateway";
import { timeoutFetch } from "#services/adapters/base_redirect_gateway";
import { paymentGatewayCredentialsService } from "#services/payment_gateway_credentials_service";

const REQUEST_URL = "https://api.zarinpal.com/pg/v4/payment/request.json";
const VERIFY_URL = "https://api.zarinpal.com/pg/v4/payment/verify.json";
const START_PAY_URL = "https://www.zarinpal.com/pg/StartPay/";

function requireMerchantId(stored: Record<string, unknown>): string {
    const settings = paymentGatewayCredentialsService.runtimeSettingsFromStored("zarinpal", stored);
    const merchantId = typeof settings.merchant_id === "string" ? settings.merchant_id.trim() : "";
    if (!merchantId) throw new Error("zarinpal merchant_id is required");
    return merchantId;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** ZarinPal v4 redirect adapter. */
export class ZarinpalGateway implements PaymentAdapter {
    readonly code = "zarinpal";
    readonly capabilities: PaymentAdapterCapabilities = { redirect: true, refunds: false, partial_refunds: false };

    async init(args: InitArgs): Promise<InitResult> {
        const merchantId = requireMerchantId(args.settings);
        const response = await timeoutFetch(REQUEST_URL, {
            method: "POST",
            timeoutMs: 5_000,
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({
                merchant_id: merchantId,
                amount: Number(args.attempt.amountMinor),
                callback_url: args.return_url,
                description: `Calibra order ${String(args.order.orderNumber)}`,
            }),
        });
        const envelope = asRecord(response.body);
        const data = asRecord(envelope.data);
        const authority = typeof data.authority === "string" ? data.authority : "";
        const code = Number(data.code);
        if (response.status < 200 || response.status >= 300 || code !== 100 || !authority) {
            throw new Error(`zarinpal request failed (${Number.isFinite(code) ? code : response.status})`);
        }
        return {
            authority,
            redirect_url: `${START_PAY_URL}${encodeURIComponent(authority)}`,
            payload: { provider_code: code, authority },
        };
    }

    parseCallback({ request }: ParseCallbackArgs): ParsedCallback {
        const authority = String(request.input("Authority") ?? request.input("authority") ?? "").trim();
        const rawStatus = String(request.input("Status") ?? request.input("status") ?? "").toUpperCase();
        return {
            authority: authority || undefined,
            status: rawStatus === "OK" ? "success" : rawStatus === "NOK" ? "cancelled" : "failed",
            payload: { authority, status: rawStatus },
        };
    }

    async verify(args: VerifyArgs): Promise<VerifyResult> {
        const merchantId = requireMerchantId(args.settings);
        const authority = args.callback.authority ?? String(args.attempt.gatewayAuthority ?? "");
        if (!authority) {
            return { ok: false, error_code: "missing_authority", error_message: "ZarinPal authority is missing", payload: {} };
        }
        const response = await timeoutFetch(VERIFY_URL, {
            method: "POST",
            timeoutMs: 10_000,
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ merchant_id: merchantId, amount: Number(args.attempt.amountMinor), authority }),
        });
        const envelope = asRecord(response.body);
        const data = asRecord(envelope.data);
        const code = Number(data.code);
        const refId = data.ref_id;
        if (response.status >= 200 && response.status < 300 && (code === 100 || code === 101) && refId !== undefined) {
            return {
                ok: true,
                transaction_id: String(refId),
                amount_minor: Number(args.attempt.amountMinor),
                payload: { provider_code: code, ref_id: String(refId), card_pan: data.card_pan ?? null },
            };
        }
        const errors = asRecord(envelope.errors);
        return {
            ok: false,
            error_code: `zarinpal_${Number.isFinite(code) ? code : response.status}`,
            error_message: typeof errors.message === "string" ? errors.message : "ZarinPal verification failed",
            payload: { provider_code: Number.isFinite(code) ? code : null },
        };
    }
}

export const zarinpalGateway = new ZarinpalGateway();
