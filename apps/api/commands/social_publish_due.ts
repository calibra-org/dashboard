import { BaseCommand, flags } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/** Publish/expire due Social Commerce content for every tenant. Intended for a once-per-minute host cron. */
export default class SocialPublishDue extends BaseCommand {
    static commandName = "social:publish-due";
    static description = "Publish approved scheduled social content and expire due content";
    static options: CommandOptions = { startApp: true };

    @flags.number({ description: "Maximum scheduled and expiring rows processed per tenant (default 100)." })
    declare limit?: number;

    async run() {
        const { socialCommerceService } = await import("#services/social/social_commerce_service");
        const { forEachTenant } = await import("#services/tenant_runner");
        let published = 0;
        let expired = 0;
        let blocked = 0;
        const tenants = await forEachTenant(async (tenantId) => {
            const result = await socialCommerceService.publishDue(this.limit ?? 100);
            published += result.data.published;
            expired += result.data.expired;
            blocked += result.data.blocked.length;
            if (result.data.processed > 0)
                this.logger.info(
                    `tenant ${tenantId}: published=${result.data.published} expired=${result.data.expired} blocked=${result.data.blocked.length}`,
                );
        });
        this.logger.info(
            `Social scheduler: tenants=${tenants.length} published=${published} expired=${expired} blocked=${blocked}`,
        );
    }
}
