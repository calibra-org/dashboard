import { randomUUID } from "node:crypto";
import { test } from "@japa/runner";
import User from "#models/user";

const ADMIN = "/api/v1/admin/personalization";
async function adminUser() {
    const token = randomUUID();
    return User.create({ email: `phase9-${token}@calibra.dev`, passwordHash: token, role: "admin", locale: "fa" });
}

test.group("Phase 9 personalization and amazing deals", () => {
    test("protects admin endpoints", async ({ client }) => {
        const r = await client.get(`${ADMIN}/overview`);
        r.assertStatus(401);
    });

    test("creates a draft campaign and enforces optimistic versioning", async ({ client, assert }) => {
        const admin = await adminUser();
        const created = await client
            .post(`${ADMIN}/campaigns`)
            .withGuard("api")
            .loginAs(admin)
            .json({ name: "پیشنهاد تست", selection_mode: "smart", min_discount_percent: 15, max_items: 8 });
        created.assertStatus(201);
        assert.equal(created.body().data.status, "draft");
        const id = Number(created.body().data.id);
        const first = await client
            .patch(`${ADMIN}/campaigns/${id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ name: "پیشنهاد نسخه دوم", expected_version: 1 });
        first.assertStatus(200);
        assert.equal(first.body().data.version, 2);
        const stale = await client
            .patch(`${ADMIN}/campaigns/${id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ name: "نسخه کهنه", expected_version: 1 });
        stale.assertStatus(409);
    });

    test("refuses to publish a campaign with no eligible real-sale products", async ({ client }) => {
        const admin = await adminUser();
        const created = await client
            .post(`${ADMIN}/campaigns`)
            .withGuard("api")
            .loginAs(admin)
            .json({ name: "بدون محصول", selection_mode: "manual", product_ids: [] });
        const r = await client
            .post(`${ADMIN}/campaigns/${created.body().data.id}/publish`)
            .withGuard("api")
            .loginAs(admin)
            .json({ expected_version: 1 });
        r.assertStatus(422);
    });

    test("keeps personalization consent separate and deduplicates versioned events", async ({ client, assert }) => {
        const headers = { "x-calibra-visitor-id": `phase9-${randomUUID()}` };
        const before = await client.get("/api/v1/personalization/consent").headers(headers);
        before.assertStatus(200);
        assert.isFalse(before.body().data.personalization);
        const consent = await client
            .put("/api/v1/personalization/consent")
            .headers(headers)
            .json({ analytics: true, personalization: true, source: "test", policy_version: "v1" });
        consent.assertStatus(200);
        assert.isTrue(consent.body().data.personalization);
        const eventId = randomUUID();
        const payload = {
            event_id: eventId,
            event_type: "view_product",
            schema_version: 1,
            occurred_at: new Date().toISOString(),
        };
        const first = await client.post("/api/v1/events").headers(headers).json(payload);
        const second = await client.post("/api/v1/events").headers(headers).json(payload);
        first.assertStatus(202);
        second.assertStatus(202);
        assert.isTrue(first.body().data.accepted);
        assert.isTrue(second.body().data.deduplicated);
    });

    test("rejects unknown events and unsupported schema versions", async ({ client }) => {
        const headers = { "x-calibra-visitor-id": `phase9-${randomUUID()}` };
        await client
            .put("/api/v1/personalization/consent")
            .headers(headers)
            .json({ analytics: true, personalization: true, source: "test", policy_version: "v1" });
        const unknown = await client
            .post("/api/v1/events")
            .headers(headers)
            .json({ event_type: "commerce.view_product", schema_version: 1 });
        unknown.assertStatus(422);
        const wrongVersion = await client
            .post("/api/v1/events")
            .headers(headers)
            .json({ event_type: "view_product", schema_version: 2 });
        wrongVersion.assertStatus(422);
    });

    test("accepts bounded event batches through the canonical endpoint", async ({ client, assert }) => {
        const headers = { "x-calibra-visitor-id": `phase9-${randomUUID()}` };
        await client
            .put("/api/v1/personalization/consent")
            .headers(headers)
            .json({ analytics: true, personalization: true, source: "test", policy_version: "v1" });
        const r = await client
            .post("/api/v1/events/batch")
            .headers(headers)
            .json({
                events: [
                    { event_id: randomUUID(), event_type: "page_view", schema_version: 1 },
                    { event_id: randomUUID(), event_type: "search", schema_version: 1, payload: { query: "آبیاری" } },
                ],
            });
        r.assertStatus(202);
        assert.equal(r.body().data.total, 2);
        assert.equal(r.body().data.accepted, 2);
    });

    test("does not persist a visitor-linked event without consent", async ({ client, assert }) => {
        const r = await client
            .post("/api/v1/events")
            .headers({ "x-calibra-visitor-id": "phase9-no-consent-visitor" })
            .json({ event_type: "view_product", schema_version: 1 });
        r.assertStatus(202);
        assert.isFalse(r.body().data.accepted);
        assert.equal(r.body().data.reason, "consent_required");
    });

    test("exposes policy, model, feature and rollout governance", async ({ client, assert }) => {
        const admin = await adminUser();
        const feature = await client
            .put(`${ADMIN}/features`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                feature_key: "recent_products",
                source: "personalization_events",
                freshness_seconds: 3600,
                sensitive: false,
            });
        feature.assertStatus(200);
        assert.equal(feature.body().data.feature_key, "recent_products");

        const policy = await client
            .post(`${ADMIN}/policies`)
            .withGuard("api")
            .loginAs(admin)
            .json({ policy_key: "home_ranker", config: { diversity_weight: 10 } });
        policy.assertStatus(201);
        const policyVersion = String(policy.body().data.version);

        const model = await client
            .post(`${ADMIN}/models`)
            .withGuard("api")
            .loginAs(admin)
            .json({ model_key: "home_ranker", version: "rules-v2", config: { exploration_percent: 5 } });
        model.assertStatus(201);

        const activatePolicy = await client
            .post(`${ADMIN}/registry/policy/home_ranker/${policyVersion}/activate`)
            .withGuard("api")
            .loginAs(admin)
            .json({ percentage: 100 });
        activatePolicy.assertStatus(200);
        assert.equal(activatePolicy.body().data.status, "active");

        const activateModel = await client
            .post(`${ADMIN}/registry/model/home_ranker/rules-v2/activate`)
            .withGuard("api")
            .loginAs(admin)
            .json({ percentage: 25 });
        activateModel.assertStatus(200);
        assert.equal(activateModel.body().data.rollout_percent, 25);

        const rollouts = await client.get(`${ADMIN}/rollouts`).withGuard("api").loginAs(admin);
        rollouts.assertStatus(200);
        assert.isAtLeast(rollouts.body().data.length, 2);
    });

    test("supports deterministic lifecycle transitions", async ({ client, assert }) => {
        const admin = await adminUser();
        const created = await client
            .post(`${ADMIN}/campaigns`)
            .withGuard("api")
            .loginAs(admin)
            .json({ name: "چرخه عمر", selection_mode: "smart", min_discount_percent: 10, max_items: 4 });
        const id = Number(created.body().data.id);
        const scheduled = await client
            .post(`${ADMIN}/campaigns/${id}/transition/scheduled`)
            .withGuard("api")
            .loginAs(admin)
            .json({ expected_version: 1 });
        scheduled.assertStatus(200);
        assert.equal(scheduled.body().data.status, "scheduled");
        const cancelled = await client
            .post(`${ADMIN}/campaigns/${id}/transition/cancelled`)
            .withGuard("api")
            .loginAs(admin)
            .json({ expected_version: 2 });
        cancelled.assertStatus(200);
        assert.equal(cancelled.body().data.status, "cancelled");
        const illegal = await client
            .post(`${ADMIN}/campaigns/${id}/transition/active`)
            .withGuard("api")
            .loginAs(admin)
            .json({ expected_version: 3 });
        illegal.assertStatus(409);
    });

    test("commerce simulator uses the canonical discounter and margin guard", async ({ client, assert }) => {
        const admin = await adminUser();
        const r = await client
            .post(`${ADMIN}/simulate`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                items: [{ line_key: "1", product_id: 1, quantity: 1, price_snapshot: 1000 }],
                applied_coupons: [],
                min_selling_price: 900,
            });
        r.assertStatus(200);
        assert.equal(r.body().data.resolver, "canonical_discounter");
        assert.isTrue(r.body().data.margin_guard.allowed);
        assert.equal(r.body().data.final_after_discount, 1000);
    });

    test("kill switch is admin controlled", async ({ client, assert }) => {
        const admin = await adminUser();
        const r = await client.patch(`${ADMIN}/settings`).withGuard("api").loginAs(admin).json({ kill_switch: true });
        r.assertStatus(200);
        assert.isTrue(r.body().data.kill_switch);
    });
});
