import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminPricingBrainController = () => import("#controllers/admin/pricing_brain_controller");

router
    .group(() => {
        router.get("/overview", [AdminPricingBrainController, "overview"]).as("admin.pricingBrain.overview");
        router.post("/simulate", [AdminPricingBrainController, "simulate"]).as("admin.pricingBrain.simulate");
    })
    .prefix("/api/v1/admin/pricing-brain")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
