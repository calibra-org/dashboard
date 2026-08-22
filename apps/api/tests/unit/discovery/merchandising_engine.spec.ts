import { test } from "@japa/runner";
import { applyMerchandising } from "#services/discovery/merchandising_engine";

test.group("phase16 merchandising", () => {
    test("hide wins and pin is applied after score changes", ({ assert }) => {
        const result = applyMerchandising(
            [
                { id: 1, score: 1, categoryIds: [10] },
                { id: 2, score: 0.9, categoryIds: [20] },
                { id: 3, score: 0.8, categoryIds: [10] },
            ],
            [
                { id: 1, action: "hide", productId: 1, categoryId: null, boostFactor: null, pinPosition: null, priority: 1 },
                { id: 2, action: "boost", productId: 3, categoryId: null, boostFactor: 2, pinPosition: null, priority: 10 },
                { id: 3, action: "pin", productId: 2, categoryId: null, boostFactor: null, pinPosition: 1, priority: 20 },
            ],
        );
        assert.deepEqual(result.map((row) => row.id), [2, 3]);
    });

    test("category rules affect every candidate in the canonical category", ({ assert }) => {
        const result = applyMerchandising(
            [
                { id: 1, score: 1, categoryIds: [10] },
                { id: 2, score: 0.9, categoryIds: [20] },
                { id: 3, score: 0.8, categoryIds: [10] },
            ],
            [{ id: 4, action: "hide", productId: null, categoryId: 10, boostFactor: null, pinPosition: null, priority: 1 }],
        );
        assert.deepEqual(result.map((row) => row.id), [2]);
    });
});
