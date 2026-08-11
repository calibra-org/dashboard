import { test } from "@japa/runner";

import PaymentAttempt from "#models/payment_attempt";
import { zarinpalGateway } from "#services/adapters/zarinpal_gateway";
import { fetchCalls, mockFetch, unmockFetch } from "#tests/helpers/mock_fetch";

const REQUEST_URL = "https://payment.zarinpal.com/pg/v4/payment/request.json";
const VERIFY_URL = "https://payment.zarinpal.com/pg/v4/payment/verify.json";

test.group("ZarinpalGateway", (group) => {
    group.each.teardown(() => unmockFetch());

    test("init sends canonical Rial amount and returns StartPay redirect", async ({ assert }) => {
        mockFetch({
            [REQUEST_URL]: {
                body: { data: { code: 100, authority: "A000000000000000000000000000001" }, errors: [] },
            },
        });
        const attempt = new PaymentAttempt();
        attempt.amountMinor = 1_250_000;
        const result = await zarinpalGateway.init({
            order: { id: 42, orderNumber: 14050042 } as never,
            attempt,
            settings: { merchant_id: "00000000-0000-0000-0000-000000000000" },
            return_url: "https://shop.example/api/v1/payment/callback/zarinpal",
        });

        assert.equal(result.authority, "A000000000000000000000000000001");
        assert.equal(result.redirect_url, "https://payment.zarinpal.com/pg/StartPay/A000000000000000000000000000001");
        const [call] = fetchCalls();
        assert.equal(call.url, REQUEST_URL);
        assert.equal(call.method, "POST");
        assert.deepInclude(call.body as Record<string, unknown>, {
            amount: 1_250_000,
            callback_url: "https://shop.example/api/v1/payment/callback/zarinpal",
        });
    });

    test("callback parser maps OK/NOK and preserves authority", async ({ assert }) => {
        const request = {
            input(key: string) {
                return key === "Authority" ? "AUTH-1" : key === "Status" ? "OK" : undefined;
            },
        } as never;
        const parsed = zarinpalGateway.parseCallback({ request, settings: {} });
        assert.equal(parsed.authority, "AUTH-1");
        assert.equal(parsed.status, "success");
    });

    test("verify accepts provider codes 100/101 and returns transaction id", async ({ assert }) => {
        mockFetch({
            [VERIFY_URL]: {
                body: { data: { code: 100, ref_id: 987654, card_pan: "6037******1234" }, errors: [] },
            },
        });
        const attempt = new PaymentAttempt();
        attempt.amountMinor = 1_250_000;
        attempt.gatewayAuthority = "AUTH-VERIFY";
        const result = await zarinpalGateway.verify({
            attempt,
            callback: { authority: "AUTH-VERIFY", status: "success", payload: {} },
            settings: { merchant_id: "00000000-0000-0000-0000-000000000000" },
        });
        assert.isTrue(result.ok);
        if (result.ok) {
            assert.equal(result.transaction_id, "987654");
            assert.equal(result.amount_minor, 1_250_000);
        }
    });

    test("provider failure stays a typed adapter failure rather than false success", async ({ assert }) => {
        mockFetch({
            [VERIFY_URL]: {
                body: { data: { code: -51 }, errors: { message: "insufficient" } },
            },
        });
        const attempt = new PaymentAttempt();
        attempt.amountMinor = 500_000;
        attempt.gatewayAuthority = "AUTH-FAIL";
        const result = await zarinpalGateway.verify({
            attempt,
            callback: { authority: "AUTH-FAIL", status: "success", payload: {} },
            settings: { merchant_id: "merchant" },
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.equal(result.error_code, "zarinpal_-51");
    });
});
