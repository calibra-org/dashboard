import { BaseCommand } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";
import db from "@adonisjs/lucid/services/db";

import { withJobTenantContext } from "#jobs/with_job_tenant_context";
import {
    completeSeoCrawlTarget,
    failSeoCrawlTarget,
    type PreparedSeoCrawlTarget,
    prepareSeoCrawlTarget,
    requestSeoCrawlTarget,
} from "#services/seo/crawl_service";

export default class SeoRunCrawls extends BaseCommand {
    static commandName = "seo:run-crawls";
    static description = "Process queued SEO crawl targets with tenant isolation and SSRF protection";
    static options: CommandOptions = { startApp: true };

    async run() {
        const candidates = (await db
            .connection("postgres_admin")
            .from("seo_crawl_targets")
            .whereIn("status", ["queued", "failed"])
            .where("attempts", "<", 3)
            .orderBy("created_at", "asc")
            .limit(100)
            .select("id")) as Array<{ id: number | string }>;

        let completed = 0;
        let failed = 0;
        for (const candidate of candidates) {
            const targetId = Number(candidate.id);
            let prepared: PreparedSeoCrawlTarget | null = null;
            await withJobTenantContext("seo_crawl_targets", targetId, async () => {
                prepared = await prepareSeoCrawlTarget(targetId);
            });
            const claimed = prepared;
            if (!claimed) continue;

            try {
                const fetched = await requestSeoCrawlTarget(claimed);
                await withJobTenantContext("seo_crawl_targets", targetId, async () => {
                    await completeSeoCrawlTarget(claimed, fetched);
                });
                completed += 1;
            } catch (error) {
                await withJobTenantContext("seo_crawl_targets", targetId, async () => {
                    await failSeoCrawlTarget(claimed, error);
                });
                failed += 1;
            }
        }
        this.logger.info(`SEO crawl worker processed ${completed + failed} target(s): ${completed} completed, ${failed} failed.`);
    }
}
