import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const Controller = () => import("#controllers/admin/ticket_omnichannel_controller");

router
    .group(() => {
        router.get("/catalog", [Controller, "catalog"]);
        router.get("/integrations", [Controller, "integrations"]);
        router.put("/integrations", [Controller, "configure"]).use(adminWriteLimiter);
        router.get("/conversations/list", [Controller, "conversations"]);
        router.post("/tickets/:ticketId/reply", [Controller, "reply"]).use(adminWriteLimiter);
        router.post("/tickets/:ticketId/media", [Controller, "mediaReply"]).use(adminWriteLimiter);
        router.post("/tickets/:ticketId/read", [Controller, "markRead"]).use(adminWriteLimiter);
        router
            .post("/campaigns/:id/provider-template/verify", [Controller, "campaignProviderTemplateVerify"])
            .use(adminWriteLimiter);
        router.post("/campaigns/:id/dispatch", [Controller, "campaignDispatch"]).use(adminWriteLimiter);
        router.get("/api-keys/list", [Controller, "apiKeys"]);
        router.post("/api-keys", [Controller, "apiKeyCreate"]).use(adminWriteLimiter);
        router.post("/api-keys/:id/revoke", [Controller, "apiKeyRevoke"]).use(adminWriteLimiter);
        router.post("/api-keys/:id/rotate", [Controller, "apiKeyRotate"]).use(adminWriteLimiter);
        router.get("/api-request-logs/list", [Controller, "apiRequestLogs"]);
        router.get("/api-webhooks/list", [Controller, "apiWebhooks"]);
        router.post("/api-webhooks", [Controller, "apiWebhookCreate"]).use(adminWriteLimiter);
        router.post("/api-webhooks/:id/rotate", [Controller, "apiWebhookRotate"]).use(adminWriteLimiter);
        router.post("/api-webhooks/:id/revoke", [Controller, "apiWebhookRevoke"]).use(adminWriteLimiter);
        router.post("/:channel/test", [Controller, "verify"]).use(adminWriteLimiter);
        router.post("/:channel/connect", [Controller, "connect"]).use(adminWriteLimiter);
        router.post("/:channel/disconnect", [Controller, "disconnect"]).use(adminWriteLimiter);
        router.post("/:channel/oauth/start", [Controller, "oauthBegin"]).use(adminWriteLimiter);
        router.get("/:channel/logs", [Controller, "logs"]);
    })
    .prefix("/api/v1/admin/tickets/omnichannel")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
