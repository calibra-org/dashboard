import { createHmac } from "node:crypto";
import { test } from "@japa/runner";

import { verifyMetaSignature } from "#services/support/channel_adapters/meta_signature";
import { TelegramAdapter } from "#services/support/channel_adapters/telegram_adapter";
import { WhatsAppAdapter } from "#services/support/channel_adapters/whatsapp_adapter";
import { fetchCalls, mockFetch, unmockFetch } from "#tests/helpers/mock_fetch";

test.group("Support channel adapter contracts", (group) => {
    group.each.teardown(() => unmockFetch());

    test("Telegram verifies identity and webhook using only official Bot API calls", async ({ assert }) => {
        const adapter = new TelegramAdapter();
        const ctx = {
            channel: "telegram" as const,
            providerKey: "telegram_bot",
            configuration: {},
            credentials: { bot_token: "123:test", webhook_secret_token: "safe_secret" },
        };
        mockFetch({
            "https://api.telegram.org/bot123%3Atest/getMe": {
                body: { ok: true, result: { id: 7, first_name: "Calibra", username: "calibra_bot" } },
            },
            "https://api.telegram.org/bot123%3Atest/getWebhookInfo": {
                body: { ok: true, result: { url: "https://tenant.test/api/v1/support/channels/telegram/1" } },
            },
        });
        const health = await adapter.verifyConnection(ctx);
        assert.isTrue(health.ok);
        assert.equal(health.account?.username, "calibra_bot");
        assert.isTrue(health.webhookOk);
        assert.deepEqual(
            fetchCalls().map((call) => call.url),
            ["https://api.telegram.org/bot123%3Atest/getMe", "https://api.telegram.org/bot123%3Atest/getWebhookInfo"],
        );
        assert.isTrue(
            adapter.verifyWebhook(ctx, {
                rawBody: "{}",
                body: {},
                query: {},
                pathSecret: null,
                headers: { "x-telegram-bot-api-secret-token": "safe_secret" },
            }),
        );
        assert.isFalse(
            adapter.verifyWebhook(ctx, {
                rawBody: "{}",
                body: {},
                query: {},
                pathSecret: null,
                headers: { "x-telegram-bot-api-secret-token": "wrong" },
            }),
        );
    });

    test("Telegram normalizes repeated provider IDs for database idempotency", async ({ assert }) => {
        const adapter = new TelegramAdapter();
        const normalized = adapter.normalizeWebhook(
            {
                channel: "telegram",
                providerKey: "telegram_bot",
                configuration: {},
                credentials: { bot_token: "x", webhook_secret_token: "s" },
            },
            {
                rawBody: "{}",
                headers: {},
                query: {},
                body: {
                    update_id: 99,
                    message: {
                        message_id: 44,
                        date: 1_700_000_000,
                        text: "hello",
                        chat: { id: 8, type: "private" },
                        from: { id: 8, first_name: "A" },
                    },
                },
            },
        );
        assert.equal(normalized.messages[0]?.providerEventId, "99");
        assert.equal(normalized.messages[0]?.providerMessageId, "44");
        assert.equal(normalized.messages[0]?.providerConversationId, "8");
    });

    test("Meta signature verification rejects modified payloads", ({ assert }) => {
        const secret = "app-secret";
        const body = '{"object":"whatsapp_business_account"}';
        const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
        assert.isTrue(verifyMetaSignature(body, signature, secret));
        assert.isFalse(verifyMetaSignature(`${body}x`, signature, secret));
    });

    test("WhatsApp template approval is taken from Meta provider evidence", async ({ assert }) => {
        const adapter = new WhatsAppAdapter();
        const ctx = {
            channel: "whatsapp" as const,
            providerKey: "whatsapp_cloud",
            configuration: { graph_version: "v99.0", phone_number_id: "111", waba_id: "222" },
            credentials: { access_token: "token", app_secret: "app-secret", webhook_verify_token: "verify" },
        };
        mockFetch({
            "https://graph.facebook.com/v99.0/222/message_templates?name=order_update&fields=id%2Cname%2Cstatus%2Clanguage": {
                body: { data: [{ id: "tpl-1", name: "order_update", status: "APPROVED", language: "fa" }] },
            },
        });
        const result = await adapter.verifyTemplate(ctx, { name: "order_update", languageCode: "fa" });
        assert.isTrue(result.approved);
        assert.equal(result.providerTemplateId, "tpl-1");
        assert.equal(result.status, "APPROVED");
    });

    test("WhatsApp template remains unapproved when Meta has no matching language", async ({ assert }) => {
        const adapter = new WhatsAppAdapter();
        const ctx = {
            channel: "whatsapp" as const,
            providerKey: "whatsapp_cloud",
            configuration: { graph_version: "v99.0", phone_number_id: "111", waba_id: "222" },
            credentials: { access_token: "token", app_secret: "app-secret", webhook_verify_token: "verify" },
        };
        mockFetch({
            "https://graph.facebook.com/v99.0/222/message_templates?name=order_update&fields=id%2Cname%2Cstatus%2Clanguage": {
                body: { data: [{ id: "tpl-1", name: "order_update", status: "APPROVED", language: "en_US" }] },
            },
        });
        const result = await adapter.verifyTemplate(ctx, { name: "order_update", languageCode: "fa" });
        assert.isFalse(result.approved);
        assert.equal(result.status, "NOT_FOUND");
    });
});
