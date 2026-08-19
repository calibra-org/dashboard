import { test } from "@japa/runner";
import { isMutationCapability, weightedReadiness } from "../../../app/services/agentic_gateway/contracts.js";

const dimension = (key: string, scoreBp: number, weightBp = 1250) => ({ key, scoreBp, weightBp, missing: [] as string[] });

test.group("Phase21 Agentic Commerce Gateway contracts", () => {
    test("readiness is weighted from explicit dimensions", ({ assert }) => {
        const score = weightedReadiness([
            dimension("identity", 10000),
            dimension("attributes", 10000),
            dimension("compatibility", 0),
            dimension("media", 10000),
            dimension("price_stock_freshness", 10000),
            dimension("fulfillment", 10000),
            dimension("policy_legal", 0),
            dimension("evidence_quality", 10000),
        ]);
        assert.isAbove(score, 0);
        assert.isBelow(score, 10000);
    });

    test("mutation capability classifier separates read and write operations", ({ assert }) => {
        assert.isFalse(isMutationCapability("catalog.search"));
        assert.isFalse(isMutationCapability("catalog.product.read"));
        assert.isTrue(isMutationCapability("cart.add"));
        assert.isTrue(isMutationCapability("order.cancel"));
    });

    test("readiness never exceeds basis-point bounds", ({ assert }) => {
        assert.equal(weightedReadiness([dimension("high", 50000), dimension("low", -1)]), 5000);
        assert.equal(weightedReadiness([dimension("high", 50000)]), 10000);
        assert.equal(weightedReadiness([dimension("low", -1)]), 0);
    });
});
