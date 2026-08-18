import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const Controller = () => import("#controllers/admin/pricing_brain_controller");

router
    .group(() => {
        router.get("/overview", [Controller, "overview"]).as("admin.pricing_brain.overview");
        router.get("/policies", [Controller, "policies"]).as("admin.pricing_brain.policies");
        router.get("/proposals", [Controller, "proposals"]).as("admin.pricing_brain.proposals");
        router.post("/policies", [Controller, "createPolicy"]).as("admin.pricing_brain.policies.create").use(adminWriteLimiter);
        router
            .post("/policies/:id/versions", [Controller, "createVersion"])
            .as("admin.pricing_brain.versions.create")
            .use(adminWriteLimiter);
        router
            .post("/policies/:id/actions/:action", [Controller, "transition"])
            .as("admin.pricing_brain.policies.transition")
            .use(adminWriteLimiter);
        router
            .post("/policies/:id/freeze", [Controller, "freeze"])
            .as("admin.pricing_brain.policies.freeze")
            .use(adminWriteLimiter);
        router.post("/proposals", [Controller, "createProposal"]).as("admin.pricing_brain.proposals.create").use(adminWriteLimiter);
        router.post("/simulate", [Controller, "simulate"]).as("admin.pricing_brain.simulate").use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/pricing-brain")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
