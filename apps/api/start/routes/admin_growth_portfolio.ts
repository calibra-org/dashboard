import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const GrowthPortfolioController = () => import("#controllers/admin/growth_portfolio_controller");

router
    .group(() => {
        router.get("/overview", [GrowthPortfolioController, "overview"]).as("admin.growth_portfolio.overview");
        router.get("/plans", [GrowthPortfolioController, "plans"]).as("admin.growth_portfolio.plans");
        router
            .post("/plans", [GrowthPortfolioController, "createPlan"])
            .as("admin.growth_portfolio.plans.create")
            .use(adminWriteLimiter);
        router.get("/plans/:publicId/candidates", [GrowthPortfolioController, "candidates"]).as("admin.growth_portfolio.candidates");
        router
            .post("/plans/:publicId/candidates", [GrowthPortfolioController, "addCandidate"])
            .as("admin.growth_portfolio.candidates.create")
            .use(adminWriteLimiter);
        router
            .post("/plans/:publicId/run", [GrowthPortfolioController, "runPlan"])
            .as("admin.growth_portfolio.run.create")
            .use(adminWriteLimiter);
        router.get("/runs", [GrowthPortfolioController, "runs"]).as("admin.growth_portfolio.runs");
        router.get("/runs/:publicId", [GrowthPortfolioController, "run"]).as("admin.growth_portfolio.run");
        router
            .post("/runs/:publicId/outcomes", [GrowthPortfolioController, "measureRun"])
            .as("admin.growth_portfolio.outcomes.create")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/growth-portfolio")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
