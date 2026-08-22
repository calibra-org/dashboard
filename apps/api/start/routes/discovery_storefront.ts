import router from "@adonisjs/core/services/router";
import limiter from "@adonisjs/limiter/services/main";

import { recordRateLimitThrottled } from "#services/metrics/domain_metrics";

const Controller = () => import("#controllers/storefront/discovery_controller");
const searchLimiter = limiter.define("discovery_public", (ctx) =>
    limiter
        .allowRequests(180)
        .every("1 minute")
        .usingKey(`discovery:${ctx.request.header("x-calibra-tenant") ?? ctx.request.host()}:${ctx.request.ip()}`)
        .limitExceeded(() => recordRateLimitThrottled("discovery_public")),
);
router
    .group(() => {
        router.post("/search", [Controller, "search"]).as("discovery.storefront.search").use(searchLimiter);
        router.post("/events", [Controller, "event"]).as("discovery.storefront.event").use(searchLimiter);
    })
    .prefix("/api/v1/storefront/discovery");
