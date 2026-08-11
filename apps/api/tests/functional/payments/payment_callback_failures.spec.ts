import lock from "@adonisjs/lock/services/main";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import Order from "#models/order";
import PaymentAttempt from "#models/payment_attempt";
import PaymentGateway from "#models/payment_gateway";
import SettingsService from "#services/settings_service";
import { resetPhase08 } from "#tests/helpers/payments";
import { runInTestTenant } from "#tests/helpers/tenant";

const FAILURE_URL = "https://shop.example.test/checkout/payment-failed?source=calibra";

test.group("Payment callback failure handling", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
        await runInTestTenant(async () => {
            const settings = new SettingsService();
            await settings.set("general", "checkout_return_url_failed", FAILURE_URL, "string");
        });
    });

    test("unknown payment authority uses configured failure URL and a stable public reason", async ({ client, assert }) => {
        const response = await client
            .get("/api/v1/payment/callback/zarinpal")
            .qs({ Authority: "A-NOT-IN-OUR-LEDGER-00000000000001", Status: "OK" })
            .redirects(0);

        assert.equal(response.response.status, 302);
        const location = response.header("location") as string;
        const redirect = new URL(location);
        assert.equal(`${redirect.origin}${redirect.pathname}`, "https://shop.example.test/checkout/payment-failed");
        assert.equal(redirect.searchParams.get("source"), "calibra");
        assert.equal(redirect.searchParams.get("reason"), "payment_attempt_not_found");
        assert.notInclude(location, "No%20matching%20payment%20attempt");
        assert.notInclude(location, "E_PAYMENT_ATTEMPT_NOT_FOUND");
    });

    test("stub callback keeps the public gateway_not_implemented reason on configured URL", async ({ client, assert }) => {
        const response = await client
            .get("/api/v1/payment/callback/sadad")
            .qs({ token: "ASTRAY00000000000000000000000001", status: "OK" })
            .redirects(0);

        assert.equal(response.response.status, 302);
        const redirect = new URL(response.header("location") as string);
        assert.equal(`${redirect.origin}${redirect.pathname}`, "https://shop.example.test/checkout/payment-failed");
        assert.equal(redirect.searchParams.get("reason"), "gateway_not_implemented");
    });

    test("callback refuses to race an in-flight refund/order mutation", async ({ client, assert }) => {
        const gateway = await PaymentGateway.findByOrFail("code", "zarinpal");
        const order = await Order.create({
            orderNumber: Date.now() % 1_000_000_000,
            orderKey: "wc_callback_lock_test",
            status: OrderStatus.Pending,
            currency: "IRR",
            currencyDisplay: "IRT",
            pricesIncludeTax: true,
            createdVia: "checkout",
            paymentGatewayIdSnapshot: gateway.id,
            paymentMethodCodeSnapshot: gateway.code,
            paymentMethodTitleSnapshot: gateway.code,
            itemsTotal: 1_000_000,
            grandTotal: 1_000_000,
        });
        const attempt = await PaymentAttempt.create({
            orderId: order.id,
            gatewayId: gateway.id,
            gatewayCodeSnapshot: gateway.code,
            status: PaymentAttemptStatus.AwaitingCallback,
            amountMinor: Number(order.grandTotal),
            currency: order.currency,
            gatewayAuthority: "A-CALLBACK-LOCK-000000000000000001",
            gatewayPayload: {},
            initiatedAt: DateTime.utc(),
        });
        order.lastPaymentAttemptId = attempt.id;
        await order.save();

        const [holderAcquired, callbackResponse] = await lock
            .createLock(`order:${Number(order.id)}`, "30s")
            .runImmediately(async () =>
                client
                    .get("/api/v1/payment/callback/zarinpal")
                    .qs({ Authority: attempt.gatewayAuthority, Status: "OK" })
                    .redirects(0),
            );

        assert.isTrue(holderAcquired);
        assert.equal(callbackResponse.response.status, 302);
        const redirect = new URL(callbackResponse.header("location") as string);
        assert.equal(redirect.searchParams.get("reason"), "concurrent_processing");

        const reloaded = await PaymentAttempt.findOrFail(Number(attempt.id));
        assert.equal(reloaded.status, PaymentAttemptStatus.AwaitingCallback, "contended callback must not mutate the attempt");
    });
});
