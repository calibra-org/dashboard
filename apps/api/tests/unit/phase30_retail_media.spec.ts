import { test } from "@japa/runner";

import {
    assertPrivacySafeContext,
    calculateCreatorRefundAdjustment,
    rankEligibleRetailMediaCandidates,
} from "#services/retail_media/retail_media_service";

test.group("Phase 30 retail media trust and money boundaries", () => {
    test("accepts aggregate first-party measurement context without direct identifiers", ({ assert }) => {
        assert.doesNotThrow(() =>
            assertPrivacySafeContext({
                surface: "search",
                query_cluster: "irrigation",
                consent: { analytics: true },
                cohort: ["new_customer", "mobile"],
            }),
        );
    });

    test("rejects direct identifiers and token-like keys at any nested depth", ({ assert }) => {
        assert.throws(
            () => assertPrivacySafeContext({ session: { customerEmail: "person@example.test" } }),
            /restricted field/,
        );
        assert.throws(() => assertPrivacySafeContext({ auth: { accessToken: "secret" } }), /restricted field/);
    });

    test("keeps bid as a bounded signal that cannot buy past materially better relevance and quality", ({ assert }) => {
        const ranked = rankEligibleRetailMediaCandidates([
            {
                campaign_public_id: "relevant",
                paid_bid_minor: 1,
                relevance_bps: 10000,
                quality_bps: 10000,
            },
            {
                campaign_public_id: "high-bid",
                paid_bid_minor: 1_000_000_000,
                relevance_bps: 7000,
                quality_bps: 7000,
            },
        ]);
        assert.equal(ranked[0]?.campaign_public_id, "relevant");
    });

    test("refund adjustment is proportional and can never reverse more than remaining commission", ({ assert }) => {
        assert.equal(calculateCreatorRefundAdjustment(1000, 2500, 10000), 250);
        assert.equal(calculateCreatorRefundAdjustment(1000, 10000, 10000, -800), 200);
        assert.equal(calculateCreatorRefundAdjustment(1000, 10000, 10000, -1000), 0);
        assert.equal(calculateCreatorRefundAdjustment(1000, 0, 10000), 0);
    });
});
