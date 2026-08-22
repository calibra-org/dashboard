import { DateTime } from "luxon";
import DiscoveryIndexProjectionJob from "#jobs/discovery_index_projection_job";
import DiscoveryIndexOperation from "#models/discovery_index_operation";
import { syncProductNow } from "./search_service.js";
const errText = (error: unknown) => (error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000));
export async function enqueueProductProjection(productId: number): Promise<void> {
    const key = `product:${productId}:${Date.now()}`;
    const operation = await DiscoveryIndexOperation.create({
        operation: "upsert_product",
        productId,
        status: "pending",
        idempotencyKey: key,
        attempts: 0,
        maxAttempts: 5,
        availableAt: DateTime.utc(),
    });
    try {
        await DiscoveryIndexProjectionJob.dispatch({ operationId: Number(operation.id) });
    } catch (error) {
        operation.status = "retrying";
        operation.lastError = `enqueue: ${errText(error)}`;
        operation.availableAt = DateTime.utc().plus({ minutes: 1 });
        await operation.save();
    }
}
export async function enqueueProductsProjection(ids: ReadonlyArray<bigint | number>): Promise<void> {
    for (const id of [...new Set(ids.map(Number).filter(Number.isSafeInteger))]) await enqueueProductProjection(id);
}
export async function runIndexOperation(operation: DiscoveryIndexOperation): Promise<void> {
    if (operation.status === "succeeded") return;
    operation.status = "processing";
    operation.attempts += 1;
    operation.startedAt = DateTime.utc();
    await operation.save();
    try {
        if (operation.operation === "upsert_product" && operation.productId !== null)
            await syncProductNow(Number(operation.productId));
        else throw new Error(`Unsupported discovery index operation: ${operation.operation}`);
        operation.status = "succeeded";
        operation.completedAt = DateTime.utc();
        operation.lastError = null;
        await operation.save();
    } catch (error) {
        operation.lastError = errText(error);
        operation.status = operation.attempts >= operation.maxAttempts ? "dead_letter" : "retrying";
        operation.availableAt = DateTime.utc().plus({ minutes: Math.min(30, 2 ** operation.attempts) });
        await operation.save();
        throw error;
    }
}
export async function retryIndexOperation(id: number) {
    const operation = await DiscoveryIndexOperation.findOrFail(id);
    if (!["retrying", "dead_letter", "pending"].includes(operation.status)) return operation;
    operation.status = "pending";
    operation.availableAt = DateTime.utc();
    await operation.save();
    await DiscoveryIndexProjectionJob.dispatch({ operationId: Number(operation.id) });
    return operation;
}
