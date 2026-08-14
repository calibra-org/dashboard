import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const Controller = () => import("#controllers/admin/ticket_operations_controller");

router
    .group(() => {
        router.get("/workflow-statuses", [Controller, "workflowStatuses"]);
        router.post("/workflow-statuses", [Controller, "workflowStatusStore"]).use(adminWriteLimiter);
        router.get("/saved-views", [Controller, "savedViews"]);
        router.post("/saved-views", [Controller, "savedViewStore"]).use(adminWriteLimiter);
        router.patch("/saved-views/:id", [Controller, "savedViewUpdate"]).use(adminWriteLimiter);
        router.delete("/saved-views/:id", [Controller, "savedViewDestroy"]).use(adminWriteLimiter);
        router.post("/bulk", [Controller, "bulk"]).use(adminWriteLimiter);
        router.get("/:ticketId/attachments", [Controller, "attachments"]);
        router.post("/:ticketId/attachments", [Controller, "attachmentStore"]).use(adminWriteLimiter);
        router.patch("/attachments/:attachmentId/scan", [Controller, "attachmentScan"]).use(adminWriteLimiter);
        router.post("/:ticketId/merge", [Controller, "merge"]).use(adminWriteLimiter);
        router.get("/operations/presence", [Controller, "presence"]);
        router.put("/operations/presence/me", [Controller, "heartbeat"]).use(adminWriteLimiter);
        router.get("/operations/channels", [Controller, "channels"]);
        router.patch("/operations/channels", [Controller, "channelUpdate"]).use(adminWriteLimiter);
        router.get("/operations/routing-rules", [Controller, "routingRules"]);
        router.post("/operations/routing-rules", [Controller, "routingRuleStore"]).use(adminWriteLimiter);
        router.patch("/operations/routing-rules/:id", [Controller, "routingRuleUpdate"]).use(adminWriteLimiter);
        router.get("/operations/automation-rules", [Controller, "automationRules"]);
        router.post("/operations/automation-rules", [Controller, "automationRuleStore"]).use(adminWriteLimiter);
        router.patch("/operations/automation-rules/:id", [Controller, "automationRuleUpdate"]).use(adminWriteLimiter);
        router.get("/operations/campaigns", [Controller, "campaigns"]);
        router.post("/operations/campaigns", [Controller, "campaignStore"]).use(adminWriteLimiter);
        router.post("/operations/campaigns/:id/recipients", [Controller, "campaignRecipients"]).use(adminWriteLimiter);
        router.post("/operations/campaigns/:id/transition", [Controller, "campaignTransition"]).use(adminWriteLimiter);
        router.get("/operations/reports", [Controller, "reports"]);
    })
    .prefix("/api/v1/admin/tickets")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
