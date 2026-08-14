import { test } from "@japa/runner";
import { DateTime } from "luxon";

import OrderRefund from "#models/order_refund";
import OrderRefundTransformer from "#transformers/order_refund_transformer";

function refundWithGatewayProjection(gatewayRefund: Record<string, unknown>) {
    const refund = new OrderRefund();
    refund.id = 1;
    refund.orderId = 10;
    refund.refundNumber = 1000;
    refund.amountMinor = 500_000;
    refund.taxAmountMinor = 0;
    refund.reason = "test";
    refund.refundedByUserId = 3;
    refund.restockRequested = false;
    refund.gatewayRefundId = null;
    refund.processedAt = DateTime.utc();
    refund.createdAt = DateTime.utc();
    refund.attributes = { gateway_refund: gatewayRefund };
    return refund;
}

test.group("OrderRefundTransformer gateway projection", () => {
    test("exposes completed automatic settlement without raw provider attributes", ({ assert }) => {
        const refund = refundWithGatewayProjection({ ok: true, gateway_refund_id: "PSP-123", secret_detail: "hidden" });
        refund.gatewayRefundId = "PSP-123";

        const output = new OrderRefundTransformer(refund).toObject();

        assert.equal(output.gateway_refund_status, "completed");
        assert.isNull(output.gateway_refund_error_code);
        assert.equal(output.gateway_refund_id, "PSP-123");
        assert.notProperty(output, "attributes");
        assert.notInclude(JSON.stringify(output), "secret_detail");
    });

    test("marks failed automatic settlement for operator reconciliation using only a bounded code", ({ assert }) => {
        const refund = refundWithGatewayProjection({
            ok: false,
            error_code: "refunds_unsupported",
            error_message: "provider raw text must remain internal",
        });

        const output = new OrderRefundTransformer(refund).toObject();

        assert.equal(output.gateway_refund_status, "manual_action_required");
        assert.equal(output.gateway_refund_error_code, "refunds_unsupported");
        assert.notInclude(JSON.stringify(output), "provider raw text must remain internal");
    });
});
