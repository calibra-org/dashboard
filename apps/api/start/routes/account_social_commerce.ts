import router from "@adonisjs/core/services/router";
import { middleware } from "#start/kernel";
import { socialInteractionLimiter } from "#start/limiter";
const Controller = () => import("#controllers/account/social_commerce_controller");
router
    .group(() => {
        router.post("/follow", [Controller, "follow"]).as("account.social.follow").use(socialInteractionLimiter);
        router
            .post("/interactions", [Controller, "interaction"])
            .as("account.social.interactions.store")
            .use(socialInteractionLimiter);
        router.get("/channels", [Controller, "channels"]).as("account.social.channels.index");
        router.get("/threads", [Controller, "threads"]).as("account.social.threads.index");
        router.post("/threads", [Controller, "threadStore"]).as("account.social.threads.store").use(socialInteractionLimiter);
        router
            .post("/threads/:threadId/messages", [Controller, "messageStore"])
            .as("account.social.threads.messages.store")
            .use(socialInteractionLimiter);
        router.post("/reports", [Controller, "report"]).as("account.social.reports.store").use(socialInteractionLimiter);
        router
            .post("/media/upload-intents", [Controller, "mediaUploadIntent"])
            .as("account.social.media.upload_intents.store")
            .use(socialInteractionLimiter);
        router
            .get("/products/:productId/review-verification", [Controller, "reviewVerification"])
            .as("account.social.products.review_verification.show");
        router
            .post("/reviews/:reviewId/media", [Controller, "reviewMedia"])
            .as("account.social.reviews.media.store")
            .use(socialInteractionLimiter);
        router
            .put("/reviews/:reviewId/helpful", [Controller, "reviewHelpful"])
            .as("account.social.reviews.helpful.update")
            .use(socialInteractionLimiter);
        router
            .post("/reviews/:reviewId/report", [Controller, "reviewReport"])
            .as("account.social.reviews.report.store")
            .use(socialInteractionLimiter);
        router
            .post("/moderation/:caseId/appeal", [Controller, "appeal"])
            .as("account.social.moderation.appeal.store")
            .use(socialInteractionLimiter);
        router.get("/reputation", [Controller, "reputation"]).as("account.social.reputation.show");
    })
    .prefix("/api/v1/account/social")
    .use(middleware.auth({ guards: ["api"] }));
