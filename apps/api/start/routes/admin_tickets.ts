import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const Controller = () => import("#controllers/admin/tickets_controller");

router
    .group(() => {
        router.get("/summary", [Controller, "summary"]).as("admin.tickets.summary");
        router.get("/trends", [Controller, "trends"]).as("admin.tickets.trends");
        router.get("/settings", [Controller, "settingsShow"]).as("admin.tickets.settings.show");
        router.patch("/settings", [Controller, "settingsUpdate"]).as("admin.tickets.settings.update").use(adminWriteLimiter);
        router.get("/resources", [Controller, "resources"]).as("admin.tickets.resources");
        router.get("/", [Controller, "index"]).as("admin.tickets.index");
        router.post("/", [Controller, "store"]).as("admin.tickets.store").use(adminWriteLimiter);
        router.get("/:id", [Controller, "show"]).as("admin.tickets.show");
        router.patch("/:id", [Controller, "update"]).as("admin.tickets.update").use(adminWriteLimiter);
        router.post("/:id/transition", [Controller, "transition"]).as("admin.tickets.transition").use(adminWriteLimiter);
        router.post("/:id/messages", [Controller, "message"]).as("admin.tickets.messages.store").use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/tickets")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
