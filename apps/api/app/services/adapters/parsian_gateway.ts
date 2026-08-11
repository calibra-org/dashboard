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
import { postSoap, xmlEscape, xmlTag } from "#services/adapters/soap_gateway_helpers";

const SALE_URL = "https://pec.shaparak.ir/NewIPGServices/Sale/SaleService.asmx";
const CONFIRM_URL = "https://pec.shaparak.ir/NewIPGServices/Confirm/ConfirmService.asmx";
const START_PAY_URL = "https://pec.shaparak.ir/NewIPG/";
const SALE_NAMESPACE = "https://pec.Shaparak.ir/NewIPGServices/Sale/SaleService";
const CONFIRM_NAMESPACE = "https://pec.Shaparak.ir/NewIPGServices/Confirm/ConfirmService";

function loginAccount(settings: Record<string, unknown>): string {
    const value = String(settings.login_account ?? "").trim();
    if (!value) throw new Error("parsian login_account is required");
    return value;
}

function numberTag(xml: string, name: string): number | null {
    const raw = xmlTag(xml, name);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

/** Parsian E-Commerce New IPG SOAP adapter. */
export class ParsianGateway implements PaymentAdapter {
    readonly code = "parsian";
    readonly capabilities: PaymentAdapterCapabilities = { redirect: true, refunds: false, partial_refunds: false };

    async init(args: InitArgs): Promise<InitResult> {
        const account = loginAccount(args.settings);
        const xml = await postSoap({
            url: SALE_URL,
            namespace: SALE_NAMESPACE,
            method: "SalePaymentRequest",
            soapAction: `${SALE_NAMESPACE}/SalePaymentRequest`,
            body: `<requestData><LoginAccount>${xmlEscape(account)}</LoginAccount><Amount>${xmlEscape(Number(args.attempt.amountMinor))}</Amount><OrderId>${xmlEscape(String(args.order.id))}</OrderId><CallBackUrl>${xmlEscape(args.return_url)}</CallBackUrl><AdditionalData></AdditionalData></requestData>`,
            timeoutMs: 8_000,
        });
        const status = numberTag(xml, "Status");
        const token = xmlTag(xml, "Token") ?? "";
        if (status !== 0 || !token) throw new Error(`parsian payment request failed (${status ?? "unknown"})`);
        return {
            authority: token,
            redirect_url: `${START_PAY_URL}?Token=${encodeURIComponent(token)}`,
            payload: { provider_status: status, token },
        };
    }

    parseCallback({ request }: ParseCallbackArgs): ParsedCallback {
        const token = String(request.input("Token") ?? request.input("token") ?? "").trim();
        const statusRaw = request.input("status") ?? request.input("Status");
        const status = Number(statusRaw);
        const orderId = String(request.input("OrderId") ?? request.input("orderId") ?? "").trim();
        const rrn = String(request.input("RRN") ?? request.input("rrn") ?? "").trim();
        return {
            authority: token || undefined,
            transaction_id: rrn || undefined,
            status: status === 0 ? "success" : status === -138 ? "cancelled" : "failed",
            payload: { token, status: Number.isFinite(status) ? status : null, order_id: orderId, rrn },
        };
    }

    async verify(args: VerifyArgs): Promise<VerifyResult> {
        const account = loginAccount(args.settings);
        const token = String(args.callback.authority ?? args.attempt.gatewayAuthority ?? "").trim();
        if (!token) {
            return { ok: false, error_code: "parsian_missing_token", error_message: "Parsian token is missing", payload: {} };
        }
        const xml = await postSoap({
            url: CONFIRM_URL,
            namespace: CONFIRM_NAMESPACE,
            method: "ConfirmPayment",
            soapAction: `${CONFIRM_NAMESPACE}/ConfirmPayment`,
            body: `<requestData><LoginAccount>${xmlEscape(account)}</LoginAccount><Token>${xmlEscape(token)}</Token></requestData>`,
            timeoutMs: 10_000,
        });
        const status = numberTag(xml, "Status");
        const rrn = xmlTag(xml, "RRN") ?? args.callback.transaction_id ?? "";
        const cardNumberMasked = xmlTag(xml, "CardNumberMasked");
        if (status === 0 && rrn) {
            return {
                ok: true,
                transaction_id: String(rrn),
                amount_minor: Number(args.attempt.amountMinor),
                payload: { provider_status: status, rrn: String(rrn), card_number_masked: cardNumberMasked },
            };
        }
        return {
            ok: false,
            error_code: `parsian_confirm_${status ?? "unknown"}`,
            error_message: "Parsian confirmation failed",
            payload: { provider_status: status },
        };
    }
}

export const parsianGateway = new ParsianGateway();
