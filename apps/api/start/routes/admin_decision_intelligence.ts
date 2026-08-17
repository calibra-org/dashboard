import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const AdminDecisionIntelligenceController = () => import("#controllers/admin/decision_intelligence_controller");

router
    .group(() => {
        router.get("/inbox", [AdminDecisionIntelligenceController, "inbox"]).as("admin.intelligence.inbox");
        router.get("/summary", [AdminDecisionIntelligenceController, "summary"]).as("admin.intelligence.summary");
        router.get("/cases/:id", [AdminDecisionIntelligenceController, "show"]).as("admin.intelligence.show");
        router
            .post("/cases/:id/decisions", [AdminDecisionIntelligenceController, "decide"])
            .as("admin.intelligence.decide")
            .use(adminWriteLimiter);
        router
            .post("/cases/:id/outcomes", [AdminDecisionIntelligenceController, "recordOutcome"])
            .as("admin.intelligence.outcomes.create")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/intelligence")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
