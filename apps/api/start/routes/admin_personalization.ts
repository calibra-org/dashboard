import router from "@adonisjs/core/services/router";
import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const Controller = () => import("#controllers/admin/personalization_controller");

router
    .group(() => {
        router.get("/overview", [Controller, "overview"]).as("admin.personalization.overview");
        router.get("/health", [Controller, "health"]).as("admin.personalization.health");
        router.get("/campaigns", [Controller, "campaigns"]).as("admin.personalization.campaigns.index");
        router
            .post("/campaigns", [Controller, "createCampaign"])
            .as("admin.personalization.campaigns.create")
            .use(adminWriteLimiter);
        router
            .patch("/campaigns/:id", [Controller, "updateCampaign"])
            .as("admin.personalization.campaigns.update")
            .use(adminWriteLimiter);
        router
            .post("/campaigns/:id/publish", [Controller, "publishCampaign"])
            .as("admin.personalization.campaigns.publish")
            .use(adminWriteLimiter);
        router
            .post("/campaigns/:id/pause", [Controller, "pauseCampaign"])
            .as("admin.personalization.campaigns.pause")
            .use(adminWriteLimiter);
        router
            .post("/campaigns/:id/transition/:target", [Controller, "transitionCampaign"])
            .as("admin.personalization.campaigns.transition")
            .use(adminWriteLimiter);

        router.get("/settings", [Controller, "settings"]).as("admin.personalization.settings.show");
        router
            .patch("/settings", [Controller, "updateSettings"])
            .as("admin.personalization.settings.update")
            .use(adminWriteLimiter);
        router.get("/placements", [Controller, "placements"]).as("admin.personalization.placements.index");
        router
            .patch("/placements/:placement", [Controller, "updatePlacement"])
            .as("admin.personalization.placements.update")
            .use(adminWriteLimiter);

        router.get("/features", [Controller, "features"]).as("admin.personalization.features.index");
        router.put("/features", [Controller, "upsertFeature"]).as("admin.personalization.features.upsert").use(adminWriteLimiter);
        router.get("/policies", [Controller, "policies"]).as("admin.personalization.policies.index");
        router.post("/policies", [Controller, "createPolicy"]).as("admin.personalization.policies.create").use(adminWriteLimiter);
        router.get("/models", [Controller, "models"]).as("admin.personalization.models.index");
        router.post("/models", [Controller, "createModel"]).as("admin.personalization.models.create").use(adminWriteLimiter);
        router.get("/rollouts", [Controller, "rollouts"]).as("admin.personalization.rollouts.index");
        router
            .post("/registry/:kind/:key/:version/activate", [Controller, "activateRegistry"])
            .as("admin.personalization.registry.activate")
            .use(adminWriteLimiter);
        router
            .post("/registry/:kind/:key/rollback", [Controller, "rollbackRegistry"])
            .as("admin.personalization.registry.rollback")
            .use(adminWriteLimiter);

        router.post("/simulate", [Controller, "simulate"]).as("admin.personalization.simulate").use(adminWriteLimiter);
        router.get("/events", [Controller, "events"]).as("admin.personalization.events.index");
        router.get("/consents", [Controller, "consents"]).as("admin.personalization.consents.index");
    })
    .prefix("/api/v1/admin/personalization")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
