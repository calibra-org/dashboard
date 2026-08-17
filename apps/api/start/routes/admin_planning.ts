import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const PlanningController = () => import("#controllers/admin/planning_controller");

router
    .group(() => {
        router.get("/overview", [PlanningController, "overview"]).as("admin.planning.overview");
        router.get("/forecast", [PlanningController, "forecast"]).as("admin.planning.forecast");
        router.get("/forecast/categories", [PlanningController, "categoryForecast"]).as("admin.planning.forecast.categories");
        router.post("/forecast/run", [PlanningController, "runForecast"]).as("admin.planning.forecast.run").use(adminWriteLimiter);
        router.get("/replenishment", [PlanningController, "recommendations"]).as("admin.planning.replenishment");
        router.get("/inventory-risks", [PlanningController, "risks"]).as("admin.planning.risks");
        router.post("/accuracy/refresh", [PlanningController, "refreshAccuracy"]).as("admin.planning.accuracy.refresh").use(adminWriteLimiter);
        router.get("/cycles", [PlanningController, "cycles"]).as("admin.planning.cycles.index");
        router.post("/cycles", [PlanningController, "createCycle"]).as("admin.planning.cycles.create").use(adminWriteLimiter);
        router.post("/cycles/:id/transition", [PlanningController, "transitionCycle"]).as("admin.planning.cycles.transition").use(adminWriteLimiter);
        router.get("/scenarios", [PlanningController, "scenarios"]).as("admin.planning.scenarios.index");
        router.post("/scenarios", [PlanningController, "createScenario"]).as("admin.planning.scenarios.create").use(adminWriteLimiter);
        router.get("/scenarios/:id/result", [PlanningController, "scenarioResult"]).as("admin.planning.scenarios.result");
        router.get("/overrides", [PlanningController, "overrides"]).as("admin.planning.overrides.index");
        router.post("/overrides", [PlanningController, "createOverride"]).as("admin.planning.overrides.create").use(adminWriteLimiter);
        router.post("/overrides/:id/review", [PlanningController, "reviewOverride"]).as("admin.planning.overrides.review").use(adminWriteLimiter);
        router.get("/health", [PlanningController, "health"]).as("admin.planning.health");
    })
    .prefix("/api/v1/admin/planning")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
