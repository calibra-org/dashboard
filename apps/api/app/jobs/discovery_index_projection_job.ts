import { Job } from "@adonisjs/queue";

import { withJobTenantContext } from "#jobs/with_job_tenant_context";
import DiscoveryIndexOperation from "#models/discovery_index_operation";
import { runIndexOperation } from "#services/discovery/index_projection";
export default class DiscoveryIndexProjectionJob extends Job<{ operationId: number }> {
    static options = { queue: "search", maxRetries: 5, timeout: "2m" };
    async execute() {
        await withJobTenantContext("discovery_index_operations", this.payload.operationId, async () => {
            const operation = await DiscoveryIndexOperation.findOrFail(this.payload.operationId);
            await runIndexOperation(operation);
        });
    }
}
