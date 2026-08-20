import { BaseCommand, flags } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/** Apply tenant-configured Phase 8 privacy retention to already soft-deleted customers. */
export default class SocialPrivacyRetention extends BaseCommand {
    static commandName = "social:privacy-retention";
    static description = "Erase Phase 8 social personal links after each tenant privacy retention window";
    static options: CommandOptions = { startApp: true };

    @flags.number({ description: "Maximum deleted customers processed per tenant (default 100)." })
    declare limit?: number;

    async run() {
        const { socialPrivacyService } = await import("#services/social/social_privacy_service");
        const { forEachTenant } = await import("#services/tenant_runner");
        let processed = 0;
        let erased = 0;
        const tenants = await forEachTenant(async (tenantId) => {
            const result = await socialPrivacyService.eraseDueCustomers(this.limit ?? 100);
            processed += result.data.processed;
            erased += result.data.erased;
            if (result.data.processed > 0)
                this.logger.info(
                    `tenant ${tenantId}: retention_days=${result.data.retention_days} processed=${result.data.processed} erased=${result.data.erased}`,
                );
        });
        this.logger.info(`Social privacy retention: tenants=${tenants.length} processed=${processed} erased=${erased}`);
    }
}
