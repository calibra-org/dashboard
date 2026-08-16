import { test } from "@japa/runner";

import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";

async function adminUser() {
    const admin = await UserFactory.apply("admin").create();
    await Customer.create({
        userId: admin.id,
        firstName: "Phase",
        lastName: "Five Hardening",
        countryDefault: "IR",
        isPayingCustomer: false,
    });
    return admin;
}

async function processingOrder(quantity: number) {
    const product = await createTaxableProduct({ regularPrice: 1_000_000 });
    const order = await makeDraftOrder({
        customerId: null,
        productId: Number(product.id),
        quantity,
        price: 1_000_000,
    });
    return { product, order };
}

async function moveToProcessing(
    client: import("@japa/api-client").ApiClient,
    admin: Awaited<ReturnType<typeof adminUser>>,
    orderId: number,
) {
    const pending = await client.post(`/api/v1/admin/orders/${orderId}/status`).loginAs(admin).json({ to_status: "pending" });
    pending.assertStatus(200);
    const processing = await client
        .post(`/api/v1/admin/orders/${orderId}/status`)
        .loginAs(admin)
        .json({ to_status: "processing" });
    processing.assertStatus(200);
}

async function lineIdFor(
    client: import("@japa/api-client").ApiClient,
    admin: Awaited<ReturnType<typeof adminUser>>,
    orderId: number,
): Promise<number> {
    const details = await client.get(`/api/v1/admin/orders/${orderId}/operations`).loginAs(admin);
    details.assertStatus(200);
    return Number(details.body().data.lines[0].id);
}

async function deliverLine(
    client: import("@japa/api-client").ApiClient,
    admin: Awaited<ReturnType<typeof adminUser>>,
    orderId: number,
    lineId: number,
    quantity: number,
) {
    const fulfillment = await client
        .post(`/api/v1/admin/orders/${orderId}/fulfillments`)
        .loginAs(admin)
        .header("Idempotency-Key", `phase5-hardening-delivery-${orderId}-${quantity}`)
        .json({ items: [{ order_line_item_id: lineId, quantity }] });
    fulfillment.assertStatus(201);
    const fulfillmentId = Number(fulfillment.body().data.id);

    const packed = await client
        .post(`/api/v1/admin/fulfillments/${fulfillmentId}/transition`)
        .loginAs(admin)
        .json({ status: "packed", expected_version: 1 });
    packed.assertStatus(200);

    const shipment = await client
        .post(`/api/v1/admin/fulfillments/${fulfillmentId}/shipments`)
        .loginAs(admin)
        .json({ carrier: "post", tracking_number: `HARDEN-${orderId}` });
    shipment.assertStatus(201);
    const shipmentId = Number(shipment.body().data.id);

    const transit = await client
        .post(`/api/v1/admin/shipments/${shipmentId}/events`)
        .loginAs(admin)
        .json({ status: "in_transit", expected_version: 1 });
    transit.assertStatus(201);

    const delivered = await client
        .post(`/api/v1/admin/shipments/${shipmentId}/events`)
        .loginAs(admin)
        .json({ status: "delivered", expected_version: 2 });
    delivered.assertStatus(201);
}

test.group("Phase 5 hardening", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("rejects fractional fulfillment quantities", async ({ client }) => {
        const admin = await adminUser();
        const { order } = await processingOrder(2);
        await moveToProcessing(client, admin, Number(order.id));
        const lineId = await lineIdFor(client, admin, Number(order.id));

        const response = await client
            .post(`/api/v1/admin/orders/${order.id}/fulfillments`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-fractional-quantity")
            .json({ items: [{ order_line_item_id: lineId, quantity: 1.5 }] });
        response.assertStatus(422);
    });

    test("rejects non-web tracking URLs on new and legacy shipment paths", async ({ client }) => {
        const admin = await adminUser();
        const { order } = await processingOrder(1);
        await moveToProcessing(client, admin, Number(order.id));
        const lineId = await lineIdFor(client, admin, Number(order.id));

        const fulfillment = await client
            .post(`/api/v1/admin/orders/${order.id}/fulfillments`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-url-scheme")
            .json({ items: [{ order_line_item_id: lineId, quantity: 1 }] });
        fulfillment.assertStatus(201);

        const unsafeShipment = await client
            .post(`/api/v1/admin/fulfillments/${fulfillment.body().data.id}/shipments`)
            .loginAs(admin)
            .json({ tracking_url: "ftp://carrier.example/track/unsafe" });
        unsafeShipment.assertStatus(422);

        const unsafeLegacy = await client
            .post(`/api/v1/admin/orders/${order.id}/mark-shipped`)
            .loginAs(admin)
            .json({ tracking_url: "ftp://carrier.example/track/legacy", notify_customer: false });
        unsafeLegacy.assertStatus(422);
    });

    test("requires the final RMA receipt to account for every approved unit", async ({ client, assert }) => {
        const admin = await adminUser();
        const { order } = await processingOrder(2);
        await moveToProcessing(client, admin, Number(order.id));
        const lineId = await lineIdFor(client, admin, Number(order.id));
        await deliverLine(client, admin, Number(order.id), lineId, 2);

        const created = await client
            .post(`/api/v1/admin/orders/${order.id}/returns`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-final-receipt")
            .json({ items: [{ order_line_item_id: lineId, quantity: 2 }], reason: "wrong item" });
        created.assertStatus(201);
        const returnId = Number(created.body().data.id);

        const approved = await client
            .post(`/api/v1/admin/returns/${returnId}/approve`)
            .loginAs(admin)
            .json({ expected_version: 1, items: [{ order_line_item_id: lineId, approved_quantity: 2 }] });
        approved.assertStatus(200);

        const partialReceipt = await client
            .post(`/api/v1/admin/returns/${returnId}/receive`)
            .loginAs(admin)
            .json({
                expected_version: 2,
                items: [{ order_line_item_id: lineId, received_quantity: 1, damaged_quantity: 0, restock_quantity: 1 }],
            });
        partialReceipt.assertStatus(422);

        const finalReceipt = await client
            .post(`/api/v1/admin/returns/${returnId}/receive`)
            .loginAs(admin)
            .json({
                expected_version: 2,
                items: [{ order_line_item_id: lineId, received_quantity: 2, damaged_quantity: 0, restock_quantity: 2 }],
            });
        finalReceipt.assertStatus(200);
        assert.equal(finalReceipt.body().data.status, "received");
    });

    test("serializes concurrent RMA creation against delivered quantity", async ({ client, assert }) => {
        const admin = await adminUser();
        const { order } = await processingOrder(2);
        await moveToProcessing(client, admin, Number(order.id));
        const lineId = await lineIdFor(client, admin, Number(order.id));
        await deliverLine(client, admin, Number(order.id), lineId, 1);

        const createReturn = (key: string) =>
            client
                .post(`/api/v1/admin/orders/${order.id}/returns`)
                .loginAs(admin)
                .header("Idempotency-Key", key)
                .json({ items: [{ order_line_item_id: lineId, quantity: 1 }], reason: "concurrent returnability check" });

        const [first, second] = await Promise.all([
            createReturn("phase5-concurrent-return-a"),
            createReturn("phase5-concurrent-return-b"),
        ]);
        const statuses = [first.status(), second.status()].sort((a, b) => a - b);
        assert.deepEqual(statuses, [201, 409]);
    });

    test("does not silently turn an explicit zero RMA refund into a full refund", async ({ client, assert }) => {
        const admin = await adminUser();
        const { order } = await processingOrder(1);
        await moveToProcessing(client, admin, Number(order.id));
        const lineId = await lineIdFor(client, admin, Number(order.id));
        await deliverLine(client, admin, Number(order.id), lineId, 1);

        const created = await client
            .post(`/api/v1/admin/orders/${order.id}/returns`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-zero-refund")
            .json({
                items: [{ order_line_item_id: lineId, quantity: 1, refund_amount_minor: 0 }],
                reason: "no financial credit",
            });
        created.assertStatus(201);
        const returnId = Number(created.body().data.id);

        const approved = await client
            .post(`/api/v1/admin/returns/${returnId}/approve`)
            .loginAs(admin)
            .json({ expected_version: 1, items: [{ order_line_item_id: lineId, approved_quantity: 1 }] });
        approved.assertStatus(200);

        const received = await client
            .post(`/api/v1/admin/returns/${returnId}/receive`)
            .loginAs(admin)
            .json({
                expected_version: 2,
                items: [{ order_line_item_id: lineId, received_quantity: 1, damaged_quantity: 1, restock_quantity: 0 }],
            });
        received.assertStatus(200);

        const refund = await client.post(`/api/v1/admin/returns/${returnId}/refund`).loginAs(admin).json({ expected_version: 3 });
        refund.assertStatus(422);

        const refunds = await client.get(`/api/v1/admin/orders/${order.id}/refunds`).loginAs(admin);
        refunds.assertStatus(200);
        assert.equal(refunds.body().data.length, 0);
    });
});
