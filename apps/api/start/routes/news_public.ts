import router from "@adonisjs/core/services/router";

import { contentPublicLimiter } from "#start/limiter";

const Controller = () => import("#controllers/news_public_controller");

router.get("/api/v1/content/news", [Controller, "index"]).use(contentPublicLimiter);
router.get("/api/v1/content/news/:slug", [Controller, "show"]).use(contentPublicLimiter);
router.get("/api/v1/news", [Controller, "index"]).use(contentPublicLimiter);
router.get("/api/v1/news/:slug", [Controller, "show"]).use(contentPublicLimiter);
