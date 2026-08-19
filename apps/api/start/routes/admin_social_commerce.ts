import router from "@adonisjs/core/services/router";
import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";
const Controller = () => import("#controllers/admin/social_commerce_controller");
router
    .group(() => {
        router.get("/summary", [Controller, "summary"]).as("admin.social.summary");
        router.get("/contract", [Controller, "contract"]).as("admin.social.contract");
        router.get("/contents", [Controller, "contentIndex"]).as("admin.social.contents.index");
        router.post("/contents", [Controller, "contentStore"]).as("admin.social.contents.store").use(adminWriteLimiter);
        router.get("/contents/:id", [Controller, "contentShow"]).as("admin.social.contents.show");
        router.patch("/contents/:id", [Controller, "contentUpdate"]).as("admin.social.contents.update").use(adminWriteLimiter);
        router
            .post("/contents/:id/transition", [Controller, "contentTransition"])
            .as("admin.social.contents.transition")
            .use(adminWriteLimiter);
        router
            .post("/contents/:contentId/frames", [Controller, "frameStore"])
            .as("admin.social.contents.frames.store")
            .use(adminWriteLimiter);
        router
            .post("/contents/:contentId/markers", [Controller, "markerStore"])
            .as("admin.social.contents.markers.store")
            .use(adminWriteLimiter);
        router
            .post("/attributions", [Controller, "attributionStore"])
            .as("admin.social.attributions.store")
            .use(adminWriteLimiter);
        router.post("/channels", [Controller, "channelStore"]).as("admin.social.channels.store").use(adminWriteLimiter);
        router
            .post("/channels/:channelId/membership", [Controller, "channelMembership"])
            .as("admin.social.channels.membership")
            .use(adminWriteLimiter);
        router.get("/threads", [Controller, "threads"]).as("admin.social.threads.index");
        router
            .post("/threads/:threadId/messages", [Controller, "threadMessage"])
            .as("admin.social.threads.messages.store")
            .use(adminWriteLimiter);
        router
            .post("/threads/:threadId/convert-to-ticket", [Controller, "threadConvertToTicket"])
            .as("admin.social.threads.convert_to_ticket")
            .use(adminWriteLimiter);
        router.get("/moderation", [Controller, "moderation"]).as("admin.social.moderation.index");
        router
            .post("/moderation/:id/actions", [Controller, "moderationAction"])
            .as("admin.social.moderation.actions.store")
            .use(adminWriteLimiter);
        router.post("/contents/:contentId/live", [Controller, "liveStore"]).as("admin.social.live.store").use(adminWriteLimiter);
        router
            .patch("/contents/:contentId/live", [Controller, "liveUpdate"])
            .as("admin.social.live.update")
            .use(adminWriteLimiter);
        router
            .post("/contents/:contentId/live/chat-freeze", [Controller, "liveChatFreeze"])
            .as("admin.social.live.chat_freeze")
            .use(adminWriteLimiter);
        router
            .post("/contents/:contentId/live/participants/control", [Controller, "liveParticipantControl"])
            .as("admin.social.live.participants.control")
            .use(adminWriteLimiter);
        router
            .post("/contents/:contentId/live/replay", [Controller, "liveReplay"])
            .as("admin.social.live.replay")
            .use(adminWriteLimiter);
        router
            .post("/contents/:contentId/live/emergency-stop", [Controller, "liveEmergencyStop"])
            .as("admin.social.live.emergency_stop")
            .use(adminWriteLimiter);
        router
            .post("/media/upload-intents", [Controller, "mediaUploadIntent"])
            .as("admin.social.media.upload_intents.store")
            .use(adminWriteLimiter);
        router.get("/media/:mediaId", [Controller, "mediaShow"]).as("admin.social.media.show");
        router
            .post("/media/:mediaId/acknowledge", [Controller, "mediaAcknowledge"])
            .as("admin.social.media.acknowledge")
            .use(adminWriteLimiter);
        router
            .post("/media/:mediaId/tracks", [Controller, "mediaTrackStore"])
            .as("admin.social.media.tracks.store")
            .use(adminWriteLimiter);
        router
            .post("/media/tracks/:trackId/review", [Controller, "mediaTrackReview"])
            .as("admin.social.media.tracks.review")
            .use(adminWriteLimiter);
        router
            .post("/media/:mediaId/rights", [Controller, "mediaRightsStore"])
            .as("admin.social.media.rights.store")
            .use(adminWriteLimiter);
        router
            .post("/media/:mediaId/security-scan", [Controller, "mediaSecurityScan"])
            .as("admin.social.media.security_scan")
            .use(adminWriteLimiter);
        router.post("/media/:mediaId/retry", [Controller, "mediaRetry"]).as("admin.social.media.retry").use(adminWriteLimiter);
        router
            .post("/media/:mediaId/publishable", [Controller, "mediaPublishable"])
            .as("admin.social.media.publishable")
            .use(adminWriteLimiter);
        router.get("/reviews/:reviewId", [Controller, "reviewShow"]).as("admin.social.reviews.show");
        router
            .post("/reviews/:reviewId/responses", [Controller, "reviewResponse"])
            .as("admin.social.reviews.responses.store")
            .use(adminWriteLimiter);
        router.get("/search", [Controller, "search"]).as("admin.social.search.index");
        router.get("/analytics", [Controller, "analytics"]).as("admin.social.analytics");
    })
    .prefix("/api/v1/admin/social")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
