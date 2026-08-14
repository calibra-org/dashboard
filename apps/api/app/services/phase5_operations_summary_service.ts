import { OrderStatus } from "#enums/order_status";
import { currentTrx } from "#services/tenant_context";

function countValue(row: Record<string, unknown> | undefined): number {
    const parsed = Number(row?.total ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Operational exception counters for the existing Orders workbench.
 *
 * A paid order remains operationally unfulfilled while it is still `processing`, even when a
 * pending/packed/shipped fulfillment already exists. Counting only orders with zero fulfillment
 * rows hides the exact stale-in-progress cases this strip is meant to surface. Carrier-returned
 * shipments are also exceptions requiring operator attention, alongside explicit carrier
 * `exception` events.
 */
export class Phase5OperationsSummaryService {
    async summary() {
        const trx = currentTrx();
        const stalePaid = trx.raw("now() - interval '24 hours'");
        const [unfulfilled, shipmentExceptions, approval, refund] = await Promise.all([
            trx
                .from("orders")
                .where("status", OrderStatus.Processing)
                .whereNotNull("date_paid_at")
                .where("date_paid_at", "<", stalePaid)
                .whereNull("deleted_at")
                .count("id as total")
                .first(),
            trx.from("order_shipments").whereIn("status", ["exception", "returned"]).count("id as total").first(),
            trx.from("order_returns").where("status", "requested").count("id as total").first(),
            trx.from("order_returns").where("status", "received").whereNull("refund_id").count("id as total").first(),
        ]);

        return {
            data: {
                paid_unfulfilled_over_24h: countValue(unfulfilled),
                shipment_exceptions: countValue(shipmentExceptions),
                returns_awaiting_approval: countValue(approval),
                returns_awaiting_refund: countValue(refund),
            },
        };
    }
}

export const phase5OperationsSummaryService = new Phase5OperationsSummaryService();
