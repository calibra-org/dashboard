import { createHash, randomUUID } from "node:crypto";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import User from "#models/user";
import { runInTestTenant } from "#tests/helpers/tenant";

async function admin() {
    const token = randomUUID();
    return User.create({ email: `ticket-omni-${token}@calibra.dev`, passwordHash: token, role: "admin", locale: "fa" });
}

async function reset() {
    await db.rawQuery(
        "TRUNCATE TABLE support_api_request_logs, support_channel_oauth_sessions, support_api_webhook_subscriptions, support_api_keys, support_channel_connection_events, support_channel_webhook_events RESTART IDENTITY CASCADE",
    );
    await db.from("support_channel_integrations").delete();
}

test.group("Ticket omnichannel credential and API-key security", (group) => {
    group.each.setup(reset);

    test("tenant-entered provider secret is encrypted and never returned", async ({ client, assert }) => {
        const user = await admin();
        const secret = `telegram-${randomUUID()}`;
        const response = await client
            .put("/api/v1/admin/tickets/omnichannel/integrations")
            .withGuard("api")
            .loginAs(user)
            .json({
                channel: "telegram",
                provider_key: "telegram_bot",
                enabled: true,
                configuration: {},
                credentials: { bot_token: secret, webhook_secret_token: "hook_secret_1" },
            });
        response.assertStatus(200);
        assert.notInclude(JSON.stringify(response.body()), secret);
        assert.equal(
            response.body().data.credential_health.fields.find((field: { key: string }) => field.key === "bot_token").value,
            "***",
        );
        const row = await runInTestTenant(async () => {
            const result = await db.from("support_channel_integrations").where("channel", "telegram").first();
            if (!result) throw new Error("telegram integration missing");
            return result;
        });
        assert.isString(row.credentials_ciphertext);
        assert.notInclude(String(row.credentials_ciphertext), secret);
    });

    test("API key secret is shown once and database stores only its hash", async ({ client, assert }) => {
        const user = await admin();
        const created = await client
            .post("/api/v1/admin/tickets/omnichannel/api-keys")
            .withGuard("api")
            .loginAs(user)
            .json({ name: "ERP", scopes: ["tickets.read", "messages.send"], rate_limit_per_minute: 60 });
        created.assertStatus(201);
        const secret = String(created.body().data.secret);
        assert.match(secret, /^cal_sk_/);
        const row = await runInTestTenant(async () => {
            const result = await db.from("support_api_keys").where("id", created.body().data.id).first();
            if (!result) throw new Error("api key missing");
            return result;
        });
        assert.equal(row.key_hash, createHash("sha256").update(secret).digest("hex"));
        assert.notInclude(JSON.stringify(row), secret);
        const listed = await client.get("/api/v1/admin/tickets/omnichannel/api-keys/list").withGuard("api").loginAs(user);
        listed.assertStatus(200);
        assert.notInclude(JSON.stringify(listed.body()), secret);
    });

    test("unavailable providers cannot be fake-configured as connected", async ({ client, assert }) => {
        const user = await admin();
        const response = await client.put("/api/v1/admin/tickets/omnichannel/integrations").withGuard("api").loginAs(user).json({
            channel: "eitaa",
            provider_key: "eitaa_official_unverified",
            enabled: true,
            configuration: {},
            credentials: {},
        });
        response.assertStatus(422);
        const row = await runInTestTenant(() => db.from("support_channel_integrations").where("channel", "eitaa").first());
        assert.isNull(row);
    });

    test("revoked API keys stop authenticating and rate limits are fail-closed", async ({ client, assert }) => {
        const user = await admin();
        const created = await client
            .post("/api/v1/admin/tickets/omnichannel/api-keys")
            .withGuard("api")
            .loginAs(user)
            .json({ name: "Limited", scopes: ["tickets.read"], rate_limit_per_minute: 1 });
        created.assertStatus(201);
        const secret = String(created.body().data.secret);
        const first = await client.get("/api/v1/support-api/tickets").header("x-api-key", secret);
        first.assertStatus(200);
        const limited = await client.get("/api/v1/support-api/tickets").header("x-api-key", secret);
        limited.assertStatus(429);
        const revoke = await client
            .post(`/api/v1/admin/tickets/omnichannel/api-keys/${created.body().data.id}/revoke`)
            .withGuard("api")
            .loginAs(user);
        revoke.assertStatus(200);
        const revoked = await client.get("/api/v1/support-api/tickets").header("x-api-key", secret);
        revoked.assertStatus(401);
        assert.notInclude(JSON.stringify(revoked.body()), secret);
    });
});
