import { test } from "@japa/runner";

import { OrderStatus } from "#enums/order_status";
import Customer from "#models/customer";
import Order from "#models/order";
import PaymentGateway from "#models/payment_gateway";
import User from "#models/user";
import { createTaxableProduct } from "#tests/helpers/cart";
import { iranRegionId } from "#tests/helpers/orders";
import { resetPhase08 } from "#tests/helpers/payments";

/**
 * Stub PSPs stay visible for operators, but are unreachable through every money-moving surface.
 * Sadad is the representative approved-catalog stub in this suite; the shared
 * UnimplementedPspGateway contract covers the remaining locked providers.
 */

async function createAdmin(): Promise<User> {
    const user = await User.create({ email: "admin@calibra.dev", passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "A", lastName: "U", countryDefault: "IR" });
    return user;
}

interface CookieResp {
    cookie(name: string): { value: unknown } | undefined;
}
function tokenFromResponse(response: CookieResp): string {
    const cookie = response.cookie("cart_token");
    if (!cookie || typeof cookie.value !== "string") throw new Error("expected cart_token");
    return cookie.value;
}

test.group("Stub PSP gateways", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
    });

    test("admin PATCH refuses to flip a stub gateway to enabled with E_GATEWAY_NOT_IMPLEMENTED", async ({ client, assert }) => {
        const admin = await createAdmin();
        const sadad = await PaymentGateway.findByOrFail("code", "sadad");

        const response = await client
            .patch(`/api/v1/admin/payment-gateways/${Number(sadad.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ enabled: true });

        response.assertStatus(422);
        const body = response.body() as { errors: Array<{ code: string; gateway: string; phase: string }> };
        assert.equal(body.errors[0]?.code, "E_GATEWAY_NOT_IMPLEMENTED");
        assert.equal(body.errors[0]?.gateway, "sadad");
        assert.equal(body.errors[0]?.phase, "enable");

        const reloaded = await PaymentGateway.findOrFail(Number(sadad.id));
        assert.isFalse(reloaded.enabled, "stub gateway should still be disabled after the rejected PATCH");
    });

    test("admin PATCH accepts preparatory credentials on a stub but stores them encrypted and masked", async ({ client, assert }) => {
        const admin = await createAdmin();
        const sadad = await PaymentGateway.findByOrFail("code", "sadad");

        const response = await client
            .patch(`/api/v1/admin/payment-gateways/${Number(sadad.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                settings: {
                    merchant_id: "PREP-MERCHANT",
                    terminal_id: "PREP-TERMINAL",
                    terminal_key: "PREP-KEY",
                },
            });

        response.assertStatus(200);
        const responseSettings = (response.body().data as { settings: Record<string, unknown> }).settings;
        assert.equal(responseSettings.merchant_id, "***");
        assert.equal(responseSettings.terminal_id, "***");
        assert.equal(responseSettings.terminal_key, "***");

        const reloaded = await PaymentGateway.findOrFail(Number(sadad.id));
        assert.isFalse(reloaded.enabled, "stub gateway stays disabled even when credentials are prepared");
        const stored = reloaded.settings as Record<string, unknown>;
        assert.notProperty(stored, "merchant_id");
        assert.notProperty(stored, "terminal_id");
        assert.notProperty(stored, "terminal_key");
        assert.isString(stored.__credentials_ciphertext);
        assert.notInclude(String(stored.__credentials_ciphertext), "PREP-KEY");
    });

    test("storefront checkout selecting a stub gateway is rejected before reaching the adapter", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const regionId = await iranRegionId();
        const sadad = await PaymentGateway.findByOrFail("code", "sadad");

        const seeded = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(seeded);
        await client
            .post("/api/v1/cart/customer")
            .cookie("cart_token", token)
            .json({ country: "IR", region_id: regionId, postcode: "1234567890" });

        const setMethod = await client
            .put("/api/v1/checkout")
            .cookie("cart_token", token)
            .json({
                billing_address: {
                    first_name: "S",
                    last_name: "T",
                    address_line_1: "Vali-Asr 1",
                    city: "Tehran",
                    country: "IR",
                    region_id: regionId,
                    postcode: "1234567890",
                    phone: "+989121234567",
                    email: "t@example.test",
                },
                payment_gateway_id: Number(sadad.id),
            });

        setMethod.assertStatus(422);
        const body = setMethod.body() as { errors?: Array<{ code?: string; gateway?: string; phase?: string }> };
        assert.equal(body.errors?.[0]?.code, "E_GATEWAY_NOT_IMPLEMENTED");
        assert.equal(body.errors?.[0]?.gateway, "sadad");

        const processing = await Order.query().where("status", OrderStatus.Processing);
        assert.lengthOf(processing, 0, "no order should have transitioned to processing");
    });

    test("stray stub callback redirects to /checkout/failed?reason=gateway_not_implemented", async ({ client, assert }) => {
        const callback = await client
            .get("/api/v1/payment/callback/sadad")
            .qs({ token: "ASTRAY00000000000000000000000001", status: "OK" })
            .redirects(0);

        assert.equal(callback.response.status, 302);
        const location = callback.header("location") as string;
        assert.match(location, /checkout\/failed/);
        assert.match(location, /reason=gateway_not_implemented/);
    });
});
