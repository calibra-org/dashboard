import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const AdminTrustController = () => import("#controllers/admin/trust_risk_controller");

router
    .group(() => {
        router.get("/overview", [AdminTrustController, "overview"]).as("admin.trust.overview");
        router.get("/cases", [AdminTrustController, "cases"]).as("admin.trust.cases");
        router.get("/cases/:publicId", [AdminTrustController, "caseDetail"]).as("admin.trust.case");
        router
            .post("/cases/:publicId/assign", [AdminTrustController, "assignCase"])
            .as("admin.trust.case.assign")
            .use(adminWriteLimiter);
        router
            .post("/cases/:publicId/decision", [AdminTrustController, "decideCase"])
            .as("admin.trust.case.decision")
            .use(adminWriteLimiter);
        router
            .post("/cases/:publicId/override", [AdminTrustController, "overrideCase"])
            .as("admin.trust.case.override")
            .use(adminWriteLimiter);
        router
            .post("/cases/:publicId/appeal", [AdminTrustController, "appealCase"])
            .as("admin.trust.case.appeal")
            .use(adminWriteLimiter);
        router
            .post("/cases/:publicId/outcome", [AdminTrustController, "outcome"])
            .as("admin.trust.case.outcome")
            .use(adminWriteLimiter);
        router.get("/graph", [AdminTrustController, "graph"]).as("admin.trust.graph");
        router.get("/signals", [AdminTrustController, "signals"]).as("admin.trust.signals");
        router.post("/scan", [AdminTrustController, "scan"]).as("admin.trust.scan").use(adminWriteLimiter);
        router.get("/policies", [AdminTrustController, "policies"]).as("admin.trust.policies");
        router.post("/policies", [AdminTrustController, "createPolicy"]).as("admin.trust.policies.create").use(adminWriteLimiter);
        router
            .post("/policies/simulate", [AdminTrustController, "simulatePolicy"])
            .as("admin.trust.policies.simulate")
            .use(adminWriteLimiter);
        router.get("/models", [AdminTrustController, "models"]).as("admin.trust.models");
        router.post("/models", [AdminTrustController, "registerModel"]).as("admin.trust.models.create").use(adminWriteLimiter);
        router
            .patch("/models/:publicId/rollout", [AdminTrustController, "updateModelRollout"])
            .as("admin.trust.models.rollout")
            .use(adminWriteLimiter);
        router.get("/outcomes", [AdminTrustController, "outcomes"]).as("admin.trust.outcomes");
        router.get("/access", [AdminTrustController, "access"]).as("admin.trust.access");
        router
            .post("/access/preset", [AdminTrustController, "applyAccessPreset"])
            .as("admin.trust.access.preset")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/trust")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
