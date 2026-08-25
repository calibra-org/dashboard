import { withJobTenantContext } from "#jobs/with_job_tenant_context";
import { reconcileCreatorRefund, settleCreatorCommissions } from "#services/retail_media/retail_media_service";

export async function handleRetailMediaOrderCompleted(orderId: number) {
    await withJobTenantContext("orders", orderId, async () => {
        await settleCreatorCommissions(orderId);
    });
}

export async function handleRetailMediaOrderRefunded(refundId: number) {
    await withJobTenantContext("order_refunds", refundId, async () => {
        await reconcileCreatorRefund(refundId);
    });
}
