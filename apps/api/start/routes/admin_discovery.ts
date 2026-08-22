import router from "@adonisjs/core/services/router";
import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";
const Controller = () => import("#controllers/admin/discovery_controller");
router
    .group(() => {
        router.get("/capabilities", [Controller, "capabilities"]).as("discovery.admin.capabilities");
        router.get("/overview", [Controller, "overview"]).as("discovery.admin.overview");
        router.get("/queries", [Controller, "queries"]).as("discovery.admin.queries");
        router.get("/zero-results", [Controller, "zeroResults"]).as("discovery.admin.zeroResults");
        router.post("/simulate", [Controller, "simulator"]).as("discovery.admin.simulator").use(adminWriteLimiter);
        router.get("/synonyms", [Controller, "synonyms"]).as("discovery.admin.synonyms");
        router.post("/synonyms", [Controller, "synonymCreate"]).as("discovery.admin.synonymCreate").use(adminWriteLimiter);
        router
            .post("/synonyms/:id/toggle", [Controller, "synonymToggle"])
            .as("discovery.admin.synonymToggle")
            .use(adminWriteLimiter);
        router.get("/merchandising", [Controller, "merchandising"]).as("discovery.admin.merchandising");
        router
            .post("/merchandising", [Controller, "merchandisingCreate"])
            .as("discovery.admin.merchandisingCreate")
            .use(adminWriteLimiter);
        router
            .post("/merchandising/:id/status", [Controller, "merchandisingStatus"])
            .as("discovery.admin.merchandisingStatus")
            .use(adminWriteLimiter);
        router.get("/relationships", [Controller, "relationships"]).as("discovery.admin.relationships");
        router
            .post("/relationships", [Controller, "relationshipCreate"])
            .as("discovery.admin.relationshipCreate")
            .use(adminWriteLimiter);
        router
            .post("/relationships/:id/resolve", [Controller, "relationshipResolve"])
            .as("discovery.admin.relationshipResolve")
            .use(adminWriteLimiter);
        router
            .post("/relationships/:id/revoke", [Controller, "relationshipRevoke"])
            .as("discovery.admin.relationshipRevoke")
            .use(adminWriteLimiter);
        router.post("/compatibility/resolve", [Controller, "compatibility"]).as("discovery.admin.compatibility");
        router.get("/opportunities", [Controller, "opportunities"]).as("discovery.admin.opportunities");
        router
            .post("/opportunities/detect", [Controller, "detectOpportunities"])
            .as("discovery.admin.detectOpportunities")
            .use(adminWriteLimiter);
        router
            .post("/opportunities/:id/action", [Controller, "opportunityAction"])
            .as("discovery.admin.opportunityAction")
            .use(adminWriteLimiter);
        router.get("/policies", [Controller, "policies"]).as("discovery.admin.policies");
        router.post("/policies", [Controller, "policyCreate"]).as("discovery.admin.policyCreate").use(adminWriteLimiter);
        router
            .post("/policies/:id/versions", [Controller, "policyVersion"])
            .as("discovery.admin.policyVersion")
            .use(adminWriteLimiter);
        router
            .post("/policies/:id/activate", [Controller, "policyActivate"])
            .as("discovery.admin.policyActivate")
            .use(adminWriteLimiter);
        router
            .post("/policies/:id/rollback", [Controller, "policyRollback"])
            .as("discovery.admin.policyRollback")
            .use(adminWriteLimiter);
        router.get("/index/health", [Controller, "indexHealth"]).as("discovery.admin.indexHealth");
        router.post("/index/rebuild", [Controller, "rebuild"]).as("discovery.admin.rebuild").use(adminWriteLimiter);
        router
            .post("/index/operations/:id/retry", [Controller, "retryIndex"])
            .as("discovery.admin.retryIndex")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/discovery")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
