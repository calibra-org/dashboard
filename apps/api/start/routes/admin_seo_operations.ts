import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const Controller = () => import("#controllers/admin/seo_operations_controller");

router
    .group(() => {
        router.get("/actions", [Controller, "actions"]);
        router.post("/actions", [Controller, "actionStore"]).use(adminWriteLimiter);
        router.post("/actions/:id/review", [Controller, "actionReview"]).use(adminWriteLimiter);
        router.post("/actions/:id/apply", [Controller, "actionApply"]).use(adminWriteLimiter);
        router.post("/actions/:id/rollback", [Controller, "actionRollback"]).use(adminWriteLimiter);
        router.post("/media/bulk-alt", [Controller, "mediaBulkAlt"]).use(adminWriteLimiter);
        router.get("/crawls", [Controller, "crawls"]);
        router.get("/crawls/:id", [Controller, "crawlShow"]);
        router.post("/crawls", [Controller, "crawlStore"]).use(adminWriteLimiter);
        router.post("/exports", [Controller, "exportStore"]).use(adminWriteLimiter);
        router.get("/exports/:id/data", [Controller, "exportData"]);
    })
    .prefix("/api/v1/admin/seo")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
