import { DateTime } from "luxon";

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
import { paymentGatewayCredentialsService } from "#services/payment_gateway_credentials_service";

export const MELLAT_START_PAY_URL = "https://bpm.shaparak.ir/pgwchannel/startpay.mellat";
const SERVICE_URL = "https://bpm.shaparak.ir/pgwchannel/services/pgw";
const NAMESPACE = "http://interfaces.core.sw.bps.com/";

interface MellatCredentials {
    terminalId: string;
    username: string;
    password: string;
}

function credentials(stored: Record<string, unknown>): MellatCredentials {
    const settings = paymentGatewayCredentialsService.runtimeSettingsFromStored("mellat", stored);
    const terminalId = String(settings.terminal_id ?? "").trim();
    const username = String(settings.username ?? "").trim();
    const password = String(settings.password ?? "").trim();
    if (!terminalId || !username || !password) throw new Error("mellat terminal_id, username and password are required");
    return { terminalId, username, password };
}

function credentialXml(c: MellatCredentials): string {
    return `<terminalId>${xmlEscape(c.terminalId)}</terminalId><userName>${xmlEscape(c.username)}</userName><userPassword>${xmlEscape(c.password)}</userPassword>`;
}

async function mellatCall(method: string, body: string): Promise<string> {
    const xml = await postSoap({
        url: SERVICE_URL,
        namespace: NAMESPACE,
        method,
        body,
        soapAction: `${NAMESPACE}${method}`,
    });
    const result = xmlTag(xml, `${method}Return`) ?? xmlTag(xml, "return");
    if (result === null) throw new Error(`mellat ${method} returned no result`);
    return result;
}

/** Behpardakht Mellat classic SOAP/IPG adapter. */
export class MellatGateway implements PaymentAdapter {
    readonly code = "mellat";
    readonly capabilities: PaymentAdapterCapabilities = { redirect: true, refunds: false, partial_refunds: false };

    async init(args: InitArgs): Promise<InitResult> {
        const c = credentials(args.settings);
        const now = DateTime.now().setZone("Asia/Tehran");
        const orderId = String(args.order.id);
        const result = await mellatCall(
            "bpPayRequest",
            `${credentialXml(c)}<orderId>${xmlEscape(orderId)}</orderId><amount>${xmlEscape(Number(args.attempt.amountMinor))}</amount><localDate>${now.toFormat("yyyyLLdd")}</localDate><localTime>${now.toFormat("HHmmss")}</localTime><additionalData></additionalData><callBackUrl>${xmlEscape(args.return_url)}</callBackUrl><payerId>0</payerId>`,
        );
        const [resultCode, refId] = result.split(",", 2);
        if (resultCode !== "0" || !refId) throw new Error(`mellat payment request failed (${resultCode || "unknown"})`);

        const bridge = new URL(args.return_url);
        bridge.pathname = "/api/v1/payment/redirect/mellat";
        bridge.search = "";
        bridge.searchParams.set("authority", refId);
        return {
            authority: refId,
            redirect_url: bridge.toString(),
            payload: { provider_code: 0, ref_id: refId },
        };
    }

    parseCallback({ request }: ParseCallbackArgs): ParsedCallback {
        const refId = String(request.input("RefId") ?? "").trim();
        const resCode = String(request.input("ResCode") ?? "").trim();
        const saleOrderId = String(request.input("SaleOrderId") ?? request.input("saleOrderId") ?? "").trim();
        const saleReferenceId = String(request.input("SaleReferenceId") ?? request.input("saleReferenceId") ?? "").trim();
        return {
            authority: refId || undefined,
            transaction_id: saleReferenceId || undefined,
            status: resCode === "0" ? "success" : resCode === "17" ? "cancelled" : "failed",
            payload: { ref_id: refId, res_code: resCode, sale_order_id: saleOrderId, sale_reference_id: saleReferenceId },
        };
    }

    async verify(args: VerifyArgs): Promise<VerifyResult> {
        const c = credentials(args.settings);
        const payload = args.callback.payload as Record<string, unknown>;
        const orderId = String(args.attempt.orderId);
        const saleOrderId = String(payload.sale_order_id ?? orderId).trim();
        const saleReferenceId = String(payload.sale_reference_id ?? args.callback.transaction_id ?? "").trim();
        if (!saleOrderId || !saleReferenceId) {
            return {
                ok: false,
                error_code: "mellat_callback_invalid",
                error_message: "Mellat callback identifiers are missing",
                payload,
            };
        }
        const common = `${credentialXml(c)}<orderId>${xmlEscape(orderId)}</orderId><saleOrderId>${xmlEscape(saleOrderId)}</saleOrderId><saleReferenceId>${xmlEscape(saleReferenceId)}</saleReferenceId>`;
        const verifyCode = await mellatCall("bpVerifyRequest", common);
        if (verifyCode !== "0") {
            return {
                ok: false,
                error_code: `mellat_verify_${verifyCode}`,
                error_message: "Mellat verification failed",
                payload: { verify_code: verifyCode, sale_reference_id: saleReferenceId },
            };
        }
        const settleCode = await mellatCall("bpSettleRequest", common);
        if (settleCode !== "0") {
            return {
                ok: false,
                error_code: `mellat_settle_${settleCode}`,
                error_message: "Mellat settlement failed",
                payload: { verify_code: verifyCode, settle_code: settleCode, sale_reference_id: saleReferenceId },
            };
        }
        return {
            ok: true,
            transaction_id: saleReferenceId,
            amount_minor: Number(args.attempt.amountMinor),
            payload: { verify_code: verifyCode, settle_code: settleCode, sale_reference_id: saleReferenceId },
        };
    }
}

export const mellatGateway = new MellatGateway();
