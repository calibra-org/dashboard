import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const ReliabilityGuardianController = () => import("#controllers/admin/reliability_guardian_controller");

router
    .group(() => {
        router.get("/overview", [ReliabilityGuardianController, "overview"]).as("admin.reliability_guardian.overview");
        router.get("/invariants", [ReliabilityGuardianController, "invariants"]).as("admin.reliability_guardian.invariants");
        router
            .post("/invariants", [ReliabilityGuardianController, "createInvariant"])
            .as("admin.reliability_guardian.invariants.create")
            .use(adminWriteLimiter);
        router
            .post("/invariants/:publicId/observations", [ReliabilityGuardianController, "observe"])
            .as("admin.reliability_guardian.observe")
            .use(adminWriteLimiter);
        router.get("/policies", [ReliabilityGuardianController, "policies"]).as("admin.reliability_guardian.policies");
        router
            .post("/policies", [ReliabilityGuardianController, "createPolicy"])
            .as("admin.reliability_guardian.policies.create")
            .use(adminWriteLimiter);
        router.get("/incidents", [ReliabilityGuardianController, "incidents"]).as("admin.reliability_guardian.incidents");
        router
            .get("/remediations", [ReliabilityGuardianController, "remediations"])
            .as("admin.reliability_guardian.remediations");
        router.get("/scorecards", [ReliabilityGuardianController, "scorecards"]).as("admin.reliability_guardian.scorecards");
        router
            .post("/cycle", [ReliabilityGuardianController, "runCycle"])
            .as("admin.reliability_guardian.cycle")
            .use(adminWriteLimiter);
        router
            .post("/incidents/:publicId/remediate", [ReliabilityGuardianController, "executeRemediation"])
            .as("admin.reliability_guardian.remediate")
            .use(adminWriteLimiter);
        router
            .post("/remediations/:publicId/rollback", [ReliabilityGuardianController, "rollbackRemediation"])
            .as("admin.reliability_guardian.rollback")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/reliability-guardian")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
