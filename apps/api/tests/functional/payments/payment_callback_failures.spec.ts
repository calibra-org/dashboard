import { test } from "@japa/runner";

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
});
