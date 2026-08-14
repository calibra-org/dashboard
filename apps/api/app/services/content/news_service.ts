import { Exception } from "@adonisjs/core/exceptions";

import { contentService } from "#services/content/content_service";
import { currentTrx } from "#services/tenant_context";

type DbRow = Record<string, unknown>;

function numberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export class NewsService {
    async adminList(input: {
        page?: number;
        limit?: number;
        q?: string;
        status?: string;
        category_id?: number;
        author_user_id?: number;
        product_id?: number;
        from?: string | null;
        to?: string | null;
        sort?: string;
    }) {
        return contentService.list({ ...input, type: "news" });
    }

    async adminSummary() {
        const trx = currentTrx();
        const [statuses, performance, scheduled] = await Promise.all([
            trx
                .from("content_posts")
                .where("type", "news")
                .whereNull("deleted_at")
                .select("status")
                .count("id as total")
                .groupBy("status"),
            trx
                .from("content_posts")
                .where("type", "news")
                .whereNull("deleted_at")
                .select(
                    trx.raw("COALESCE(SUM(views_count),0)::bigint AS views"),
                    trx.raw("COALESCE(SUM(product_clicks_count),0)::bigint AS product_clicks"),
                    trx.raw("COALESCE(SUM(assisted_orders_count),0)::bigint AS assisted_orders"),
                    trx.raw("COALESCE(SUM(assisted_revenue_minor),0)::bigint AS assisted_revenue_minor"),
                )
                .first(),
            trx
                .from("content_posts")
                .where("type", "news")
                .where("status", "scheduled")
                .whereNotNull("scheduled_at")
                .where("scheduled_at", "<=", trx.raw("now() + interval '7 days'"))
                .count("id as total")
                .first(),
        ]);
        const byStatus = Object.fromEntries(statuses.map((row) => [String(row.status), numberValue(row.total)]));
        return {
            data: {
                total: Object.values(byStatus).reduce((sum, value) => sum + Number(value), 0),
                by_status: byStatus,
                scheduled_next_7_days: numberValue(scheduled?.total),
                performance: {
                    views: numberValue(performance?.views),
                    product_clicks: numberValue(performance?.product_clicks),
                    assisted_orders: numberValue(performance?.assisted_orders),
                    assisted_revenue_minor: numberValue(performance?.assisted_revenue_minor),
                },
            },
        };
    }

    async publicList(input: { page?: number; limit?: number; category?: string; q?: string; locale?: "fa" | "en" }) {
        return contentService.publicList({ ...input, type: "news" });
    }

    async publicDetail(slug: string, locale: "fa" | "en") {
        const result = await contentService.publicDetail(slug, locale);
        if (String((result.data as DbRow).type) !== "news") {
            throw new Exception("News item not found", { status: 404, code: "E_NEWS_NOT_FOUND" });
        }
        return result;
    }
}

export const newsService = new NewsService();
