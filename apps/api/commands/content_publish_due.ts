import { BaseCommand } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/** Publish approved scheduled content for every tenant. Intended for a once-per-minute cron. */
export default class ContentPublishDue extends BaseCommand {
    static commandName = "content:publish-due";
    static description = "Publish tenant content whose scheduled time has arrived";
    static options: CommandOptions = { startApp: true };

    async run() {
        const { contentService } = await import("#services/content/content_service");
        const { contentSchedulerObservabilityService } = await import("#services/content/scheduler_observability_service");
        const { forEachTenant } = await import("#services/tenant_runner");
        let total = 0;
        const tenants = await forEachTenant(async (tenantId) => {
            const runId = await contentSchedulerObservabilityService.begin("publish_due");
            if (runId === null) {
                this.logger.info(`tenant ${tenantId}: publish scheduler already claimed this minute`);
                return;
            }
            try {
                const count = await contentService.publishDue();
                total += count;
                await contentSchedulerObservabilityService.complete(runId, count);
                if (count > 0) this.logger.info(`tenant ${tenantId}: published ${count} scheduled content item(s)`);
            } catch (error) {
                await contentSchedulerObservabilityService.fail(runId, error);
                this.logger.error(`tenant ${tenantId}: publish scheduler failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
        this.logger.info(`Published ${total} content item(s) across ${tenants.length} tenant(s).`);
    }
}
