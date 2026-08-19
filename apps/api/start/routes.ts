/**
 * Public route table. Versioned under `/api/v1` so breaking changes can ship behind `/api/v2`
 * without rewriting consumer apps. Liveness probe lives at `/health` (unversioned).
 *
 * Per-domain route files live under `start/routes/`; this module imports each one so the registry
 * is fully populated before AdonisJS boots the HTTP server.
 */

import router from "@adonisjs/core/services/router";

import { renderPrometheusText } from "#middleware/metrics_middleware";
import { healthChecks } from "#start/health";

router.get("/health", async () => ({ status: "ok" }));
router.get("/health/live", async () => ({ status: "ok" }));
router.get("/health/ready", async ({ response }) => {
    const report = await healthChecks.run();
    response.status(report.isHealthy ? 200 : 503);
    return report;
});
router.get("/metrics", async ({ response }) => {
    response.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return renderPrometheusText();
});

await import("./routes/catalog.js");
await import("./routes/auth.js");
await import("./routes/platform.js");
await import("./routes/account.js");
await import("./routes/account_identity.js");
await import("./routes/cart.js");
await import("./routes/checkout.js");
await import("./routes/account_orders.js");
await import("./routes/currency.js");
await import("./routes/storefront.js");
await import("./routes/personalization.js");
await import("./routes/experiments.js");
await import("./routes/admin_catalog.js");
await import("./routes/admin_customers.js");
await import("./routes/admin_customer_notes.js");
await import("./routes/admin_customer_tags.js");
await import("./routes/admin_customer_segments.js");
await import("./routes/admin_customer_actions.js");
await import("./routes/admin_orders.js");
await import("./routes/admin_phase5_operations.js");
await import("./routes/admin_coupons.js");
await import("./routes/admin_refunds.js");
await import("./routes/admin_notes.js");
await import("./routes/admin_payments.js");
await import("./routes/admin_factor.js");
await import("./routes/admin_content.js");
await import("./routes/admin_news.js");
await import("./routes/admin_seo.js");
await import("./routes/admin_seo_operations.js");
await import("./routes/admin_tickets.js");
await import("./routes/admin_ticket_operations.js");
await import("./routes/admin_ticket_campaign_review.js");
await import("./routes/admin_ticket_omnichannel.js");
await import("./routes/admin_identity.js");
await import("./routes/admin_governance.js");
await import("./routes/admin_reports.js");
await import("./routes/admin_insights.js");
await import("./routes/admin_decision_intelligence.js");
await import("./routes/admin_economics.js");
await import("./routes/admin_pricing_brain.js");
await import("./routes/admin_planning.js");
await import("./routes/admin_procurement.js");
await import("./routes/admin_experiments.js");
await import("./routes/admin_trust_risk.js");
await import("./routes/admin_settings.js");
await import("./routes/admin_personalization.js");
await import("./routes/admin_media.js");
await import("./routes/admin_product_imports.js");
await import("./routes/admin_product_exports.js");
await import("./routes/uploads.js");
await import("./routes/payment.js");
await import("./routes/factor_public.js");
await import("./routes/content_public.js");
await import("./routes/news_public.js");
await import("./routes/seo_public.js");
await import("./routes/support_public.js");
await import("./routes/support_channel_webhooks.js");
await import("./routes/support_api.js");