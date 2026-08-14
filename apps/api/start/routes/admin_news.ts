import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const Controller = () => import("#controllers/admin/news_controller");

router
    .group(() => {
        router.get("/", [Controller, "index"]).as("adminNews.index");
        router.get("/summary", [Controller, "summary"]).as("adminNews.summary");
        router.get("/scheduler-runs", [Controller, "schedulerRuns"]).as("adminNews.schedulerRuns");
    })
    .prefix("/api/v1/admin/news")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
