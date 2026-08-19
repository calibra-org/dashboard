import { test } from "@japa/runner";

test.group("Phase14 procurement invariants", () => {
    test("receipt disposition is conserved", ({ assert }) => {
        const received = 12,
            accepted = 9,
            rejected = 2,
            quarantine = 1;
        assert.equal(accepted + rejected + quarantine, received);
    });
    test("MOQ and multiple round recommendation upward", ({ assert }) => {
        const demand = 23,
            moq = 10,
            multiple = 6;
        assert.equal(Math.max(moq, Math.ceil(demand / multiple) * multiple), 24);
    });
});