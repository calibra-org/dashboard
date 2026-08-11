import { test } from "@japa/runner";

import Customer from "#models/customer";
import PaymentGateway from "#models/payment_gateway";
import User from "#models/user";
import { resetPhase08 } from "#tests/helpers/payments";

async function createAdmin(): Promise<User> {
    const user = await User.create({ email: "admin@calibra.dev", passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "A", lastName: "U", countryDefault: "IR" });
    return user;
}

async function createPlainUser(email: string): Promise<User> {
    const user = await User.create({ email, passwordHash: "Passw0rd1!", role: "customer", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "C", lastName: "U", countryDefault: "IR" });
    return user;
}

test.group("/api/v1/admin/payment-gateways", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
    });

    test("non-admin → 403", async ({ client }) => {
        const user = await createPlainUser("nope@calibra.dev");
        const response = await client.get("/api/v1/admin/payment-gateways").withGuard("api").loginAs(user);
        response.assertStatus(403);
    });

    test("admin GET reconciles the approved ten-method catalog without deleting legacy rows", async ({ client, assert }) => {
        const admin = await createAdmin();
        const response = await client.get("/api/v1/admin/payment-gateways").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const list = response.body().data as Array<{
            code: string;
            implementation_status: "stub" | "implemented" | "live";
            admin_visible: boolean;
        }>;
        const byCode = new Map(list.map((gateway) => [gateway.code, gateway]));
        for (const code of [
            "mellat",
            "sadad",
            "parsian",
            "zarinpal",
            "bitpay",
            "digipay",
            "snapppay",
            "azkivam",
            "card_to_card",
            "cod",
        ]) {
            assert.isTrue(Boolean(byCode.get(code)?.admin_visible), `${code} must be visible in the approved catalog`);
        }
        assert.equal(byCode.get("mellat")?.implementation_status, "implemented");
        assert.equal(byCode.get("parsian")?.implementation_status, "implemented");
        assert.equal(byCode.get("zarinpal")?.implementation_status, "implemented");
        assert.equal(byCode.get("sadad")?.implementation_status, "stub");
        assert.equal(byCode.get("cod")?.implementation_status, "live");
        assert.isFalse(byCode.get("bank_transfer")?.admin_visible ?? true);
    });

    test("Mellat merchant secrets are encrypted at rest and only masks come back over admin API", async ({ client, assert }) => {
        const admin = await createAdmin();
        const mellat = await PaymentGateway.findByOrFail("code", "mellat");
        const response = await client
            .patch(`/api/v1/admin/payment-gateways/${Number(mellat.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                enabled: true,
                settings: {
                    terminal_id: "1234567",
                    username: "merchant-user",
                    password: "merchant-password",
                },
            });

        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body().data as {
            enabled: boolean;
            settings: Record<string, string>;
            health_status: string;
        };
        assert.isTrue(body.enabled);
        assert.equal(body.health_status, "configured");
        assert.equal(body.settings.terminal_id, "***");
        assert.equal(body.settings.username, "***");
        assert.equal(body.settings.password, "***");

        const reloaded = await PaymentGateway.findOrFail(Number(mellat.id));
        const stored = reloaded.settings as Record<string, unknown>;
        assert.notProperty(stored, "terminal_id");
        assert.notProperty(stored, "username");
        assert.notProperty(stored, "password");
        assert.isString(stored.__credentials_ciphertext);
        assert.notInclude(String(stored.__credentials_ciphertext), "merchant-password");
    });

    test("mask sentinel preserves an already-configured secret while rotating another field", async ({ client, assert }) => {
        const admin = await createAdmin();
        const mellat = await PaymentGateway.findByOrFail("code", "mellat");
        await client
            .patch(`/api/v1/admin/payment-gateways/${Number(mellat.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ settings: { terminal_id: "111", username: "old-user", password: "old-pass" } });

        const rotate = await client
            .patch(`/api/v1/admin/payment-gateways/${Number(mellat.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ settings: { terminal_id: "***", username: "new-user", password: "***" } });
        rotate.assertStatus(200);
        const settings = (rotate.body().data as { settings: Record<string, string> }).settings;
        assert.equal(settings.terminal_id, "***");
        assert.equal(settings.username, "***");
        assert.equal(settings.password, "***");

        const enable = await client
            .patch(`/api/v1/admin/payment-gateways/${Number(mellat.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ enabled: true });
        enable.assertStatus(200);
    });

    test("implemented remote gateway cannot be enabled before required merchant credentials exist", async ({ client }) => {
        const admin = await createAdmin();
        const zarinpal = await PaymentGateway.findByOrFail("code", "zarinpal");
        const response = await client
            .patch(`/api/v1/admin/payment-gateways/${Number(zarinpal.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ enabled: true });
        response.assertStatus(422);
    });

    test("stub gateway stays fail-closed even if the operator supplies the expected-looking fields", async ({ client }) => {
        const admin = await createAdmin();
        const sadad = await PaymentGateway.findByOrFail("code", "sadad");
        const response = await client
            .patch(`/api/v1/admin/payment-gateways/${Number(sadad.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                enabled: true,
                settings: { merchant_id: "m", terminal_id: "t", terminal_key: "k" },
            });
        response.assertStatus(422);
    });

    test("PATCH that only changes non-secret settings leaves an enabled live gateway alone", async ({ client, assert }) => {
        const admin = await createAdmin();
        const cod = await PaymentGateway.findByOrFail("code", "cod");
        assert.isTrue(cod.enabled);
        const response = await client
            .patch(`/api/v1/admin/payment-gateways/${Number(cod.id)}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ settings: { customer_note: "پرداخت هنگام تحویل" } });
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const reloaded = await PaymentGateway.findOrFail(Number(cod.id));
        assert.isTrue(reloaded.enabled);
        assert.equal((reloaded.settings as Record<string, unknown>).customer_note, "پرداخت هنگام تحویل");
    });
});
