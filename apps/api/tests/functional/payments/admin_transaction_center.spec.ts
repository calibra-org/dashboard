import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import Customer from "#models/customer";
import PaymentAttempt from "#models/payment_attempt";
import PaymentGateway from "#models/payment_gateway";
import User from "#models/user";
import { createTaxableProduct } from "#tests/helpers/cart";
import { makeDraftOrder } from "#tests/helpers/orders";
import { resetPhase08 } from "#tests/helpers/payments";

async function admin() {
    const user = await User.create({ email: "transactions@calibra.dev", passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "T", lastName: "Admin", countryDefault: "IR" });
    return user;
}

async function attempt(productId: number, status: PaymentAttemptStatus, authority: string, amountMinor: number) {
    const gateway = await PaymentGateway.findByOrFail("code", "zarinpal");
    const order = await makeDraftOrder({ productId, quantity: 1, price: amountMinor, gatewayId: Number(gateway.id) });
    return PaymentAttempt.create({
        orderId: order.id,
        gatewayId: gateway.id,
        gatewayCodeSnapshot: gateway.code,
        status,
        amountMinor,
        currency: "IRR",
        gatewayAuthority: authority,
        gatewayPayload: {},
        initiatedAt: DateTime.utc(),
    });
}

test.group("admin transaction center", (group) => {
    group.each.setup(resetPhase08);

    test("searches by PSP authority and numeric order id", async ({ client, assert }) => {
        const user = await admin();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const wanted = await attempt(Number(product.id), PaymentAttemptStatus.Verified, "A-UNIQUE-7788", 1_000_000);
        await attempt(Number(product.id), PaymentAttemptStatus.Failed, "A-OTHER", 2_000_000);

        const authority = await client.get("/api/v1/admin/payment-attempts").qs({ q: "UNIQUE-7788" }).withGuard("api").loginAs(user);
        authority.assertStatus(200);
        assert.equal(authority.body().meta.total, 1);
        assert.equal(authority.body().data[0].id, Number(wanted.id));

        const byOrder = await client.get("/api/v1/admin/payment-attempts").qs({ q: String(wanted.orderId) }).withGuard("api").loginAs(user);
        byOrder.assertStatus(200);
        assert.equal(byOrder.body().meta.total, 1);
        assert.equal(byOrder.body().data[0].order_id, Number(wanted.orderId));
    });

    test("returns status counts and canonical minor-unit totals", async ({ client, assert }) => {
        const user = await admin();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await attempt(Number(product.id), PaymentAttemptStatus.Verified, "A-1", 1_000_000);
        await attempt(Number(product.id), PaymentAttemptStatus.Verified, "A-2", 2_000_000);
        await attempt(Number(product.id), PaymentAttemptStatus.Failed, "A-3", 500_000);

        const response = await client.get("/api/v1/admin/payment-attempts/summary").withGuard("api").loginAs(user);
        response.assertStatus(200);
        const data = response.body().data;
        assert.equal(data.total_count, 3);
        assert.equal(data.total_amount_minor, 3_500_000);
        assert.equal(data.by_status.verified.count, 2);
        assert.equal(data.by_status.verified.amount_minor, 3_000_000);
        assert.equal(data.by_status.failed.count, 1);
    });

    test("summary remains admin-only", async ({ client }) => {
        const user = await User.create({ email: "customer-transactions@calibra.dev", passwordHash: "Passw0rd1!", role: "customer", locale: "fa" });
        await Customer.create({ userId: user.id, firstName: "C", lastName: "U", countryDefault: "IR" });
        const response = await client.get("/api/v1/admin/payment-attempts/summary").withGuard("api").loginAs(user);
        response.assertStatus(403);
    });
});
