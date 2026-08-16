import router from "@adonisjs/core/services/router";

import { contentPublicLimiter } from "#start/limiter";

const Controller = () => import("#controllers/support_channel_webhook_controller");

router
    .get("/api/v1/support/oauth/:channel/callback", [Controller, "oauthCallback"])
    .as("support.oauth.callback")
    .use(contentPublicLimiter);

router
    .get("/api/v1/support/channels/:channel/:integrationId", [Controller, "challenge"])
    .as("support.channels.challenge")
    .use(contentPublicLimiter);
router
    .post("/api/v1/support/channels/:channel/:integrationId", [Controller, "receive"])
    .as("support.channels.receive")
    .use(contentPublicLimiter);
router
    .post("/api/v1/support/channels/:channel/:integrationId/:pathSecret", [Controller, "receive"])
    .as("support.channels.receive_secret")
    .use(contentPublicLimiter);
