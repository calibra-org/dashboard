import type { HttpContext } from "@adonisjs/core/http";

import { newsService } from "#services/content/news_service";
import { contentSchedulerObservabilityService } from "#services/content/scheduler_observability_service";
import { adminContentPostListValidator } from "#validators/admin/content_validator";

export default class AdminNewsController {
    async index(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminContentPostListValidator);
        const { type: _ignored, ...filters } = payload;
        return newsService.adminList(filters);
    }

    async summary() {
        return newsService.adminSummary();
    }

    async schedulerRuns(ctx: HttpContext) {
        const kind = String(ctx.request.input("kind", ""));
        const normalized = kind === "publish_due" || kind === "ingest_due" ? kind : undefined;
        return contentSchedulerObservabilityService.list(normalized, Number(ctx.request.input("limit", 100)));
    }
}
