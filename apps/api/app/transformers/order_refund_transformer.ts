import { BaseTransformer } from "@adonisjs/core/transformers";

import type OrderRefund from "#models/order_refund";
import type OrderRefundLineItem from "#models/order_refund_line_item";

/**
 * Owns the `/api/v1/.../refunds/*` response shape. The raw `attributes` bag is intentionally not
 * exposed because it may contain provider diagnostics. Instead, the transformer derives a bounded
 * gateway settlement projection so the admin can distinguish "refund booked" from "PSP money
 * movement completed" without leaking provider payloads.
 */
export default class OrderRefundTransformer extends BaseTransformer<OrderRefund> {
    toObject() {
        const refund = this.resource;
        const lineItems = (refund as OrderRefund & { lineItems?: OrderRefundLineItem[] }).lineItems ?? [];
        const gatewayRefund = this.gatewayRefundProjection(refund.attributes);
        return {
            id: Number(refund.id),
            order_id: Number(refund.orderId),
            refund_number: Number(refund.refundNumber),
            amount_minor: Number(refund.amountMinor),
            tax_amount_minor: Number(refund.taxAmountMinor),
            reason: refund.reason,
            refunded_by_user_id: refund.refundedByUserId === null ? null : Number(refund.refundedByUserId),
            restock_requested: refund.restockRequested,
            gateway_refund_id: refund.gatewayRefundId,
            gateway_refund_status: gatewayRefund.status,
            gateway_refund_error_code: gatewayRefund.errorCode,
            processed_at: refund.processedAt?.toISO() ?? null,
            line_items: lineItems.map((line) => this.serializeLine(line)),
            created_at: refund.createdAt?.toISO() ?? null,
        };
    }

    private gatewayRefundProjection(attributes: unknown): {
        status: "completed" | "manual_action_required" | "unknown";
        errorCode: string | null;
    } {
        if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
            return { status: "unknown", errorCode: null };
        }
        const gatewayRefund = (attributes as Record<string, unknown>).gateway_refund;
        if (!gatewayRefund || typeof gatewayRefund !== "object" || Array.isArray(gatewayRefund)) {
            return { status: "unknown", errorCode: null };
        }
        const projection = gatewayRefund as Record<string, unknown>;
        if (projection.ok === true) return { status: "completed", errorCode: null };
        if (projection.ok === false) {
            return {
                status: "manual_action_required",
                errorCode: typeof projection.error_code === "string" ? projection.error_code : "unknown",
            };
        }
        return { status: "unknown", errorCode: null };
    }

    private serializeLine(line: OrderRefundLineItem) {
        return {
            id: Number(line.id),
            order_line_item_id: Number(line.orderLineItemId),
            quantity: line.quantity,
            refund_amount_minor: Number(line.refundAmountMinor),
            refund_tax_minor: Number(line.refundTaxMinor),
        };
    }
}
