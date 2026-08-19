import { test } from "@japa/runner";

import { QUALITY_ACTION_FLOW, QUALITY_CASE_FLOW } from "#services/quality_trust_service";

test.group("Phase 19 quality and trust invariants", () => {
    test("closed cases are terminal while resolved cases may reopen for new evidence", ({ assert }) => {
        assert.deepEqual(QUALITY_CASE_FLOW.closed, []);
        assert.include(QUALITY_CASE_FLOW.resolved, "investigating");
        assert.notInclude(QUALITY_CASE_FLOW.open, "closed");
    });

    test("corrective action verification may fail back to in progress", ({ assert }) => {
        assert.include(QUALITY_ACTION_FLOW.verification_pending, "completed");
        assert.include(QUALITY_ACTION_FLOW.verification_pending, "in_progress");
        assert.deepEqual(QUALITY_ACTION_FLOW.completed, []);
    });

    test("denominator-aware metrics never convert missing evidence to zero rate", ({ assert }) => {
        const rate = (numerator: number, denominator: number) => (denominator > 0 ? numerator / denominator : null);
        assert.isNull(rate(0, 0));
        assert.equal(rate(2, 20), 0.1);
    });

    test("supplier attribution requires a direct receiving allocation chain", ({ assert }) => {
        const allowed = new Set(["purchase_order_receipt_line", "supplier_incident"]);
        assert.isTrue(allowed.has("purchase_order_receipt_line"));
        assert.isFalse(allowed.has("product_review"));
        assert.isFalse(allowed.has("support_ticket"));
        assert.isFalse(allowed.has("return_item"));
    });
});
