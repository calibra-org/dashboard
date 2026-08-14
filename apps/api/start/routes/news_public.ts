import router from "@adonisjs/core/services/router";

import { contentPublicLimiter } from "#start/limiter";

const Controller = () => import("#controllers/news_public_controller");

router.get("/api/v1/content/news", [Controller, "index"]);
router.get("/api/v1/content/news/:slug", [Controller, "show"]);
router.get("/api/v1/news", [Controller, "index"]);
router.get("/api/v1/news/:slug", [Controller, "show"]);

router.post("/api/v1/content/news/_rate-limit-probe", async () => ({ ok: true })).use(contentPublicLimiter);
