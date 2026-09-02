import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const SnippetsController = () => import("#controllers/admin/snippets_controller");

router
    .group(() => {
        router.get("/overview", [SnippetsController, "overview"]).as("admin.snippets.overview");
        router.get("/library", [SnippetsController, "library"]).as("admin.snippets.library");
        router.get("/executions", [SnippetsController, "executions"]).as("admin.snippets.executions");
        router
            .post("/executions/observe", [SnippetsController, "observeExecution"])
            .as("admin.snippets.executions.observe")
            .use(adminWriteLimiter);
        router.get("/settings", [SnippetsController, "settings"]).as("admin.snippets.settings");
        router
            .patch("/settings", [SnippetsController, "updateSettings"])
            .as("admin.snippets.settings.update")
            .use(adminWriteLimiter);
        router
            .post("/safe-mode/enable", [SnippetsController, "enableSafeMode"])
            .as("admin.snippets.safe_mode.enable")
            .use(adminWriteLimiter);
        router
            .post("/safe-mode/disable", [SnippetsController, "disableSafeMode"])
            .as("admin.snippets.safe_mode.disable")
            .use(adminWriteLimiter);
        router.get("/", [SnippetsController, "index"]).as("admin.snippets.index");
        router.post("/", [SnippetsController, "create"]).as("admin.snippets.create").use(adminWriteLimiter);
        router.get("/:publicId", [SnippetsController, "show"]).as("admin.snippets.show");
        router.patch("/:publicId", [SnippetsController, "update"]).as("admin.snippets.update").use(adminWriteLimiter);
        router
            .post("/:publicId/validate", [SnippetsController, "validate"])
            .as("admin.snippets.validate")
            .use(adminWriteLimiter);
        router
            .post("/:publicId/simulate", [SnippetsController, "simulate"])
            .as("admin.snippets.simulate")
            .use(adminWriteLimiter);
        router
            .post("/:publicId/publish", [SnippetsController, "publish"])
            .as("admin.snippets.publish")
            .use(adminWriteLimiter);
        router.post("/:publicId/pause", [SnippetsController, "pause"]).as("admin.snippets.pause").use(adminWriteLimiter);
        router
            .post("/:publicId/resume", [SnippetsController, "resume"])
            .as("admin.snippets.resume")
            .use(adminWriteLimiter);
        router
            .post("/:publicId/rollback", [SnippetsController, "rollback"])
            .as("admin.snippets.rollback")
            .use(adminWriteLimiter);
        router.get("/:publicId/revisions", [SnippetsController, "revisions"]).as("admin.snippets.revisions");
        router.get("/:publicId/deployments", [SnippetsController, "deployments"]).as("admin.snippets.deployments");
    })
    .prefix("/api/v1/admin/snippets")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
