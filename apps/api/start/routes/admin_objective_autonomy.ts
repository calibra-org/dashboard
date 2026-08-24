import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const ObjectiveAutonomyController = () => import("#controllers/admin/objective_autonomy_controller");

router
    .group(() => {
        router.get("/overview", [ObjectiveAutonomyController, "overview"]).as("admin.objective_autonomy.overview");
        router.get("/objectives", [ObjectiveAutonomyController, "objectives"]).as("admin.objective_autonomy.objectives");
        router.get("/objectives/:publicId", [ObjectiveAutonomyController, "objective"]).as("admin.objective_autonomy.objective");
        router.post("/objectives", [ObjectiveAutonomyController, "createObjective"]).as("admin.objective_autonomy.objectives.create").use(adminWriteLimiter);
        router.post("/objectives/:publicId/activate", [ObjectiveAutonomyController, "activate"]).as("admin.objective_autonomy.activate").use(adminWriteLimiter);
        router.post("/objectives/:publicId/halt", [ObjectiveAutonomyController, "halt"]).as("admin.objective_autonomy.halt").use(adminWriteLimiter);
        router.post("/objectives/:publicId/cycles", [ObjectiveAutonomyController, "startCycle"]).as("admin.objective_autonomy.cycles.create").use(adminWriteLimiter);
        router.post("/objectives/:publicId/cycles/:cyclePublicId/execute", [ObjectiveAutonomyController, "executeStep"]).as("admin.objective_autonomy.execute").use(adminWriteLimiter);
        router.post("/objectives/:publicId/checkpoints", [ObjectiveAutonomyController, "checkpoint"]).as("admin.objective_autonomy.checkpoints.create").use(adminWriteLimiter);
        router.post("/objectives/:publicId/postmortem", [ObjectiveAutonomyController, "postmortem"]).as("admin.objective_autonomy.postmortem.create").use(adminWriteLimiter);
        router.get("/access", [ObjectiveAutonomyController, "access"]).as("admin.objective_autonomy.access");
        router.post("/access/preset", [ObjectiveAutonomyController, "accessPreset"]).as("admin.objective_autonomy.access.preset").use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/objective-autonomy")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
