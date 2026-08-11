import { test } from "@japa/runner";

import PaymentGateway from "#models/payment_gateway";
import { paymentAdapterRegistry } from "#services/payment_adapter_registry";
import { resetPhase08 } from "#tests/helpers/payments";

test.group("PaymentAdapterRegistry", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
    });

    test("resolves every approved and legacy gateway code", async ({ assert }) => {
        const codes = [
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
            "idpay",
            "nextpay",
            "payir",
            "zibal",
            "bank_transfer",
        ];
        for (const code of codes) assert.equal(paymentAdapterRegistry.get(code).code, code);
    });

    test("unknown code throws GatewayNotConfigured", async ({ assert }) => {
        assert.throws(() => paymentAdapterRegistry.get("not_a_real_gateway"), /not_a_real_gateway/);
    });

    test("concrete provider adapters advertise redirect capability", async ({ assert }) => {
        for (const code of ["mellat", "parsian", "zarinpal"]) {
            assert.deepEqual(paymentAdapterRegistry.get(code).capabilities, {
                redirect: true,
                refunds: false,
                partial_refunds: false,
            });
        }
    });

    test("stub catalog method stays fail-closed even if its database row is forced enabled", async ({ assert }) => {
        const sadad = await PaymentGateway.findByOrFail("code", "sadad");
        sadad.enabled = true;
        await sadad.save();

        await assert.rejects(() => paymentAdapterRegistry.resolveForCode("sadad"), /not yet implemented/);
        await assert.rejects(() => paymentAdapterRegistry.resolveForGatewayId(sadad.id), /not yet implemented/);
    });

    test("implemented provider is resolvable after tenant enables it", async ({ assert }) => {
        const zarinpal = await PaymentGateway.findByOrFail("code", "zarinpal");
        zarinpal.enabled = true;
        await zarinpal.save();
        const result = await paymentAdapterRegistry.resolveForCode("zarinpal");
        assert.equal(result.adapter.code, "zarinpal");
        assert.equal(result.gateway.code, "zarinpal");
    });

    test("disabled live gateway throws GatewayNotConfigured", async ({ assert }) => {
        const cod = await PaymentGateway.findByOrFail("code", "cod");
        cod.enabled = false;
        await cod.save();
        await assert.rejects(() => paymentAdapterRegistry.resolveForCode("cod"), /disabled/);
        await assert.rejects(() => paymentAdapterRegistry.resolveForGatewayId(cod.id), /disabled/);
    });

    test("resolveForCode returns adapter + gateway row for a live, enabled gateway", async ({ assert }) => {
        const result = await paymentAdapterRegistry.resolveForCode("cod");
        assert.equal(result.adapter.code, "cod");
        assert.equal(result.gateway.code, "cod");
        assert.isTrue(result.gateway.enabled);
    });
});
