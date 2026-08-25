import { test } from "@japa/runner";

import { assertPublicPayloadSafe } from "#services/product_passport/product_passport_service";

test.group("Phase 29 product passport public boundary", () => {
    test("accepts nested public product evidence without restricted keys", ({ assert }) => {
        assert.doesNotThrow(() =>
            assertPublicPayloadSafe({
                manual: { url: "https://example.test/manual.pdf" },
                warranty: { months: 24 },
                composition: [{ material: "steel", share: 0.8 }],
            }),
        );
    });

    test("rejects restricted keys at any nested depth", ({ assert }) => {
        assert.throws(
            () => assertPublicPayloadSafe({ warranty: { internal_note: "operator only" } }),
            /Public payload contains a restricted field/,
        );
    });

    test("rejects token-like fields case-insensitively", ({ assert }) => {
        assert.throws(() => assertPublicPayloadSafe({ certificate: { accessToken: "secret" } }), /restricted field/);
    });
});
