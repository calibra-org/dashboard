import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const ExperimentationController = () => import("#controllers/admin/experimentation_controller");

router
    .group(() => {
        router.get("/overview", [ExperimentationController, "overview"]).as("admin.experiments.overview");
        router.get("/collisions", [ExperimentationController, "collisions"]).as("admin.experiments.collisions");
        router.get("/knowledge", [ExperimentationController, "knowledge"]).as("admin.experiments.knowledge");
        router.get("/holdouts", [ExperimentationController, "holdouts"]).as("admin.experiments.holdouts");
        router
            .post("/holdouts", [ExperimentationController, "createHoldout"])
            .as("admin.experiments.holdouts.create")
            .use(adminWriteLimiter);
        router.get("/", [ExperimentationController, "index"]).as("admin.experiments.index");
        router.post("/", [ExperimentationController, "create"]).as("admin.experiments.create").use(adminWriteLimiter);
        router.get("/:id", [ExperimentationController, "show"]).as("admin.experiments.show");
        router
            .post("/:id/transition", [ExperimentationController, "transition"])
            .as("admin.experiments.transition")
            .use(adminWriteLimiter);
        router
            .post("/:id/analyze", [ExperimentationController, "analyze"])
            .as("admin.experiments.analyze")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/experiments")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
