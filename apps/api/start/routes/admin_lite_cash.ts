import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const LiteCashController = () => import("#controllers/admin/lite_cash_controller");

router
    .group(() => {
        router.get("/overview", [LiteCashController, "overview"]).as("admin.lite_cash.overview");
        router.get("/topology", [LiteCashController, "topology"]).as("admin.lite_cash.topology");
        router.get("/registry/purge-scopes", [LiteCashController, "purgeRegistry"]).as("admin.lite_cash.purge_registry");
        router.get("/purges", [LiteCashController, "purges"]).as("admin.lite_cash.purges");
        router.get("/warm-jobs", [LiteCashController, "warmJobs"]).as("admin.lite_cash.warm_jobs");
        router
            .post("/warm-jobs", [LiteCashController, "createWarmJob"])
            .as("admin.lite_cash.warm_jobs.create")
            .use(adminWriteLimiter);
        router.get("/profiles", [LiteCashController, "profiles"]).as("admin.lite_cash.profiles");
        router
            .post("/profiles", [LiteCashController, "createProfile"])
            .as("admin.lite_cash.profiles.create")
            .use(adminWriteLimiter);
        router.get("/observations", [LiteCashController, "observations"]).as("admin.lite_cash.observations");
        router
            .post("/observations", [LiteCashController, "createObservation"])
            .as("admin.lite_cash.observations.create")
            .use(adminWriteLimiter);
        router.get("/settings", [LiteCashController, "settings"]).as("admin.lite_cash.settings");
        router
            .patch("/settings", [LiteCashController, "updateSettings"])
            .as("admin.lite_cash.settings.update")
            .use(adminWriteLimiter);
        router.get("/snapshots", [LiteCashController, "snapshots"]).as("admin.lite_cash.snapshots");
        router
            .post("/snapshots", [LiteCashController, "createSnapshot"])
            .as("admin.lite_cash.snapshots.create")
            .use(adminWriteLimiter);
        router.get("/export", [LiteCashController, "exportConfiguration"]).as("admin.lite_cash.export");
        router
            .post("/import/validate", [LiteCashController, "validateImport"])
            .as("admin.lite_cash.import.validate")
            .use(adminWriteLimiter);
        router
            .post("/import/apply", [LiteCashController, "applyImport"])
            .as("admin.lite_cash.import.apply")
            .use(adminWriteLimiter);
        router
            .post("/purge/plan", [LiteCashController, "planPurge"])
            .as("admin.lite_cash.purge.plan")
            .use(adminWriteLimiter);
        router
            .post("/purge/execute", [LiteCashController, "executePurge"])
            .as("admin.lite_cash.purge.execute")
            .use(adminWriteLimiter);
        router.get("/policies", [LiteCashController, "policies"]).as("admin.lite_cash.policies");
        router
            .post("/policies", [LiteCashController, "createPolicy"])
            .as("admin.lite_cash.policies.create")
            .use(adminWriteLimiter);
        router.get("/policies/:publicId", [LiteCashController, "policy"]).as("admin.lite_cash.policy");
        router
            .patch("/policies/:publicId", [LiteCashController, "updatePolicy"])
            .as("admin.lite_cash.policy.update")
            .use(adminWriteLimiter);
        router
            .post("/policies/:publicId/validate", [LiteCashController, "validatePolicy"])
            .as("admin.lite_cash.policy.validate")
            .use(adminWriteLimiter);
        router.get("/warm-jobs/:publicId", [LiteCashController, "warmJob"]).as("admin.lite_cash.warm_job");
        router
            .post("/warm-jobs/:publicId/cancel", [LiteCashController, "cancelWarmJob"])
            .as("admin.lite_cash.warm_job.cancel")
            .use(adminWriteLimiter);
        router
            .post("/warm-jobs/:publicId/observe", [LiteCashController, "observeWarmJob"])
            .as("admin.lite_cash.warm_job.observe")
            .use(adminWriteLimiter);
        router.get("/profiles/:publicId", [LiteCashController, "profile"]).as("admin.lite_cash.profile");
        router
            .patch("/profiles/:publicId", [LiteCashController, "updateProfile"])
            .as("admin.lite_cash.profile.update")
            .use(adminWriteLimiter);
        router
            .post("/profiles/:publicId/activate", [LiteCashController, "activateProfile"])
            .as("admin.lite_cash.profile.activate")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/lite-cash")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
