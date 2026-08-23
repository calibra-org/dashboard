import { test } from "@japa/runner";

import { merchantMemoryRetrievalScore } from "#services/phase26_merchant_memory_service";

test.group("Phase 26 merchant-memory ranking", () => {
    test("relevant evidence scores above unrelated memory deterministically", ({ assert }) => {
        const relevant = {
            title: "درس کمپین آبیاری",
            context: "کمپین آبیاری قطره‌ای برای سگمنت گلخانه",
            lesson: "پیام فنی بهتر از تخفیف عمومی بود",
            confidence: 0.8,
            strength: 0.7,
        };
        const unrelated = {
            title: "درس تأمین‌کننده",
            context: "تأخیر حمل",
            lesson: "ظرفیت تأمین محدود بود",
            confidence: 0.8,
            strength: 0.7,
        };
        const tokens = ["کمپین", "آبیاری"];
        const a = merchantMemoryRetrievalScore(relevant, tokens);
        const b = merchantMemoryRetrievalScore(unrelated, tokens);
        assert.isAbove(a.total, b.total);
        assert.deepEqual(a, merchantMemoryRetrievalScore(relevant, tokens));
    });

    test("score decomposition is bounded and additive", ({ assert }) => {
        const score = merchantMemoryRetrievalScore(
            { title: "x", context: "x", lesson: "x", confidence: 1, strength: 1 },
            ["x"],
        );
        assert.isAtLeast(score.total, 0);
        assert.isAtMost(score.total, 1);
        assert.closeTo(score.total, score.lexical + score.confidence + score.strength, 0.000001);
    });
});
