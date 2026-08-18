import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const TrustRiskController = () => import("#controllers/admin/trust_risk_controller");

router
    .group(() => {
        router.get("/overview", [TrustRiskController, "overview"]).as("admin.trust.overview");
        router.get("/cases", [TrustRiskController, "cases"]).as("admin.trust.cases.index");
        router.get("/signals", [TrustRiskController, "signals"]).as("admin.trust.signals.index");
        router.get("/models", [TrustRiskController, "models"]).as("admin.trust.models.index");
        router.get("/health", [TrustRiskController, "health"]).as("admin.trust.health");
        router.post("/evaluate", [TrustRiskController, "evaluate"]).as("admin.trust.evaluate").use(adminWriteLimiter);
        router.post("/models", [TrustRiskController, "createModel"]).as("admin.trust.models.create").use(adminWriteLimiter);
        router
            .post("/models/:id/versions", [TrustRiskController, "createModelVersion"])
            .as("admin.trust.models.versions.create")
            .use(adminWriteLimiter);
        router
            .post("/model-versions/:id/promote", [TrustRiskController, "promoteChampion"])
            .as("admin.trust.models.promote")
            .use(adminWriteLimiter);
        router.post("/cases", [TrustRiskController, "createCase"]).as("admin.trust.cases.create").use(adminWriteLimiter);
        router
            .post("/cases/:id/assign", [TrustRiskController, "assignCase"])
            .as("admin.trust.cases.assign")
            .use(adminWriteLimiter);
        router
            .post("/cases/:id/status", [TrustRiskController, "updateCaseStatus"])
            .as("admin.trust.cases.status")
            .use(adminWriteLimiter);
        router
            .post("/cases/:id/notes", [TrustRiskController, "addCaseNote"])
            .as("admin.trust.cases.notes.create")
            .use(adminWriteLimiter);
        router.post("/controls", [TrustRiskController, "createControl"]).as("admin.trust.controls.create").use(adminWriteLimiter);
        router
            .post("/controls/:id/release", [TrustRiskController, "releaseControl"])
            .as("admin.trust.controls.release")
            .use(adminWriteLimiter);
        router
            .post("/controls/block", [TrustRiskController, "blockSubject"])
            .as("admin.trust.controls.block")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/trust")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
