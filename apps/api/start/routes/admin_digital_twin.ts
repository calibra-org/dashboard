import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const DigitalTwinController = () => import("#controllers/admin/digital_twin_controller");

router
    .group(() => {
        router.get("/overview", [DigitalTwinController, "overview"]).as("admin.digital_twin.overview");
        router.get("/scenarios", [DigitalTwinController, "scenarios"]).as("admin.digital_twin.scenarios");
        router
            .post("/scenarios", [DigitalTwinController, "createScenario"])
            .as("admin.digital_twin.scenarios.create")
            .use(adminWriteLimiter);
        router
            .put("/scenarios/:publicId", [DigitalTwinController, "updateScenario"])
            .as("admin.digital_twin.scenarios.update")
            .use(adminWriteLimiter);
        router
            .post("/scenarios/:publicId/run", [DigitalTwinController, "runScenario"])
            .as("admin.digital_twin.run.create")
            .use(adminWriteLimiter);
        router.get("/runs/:publicId", [DigitalTwinController, "run"]).as("admin.digital_twin.run");
        router.get("/compare", [DigitalTwinController, "compare"]).as("admin.digital_twin.compare");
        router
            .get("/runs/:publicId/sensitivity", [DigitalTwinController, "sensitivity"])
            .as("admin.digital_twin.sensitivity");
        router
            .get("/runs/:publicId/decision-brief", [DigitalTwinController, "brief"])
            .as("admin.digital_twin.decision_brief");
    })
    .prefix("/api/v1/admin/digital-twin")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
