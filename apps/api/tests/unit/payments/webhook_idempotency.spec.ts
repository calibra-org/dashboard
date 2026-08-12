import { test } from "@japa/runner";

import ProcessedWebhookEvent from "#models/processed_webhook_event";
import { webhookIdempotencyService } from "#services/webhook_idempotency_service";
import { runInTestTenant } from "#tests/helpers/tenant";

test.group("Payment webhook idempotency", (group) => {
    group.each.setup(async () => {
        await runInTestTenant(async () => {
            await ProcessedWebhookEvent.query().delete();
        });
    });

    test("identical event kind replays but a later status for the same authority is new", async ({ assert }) => {
        await runInTestTenant(async () => {
            const base = { provider: "zarinpal", eventId: "A000000000000000000000000000001", rawBody: "Authority=A&Status=NOK" };
            const failed = await webhookIdempotencyService.record({ ...base, eventKind: "payment.callback.failed" });
            assert.isFalse(failed.replayed);
            if (!failed.replayed) await webhookIdempotencyService.finalize(failed.inserted, "failed");

            const failedReplay = await webhookIdempotencyService.record({ ...base, eventKind: "payment.callback.failed" });
            assert.isTrue(failedReplay.replayed);

            const success = await webhookIdempotencyService.record({
                ...base,
                eventKind: "payment.callback.success",
                rawBody: "Authority=A&Status=OK",
            });
            assert.isFalse(success.replayed);

            const rows = await ProcessedWebhookEvent.query().where("provider", "zarinpal").where("event_id", base.eventId);
            assert.lengthOf(rows, 2);
        });
    });

    test("flags changed payload on a replay without creating another ledger row", async ({ assert }) => {
        await runInTestTenant(async () => {
            const input = {
                provider: "zarinpal",
                eventId: "A000000000000000000000000000002",
                eventKind: "payment.callback.success",
                rawBody: "Authority=A&Status=OK&Card=1",
            };
            const first = await webhookIdempotencyService.record(input);
            assert.isFalse(first.replayed);
            if (!first.replayed) await webhookIdempotencyService.finalize(first.inserted, "verified");

            const replay = await webhookIdempotencyService.record({ ...input, rawBody: "Authority=A&Status=OK&Card=2" });
            assert.isTrue(replay.replayed);
            if (replay.replayed) assert.isTrue(replay.payloadChanged);

            const rows = await ProcessedWebhookEvent.query().where("provider", "zarinpal").where("event_id", input.eventId);
            assert.lengthOf(rows, 1);
        });
    });
});
