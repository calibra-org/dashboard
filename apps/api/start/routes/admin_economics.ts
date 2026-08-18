import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const Controller = () => import("#controllers/admin/economics_controller");

router
    .group(() => {
        router.get("/overview", [Controller, "overview"]);
        router.get("/cube", [Controller, "cube"]);
        router.get("/working-capital", [Controller, "workingCapital"]);
        router.get("/orders/:id", [Controller, "order"]);
        router.get("/products/:id", [Controller, "product"]);
        router.post("/cost-policies", [Controller, "createPolicy"]).use(adminWriteLimiter);
        router.post("/cost-layers", [Controller, "createLayer"]).use(adminWriteLimiter);
        router.post("/line-costs/:id/corrections", [Controller, "correctCost"]).use(adminWriteLimiter);
        router.post("/settlements/reconcile", [Controller, "reconcileSettlement"]).use(adminWriteLimiter);
        router.post("/backfill", [Controller, "backfill"]).use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/economics")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
