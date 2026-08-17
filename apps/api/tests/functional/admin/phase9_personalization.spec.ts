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
    test("keeps personalization consent separate and deduplicates events", async ({ client, assert }) => {
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
        const payload = { event_id: eventId, event_type: "commerce.view_product", occurred_at: new Date().toISOString() };
        const first = await client.post("/api/v1/personalization/events").headers(headers).json(payload);
        const second = await client.post("/api/v1/personalization/events").headers(headers).json(payload);
        first.assertStatus(202);
        second.assertStatus(202);
        assert.isTrue(first.body().data.accepted);
        assert.isTrue(second.body().data.deduplicated);
    });
    test("does not persist a visitor-linked event without consent", async ({ client, assert }) => {
        const r = await client
            .post("/api/v1/personalization/events")
            .headers({ "x-calibra-visitor-id": "phase9-no-consent-visitor" })
            .json({ event_type: "commerce.view_product" });
        r.assertStatus(202);
        assert.isFalse(r.body().data.accepted);
        assert.equal(r.body().data.reason, "consent_required");
    });
    test("kill switch is admin controlled", async ({ client, assert }) => {
        const admin = await adminUser();
        const r = await client.patch(`${ADMIN}/settings`).withGuard("api").loginAs(admin).json({ kill_switch: true });
        r.assertStatus(200);
        assert.isTrue(r.body().data.kill_switch);
    });
});
