import router from "@adonisjs/core/services/router";
import { socialInteractionLimiter, socialProviderWebhookLimiter } from "#start/limiter";
const Controller = () => import("#controllers/storefront/social_commerce_controller");
router
    .group(() => {
        router.get("/story-rail", [Controller, "storyRail"]).as("storefront.social.story_rail.index");
        router.get("/discover", [Controller, "discover"]).as("storefront.social.discover.index");
        router
            .post("/interactions", [Controller, "interaction"])
            .as("storefront.social.interactions.store")
            .use(socialInteractionLimiter);
        router.get("/search", [Controller, "search"]).as("storefront.social.search.index");
        router.get("/media/:mediaId/playback", [Controller, "playback"]).as("storefront.social.media.playback.show");
        router
            .post("/contents/:contentId/ask", [Controller, "askVideo"])
            .as("storefront.social.contents.ask.store")
            .use(socialInteractionLimiter);
        router.get("/reviews/:reviewId", [Controller, "reviewShow"]).as("storefront.social.reviews.show");
        router
            .get("/contents/:contentId/live-access", [Controller, "liveAccess"])
            .as("storefront.social.contents.live_access.show");
        router
            .post("/provider/webhook", [Controller, "providerWebhook"])
            .as("storefront.social.provider.webhook")
            .use(socialProviderWebhookLimiter);
        router.get("/contract", [Controller, "contract"]).as("storefront.social.contract.show");
    })
    .prefix("/api/v1/storefront/social");
