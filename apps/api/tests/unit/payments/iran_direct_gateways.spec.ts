import { test } from "@japa/runner";

import PaymentAttempt from "#models/payment_attempt";
import { mellatGateway } from "#services/adapters/mellat_gateway";
import { parsianGateway } from "#services/adapters/parsian_gateway";
import { fetchCalls, mockFetch, unmockFetch } from "#tests/helpers/mock_fetch";

const MELLAT_SERVICE = "https://bpm.shaparak.ir/pgwchannel/services/pgw";
const PARSIAN_SALE = "https://pec.shaparak.ir/NewIPGServices/Sale/SaleService.asmx";
const PARSIAN_CONFIRM = "https://pec.shaparak.ir/NewIPGServices/Confirm/ConfirmService.asmx";

function xml(body: string): string {
    return `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`;
}

test.group("Iran direct bank adapters", (group) => {
    group.each.teardown(() => unmockFetch());

    test("Mellat bpPayRequest uses terminal credentials and returns the secure form-post bridge", async ({ assert }) => {
        mockFetch({
            [MELLAT_SERVICE]: {
                headers: { "Content-Type": "text/xml" },
                body: xml("<bpPayRequestResponse><bpPayRequestReturn>0,REFID-123456</bpPayRequestReturn></bpPayRequestResponse>"),
            },
        });
        const attempt = new PaymentAttempt();
        attempt.amountMinor = 2_500_000;
        const result = await mellatGateway.init({
            order: { id: 44, orderNumber: 14050044 } as never,
            attempt,
            settings: { terminal_id: "1234567", username: "merchant", password: "secret" },
            return_url: "https://api.example/api/v1/payment/callback/mellat",
        });

        assert.equal(result.authority, "REFID-123456");
        assert.equal(
            result.redirect_url,
            "https://api.example/api/v1/payment/redirect/mellat?authority=REFID-123456",
        );
        const [call] = fetchCalls();
        assert.equal(call.method, "POST");
        assert.include(String(call.body), "<terminalId>1234567</terminalId>");
        assert.include(String(call.body), "<userName>merchant</userName>");
        assert.include(String(call.body), "<amount>2500000</amount>");
    });

    test("Mellat verify performs verify then settle and returns SaleReferenceId", async ({ assert }) => {
        mockFetch({
            [MELLAT_SERVICE]: [
                {
                    headers: { "Content-Type": "text/xml" },
                    body: xml("<bpVerifyRequestResponse><bpVerifyRequestReturn>0</bpVerifyRequestReturn></bpVerifyRequestResponse>"),
                },
                {
                    headers: { "Content-Type": "text/xml" },
                    body: xml("<bpSettleRequestResponse><bpSettleRequestReturn>0</bpSettleRequestReturn></bpSettleRequestResponse>"),
                },
            ],
        });
        const attempt = new PaymentAttempt();
        attempt.orderId = 44;
        attempt.amountMinor = 2_500_000;
        const result = await mellatGateway.verify({
            attempt,
            callback: {
                authority: "REFID-123456",
                transaction_id: "987654321",
                status: "success",
                payload: { sale_order_id: "44", sale_reference_id: "987654321" },
            },
            settings: { terminal_id: "1234567", username: "merchant", password: "secret" },
        });
        assert.isTrue(result.ok);
        if (result.ok) assert.equal(result.transaction_id, "987654321");
        assert.lengthOf(fetchCalls(), 2);
    });

    test("Parsian sale request returns provider token redirect", async ({ assert }) => {
        mockFetch({
            [PARSIAN_SALE]: {
                headers: { "Content-Type": "text/xml" },
                body: xml("<SalePaymentRequestResponse><SalePaymentRequestResult><Status>0</Status><Token>1234567890</Token></SalePaymentRequestResult></SalePaymentRequestResponse>"),
            },
        });
        const attempt = new PaymentAttempt();
        attempt.amountMinor = 3_000_000;
        const result = await parsianGateway.init({
            order: { id: 77, orderNumber: 14050077 } as never,
            attempt,
            settings: { login_account: "merchant-pin" },
            return_url: "https://api.example/api/v1/payment/callback/parsian",
        });
        assert.equal(result.authority, "1234567890");
        assert.equal(result.redirect_url, "https://pec.shaparak.ir/NewIPG/?Token=1234567890");
        const [call] = fetchCalls();
        assert.include(String(call.body), "<LoginAccount>merchant-pin</LoginAccount>");
        assert.include(String(call.body), "<Amount>3000000</Amount>");
    });

    test("Parsian confirmation returns the provider RRN", async ({ assert }) => {
        mockFetch({
            [PARSIAN_CONFIRM]: {
                headers: { "Content-Type": "text/xml" },
                body: xml("<ConfirmPaymentResponse><ConfirmPaymentResult><Status>0</Status><RRN>555888</RRN><CardNumberMasked>6037******1234</CardNumberMasked></ConfirmPaymentResult></ConfirmPaymentResponse>"),
            },
        });
        const attempt = new PaymentAttempt();
        attempt.amountMinor = 3_000_000;
        attempt.gatewayAuthority = "1234567890";
        const result = await parsianGateway.verify({
            attempt,
            callback: { authority: "1234567890", status: "success", payload: {} },
            settings: { login_account: "merchant-pin" },
        });
        assert.isTrue(result.ok);
        if (result.ok) {
            assert.equal(result.transaction_id, "555888");
            assert.equal(result.amount_minor, 3_000_000);
        }
    });
});
