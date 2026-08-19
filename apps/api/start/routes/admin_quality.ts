import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const QualityTrustController = () => import("#controllers/admin/quality_trust_controller");

router
    .group(() => {
        router.get("/quality/overview", [QualityTrustController, "overview"]);
        router.get("/quality/cases", [QualityTrustController, "cases"]);
        router.post("/quality/cases", [QualityTrustController, "createCase"]).use(adminWriteLimiter);
        router.get("/quality/cases/:id", [QualityTrustController, "showCase"]);
        router.patch("/quality/cases/:id", [QualityTrustController, "updateCase"]).use(adminWriteLimiter);
        router.post("/quality/cases/:id/sources", [QualityTrustController, "addSource"]).use(adminWriteLimiter);
        router.post("/quality/cases/:id/evidence", [QualityTrustController, "addEvidence"]).use(adminWriteLimiter);
        router.post("/quality/cases/:id/findings", [QualityTrustController, "addFinding"]).use(adminWriteLimiter);
        router
            .patch("/quality/cases/:id/findings/:findingId", [QualityTrustController, "adjudicateFinding"])
            .use(adminWriteLimiter);
        router.get("/quality/returns", [QualityTrustController, "returns"]);
        router
            .post("/order-returns/:returnId/items/:itemId/inspection", [QualityTrustController, "inspect"])
            .use(adminWriteLimiter);
        router.get("/quality/voc", [QualityTrustController, "voc"]);
        router.post("/quality/voc/classifications", [QualityTrustController, "classify"]).use(adminWriteLimiter);
        router.get("/quality/signals", [QualityTrustController, "signals"]);
        router.post("/quality/signals/evaluate", [QualityTrustController, "evaluateSignals"]).use(adminWriteLimiter);
        router.post("/quality/signals/:id/acknowledge", [QualityTrustController, "acknowledgeSignal"]).use(adminWriteLimiter);
        router.post("/quality/signals/:id/resolve", [QualityTrustController, "resolveSignal"]).use(adminWriteLimiter);
        router.get("/quality/actions", [QualityTrustController, "actions"]);
        router.post("/quality/actions", [QualityTrustController, "createAction"]).use(adminWriteLimiter);
        router.patch("/quality/actions/:id", [QualityTrustController, "updateAction"]).use(adminWriteLimiter);
        router.post("/quality/outcomes", [QualityTrustController, "createOutcome"]).use(adminWriteLimiter);
        router.get("/quality/taxonomy/reasons", [QualityTrustController, "reasons"]);
        router.post("/quality/taxonomy/reasons", [QualityTrustController, "createReason"]).use(adminWriteLimiter);
        router
            .post("/quality/taxonomy/reasons/:id/versions", [QualityTrustController, "createReasonVersion"])
            .use(adminWriteLimiter);
        router.get("/quality/traceability", [QualityTrustController, "traceability"]);
        router.get("/quality/supplier-quality", [QualityTrustController, "supplierQuality"]);
        router.get("/quality/metrics", [QualityTrustController, "metrics"]);
        router.get("/quality/audit", [QualityTrustController, "audit"]);
    })
    .prefix("/api/v1/admin")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
