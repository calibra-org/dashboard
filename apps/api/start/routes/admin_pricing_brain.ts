import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const Controller = () => import("#controllers/admin/pricing_brain_controller");

router
    .group(() => {
        router.get("/overview", [Controller, "overview"]).as("admin.pricing_brain.overview");
        router.post("/simulate", [Controller, "simulate"]).as("admin.pricing_brain.simulate").use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/pricing-brain")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
