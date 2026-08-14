import { test } from "@japa/runner";

import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";

async function adminUser() {
    const admin = await UserFactory.apply("admin").create();
    await Customer.create({ userId: admin.id, firstName: "Phase", lastName: "Five", countryDefault: "IR", isPayingCustomer: false });
    return admin;
}

async function processingOrder(quantity = 2) {
    const product = await createTaxableProduct({ regularPrice: 1_000_000 });
    const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity, price: 1_000_000 });
    return { product, order };
}

test.group("Phase 5 order operations", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("requires authentication and admin role", async ({ client }) => {
        const anonymous = await client.get("/api/v1/admin/orders/operations/summary");
        anonymous.assertStatus(401);

        const user = await UserFactory.create();
        const forbidden = await client.get("/api/v1/admin/orders/operations/summary").loginAs(user);
        forbidden.assertStatus(403);
    });

    test("creates partial fulfillments idempotently and blocks over-fulfillment", async ({ client, assert }) => {
        const admin = await adminUser();
        const { order } = await processingOrder(2);
        await client.post(`/api/v1/admin/orders/${order.id}/status`).loginAs(admin).json({ to_status: "pending" });
        await client.post(`/api/v1/admin/orders/${order.id}/status`).loginAs(admin).json({ to_status: "processing" });

        const details = await client.get(`/api/v1/admin/orders/${order.id}/operations`).loginAs(admin);
        details.assertStatus(200);
        const lineId = Number(details.body().data.lines[0].id);

        const first = await client
            .post(`/api/v1/admin/orders/${order.id}/fulfillments`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-partial-1")
            .json({ items: [{ order_line_item_id: lineId, quantity: 1 }] });
        first.assertStatus(201);
        assert.equal(first.body().data.items[0].quantity, 1);

        const replay = await client
            .post(`/api/v1/admin/orders/${order.id}/fulfillments`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-partial-1")
            .json({ items: [{ order_line_item_id: lineId, quantity: 1 }] });
        replay.assertStatus(201);
        assert.equal(replay.body().data.id, first.body().data.id);

        const mismatch = await client
            .post(`/api/v1/admin/orders/${order.id}/fulfillments`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-partial-1")
            .json({ items: [{ order_line_item_id: lineId, quantity: 2 }] });
        mismatch.assertStatus(409);

        const over = await client
            .post(`/api/v1/admin/orders/${order.id}/fulfillments`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-over")
            .json({ items: [{ order_line_item_id: lineId, quantity: 2 }] });
        over.assertStatus(409);
    });

    test("records shipment events and completes only after delivered fulfillment quantities cover the order", async ({ client, assert }) => {
        const admin = await adminUser();
        const { order } = await processingOrder(1);
        await client.post(`/api/v1/admin/orders/${order.id}/status`).loginAs(admin).json({ to_status: "pending" });
        await client.post(`/api/v1/admin/orders/${order.id}/status`).loginAs(admin).json({ to_status: "processing" });
        const details = await client.get(`/api/v1/admin/orders/${order.id}/operations`).loginAs(admin);
        const lineId = Number(details.body().data.lines[0].id);

        const fulfillment = await client
            .post(`/api/v1/admin/orders/${order.id}/fulfillments`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-delivery")
            .json({ items: [{ order_line_item_id: lineId, quantity: 1 }] });
        const fulfillmentId = Number(fulfillment.body().data.id);

        const packed = await client.post(`/api/v1/admin/fulfillments/${fulfillmentId}/transition`).loginAs(admin).json({ status: "packed", expected_version: 1 });
        packed.assertStatus(200);

        const shipment = await client.post(`/api/v1/admin/fulfillments/${fulfillmentId}/shipments`).loginAs(admin).json({ carrier: "post", tracking_number: "PHASE5-1" });
        shipment.assertStatus(201);
        const shipmentId = Number(shipment.body().data.id);

        const inTransit = await client.post(`/api/v1/admin/shipments/${shipmentId}/events`).loginAs(admin).json({ status: "in_transit", expected_version: 1, message: "accepted" });
        inTransit.assertStatus(201);
        const delivered = await client.post(`/api/v1/admin/shipments/${shipmentId}/events`).loginAs(admin).json({ status: "delivered", expected_version: 2, message: "delivered" });
        delivered.assertStatus(201);

        const shipped = await client.post(`/api/v1/admin/fulfillments/${fulfillmentId}/transition`).loginAs(admin).json({ status: "shipped", expected_version: 2 });
        shipped.assertStatus(200);
        const final = await client.post(`/api/v1/admin/fulfillments/${fulfillmentId}/transition`).loginAs(admin).json({ status: "delivered", expected_version: 3 });
        final.assertStatus(200);

        const after = await client.get(`/api/v1/admin/orders/${order.id}`).loginAs(admin);
        after.assertStatus(200);
        assert.equal(after.body().data.status, "completed");
    });
});
