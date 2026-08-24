import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const NetworkIntelligenceController = () => import("#controllers/admin/network_intelligence_controller");

router
    .group(() => {
        router.get("/overview", [NetworkIntelligenceController, "overview"]).as("admin.network_intelligence.overview");
        router.get("/metrics", [NetworkIntelligenceController, "metrics"]).as("admin.network_intelligence.metrics");
        router
            .post("/metrics", [NetworkIntelligenceController, "metric"])
            .as("admin.network_intelligence.metrics.create")
            .use(adminWriteLimiter);
        router
            .post("/participation", [NetworkIntelligenceController, "participation"])
            .as("admin.network_intelligence.participation")
            .use(adminWriteLimiter);
        router.get("/contributions", [NetworkIntelligenceController, "contributions"]).as("admin.network_intelligence.contributions");
        router
            .post("/contributions", [NetworkIntelligenceController, "contribution"])
            .as("admin.network_intelligence.contributions.upsert")
            .use(adminWriteLimiter);
        router.get("/benchmarks", [NetworkIntelligenceController, "benchmarks"]).as("admin.network_intelligence.benchmarks");
        router
            .post("/exports", [NetworkIntelligenceController, "export"])
            .as("admin.network_intelligence.exports.create")
            .use(adminWriteLimiter);
        router
            .post("/security-reviews", [NetworkIntelligenceController, "securityReview"])
            .as("admin.network_intelligence.security_reviews.create")
            .use(adminWriteLimiter);
        router.get("/access", [NetworkIntelligenceController, "access"]).as("admin.network_intelligence.access");
        router
            .post("/access/preset", [NetworkIntelligenceController, "applyAccessPreset"])
            .as("admin.network_intelligence.access.preset")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/network-intelligence")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
