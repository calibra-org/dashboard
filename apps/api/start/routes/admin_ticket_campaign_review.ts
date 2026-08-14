import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const Controller = () => import("#controllers/admin/ticket_campaign_review_controller");

router
    .post("/api/v1/admin/tickets/operations/campaigns/:id/template-review", [Controller, "review"])
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin())
    .use(adminWriteLimiter);
