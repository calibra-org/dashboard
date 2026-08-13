import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { PaymentAttemptStatus } from "#enums/payment_attempt_status";
import Customer from "#models/customer";
import PaymentAttempt from "#models/payment_attempt";
import PaymentGateway from "#models/payment_gateway";
import User from "#models/user";
import { createTaxableProduct } from "#tests/helpers/cart";
import { mockFetch, unmockFetch } from "#tests/helpers/mock_fetch";
import { makeDraftOrder } from "#tests/helpers/orders";
import { resetPhase08 } from "#tests/helpers/payments";

const ZARINPAL_VERIFY_URL = "https://payment.zarinpal.com/pg/v4/payment/verify.json";

async function admin(email = "transactions@calibra.dev") {
    const user = await User.create({ email, passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "T", lastName: "Admin", countryDefault: "IR" });
    return user;
}

async function customer() {
    const user = await User.create({
        email: "customer-transactions@calibra.dev",
        passwordHash: "Passw0rd1!",
        role: "customer",
        locale: "fa",
    });
    await Customer.create({ userId: user.id, firstName: "C", lastName: "U", countryDefault: "IR" });
    return user;
}

async function attempt(args: {
    productId: number;
    status: PaymentAttemptStatus;
    authority: string;
    amountMinor: number;
    gatewayCode?: string;
    transactionId?: string | null;
}) {
    const gateway = await PaymentGateway.findByOrFail("code", args.gatewayCode ?? "zarinpal");
    const order = await makeDraftOrder({
        productId: args.productId,
        quantity: 1,
        price: args.amountMinor,
        gatewayId: Number(gateway.id),
    });
    return PaymentAttempt.create({
        orderId: order.id,
        gatewayId: gateway.id,
        gatewayCodeSnapshot: gateway.code,
        status: args.status,
        amountMinor: args.amountMinor,
        currency: "IRR",
        gatewayAuthority: args.authority,
        gatewayTransactionId: args.transactionId ?? null,
        gatewayPayload: {},
        initiatedAt: DateTime.utc(),
        verifiedAt: args.status === PaymentAttemptStatus.Verified ? DateTime.utc() : null,
    });
}

test.group("admin transaction center", (group) => {
    group.each.setup(resetPhase08);
    group.each.teardown(() => unmockFetch());

    test("searches by PSP authority and numeric order id", async ({ client, assert }) => {
        const user = await admin();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const wanted = await attempt({ productId: Number(product.id), status: PaymentAttemptStatus.Verified, authority: "A-UNIQUE-7788", amountMinor: 1_000_000 });
        await attempt({ productId: Number(product.id), status: PaymentAttemptStatus.Failed, authority: "A-OTHER", amountMinor: 2_000_000 });

        const authority = await client.get("/api/v1/admin/payment-attempts").qs({ q: "UNIQUE-7788" }).withGuard("api").loginAs(user);
        authority.assertStatus(200);
        assert.equal(authority.body().meta.total, 1);
        assert.equal(authority.body().data[0].id, Number(wanted.id));

        const byOrder = await client.get("/api/v1/admin/payment-attempts").qs({ q: String(wanted.orderId) }).withGuard("api").loginAs(user);
        byOrder.assertStatus(200);
        assert.equal(byOrder.body().meta.total, 1);
        assert.equal(byOrder.body().data[0].order_id, Number(wanted.orderId));
    });

    test("filters and sorts by canonical minor-unit amount through TableView", async ({ client, assert }) => {
        const user = await admin();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await attempt({ productId: Number(product.id), status: PaymentAttemptStatus.Verified, authority: "A-1", amountMinor: 1_000_000 });
        await attempt({ productId: Number(product.id), status: PaymentAttemptStatus.Verified, authority: "A-2", amountMinor: 2_000_000 });
        await attempt({ productId: Number(product.id), status: PaymentAttemptStatus.Verified, authority: "A-3", amountMinor: 3_000_000 });

        const response = await client
            .get("/api/v1/admin/payment-attempts")
            .qs({ "filter[]": ["amount_minor:gte:1500000", "amount_minor:lte:3000000"], "sort[]": "amount_minor:desc" })
            .withGuard("api")
            .loginAs(user);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, 2);
        assert.deepEqual((response.body().data as Array<{ amount_minor: number }>).map((row) => row.amount_minor), [3_000_000, 2_000_000]);
    });

    test("returns status, reconciliation and attention aggregates", async ({ client, assert }) => {
        const user = await admin();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await attempt({ productId: Number(product.id), status: PaymentAttemptStatus.Verified, authority: "A-1", amountMinor: 1_000_000 });
        const mismatch = await attempt({ productId: Number(product.id), status: PaymentAttemptStatus.Verified, authority: "A-2", amountMinor: 2_000_000 });
        mismatch.reconciliationStatus = "mismatch";
        await mismatch.save();
        await attempt({ productId: Number(product.id), status: PaymentAttemptStatus.Failed, authority: "A-3", amountMinor: 500_000 });

        const response = await client.get("/api/v1/admin/payment-attempts/summary").withGuard("api").loginAs(user);
        response.assertStatus(200);
        const data = response.body().data;
        assert.equal(data.total_count, 3);
        assert.equal(data.total_amount_minor, 3_500_000);
        assert.equal(data.by_status.verified.count, 2);
        assert.equal(data.by_reconciliation.mismatch, 1);
        assert.equal(data.needs_attention_count, 2);
    });

    test("reconciles ZarinPal verified evidence and appends an audit event", async ({ client, assert }) => {
        const user = await admin();
        const product = await createTaxableProduct({ regularPrice: 2_500_000 });
        const gateway = await PaymentGateway.findByOrFail("code", "zarinpal");
        gateway.settings = { merchant_id: "merchant" };
        await gateway.save();
        const row = await attempt({
            productId: Number(product.id),
            status: PaymentAttemptStatus.Verified,
            authority: "AUTH-RECONCILE",
            amountMinor: 2_500_000,
            transactionId: "445566",
        });
        mockFetch({
            [ZARINPAL_VERIFY_URL]: { body: { data: { code: 101, ref_id: 445566, card_pan: "6037******0000" }, errors: [] } },
        });

        const response = await client.post(`/api/v1/admin/payment-attempts/${Number(row.id)}/reconcile`).withGuard("api").loginAs(user);
        response.assertStatus(200);
        assert.equal(response.body().data.reconciliation_status, "matched");
        assert.equal(response.body().data.reconciliation_provider_status, "verified");
        assert.equal(response.body().data.reconciliation_checked_by_user_id, Number(user.id));

        const history = await client.get(`/api/v1/admin/payment-attempts/${Number(row.id)}/reconciliation`).withGuard("api").loginAs(user);
        history.assertStatus(200);
        assert.equal(history.body().data.length, 1);
        assert.equal(history.body().data[0].action, "payment.reconciliation.checked");
        assert.equal(history.body().data[0].actor.email, user.email);
    });

    test("flags provider/internal transaction disagreement as mismatch", async ({ client, assert }) => {
        const user = await admin();
        const product = await createTaxableProduct({ regularPrice: 2_500_000 });
        const gateway = await PaymentGateway.findByOrFail("code", "zarinpal");
        gateway.settings = { merchant_id: "merchant" };
        await gateway.save();
        const row = await attempt({ productId: Number(product.id), status: PaymentAttemptStatus.Verified, authority: "AUTH-MISMATCH", amountMinor: 2_500_000, transactionId: "internal-1" });
        mockFetch({ [ZARINPAL_VERIFY_URL]: { body: { data: { code: 101, ref_id: "provider-2" }, errors: [] } } });

        const response = await client.post(`/api/v1/admin/payment-attempts/${Number(row.id)}/reconcile`).withGuard("api").loginAs(user);
        response.assertStatus(200);
        assert.equal(response.body().data.reconciliation_status, "mismatch");
    });

    test("records unsupported reconciliation without inventing provider state", async ({ client, assert }) => {
        const user = await admin();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const row = await attempt({ productId: Number(product.id), status: PaymentAttemptStatus.Verified, authority: "COD-1", amountMinor: 1_000_000, gatewayCode: "cod" });
        const response = await client.post(`/api/v1/admin/payment-attempts/${Number(row.id)}/reconcile`).withGuard("api").loginAs(user);
        response.assertStatus(200);
        assert.equal(response.body().data.reconciliation_status, "unsupported");
        assert.equal(response.body().data.reconciliation_provider_status, "unsupported");
    });

    test("list, summary, reconcile and history remain admin-only", async ({ client }) => {
        const user = await customer();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const row = await attempt({ productId: Number(product.id), status: PaymentAttemptStatus.Verified, authority: "A-CUSTOMER", amountMinor: 1_000_000 });
        const requests = [
            client.get("/api/v1/admin/payment-attempts"),
            client.get("/api/v1/admin/payment-attempts/summary"),
            client.post(`/api/v1/admin/payment-attempts/${Number(row.id)}/reconcile`),
            client.get(`/api/v1/admin/payment-attempts/${Number(row.id)}/reconciliation`),
        ];
        for (const request of requests) {
            const response = await request.withGuard("api").loginAs(user);
            response.assertStatus(403);
        }
    });
});
