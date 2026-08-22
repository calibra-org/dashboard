import { test } from "@japa/runner";
import { normalizeDiscoveryQuery, redactDiscoveryQuery } from "#services/discovery/normalizer";
import { hashSession } from "#services/discovery/search_service";

test.group("phase16 discovery normalization", () => {
    test("normalizes Arabic/Persian characters, digits and measurement units", ({ assert }) => {
        assert.equal(normalizeDiscoveryQuery(" لوله ي ۲ اينچ  ۲۰ سانتی متر "), "لوله ی 2 in 20 cm");
    });

    test("masks email, formatted mobile, IBAN and long numeric identifiers", ({ assert }) => {
        const value = redactDiscoveryQuery(
            "reza@example.com 0912 123 4567 IR820540102680020817909002 123456789012",
        );
        assert.notInclude(value, "reza@example.com");
        assert.notInclude(value, "0912 123 4567");
        assert.notInclude(value, "IR820540102680020817909002");
        assert.include(value, "[email]");
        assert.include(value, "[phone]");
        assert.include(value, "[iban]");
    });

    test("hashes sessions deterministically without storing raw key", ({ assert }) => {
        const hash = hashSession("session-secret");
        assert.equal(hash, hashSession("session-secret"));
        assert.notEqual(hash, "session-secret");
        assert.lengthOf(hash!, 64);
    });
});
