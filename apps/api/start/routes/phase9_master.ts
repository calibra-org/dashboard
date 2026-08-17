import router from "@adonisjs/core/services/router";
import { contentPublicLimiter } from "#start/limiter";

const Controller = () => import("#controllers/phase9_master_controller");

router.post("/api/v1/events", [Controller, "event"]).as("phase9.events.create").use(contentPublicLimiter);
router.post("/api/v1/events/batch", [Controller, "batch"]).as("phase9.events.batch").use(contentPublicLimiter);
router.post("/api/v1/recommendations/serve", [Controller, "serve"]).as("phase9.recommendations.serve").use(contentPublicLimiter);
router.post("/api/v1/recommendations/serve-page", [Controller, "servePage"]).as("phase9.recommendations.servePage").use(contentPublicLimiter);
router.get("/api/v1/personalization/preferences", [Controller, "preferences"]).as("phase9.preferences.show");
router.put("/api/v1/personalization/preferences", [Controller, "updatePreferences"]).as("phase9.preferences.update").use(contentPublicLimiter);
router.post("/api/v1/personalization/not-interested", [Controller, "notInterested"]).as("phase9.preferences.notInterested").use(contentPublicLimiter);
router.post("/api/v1/personalization/reset-all", [Controller, "reset"]).as("phase9.preferences.reset").use(contentPublicLimiter);
