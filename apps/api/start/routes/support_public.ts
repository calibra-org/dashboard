import router from "@adonisjs/core/services/router";

import { contentPublicLimiter } from "#start/limiter";

const Controller = () => import("#controllers/support_public_controller");

router.post("/api/v1/support/tickets", [Controller, "store"]).as("publicSupport.store").use(contentPublicLimiter);
router.get("/api/v1/support/tickets/:token", [Controller, "show"]).as("publicSupport.show").use(contentPublicLimiter);
router
    .post("/api/v1/support/tickets/:token/replies", [Controller, "reply"])
    .as("publicSupport.reply")
    .use(contentPublicLimiter);
router.post("/api/v1/support/tickets/:token/csat", [Controller, "csat"]).as("publicSupport.csat").use(contentPublicLimiter);
