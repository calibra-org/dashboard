import { randomUUID } from "node:crypto";
import { test } from "@japa/runner";
import User from "#models/user";

const ADMIN = "/api/v1/admin/personalization";
async function adminUser() {
    const token = randomUUID();
    return User.create({ email: `phase9-master-${token}@calibra.dev`, passwordHash: token, role: "admin", locale: "fa" });
}

test.group("Phase 9 master DoD", () => {
    test("canonical event API enforces the versioned vocabulary and batch dedupe", async ({ client, assert }) => {
        const visitor = `phase9-master-${randomUUID()}`;
        const headers = { "x-calibra-visitor-id": visitor };
        await client.put("/api/v1/personalization/consent").headers(headers).json({ analytics: true, personalization: true, source: "test", policy_version: "v1" });

        const bad = await client.post("/api/v1/events").headers(headers).json({ event_id: randomUUID(), event_type: "commerce.view_product", schema_version: 1 });
        bad.assertStatus(422);
        assert.equal(bad.body().error, "unsupported_event_type");

        const eventId = randomUUID();
        const batch = await client.post("/api/v1/events/batch").headers(headers).json({ events: [
            { event_id: eventId, event_type: "view_product", schema_version: 1 },
            { event_id: eventId, event_type: "view_product", schema_version: 1 },
        ] });
        batch.assertStatus(202);
        assert.equal(batch.body().data.results.length, 2);
        assert.isTrue(batch.body().data.results[0].accepted);
        assert.isTrue(batch.body().data.results[1].deduplicated);
    });

    test("policy and model registries support activation and rollback", async ({ client, assert }) => {
        const admin = await adminUser();
        const p1 = await client.post(`${ADMIN}/policies`).withGuard("api").loginAs(admin).json({ policy_key: "ranking", config: { relevance: 1 } });
        p1.assertStatus(201);
        const p2 = await client.post(`${ADMIN}/policies`).withGuard("api").loginAs(admin).json({ policy_key: "ranking", config: { relevance: 2 } });
        p2.assertStatus(201);
        await client.post(`${ADMIN}/policies/${p2.body().data.id}/activate`).withGuard("api").loginAs(admin).json({}).then((r) => r.assertStatus(200));
        const rollback = await client.post(`${ADMIN}/policies/ranking/rollback`).withGuard("api").loginAs(admin).json({ version: 1 });
        rollback.assertStatus(200);
        assert.equal(rollback.body().data.version, 1);

        const m1 = await client.post(`${ADMIN}/models`).withGuard("api").loginAs(admin).json({ model_key: "recommender", version: "rules-v2", rollout_percent: 10, config: { diversity: 0.2 } });
        m1.assertStatus(201);
        const active = await client.post(`${ADMIN}/models/${m1.body().data.id}/activate`).withGuard("api").loginAs(admin).json({ rollout_percent: 100 });
        active.assertStatus(200);
        assert.equal(active.body().data.status, "active");
        assert.equal(active.body().data.rollout_percent, 100);
    });

    test("deal lifecycle and reservation ledger enforce allocation and idempotent release", async ({ client, assert }) => {
        const admin = await adminUser();
        const campaign = await client.post(`${ADMIN}/campaigns`).withGuard("api").loginAs(admin).json({ name: "Master capacity", selection_mode: "smart", max_items: 2 });
        campaign.assertStatus(201);
        const id = Number(campaign.body().data.id);
        const active = await client.post(`${ADMIN}/deals/${id}/transition/active`).withGuard("api").loginAs(admin).json({ expected_version: 1 });
        active.assertStatus(200);
        const allocation = await client.put(`${ADMIN}/deals/${id}/allocation`).withGuard("api").loginAs(admin).json({ allocated_quantity: 2 });
        allocation.assertStatus(200);
        assert.equal(allocation.body().data.allocated_quantity, 2);

        const key = `reserve-${randomUUID()}`;
        const first = await client.post(`${ADMIN}/deals/${id}/reservations`).withGuard("api").loginAs(admin).json({ idempotency_key: key, quantity: 2, subject_type: "visitor", subject_id: `v-${randomUUID()}` });
        first.assertStatus(201);
        const second = await client.post(`${ADMIN}/deals/${id}/reservations`).withGuard("api").loginAs(admin).json({ idempotency_key: key, quantity: 2 });
        second.assertStatus(201);
        assert.isTrue(second.body().data.deduplicated);
        const exhausted = await client.post(`${ADMIN}/deals/${id}/reservations`).withGuard("api").loginAs(admin).json({ idempotency_key: `reserve-${randomUUID()}`, quantity: 1 });
        exhausted.assertStatus(409);
        assert.equal(exhausted.body().error, "deal_quantity_exhausted");

        const reservationId = first.body().data.reservation_id;
        const released = await client.post(`${ADMIN}/reservations/${reservationId}/release`).withGuard("api").loginAs(admin).json({});
        released.assertStatus(200);
        const replay = await client.post(`${ADMIN}/reservations/${reservationId}/release`).withGuard("api").loginAs(admin).json({});
        replay.assertStatus(200);
        assert.isTrue(replay.body().data.deduplicated);
    });

    test("promotion simulator uses the canonical checkout discounter", async ({ client, assert }) => {
        const admin = await adminUser();
        const r = await client.post(`${ADMIN}/promotion-simulator`).withGuard("api").loginAs(admin).json({
            items: [{ product_id: 1, quantity: 2, price_snapshot: 1000 }], coupons: [],
        });
        r.assertStatus(200);
        assert.isTrue(r.body().data.canonical_pricing);
        assert.equal(r.body().data.resolver, "DiscounterService");
        assert.equal(r.body().data.final_items_total, 2000);
    });
});
