import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminCustomerIntelligenceController = () => import("#controllers/admin/customer_intelligence_controller");

router
    .group(() => {
        router.get("/summary", [AdminCustomerIntelligenceController, "summary"]);
        router.get("/cohorts", [AdminCustomerIntelligenceController, "cohorts"]);
        router.post("/refresh", [AdminCustomerIntelligenceController, "refreshAll"]);
        router.get("/customers/:id", [AdminCustomerIntelligenceController, "show"]);
        router.post("/customers/:id/refresh", [AdminCustomerIntelligenceController, "refresh"]);
    })
    .prefix("/api/v1/admin/customer-intelligence")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
