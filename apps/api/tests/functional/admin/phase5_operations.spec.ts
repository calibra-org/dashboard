import { test } from "@japa/runner";
import db from "@adonisjs/lucid/services/db";

import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder, resetPhase05 } from "#tests/helpers/orders";

async function adminUser() {
    const admin = await UserFactory.apply("admin").create();
    await Customer.create({
        userId: admin.id,
        firstName: "Phase",
        lastName: "Five",
        countryDefault: "IR",
        isPayingCustomer: false,
    });
    return admin;
}

async function processingOrder(quantity = 2) {
    const product = await createTaxableProduct({ regularPrice: 1_000_000 });
    const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity, price: 1_000_000 });
    return { product, order };
}

async function moveToProcessing(
    client: import("@japa/api-client").ApiClient,
    admin: Awaited<ReturnType<typeof adminUser>>,
    orderId: number,
) {
    await client.post(`/api/v1/admin/orders/${orderId}/status`).loginAs(admin).json({ to_status: "pending" });
    await client.post(`/api/v1/admin/orders/${orderId}/status`).loginAs(admin).json({ to_status: "processing" });
}

async function deliverSingleLine(
    client: import("@japa/api-client").ApiClient,
    admin: Awaited<ReturnType<typeof adminUser>>,
    orderId: number,
    lineId: number,
) {
    const fulfillment = await client
        .post(`/api/v1/admin/orders/${orderId}/fulfillments`)
        .loginAs(admin)
        .header("Idempotency-Key", `phase5-delivery-${orderId}`)
        .json({ items: [{ order_line_item_id: lineId, quantity: 1 }] });
    fulfillment.assertStatus(201);
    const fulfillmentId = Number(fulfillment.body().data.id);
    await client
        .post(`/api/v1/admin/fulfillments/${fulfillmentId}/transition`)
        .loginAs(admin)
        .json({ status: "packed", expected_version: 1 });
    const shipment = await client
        .post(`/api/v1/admin/fulfillments/${fulfillmentId}/shipments`)
        .loginAs(admin)
        .json({ carrier: "post", tracking_number: `PHASE5-${orderId}` });
    shipment.assertStatus(201);
    const shipmentId = Number(shipment.body().data.id);
    await client
        .post(`/api/v1/admin/shipments/${shipmentId}/events`)
        .loginAs(admin)
        .json({ status: "in_transit", expected_version: 1, message: "accepted" });
    const delivered = await client
        .post(`/api/v1/admin/shipments/${shipmentId}/events`)
        .loginAs(admin)
        .json({ status: "delivered", expected_version: 2, message: "delivered" });
    delivered.assertStatus(201);
    return { fulfillmentId, shipmentId };
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
        await moveToProcessing(client, admin, Number(order.id));

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

    test("records shipment events and completes only after delivered fulfillment quantities cover the order", async ({
        client,
        assert,
    }) => {
        const admin = await adminUser();
        const { order } = await processingOrder(1);
        await moveToProcessing(client, admin, Number(order.id));
        const details = await client.get(`/api/v1/admin/orders/${order.id}/operations`).loginAs(admin);
        const lineId = Number(details.body().data.lines[0].id);

        await deliverSingleLine(client, admin, Number(order.id), lineId);

        const after = await client.get(`/api/v1/admin/orders/${order.id}`).loginAs(admin);
        after.assertStatus(200);
        assert.equal(after.body().data.status, "completed");

        const operations = await client.get(`/api/v1/admin/orders/${order.id}/operations`).loginAs(admin);
        operations.assertStatus(200);
        assert.equal(operations.body().data.fulfillments[0].status, "delivered");
        assert.equal(operations.body().data.fulfillments[0].shipments[0].events.length, 3);
        assert.equal(operations.body().data.lines[0].returnable_quantity, 1);
    });

    test("routes legacy mark-shipped through fulfillment without double-decrementing reserved stock", async ({
        client,
        assert,
    }) => {
        const admin = await adminUser();
        const { product, order } = await processingOrder(1);
        await moveToProcessing(client, admin, Number(order.id));

        const reserved = await db.from("inventory_items").where("product_id", product.id).whereNull("variation_id").first();
        assert.equal(Number(reserved?.stock_quantity), 99);

        const shipped = await client
            .post(`/api/v1/admin/orders/${order.id}/mark-shipped`)
            .loginAs(admin)
            .json({ carrier: "post", tracking_number: "LEGACY-PHASE5", notify_customer: false });
        shipped.assertStatus(200);
        assert.equal(shipped.body().data.status, "processing");

        const operations = await client.get(`/api/v1/admin/orders/${order.id}/operations`).loginAs(admin);
        operations.assertStatus(200);
        assert.equal(operations.body().data.fulfillments.length, 1);
        assert.equal(operations.body().data.fulfillments[0].status, "shipped");
        assert.equal(operations.body().data.fulfillments[0].shipments[0].status, "in_transit");

        const after = await db.from("inventory_items").where("product_id", product.id).whereNull("variation_id").first();
        assert.equal(Number(after?.stock_quantity), 99);
    });

    test("blocks returns before delivery and keeps create retries idempotent after delivery", async ({ client, assert }) => {
        const admin = await adminUser();
        const { order } = await processingOrder(1);
        await moveToProcessing(client, admin, Number(order.id));
        const details = await client.get(`/api/v1/admin/orders/${order.id}/operations`).loginAs(admin);
        const lineId = Number(details.body().data.lines[0].id);

        const early = await client
            .post(`/api/v1/admin/orders/${order.id}/returns`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-rma-1")
            .json({ items: [{ order_line_item_id: lineId, quantity: 1 }], reason: "damaged" });
        early.assertStatus(409);

        await deliverSingleLine(client, admin, Number(order.id), lineId);

        const excessiveMoney = await client
            .post(`/api/v1/admin/orders/${order.id}/returns`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-rma-too-much")
            .json({ items: [{ order_line_item_id: lineId, quantity: 1, refund_amount_minor: 1_000_001 }], reason: "damaged" });
        excessiveMoney.assertStatus(422);

        const created = await client
            .post(`/api/v1/admin/orders/${order.id}/returns`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-rma-1")
            .json({ items: [{ order_line_item_id: lineId, quantity: 1 }], reason: "damaged" });
        created.assertStatus(201);
        assert.equal(created.body().data.items[0].refund_amount_minor, 1_000_000);

        const replay = await client
            .post(`/api/v1/admin/orders/${order.id}/returns`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-rma-1")
            .json({ items: [{ order_line_item_id: lineId, quantity: 1 }], reason: "damaged" });
        replay.assertStatus(201);
        assert.equal(replay.body().data.id, created.body().data.id);
    });

    test("receives an RMA, restocks once, and hands the financial refund to RefundService", async ({ client, assert }) => {
        const admin = await adminUser();
        const { product, order } = await processingOrder(1);
        await moveToProcessing(client, admin, Number(order.id));
        const details = await client.get(`/api/v1/admin/orders/${order.id}/operations`).loginAs(admin);
        const lineId = Number(details.body().data.lines[0].id);
        await deliverSingleLine(client, admin, Number(order.id), lineId);

        const created = await client
            .post(`/api/v1/admin/orders/${order.id}/returns`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-rma-refund")
            .json({ items: [{ order_line_item_id: lineId, quantity: 1 }], reason: "wrong item" });
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
                items: [{ order_line_item_id: lineId, received_quantity: 1, damaged_quantity: 0, restock_quantity: 1 }],
            });
        received.assertStatus(200);

        const inventory = await db.from("inventory_items").where("product_id", product.id).whereNull("variation_id").first();
        assert.equal(Number(inventory?.stock_quantity), 100);

        const refunded = await client
            .post(`/api/v1/admin/returns/${returnId}/refund`)
            .loginAs(admin)
            .json({ expected_version: 3, reason: "approved RMA" });
        refunded.assertStatus(200);
        assert.equal(refunded.body().data.status, "completed");
        assert.isNumber(refunded.body().data.refund_id);

        const refunds = await client.get(`/api/v1/admin/orders/${order.id}/refunds`).loginAs(admin);
        refunds.assertStatus(200);
        assert.equal(refunds.body().data.length, 1);
        assert.equal(refunds.body().data[0].amount_minor, 1_000_000);
    });

    test("blocks order cancellation while a non-cancelled fulfillment exists", async ({ client }) => {
        const admin = await adminUser();
        const { order } = await processingOrder(1);
        await moveToProcessing(client, admin, Number(order.id));
        const details = await client.get(`/api/v1/admin/orders/${order.id}/operations`).loginAs(admin);
        const lineId = Number(details.body().data.lines[0].id);
        const fulfillment = await client
            .post(`/api/v1/admin/orders/${order.id}/fulfillments`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-cancel-guard")
            .json({ items: [{ order_line_item_id: lineId, quantity: 1 }] });
        fulfillment.assertStatus(201);

        const blocked = await client
            .post(`/api/v1/admin/orders/${order.id}/status`)
            .loginAs(admin)
            .json({ to_status: "cancelled", reason: "operator cancellation" });
        blocked.assertStatus(409);

        const fulfillmentId = Number(fulfillment.body().data.id);
        const cancelledFulfillment = await client
            .post(`/api/v1/admin/fulfillments/${fulfillmentId}/transition`)
            .loginAs(admin)
            .json({ status: "cancelled", expected_version: 1 });
        cancelledFulfillment.assertStatus(200);

        const cancelledOrder = await client
            .post(`/api/v1/admin/orders/${order.id}/status`)
            .loginAs(admin)
            .json({ to_status: "cancelled", reason: "operator cancellation" });
        cancelledOrder.assertStatus(200);
    });

    test("persists inventory adjustments and shipping/tax configuration through existing admin categories", async ({
        client,
        assert,
    }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const inventory = await db.from("inventory_items").where("product_id", product.id).whereNull("variation_id").first();
        const inventoryId = Number(inventory?.id);

        const adjustment = await client
            .post("/api/v1/admin/inventory/adjustments")
            .loginAs(admin)
            .json({ inventory_item_id: inventoryId, quantity_delta: 3, reason: "warehouse count" });
        adjustment.assertStatus(200);
        assert.equal(adjustment.body().data.item.stock_quantity, 103);
        assert.equal(adjustment.body().data.movements[0].kind, "adjustment");

        const zone = await client
            .post("/api/v1/admin/shipping/zones")
            .loginAs(admin)
            .json({ name: "Phase 5 test zone", locations: [{ type: "country", code: "TR" }] });
        zone.assertStatus(201);
        const zoneId = Number(zone.body().data.id);
        const zoneDetails = await client.get(`/api/v1/admin/shipping/zones/${zoneId}`).loginAs(admin);
        zoneDetails.assertStatus(200);
        assert.equal(zoneDetails.body().data.locations[0].code, "TR");
        const deletedZone = await client.delete(`/api/v1/admin/shipping/zones/${zoneId}`).loginAs(admin);
        deletedZone.assertStatus(204);

        const taxClass = await db.from("tax_classes").where("slug", "standard").first();
        const rate = await client
            .post("/api/v1/admin/tax/rates")
            .loginAs(admin)
            .json({ tax_class_id: Number(taxClass?.id), country: "TR", rate: 20, label: "Phase 5 VAT" });
        rate.assertStatus(201);
        const rateId = Number(rate.body().data.id);
        const updatedRate = await client
            .patch(`/api/v1/admin/tax/rates/${rateId}`)
            .loginAs(admin)
            .json({ rate: 18, applies_to_shipping: false });
        updatedRate.assertStatus(200);
        assert.equal(Number(updatedRate.body().data.rate), 18);
        const deletedRate = await client.delete(`/api/v1/admin/tax/rates/${rateId}`).loginAs(admin);
        deletedRate.assertStatus(204);
    });
});
