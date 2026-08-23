import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const SyntheticCommerceController = () => import("#controllers/admin/synthetic_commerce_controller");

router
    .group(() => {
        router.get("/overview", [SyntheticCommerceController, "overview"]).as("admin.synthetic_commerce.overview");
        router.get("/environments", [SyntheticCommerceController, "environments"]).as("admin.synthetic_commerce.environments");
        router
            .post("/environments", [SyntheticCommerceController, "createEnvironment"])
            .as("admin.synthetic_commerce.environments.create")
            .use(adminWriteLimiter);
        router.get("/personas", [SyntheticCommerceController, "personas"]).as("admin.synthetic_commerce.personas");
        router
            .post("/personas", [SyntheticCommerceController, "createPersona"])
            .as("admin.synthetic_commerce.personas.create")
            .use(adminWriteLimiter);
        router.get("/seeds", [SyntheticCommerceController, "seeds"]).as("admin.synthetic_commerce.seeds");
        router
            .post("/seeds", [SyntheticCommerceController, "createSeed"])
            .as("admin.synthetic_commerce.seeds.create")
            .use(adminWriteLimiter);
        router
            .post("/seeds/:publicId/freeze", [SyntheticCommerceController, "freezeSeed"])
            .as("admin.synthetic_commerce.seeds.freeze")
            .use(adminWriteLimiter);
        router.get("/scenarios", [SyntheticCommerceController, "scenarios"]).as("admin.synthetic_commerce.scenarios");
        router
            .post("/scenarios", [SyntheticCommerceController, "createScenario"])
            .as("admin.synthetic_commerce.scenarios.create")
            .use(adminWriteLimiter);
        router.get("/runs", [SyntheticCommerceController, "runs"]).as("admin.synthetic_commerce.runs");
        router
            .post("/scenarios/:publicId/run", [SyntheticCommerceController, "queueRun"])
            .as("admin.synthetic_commerce.runs.queue")
            .use(adminWriteLimiter);
        router.get("/runs/:publicId", [SyntheticCommerceController, "run"]).as("admin.synthetic_commerce.run");
        router
            .post("/runs/:publicId/report", [SyntheticCommerceController, "reportRun"])
            .as("admin.synthetic_commerce.runs.report")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/synthetic-commerce")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
