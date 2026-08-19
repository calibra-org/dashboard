import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import { CouponFactory } from "#factories/coupon_factory";
import CouponRedemption from "#models/coupon_redemption";
import OrderCouponLine from "#models/order_coupon_line";
import PaymentGateway from "#models/payment_gateway";
import User from "#models/user";
import { PRICING_PERMISSIONS } from "#services/pricing_permissions";
import { createTaxableProduct } from "#tests/helpers/cart";
import { iranRegionId, resetPhase05 } from "#tests/helpers/orders";
import { TEST_TENANT_ID } from "#tests/helpers/tenant";

type PricingTestContext = Parameters<NonNullable<Parameters<typeof test>[1]>>[0];
type PricingTestClient = PricingTestContext["client"];

let userSequence = 0;

async function createUser(role: "admin" | "customer" = "admin") {
    userSequence += 1;
    return User.create({
        email: `phase18-${role}-${userSequence}@calibra.dev`,
        passwordHash: "Passw0rd1!",
        role,
        locale: "fa",
    });
}

async function resetPricingTables() {
    const admin = db.connection("postgres_admin");
    await admin.from("pricing_order_snapshots").delete();
    await admin.from("pricing_policy_actions").delete();
    await admin.from("pricing_proposals").delete();
    await admin.from("pricing_policy_versions").delete();
    await admin.from("pricing_policies").delete();
    await admin
        .from("admin_permissions")
        .whereIn("permission", [...PRICING_PERMISSIONS])
        .delete();
    await admin.from("admin_audit_log").where("entity_kind", "pricing_policy").delete();
}

async function createPolicy(
    client: PricingTestClient,
    admin: User,
    key: string,
    options: {
        currency?: string;
        productId?: number;
        guardrails?: Record<string, number>;
    } = {},
) {
    const response = await client
        .post("/api/v1/admin/pricing-brain/policies")
        .withGuard("api")
        .loginAs(admin)
        .json({
            policy_key: key,
            name: `Policy ${key}`,
            objective: "margin_protection",
            currency: options.currency ?? "IRR",
            product_id: options.productId ?? null,
            guardrails: options.guardrails ?? { floor_price_minor: 90_000, maximum_discount_percent: 20 },
            evidence: { source: "phase18-functional-test" },
            reason: "create governance test policy",
        });
    response.assertStatus(200);
    response.assertAgainstApiSpec();
    return response.body().data as {
        policy: { id: number };
        version: { id: number; version: number; state: string };
    };
}

async function transition(
    client: PricingTestClient,
    admin: User,
    policyId: number,
    action: string,
    body: Record<string, unknown>,
) {
    return client
        .post(`/api/v1/admin/pricing-brain/policies/${policyId}/actions/${action}`)
        .withGuard("api")
        .loginAs(admin)
        .json(body);
}

async function activatePolicy(
    client: PricingTestClient,
    proposer: User,
    approver: User,
    key: string,
    options: { currency?: string; productId?: number; guardrails?: Record<string, number> } = {},
) {
    const created = await createPolicy(client, proposer, key, options);
    const submitted = await transition(client, proposer, created.policy.id, "submit", {
        expected_version: created.version.version,
        reason: `submit ${key} for independent review`,
    });
    submitted.assertStatus(200);
    const approved = await transition(client, approver, created.policy.id, "approve", {
        expected_version: created.version.version,
        reason: `approve ${key}`,
    });
    approved.assertStatus(200);
    const activated = await transition(client, approver, created.policy.id, "activate", {
        expected_version: created.version.version,
        reason: `activate ${key}`,
    });
    activated.assertStatus(200);
    return { created, activated: activated.body().data.version as { id: number; version: number; state: string } };
}

function tokenFromResponse(response: { cookie(name: string): { value: unknown } | undefined }): string {
    const cookie = response.cookie("cart_token");
    if (!cookie || typeof cookie.value !== "string") throw new Error("expected cart_token");
    return cookie.value;
}

async function checkoutProduct(client: PricingTestClient, productId: number, idempotencyKey: string, couponCode?: string) {
    const regionId = await iranRegionId();
    const gateway = await PaymentGateway.findByOrFail("code", "cod");
    const seeded = await client.post("/api/v1/cart/items").json({ product_id: productId, quantity: 1 });
    const token = tokenFromResponse(seeded);

    if (couponCode) {
        const applied = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: couponCode });
        applied.assertStatus(200);
    }

    const customer = await client
        .post("/api/v1/cart/customer")
        .cookie("cart_token", token)
        .json({ country: "IR", region_id: regionId, postcode: "1234567890" });
    customer.assertStatus(200);

    const draft = await client
        .put("/api/v1/checkout")
        .cookie("cart_token", token)
        .json({
            billing_address: {
                first_name: "Phase",
                last_name: "Eighteen",
                address_line_1: "Vali-Asr 1",
                city: "Tehran",
                country: "IR",
                region_id: regionId,
                postcode: "1234567890",
                phone: "+989121234567",
                email: "phase18-checkout@example.test",
            },
            payment_gateway_id: Number(gateway.id),
        });
    draft.assertStatus(200);

    const finalize = await client
        .post("/api/v1/checkout/submit")
        .cookie("cart_token", token)
        .header("Idempotency-Key", idempotencyKey);
    return { token, finalize };
}

test.group("Phase 18 pricing governance", (group) => {
    group.each.setup(resetPricingTables);

    test("non-admin actors cannot read pricing governance", async ({ client }) => {
        const customer = await createUser("customer");
        const response = await client.get("/api/v1/admin/pricing-brain/policies").withGuard("api").loginAs(customer);
        response.assertStatus(403);
    });

    test("tenant-scoped pricing.view override denies an admin", async ({ client }) => {
        const admin = await createUser();
        await db
            .connection("postgres_admin")
            .table("admin_permissions")
            .insert({
                tenant_id: TEST_TENANT_ID,
                user_id: Number(admin.id),
                permission: "pricing.view",
                allowed: false,
            });
        const response = await client.get("/api/v1/admin/pricing-brain/policies").withGuard("api").loginAs(admin);
        response.assertStatus(403);
    });

    test("policy creation is versioned and exposed through the documented contract", async ({ client, assert }) => {
        const admin = await createUser();
        const created = await createPolicy(client, admin, "margin-core");
        assert.equal(created.version.version, 1);
        assert.equal(created.version.state, "draft");

        const response = await client.get("/api/v1/admin/pricing-brain/policies").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.equal(response.body().data.length, 1);
        assert.equal(response.body().data[0].policy_key, "margin-core");
        assert.equal(response.body().data[0].latest_version.version, 1);
    });

    test("proposer cannot self-approve but a second admin can approve and activate", async ({ client, assert }) => {
        const proposer = await createUser();
        const approver = await createUser();
        const created = await createPolicy(client, proposer, "dual-control");

        const submitted = await transition(client, proposer, created.policy.id, "submit", {
            expected_version: 1,
            reason: "submit for independent review",
            idempotency_key: "phase18-submit-dual-control",
        });
        submitted.assertStatus(200);
        submitted.assertAgainstApiSpec();
        assert.equal(submitted.body().data.version.state, "review");

        const selfApproval = await transition(client, proposer, created.policy.id, "approve", {
            expected_version: 1,
            reason: "must not self approve",
        });
        selfApproval.assertStatus(422);

        const approved = await transition(client, approver, created.policy.id, "approve", {
            expected_version: 1,
            reason: "independent approval",
            idempotency_key: "phase18-approve-dual-control",
        });
        approved.assertStatus(200);
        approved.assertAgainstApiSpec();
        assert.equal(approved.body().data.version.state, "approved");

        const activated = await transition(client, approver, created.policy.id, "activate", {
            expected_version: 1,
            reason: "activate approved guardrails",
            idempotency_key: "phase18-activate-dual-control",
        });
        activated.assertStatus(200);
        activated.assertAgainstApiSpec();
        assert.equal(activated.body().data.version.state, "active");
    });

    test("stale expected_version is rejected after a newer draft exists", async ({ client }) => {
        const admin = await createUser();
        const created = await createPolicy(client, admin, "stale-version");

        const version2 = await client
            .post(`/api/v1/admin/pricing-brain/policies/${created.policy.id}/versions`)
            .withGuard("api")
            .loginAs(admin)
            .json({ reason: "newer draft for stale version regression" });
        version2.assertStatus(200);
        version2.assertAgainstApiSpec();

        const stale = await transition(client, admin, created.policy.id, "submit", {
            expected_version: 1,
            reason: "stale write must fail",
        });
        stale.assertStatus(409);
    });

    test("freeze is idempotent and blocks normal activation transitions", async ({ client, assert }) => {
        const proposer = await createUser();
        const approver = await createUser();
        const created = await createPolicy(client, proposer, "freeze-control");

        const submitted = await transition(client, proposer, created.policy.id, "submit", {
            expected_version: 1,
            reason: "submit before freeze",
        });
        submitted.assertStatus(200);
        const approved = await transition(client, approver, created.policy.id, "approve", {
            expected_version: 1,
            reason: "approve before freeze",
        });
        approved.assertStatus(200);

        const freeze = () =>
            client
                .post(`/api/v1/admin/pricing-brain/policies/${created.policy.id}/freeze`)
                .withGuard("api")
                .loginAs(approver)
                .json({ frozen: true, reason: "emergency freeze regression", idempotency_key: "phase18-freeze-control" });

        const first = await freeze();
        first.assertStatus(200);
        first.assertAgainstApiSpec();
        assert.equal(first.body().replayed, false);
        const replay = await freeze();
        replay.assertStatus(200);
        replay.assertAgainstApiSpec();
        assert.equal(replay.body().replayed, true);

        const blocked = await transition(client, approver, created.policy.id, "activate", {
            expected_version: 1,
            reason: "frozen activation must fail",
        });
        blocked.assertStatus(409);
    });

    test("rollback restores a previously approved version and records durable audit evidence", async ({ client, assert }) => {
        const proposer = await createUser();
        const approver = await createUser();
        const created = await createPolicy(client, proposer, "rollback-control");

        await transition(client, proposer, created.policy.id, "submit", { expected_version: 1, reason: "submit v1" });
        await transition(client, approver, created.policy.id, "approve", { expected_version: 1, reason: "approve v1" });
        const activeV1 = await transition(client, approver, created.policy.id, "activate", {
            expected_version: 1,
            reason: "activate v1",
        });
        activeV1.assertStatus(200);

        const v2 = await client
            .post(`/api/v1/admin/pricing-brain/policies/${created.policy.id}/versions`)
            .withGuard("api")
            .loginAs(proposer)
            .json({
                guardrails: { floor_price_minor: 95_000, maximum_discount_percent: 15 },
                reason: "tighten margin guardrails",
            });
        v2.assertStatus(200);
        assert.equal(v2.body().data.version, 2);

        await transition(client, proposer, created.policy.id, "submit", { expected_version: 2, reason: "submit v2" });
        await transition(client, approver, created.policy.id, "approve", { expected_version: 2, reason: "approve v2" });
        const activeV2 = await transition(client, approver, created.policy.id, "activate", {
            expected_version: 2,
            reason: "activate v2",
        });
        activeV2.assertStatus(200);

        const rolledBack = await transition(client, approver, created.policy.id, "rollback", {
            expected_version: 2,
            rollback_to_version: 1,
            reason: "guardrail regression detected",
            evidence: { trigger: "post_activation_monitor" },
            correlation_id: "phase18-rollback-correlation",
            idempotency_key: "phase18-rollback-control",
        });
        rolledBack.assertStatus(200);
        rolledBack.assertAgainstApiSpec();
        assert.equal(rolledBack.body().data.version.version, 1);
        assert.equal(rolledBack.body().data.version.state, "active");

        const adminDb = db.connection("postgres_admin");
        const action = await adminDb
            .from("pricing_policy_actions")
            .where("tenant_id", TEST_TENANT_ID)
            .where("policy_id", created.policy.id)
            .where("action", "version.rollback")
            .first();
        assert.exists(action);
        assert.equal(action.reason, "guardrail regression detected");
        assert.equal(action.correlation_id, "phase18-rollback-correlation");

        const audit = await adminDb
            .from("admin_audit_log")
            .where("tenant_id", TEST_TENANT_ID)
            .where("entity_kind", "pricing_policy")
            .where("entity_id", String(created.policy.id))
            .where("action", "pricing.version.rollback")
            .first();
        assert.exists(audit);
    });

    test("active policy preserves canonical coupon redemption and records the exact promotion allocation", async ({
        client,
        assert,
    }) => {
        await resetPhase05();
        await db.rawQuery("TRUNCATE TABLE coupons, coupon_redemptions RESTART IDENTITY CASCADE");

        const proposer = await createUser();
        const approver = await createUser();
        const coupon = await CouponFactory.merge({ code: "P18REG10", amountPercent: "10.00" }).create();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const policy = await activatePolicy(client, proposer, approver, "coupon-golden-regression", {
            productId: Number(product.id),
            guardrails: { floor_price_minor: 800_000, maximum_discount_percent: 20 },
        });

        const { finalize } = await checkoutProduct(client, Number(product.id), "phase18-coupon-golden-regression", "P18REG10");
        finalize.assertStatus(200);
        finalize.assertAgainstApiSpec();
        const orderId = Number(finalize.body().data.id);

        const couponLines = await OrderCouponLine.query().where("order_id", orderId);
        assert.lengthOf(couponLines, 1);
        assert.equal(couponLines[0]!.codeSnapshot, "P18REG10");
        assert.equal(Number(couponLines[0]!.discount), 100_000);

        const redemptions = await CouponRedemption.query().where("coupon_id", Number(coupon.id));
        assert.lengthOf(redemptions, 1);
        assert.equal(Number(redemptions[0]!.orderId), orderId);

        const snapshot = await db
            .connection("postgres_admin")
            .from("pricing_order_snapshots")
            .where("tenant_id", TEST_TENANT_ID)
            .where("order_id", orderId)
            .where("product_id", Number(product.id))
            .first();
        assert.exists(snapshot);
        assert.equal(Number(snapshot.policy_id), policy.created.policy.id);
        assert.equal(Number(snapshot.policy_version_id), policy.activated.id);
        assert.equal(snapshot.currency, "IRR");
        assert.deepEqual((snapshot.coupon_ids ?? []).map(Number), [Number(coupon.id)]);
        const guardrailResult = (snapshot.guardrail_result ?? {}) as Record<string, unknown>;
        assert.equal(Number(guardrailResult.promotion_discount_minor), Number(couponLines[0]!.discount));
        assert.equal(guardrailResult.promotion_engine, "shared_discounter");
    });

    test("an active policy for another currency cannot govern an IRR checkout", async ({ client, assert }) => {
        await resetPhase05();

        const proposer = await createUser();
        const approver = await createUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await activatePolicy(client, proposer, approver, "foreign-currency-guardrail", {
            currency: "USD",
            productId: Number(product.id),
            guardrails: { floor_price_minor: 2_000_000 },
        });

        const { finalize } = await checkoutProduct(client, Number(product.id), "phase18-currency-isolation-regression");
        finalize.assertStatus(200);
        finalize.assertAgainstApiSpec();
        const orderId = Number(finalize.body().data.id);

        const snapshot = await db
            .connection("postgres_admin")
            .from("pricing_order_snapshots")
            .where("tenant_id", TEST_TENANT_ID)
            .where("order_id", orderId)
            .where("product_id", Number(product.id))
            .first();
        assert.exists(snapshot);
        assert.equal(snapshot.currency, "IRR");
        assert.isNull(snapshot.policy_id);
        assert.isNull(snapshot.policy_version_id);
    });
});
