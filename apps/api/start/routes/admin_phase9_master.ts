import router from "@adonisjs/core/services/router";
import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const Controller = () => import("#controllers/admin/phase9_master_controller");

router
    .group(() => {
        router.get("/policies", [Controller, "policies"]).as("admin.phase9.policies.index");
        router.post("/policies", [Controller, "createPolicy"]).as("admin.phase9.policies.create").use(adminWriteLimiter);
        router.post("/policies/:id/activate", [Controller, "activatePolicy"]).as("admin.phase9.policies.activate").use(adminWriteLimiter);
        router.post("/policies/:key/rollback", [Controller, "rollbackPolicy"]).as("admin.phase9.policies.rollback").use(adminWriteLimiter);
        router.get("/models", [Controller, "models"]).as("admin.phase9.models.index");
        router.post("/models", [Controller, "createModel"]).as("admin.phase9.models.create").use(adminWriteLimiter);
        router.post("/models/:id/activate", [Controller, "activateModel"]).as("admin.phase9.models.activate").use(adminWriteLimiter);
        router.post("/models/:key/rollback", [Controller, "rollbackModel"]).as("admin.phase9.models.rollback").use(adminWriteLimiter);
        router.get("/rollouts", [Controller, "rollouts"]).as("admin.phase9.rollouts.index");
        router.get("/analytics", [Controller, "analytics"]).as("admin.phase9.analytics");
        router.post("/deals/:id/transition/:status", [Controller, "transitionCampaign"]).as("admin.phase9.deals.transition").use(adminWriteLimiter);
        router.put("/deals/:id/allocation", [Controller, "allocation"]).as("admin.phase9.deals.allocation").use(adminWriteLimiter);
        router.post("/deals/:id/reservations", [Controller, "reserve"]).as("admin.phase9.deals.reserve").use(adminWriteLimiter);
        router.post("/reservations/:reservationId/consume", [Controller, "consume"]).as("admin.phase9.reservations.consume").use(adminWriteLimiter);
        router.post("/reservations/:reservationId/release", [Controller, "release"]).as("admin.phase9.reservations.release").use(adminWriteLimiter);
        router.post("/promotion-simulator", [Controller, "simulate"]).as("admin.phase9.promotionSimulator").use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/personalization")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
