import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import { TEST_TENANT_ID } from "#tests/helpers/tenant";

const EVENT_KEY = "11111111-1111-4111-8111-111111111116";

test.group("Storefront discovery events", (group) => {
    group.each.setup(async () => {
        await db.connection("postgres_admin").from("discovery_search_events").where("tenant_id", TEST_TENANT_ID).delete();
    });

    test("redacts PII, hashes session keys and accepts an idempotent retry", async ({ client, assert }) => {
        const payload = {
            event_key: EVENT_KEY,
            event_type: "search_performed",
            query: "فیلتر برای 0912 123 4567 reza@example.com",
            session_key: "private-browser-session",
            locale: "fa",
            surface: "storefront",
            result_count: 0,
        };

        const first = await client.post("/api/v1/storefront/discovery/events").json(payload);
        first.assertStatus(202);
        const retry = await client.post("/api/v1/storefront/discovery/events").json(payload);
        retry.assertStatus(200);
        assert.isTrue((retry.body() as { data: { duplicate?: boolean } }).data.duplicate);

        const row = await db
            .connection("postgres_admin")
            .from("discovery_search_events")
            .where("tenant_id", TEST_TENANT_ID)
            .where("event_key", EVENT_KEY)
            .firstOrFail();

        assert.notInclude(String(row.raw_query_redacted), "0912 123 4567");
        assert.notInclude(String(row.raw_query_redacted), "reza@example.com");
        assert.include(String(row.raw_query_redacted), "[phone]");
        assert.include(String(row.raw_query_redacted), "[email]");
        assert.notEqual(row.session_hash, payload.session_key);
        assert.lengthOf(String(row.session_hash), 64);
    });
});
