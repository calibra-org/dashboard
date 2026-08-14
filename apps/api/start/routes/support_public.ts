import router from "@adonisjs/core/services/router";

import { contentPublicLimiter } from "#start/limiter";

const Controller = () => import("#controllers/support_public_controller");

router.post("/api/v1/support/tickets", [Controller, "store"]).use(contentPublicLimiter);
router.get("/api/v1/support/tickets/:token", [Controller, "show"]).use(contentPublicLimiter);
router.post("/api/v1/support/tickets/:token/replies", [Controller, "reply"]).use(contentPublicLimiter);
router.post("/api/v1/support/tickets/:token/csat", [Controller, "csat"]).use(contentPublicLimiter);
