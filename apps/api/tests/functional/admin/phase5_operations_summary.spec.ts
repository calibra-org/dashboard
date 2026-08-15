import db from "@adonisjs/lucid/services/db";
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
        lastName: "Five Summary",
        countryDefault: "IR",
        isPayingCustomer: false,
    });
    return admin;
}

test.group("Phase 5 operations summary", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
    });

    test("keeps stale in-progress fulfillment visible and treats carrier returns as exceptions", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 1,
            price: 1_000_000,
        });

        const pending = await client
            .post(`/api/v1/admin/orders/${order.id}/status`)
            .loginAs(admin)
            .json({ to_status: "pending" });
        pending.assertStatus(200);
        const processing = await client
            .post(`/api/v1/admin/orders/${order.id}/status`)
            .loginAs(admin)
            .json({ to_status: "processing" });
        processing.assertStatus(200);

        await db
            .from("orders")
            .where("id", Number(order.id))
            .update({ date_paid_at: db.raw("now() - interval '25 hours'") });

        const operations = await client.get(`/api/v1/admin/orders/${order.id}/operations`).loginAs(admin);
        operations.assertStatus(200);
        const lineId = Number(operations.body().data.lines[0].id);
        const fulfillment = await client
            .post(`/api/v1/admin/orders/${order.id}/fulfillments`)
            .loginAs(admin)
            .header("Idempotency-Key", "phase5-summary-stale")
            .json({ items: [{ order_line_item_id: lineId, quantity: 1 }] });
        fulfillment.assertStatus(201);

        const beforeCarrierReturn = await client.get("/api/v1/admin/orders/operations/summary").loginAs(admin);
        beforeCarrierReturn.assertStatus(200);
        assert.equal(beforeCarrierReturn.body().data.paid_unfulfilled_over_24h, 1);

        const shipment = await client
            .post(`/api/v1/admin/fulfillments/${fulfillment.body().data.id}/shipments`)
            .loginAs(admin)
            .json({ carrier: "post", tracking_number: "RETURNED-PARCEL" });
        shipment.assertStatus(201);
        const returned = await client
            .post(`/api/v1/admin/shipments/${shipment.body().data.id}/events`)
            .loginAs(admin)
            .json({ status: "returned", expected_version: 1, message: "returned to sender" });
        returned.assertStatus(201);

        const afterCarrierReturn = await client.get("/api/v1/admin/orders/operations/summary").loginAs(admin);
        afterCarrierReturn.assertStatus(200);
        assert.equal(afterCarrierReturn.body().data.paid_unfulfilled_over_24h, 1);
        assert.equal(afterCarrierReturn.body().data.shipment_exceptions, 1);
    });
});
