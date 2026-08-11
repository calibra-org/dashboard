import { BaseCommand } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

import type { SeoSearchEngineProvider } from "#services/seo/search_engines";

/**
 * Refresh rank/webmaster observations for every tenant with configured credentials.
 *
 * Intended for an external cron (for example once daily). Submission-only connectors
 * (Baidu, Naver and Seznam) are deliberately excluded so a periodic analytics job never
 * resubmits URLs just to appear active.
 */
export default class SeoSyncSearchEngines extends BaseCommand {
    static commandName = "seo:sync-search-engines";
    static description = "Sync configured SEO search-engine analytics/rank connectors for all tenants";
    static options: CommandOptions = { startApp: true };

    async run() {
        const { seoSearchEngineService } = await import("#services/seo/search_engines");
        const { forEachTenant } = await import("#services/tenant_runner");
        let attempted = 0;
        let connected = 0;
        let failed = 0;

        const tenants = await forEachTenant(async (tenantId) => {
            const integrations = await seoSearchEngineService.integrations();
            const scheduled = integrations.filter(
                (item) =>
                    Boolean(item.credential_env_ref) &&
                    item.status !== "disabled" &&
                    (item.capabilities.native_rank_tracking || item.capabilities.webmaster_analytics),
            );

            for (const item of scheduled) {
                attempted += 1;
                const result = await seoSearchEngineService.configureAndSync({
                    provider: item.provider as SeoSearchEngineProvider,
                });
                if (result.status === "connected") {
                    connected += 1;
                    this.logger.info(`tenant ${tenantId}: ${item.provider} synced successfully`);
                } else if (result.status === "error") {
                    failed += 1;
                    this.logger.warning(
                        `tenant ${tenantId}: ${item.provider} sync failed${result.last_error ? `: ${result.last_error}` : ""}`,
                    );
                } else {
                    this.logger.info(`tenant ${tenantId}: ${item.provider} is ${result.status}`);
                }
            }
        });

        this.logger.info(
            `SEO engine sync complete: tenants=${tenants.length}, attempted=${attempted}, connected=${connected}, failed=${failed}.`,
        );
    }
}
