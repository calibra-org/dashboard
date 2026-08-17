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
        router.post("/reset", [PersonalizationController, "reset"]).as("personalization.reset").use(contentPublicLimiter);
    })
    .prefix("/api/v1/personalization");
