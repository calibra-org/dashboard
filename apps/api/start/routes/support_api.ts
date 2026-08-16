import router from "@adonisjs/core/services/router";

import { contentPublicLimiter } from "#start/limiter";

const Controller = () => import("#controllers/support_api_controller");

router.get("/api/v1/support-api/tickets", [Controller, "tickets"]).use(contentPublicLimiter);
router.post("/api/v1/support-api/tickets", [Controller, "createTicket"]).use(contentPublicLimiter);
router.get("/api/v1/support-api/tickets/:ticketId", [Controller, "ticket"]).use(contentPublicLimiter);
router.post("/api/v1/support-api/tickets/:ticketId/messages", [Controller, "sendMessage"]).use(contentPublicLimiter);
router.get("/api/v1/support-api/request-logs", [Controller, "requestLogs"]).use(contentPublicLimiter);
