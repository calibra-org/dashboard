import { test } from "@japa/runner";

import Customer from "#models/customer";
import PaymentGateway from "#models/payment_gateway";
import User from "#models/user";
import { mockFetch, unmockFetch } from "#tests/helpers/mock_fetch";
import { resetPhase08 } from "#tests/helpers/payments";

const ZARINPAL_REQUEST = "https://payment.zarinpal.com/pg/v4/payment/request.json";

async function createAdmin(): Promise<User> {
    const user = await User.create({
        email: `gateway-verify-${Date.now()}@calibra.dev`,
        passwordHash: "Passw0rd1!",
        role: "admin",
        locale: "fa",
    });
    await Customer.create({ userId: user.id, firstName: "Gateway", lastName: "Admin", countryDefault: "IR" });
    return user;
}

test.group("payment gateway connection verification", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
    });

    group.each.teardown(() => unmockFetch());

    test("configured ZarinPal becomes healthy only after a real provider-backed verify request", async ({ client, assert }) => {
        const admin = await createAdmin();
        const gateway = await PaymentGateway.findByOrFail("code", "zarinpal");

        const configured = await client
            .patch(`/api/v1/admin/payment-gateways/${Number(gateway.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ settings: { merchant_id: "00000000-0000-0000-0000-000000000001" } });
        configured.assertStatus(200);
        assert.equal(configured.body().data.health_status, "configured");
        assert.isFalse(configured.body().data.enabled);

        mockFetch({
            [ZARINPAL_REQUEST]: {
                status: 200,
                body: { data: { code: 100, authority: "A000000000000000000000000000000001" }, errors: [] },
            },
        });

        const verified = await client
            .post(`/api/v1/admin/payment-gateways/${Number(gateway.id)}/verify`)
            .withGuard("api")
            .loginAs(admin);
        verified.assertStatus(200);
        assert.equal(verified.body().data.health_status, "healthy");
        assert.isString(verified.body().data.last_verified_at);
        assert.isFalse(verified.body().data.enabled);

        const enabled = await client
            .patch(`/api/v1/admin/payment-gateways/${Number(gateway.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ enabled: true });
        enabled.assertStatus(200);
        assert.isTrue(enabled.body().data.enabled);
        assert.equal(enabled.body().data.health_status, "healthy");
    });

    test("provider rejection persists error health and keeps the gateway disabled", async ({ client, assert }) => {
        const admin = await createAdmin();
        const gateway = await PaymentGateway.findByOrFail("code", "zarinpal");

        await client
            .patch(`/api/v1/admin/payment-gateways/${Number(gateway.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ settings: { merchant_id: "invalid-merchant" } });

        mockFetch({
            [ZARINPAL_REQUEST]: {
                status: 422,
                body: { data: {}, errors: { code: -9, message: "validation error" } },
            },
        });

        const response = await client
            .post(`/api/v1/admin/payment-gateways/${Number(gateway.id)}/verify`)
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(422);

        const reloaded = await PaymentGateway.findOrFail(Number(gateway.id));
        const attrs = (reloaded.attributes ?? {}) as Record<string, unknown>;
        assert.equal(attrs.health_status, "error");
        assert.isFalse(reloaded.enabled);
        assert.match(String(attrs.last_error), /^provider_rejected_/);
        assert.notInclude(JSON.stringify(attrs), "invalid-merchant");
    });

    test("stub providers cannot be connection-verified", async ({ client }) => {
        const admin = await createAdmin();
        const gateway = await PaymentGateway.findByOrFail("code", "sadad");
        const response = await client
            .post(`/api/v1/admin/payment-gateways/${Number(gateway.id)}/verify`)
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(422);
    });
});
