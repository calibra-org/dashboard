import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const C = () => import("#controllers/admin/agent_orchestrator_controller");
router
    .group(() => {
        router.get("/overview", [C, "overview"]);
        router.get("/agents", [C, "agents"]);
        router.post("/agents", [C, "saveAgent"]).use(adminWriteLimiter);
        router.get("/tools", [C, "tools"]);
        router.post("/tools", [C, "registerTool"]).use(adminWriteLimiter);
        router.get("/plans", [C, "plans"]);
        router.post("/plans", [C, "createPlan"]).use(adminWriteLimiter);
        router.post("/conflicts", [C, "conflict"]).use(adminWriteLimiter);
        router.post("/approvals", [C, "approval"]).use(adminWriteLimiter);
        router.post("/execute", [C, "execute"]).use(adminWriteLimiter);
        router.post("/outcome-hooks", [C, "outcomeHook"]).use(adminWriteLimiter);
        router.post("/kill-switch", [C, "killSwitch"]).use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/agentic-commerce/orchestrator")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
