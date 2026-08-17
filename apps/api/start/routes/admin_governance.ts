import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const AdminGovernanceController = () => import("#controllers/admin/governance_controller");

router
    .group(() => {
        router.get("/overview", [AdminGovernanceController, "overview"]).as("admin.governance.overview");
        router.get("/registry", [AdminGovernanceController, "registry"]).as("admin.governance.registry");
        router.get("/policies", [AdminGovernanceController, "policies"]).as("admin.governance.policies");
        router
            .post("/policies", [AdminGovernanceController, "createPolicy"])
            .as("admin.governance.policies.create")
            .use(adminWriteLimiter);
        router.post("/evaluate", [AdminGovernanceController, "evaluate"]).as("admin.governance.evaluate").use(adminWriteLimiter);
        router.get("/agents", [AdminGovernanceController, "agents"]).as("admin.governance.agents");
        router
            .post("/agents", [AdminGovernanceController, "createAgent"])
            .as("admin.governance.agents.create")
            .use(adminWriteLimiter);
        router
            .post("/agents/:id/kill-switch", [AdminGovernanceController, "killSwitch"])
            .as("admin.governance.agents.kill_switch")
            .use(adminWriteLimiter);
        router.get("/approvals", [AdminGovernanceController, "approvals"]).as("admin.governance.approvals");
        router
            .post("/approvals", [AdminGovernanceController, "createApproval"])
            .as("admin.governance.approvals.create")
            .use(adminWriteLimiter);
        router.get("/approvals/:reference", [AdminGovernanceController, "approval"]).as("admin.governance.approval");
        router
            .post("/approvals/:reference/decision", [AdminGovernanceController, "decideApproval"])
            .as("admin.governance.approval.decision")
            .use(adminWriteLimiter);
        router
            .post("/approvals/:reference/delegate", [AdminGovernanceController, "delegateApproval"])
            .as("admin.governance.approval.delegate")
            .use(adminWriteLimiter);
        router
            .post("/approvals/:reference/break-glass", [AdminGovernanceController, "breakGlass"])
            .as("admin.governance.approval.break_glass")
            .use(adminWriteLimiter);
        router.get("/ledger", [AdminGovernanceController, "ledger"]).as("admin.governance.ledger");
        router
            .post("/ledger/verify", [AdminGovernanceController, "verifyLedger"])
            .as("admin.governance.ledger.verify")
            .use(adminWriteLimiter);
        router.get("/shadow", [AdminGovernanceController, "shadow"]).as("admin.governance.shadow");
        router
            .post("/shadow", [AdminGovernanceController, "createShadow"])
            .as("admin.governance.shadow.create")
            .use(adminWriteLimiter);
        router
            .post("/shadow/:id/review", [AdminGovernanceController, "reviewShadow"])
            .as("admin.governance.shadow.review")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/governance")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
