import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import { PaymentAttemptStatus } from "#enums/payment_attempt_status";
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

    test("different key reuses an already-live PSP session instead of creating a second one", async ({ client, assert }) => {
        const order = await submitCodOrder(client, "active-session@example.test");
        const gateway = await PaymentGateway.findByOrFail("code", "cod");

        const active = new PaymentAttempt();
        active.orderId = order.id;
        active.gatewayId = gateway.id;
        active.gatewayCodeSnapshot = gateway.code;
        active.status = PaymentAttemptStatus.AwaitingCallback;
        active.amountMinor = Number(order.grandTotal);
        active.currency = order.currency;
        active.gatewayAuthority = "ACTIVE-AUTHORITY-0001";
        active.gatewayPayload = { redirect_url: "https://psp.example.test/session/ACTIVE-AUTHORITY-0001" };
        active.idempotencyKey = "first-browser-request";
        active.initiatedAt = DateTime.utc();
        await active.save();

        const before = await PaymentAttempt.query().where("order_id", Number(order.id));
        const replay = await paymentService.init(order, gateway.id, "different-browser-request");
        const after = await PaymentAttempt.query().where("order_id", Number(order.id));

        assert.equal(Number(replay.attempt.id), Number(active.id));
        assert.equal(replay.redirect_url, "https://psp.example.test/session/ACTIVE-AUTHORITY-0001");
        assert.lengthOf(after, before.length, "a second live PSP attempt must not be minted");
    });

    test("processing orders cannot be charged again with a new init", async ({ client, assert }) => {
        const order = await submitCodOrder(client, "already-processing@example.test");
        const gateway = await PaymentGateway.findByOrFail("code", "cod");
        order.status = OrderStatus.Processing;
        await order.save();
        const before = await PaymentAttempt.query().where("order_id", Number(order.id));

        await assert.rejects(() => paymentService.init(order, gateway.id, "charge-again"), /Order is no longer payable/);

        const after = await PaymentAttempt.query().where("order_id", Number(order.id));
        assert.lengthOf(after, before.length);
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
