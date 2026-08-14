import vine from "@vinejs/vine";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Admin date picker sends Gregorian `YYYY-MM-DD` values. JavaScript parses that shape at UTC
 * midnight, so using it unchanged as an inclusive `date_to` would silently drop almost the entire
 * final day. Normalize date-only bounds before the controller converts them to `Date` objects.
 * Explicit timestamps are preserved byte-for-byte so API callers can still request sub-day ranges.
 */
const reportDate = (boundary: "start" | "end") =>
    vine
        .string()
        .trim()
        .maxLength(40)
        .transform((value) => {
            if (!DATE_ONLY.test(value)) return value;
            return boundary === "start" ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`;
        });

/**
 * Query parameters for `GET /api/v1/admin/reports/top-products`. `days` is bounded so a careless
 * caller can't ask for a five-year window; `limit` caps how many rows we return.
 */
export const adminTopProductsValidator = vine.compile(
    vine.object({
        days: vine.number().min(1).max(365).optional(),
        limit: vine.number().min(1).max(50).optional(),
    }),
);

/** `GET /api/v1/admin/reports/top-categories` — same trailing-window contract as top-products. */
export const adminTopCategoriesValidator = adminTopProductsValidator;

/**
 * Shared query contract for every windowed analytics endpoint (performance + the `*​/stats`
 * family). `date_from` / `date_to` are inclusive Gregorian bounds the admin date-picker resolves;
 * `interval` overrides the auto-picked bucket granularity; `compare_from` / `compare_to` request a
 * parallel comparison window.
 */
export const adminReportStatsValidator = vine.compile(
    vine.object({
        date_from: reportDate("start"),
        date_to: reportDate("end"),
        interval: vine.enum(["day", "week", "month"]).optional(),
        compare_from: reportDate("start").optional(),
        compare_to: reportDate("end").optional(),
    }),
);

/**
 * Query contract for the custom report TABLE endpoints (revenue / orders / products / categories /
 * coupons / taxes). These are GROUP BY aggregations, not entity lists, so they take a flat sort +
 * pagination contract rather than the TableView grammar. `format=csv` streams the full windowed
 * result as a download.
 */
export const adminReportTableValidator = vine.compile(
    vine.object({
        date_from: reportDate("start"),
        date_to: reportDate("end"),
        interval: vine.enum(["day", "week", "month"]).optional(),
        order_by: vine.string().trim().maxLength(40).optional(),
        order_dir: vine.enum(["asc", "desc"]).optional(),
        page: vine.number().min(1).optional(),
        limit: vine.number().min(1).max(200).optional(),
        format: vine.enum(["csv"]).optional(),
        q: vine.string().trim().maxLength(120).optional(),
        category_id: vine.number().min(1).optional(),
    }),
);

/**
 * Stock report query contract. The Stock report is a current snapshot with no date dimension, so it
 * drops `date_from` / `date_to` and adds the `status` filter (including the derived `lowstock`).
 */
export const adminStockReportValidator = vine.compile(
    vine.object({
        status: vine.enum(["all", "instock", "outofstock", "onbackorder", "lowstock"]).optional(),
        q: vine.string().trim().maxLength(120).optional(),
        order_by: vine.string().trim().maxLength(40).optional(),
        order_dir: vine.enum(["asc", "desc"]).optional(),
        page: vine.number().min(1).optional(),
        limit: vine.number().min(1).max(200).optional(),
        format: vine.enum(["csv"]).optional(),
    }),
);
