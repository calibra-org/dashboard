import router from "@adonisjs/core/services/router";

import { contentPublicLimiter } from "#start/limiter";

const Controller = () => import("#controllers/news_public_controller");

router.get("/api/v1/content/news", [Controller, "index"]).as("publicContentNews.index").use(contentPublicLimiter);
router.get("/api/v1/content/news/:slug", [Controller, "show"]).as("publicContentNews.show").use(contentPublicLimiter);
router.get("/api/v1/news", [Controller, "index"]).as("publicNews.index").use(contentPublicLimiter);
router.get("/api/v1/news/:slug", [Controller, "show"]).as("publicNews.show").use(contentPublicLimiter);
