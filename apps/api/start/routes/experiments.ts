import router from "@adonisjs/core/services/router";

import { contentPublicLimiter } from "#start/limiter";

const ExperimentationController = () => import("#controllers/experimentation_controller");

router
    .group(() => {
        router.post("/assign", [ExperimentationController, "assign"]).as("experiments.assign").use(contentPublicLimiter);
        router
            .post("/exposures", [ExperimentationController, "exposure"])
            .as("experiments.exposures.create")
            .use(contentPublicLimiter);
        router
            .post("/observations", [ExperimentationController, "observation"])
            .as("experiments.observations.create")
            .use(contentPublicLimiter);
    })
    .prefix("/api/v1/experiments");
