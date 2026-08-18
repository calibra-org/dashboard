import router from "@adonisjs/core/services/router";
import { contentPublicLimiter } from "#start/limiter";

const PersonalizationController = () => import("#controllers/personalization_controller");

router
    .group(() => {
        router.get("/amazing-deals", [PersonalizationController, "amazingDeals"]).as("personalization.amazingDeals");
        router.get("/recommendations", [PersonalizationController, "recommendations"]).as("personalization.recommendations");
        router
            .post("/events", [PersonalizationController, "event"])
            .as("personalization.events.create")
            .use(contentPublicLimiter);
        router.get("/consent", [PersonalizationController, "consent"]).as("personalization.consent.show");
        router
            .put("/consent", [PersonalizationController, "updateConsent"])
            .as("personalization.consent.update")
            .use(contentPublicLimiter);
        router.get("/preferences", [PersonalizationController, "preferences"]).as("personalization.preferences.show");
        router
            .put("/preferences", [PersonalizationController, "updatePreferences"])
            .as("personalization.preferences.update")
            .use(contentPublicLimiter);
        router.post("/reset", [PersonalizationController, "reset"]).as("personalization.reset").use(contentPublicLimiter);
    })
    .prefix("/api/v1/personalization");

router
    .group(() => {
        router.post("/events", [PersonalizationController, "event"]).as("phase9.events.create").use(contentPublicLimiter);
        router
            .post("/events/batch", [PersonalizationController, "eventBatch"])
            .as("phase9.events.batch")
            .use(contentPublicLimiter);
        router
            .post("/recommendations/serve", [PersonalizationController, "serve"])
            .as("phase9.recommendations.serve")
            .use(contentPublicLimiter);
        router
            .post("/recommendations/serve-page", [PersonalizationController, "servePage"])
            .as("phase9.recommendations.servePage")
            .use(contentPublicLimiter);
    })
    .prefix("/api/v1");
