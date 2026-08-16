import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const PlanningController = () => import("#controllers/admin/planning_controller");

router
    .group(() => {
        router.get("/planning/overview", [PlanningController, "overview"]).as("admin.planning.overview");
        router.get("/planning/forecast", [PlanningController, "forecast"]).as("admin.planning.forecast");
        router.post("/planning/forecast/run", [PlanningController, "runForecast"]).as("admin.planning.forecast.run").use(adminWriteLimiter);
        router.get("/planning/inventory-risks", [PlanningController, "risks"]).as("admin.planning.risks");
        router.get("/planning/cycles", [PlanningController, "cycles"]).as("admin.planning.cycles.index");
        router.post("/planning/cycles", [PlanningController, "createCycle"]).as("admin.planning.cycles.create").use(adminWriteLimiter);
        router
            .post("/planning/cycles/:id/transition", [PlanningController, "transitionCycle"])
            .as("admin.planning.cycles.transition")
            .use(adminWriteLimiter);
        router.get("/planning/scenarios", [PlanningController, "scenarios"]).as("admin.planning.scenarios.index");
        router.post("/planning/scenarios", [PlanningController, "createScenario"]).as("admin.planning.scenarios.create").use(adminWriteLimiter);
        router.get("/planning/scenarios/:id/result", [PlanningController, "scenarioResult"]).as("admin.planning.scenarios.result");
        router.get("/planning/overrides", [PlanningController, "overrides"]).as("admin.planning.overrides.index");
        router.post("/planning/overrides", [PlanningController, "createOverride"]).as("admin.planning.overrides.create").use(adminWriteLimiter);
        router
            .post("/planning/overrides/:id/review", [PlanningController, "reviewOverride"])
            .as("admin.planning.overrides.review")
            .use(adminWriteLimiter);
        router.get("/planning/health", [PlanningController, "health"]).as("admin.planning.health");
    })
    .prefix("/api/v1/admin")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
