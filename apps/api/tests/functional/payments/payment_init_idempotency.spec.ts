import { test } from "@japa/runner";

import Order from "#models/order";
import PaymentAttempt from "#models/payment_attempt";
import PaymentGateway from "#models/payment_gateway";
import { paymentService } from "#services/payment_service";
import { createTaxableProduct } from "#tests/helpers/cart";
import { iranRegionId } from "#tests/helpers/orders";
import { resetPhase08 } from "#tests/helpers/payments";

function tokenFromResponse(response: { cookie(name: string): { value: unknown } | undefined }): string {
    const cookie = response.cookie("cart_token");
    if (!cookie || typeof cookie.value !== "string") throw new Error("expected cart_token");
    return cookie.value;
}

async function submitCodOrder(client: any, email: string): Promise<Order> {
    const product = await createTaxableProduct({ regularPrice: 1_000_000 });
    const regionId = await iranRegionId();
    const gateway = await PaymentGateway.findByOrFail("code", "cod");
    const seeded = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
    const token = tokenFromResponse(seeded);
    await client
        .post("/api/v1/cart/customer")
        .cookie("cart_token", token)
        .json({ country: "IR", region_id: regionId, postcode: "1234567890" });
    await client
        .put("/api/v1/checkout")
        .cookie("cart_token", token)
        .json({
            billing_address: {
                first_name: "Pay",
                last_name: "Test",
                address_line_1: "Vali-Asr 1",
                city: "Tehran",
                country: "IR",
                region_id: regionId,
                postcode: "1234567890",
                phone: "+989121234567",
                email,
            },
            payment_gateway_id: Number(gateway.id),
        });
    const submitted = await client.post("/api/v1/checkout/submit").cookie("cart_token", token);
    submitted.assertStatus(200);
    return Order.findOrFail(Number(submitted.body().data.id));
}

test.group("Payment init idempotency", (group) => {
    group.each.setup(async () => {
        await resetPhase08();
    });

    test("same key on the same order replays one attempt", async ({ client, assert }) => {
        const order = await submitCodOrder(client, "same-order@example.test");
        const gateway = await PaymentGateway.findByOrFail("code", "cod");

        // checkout/submit already created the first COD attempt. Use a fresh key to exercise the
        // service's explicit init replay contract without depending on checkout-submit idempotency.
        const first = await paymentService.init(order, gateway.id, "payment-init-same-order");
        const second = await paymentService.init(order, gateway.id, "payment-init-same-order");

        assert.equal(Number(first.attempt.id), Number(second.attempt.id));
        const rows = await PaymentAttempt.query()
            .where("order_id", Number(order.id))
            .where("idempotency_key", "payment-init-same-order");
        assert.lengthOf(rows, 1);
    });

    test("same key can be reused by unrelated orders", async ({ client, assert }) => {
        const firstOrder = await submitCodOrder(client, "first-order@example.test");
        const secondOrder = await submitCodOrder(client, "second-order@example.test");
        const gateway = await PaymentGateway.findByOrFail("code", "cod");
        const key = "payment-init-reusable-key";

        const first = await paymentService.init(firstOrder, gateway.id, key);
        const second = await paymentService.init(secondOrder, gateway.id, key);

        assert.notEqual(Number(first.attempt.id), Number(second.attempt.id));
        const rows = await PaymentAttempt.query().where("idempotency_key", key);
        assert.lengthOf(rows, 2);
    });

    test("rejects overlong keys before creating an attempt", async ({ client, assert }) => {
        const order = await submitCodOrder(client, "long-key@example.test");
        const gateway = await PaymentGateway.findByOrFail("code", "cod");
        const before = await PaymentAttempt.query().where("order_id", Number(order.id));

        await assert.rejects(
            () => paymentService.init(order, gateway.id, "x".repeat(65)),
            /Idempotency-Key must be at most 64 characters/,
        );

        const after = await PaymentAttempt.query().where("order_id", Number(order.id));
        assert.lengthOf(after, before.length);
    });
});
