import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const AdminIdentityController = () => import("#controllers/admin/identity_controller");

router
    .group(() => {
        router.get("/overview", [AdminIdentityController, "overview"]).as("admin.identity.overview");
        router.get("/verifications", [AdminIdentityController, "verifications"]).as("admin.identity.verifications");
        router.get("/verifications/:publicId", [AdminIdentityController, "verification"]).as("admin.identity.verification");
        router.get("/methods", [AdminIdentityController, "methods"]).as("admin.identity.methods");
        router.get("/policies", [AdminIdentityController, "policies"]).as("admin.identity.policies");
        router
            .post("/policies", [AdminIdentityController, "createPolicy"])
            .as("admin.identity.policies.create")
            .use(adminWriteLimiter);
        router.get("/providers", [AdminIdentityController, "providers"]).as("admin.identity.providers");
        router
            .put("/providers", [AdminIdentityController, "updateProvider"])
            .as("admin.identity.providers.update")
            .use(adminWriteLimiter);
        router
            .post("/providers/:providerKey/test", [AdminIdentityController, "testProvider"])
            .as("admin.identity.providers.test")
            .use(adminWriteLimiter);
        router
            .post("/provider-attempts/:attemptId/refresh", [AdminIdentityController, "refreshDelivery"])
            .as("admin.identity.delivery.refresh")
            .use(adminWriteLimiter);
        router.get("/delivery", [AdminIdentityController, "delivery"]).as("admin.identity.delivery");
        router.get("/risk", [AdminIdentityController, "risk"]).as("admin.identity.risk");
        router.get("/users/:userId/credentials", [AdminIdentityController, "credentials"]).as("admin.identity.credentials");
        router
            .delete("/users/:userId/credentials/:credentialId", [AdminIdentityController, "revokeCredential"])
            .as("admin.identity.credentials.revoke")
            .use(adminWriteLimiter);
        router.get("/users/:userId/sessions", [AdminIdentityController, "sessions"]).as("admin.identity.sessions");
        router
            .delete("/users/:userId/sessions/:sessionId", [AdminIdentityController, "revokeSession"])
            .as("admin.identity.sessions.revoke")
            .use(adminWriteLimiter);
        router.get("/audit", [AdminIdentityController, "audit"]).as("admin.identity.audit");
        router.get("/analytics", [AdminIdentityController, "analytics"]).as("admin.identity.analytics");
        router.get("/settings", [AdminIdentityController, "settings"]).as("admin.identity.settings");
        router
            .patch("/settings", [AdminIdentityController, "updateSettings"])
            .as("admin.identity.settings.update")
            .use(adminWriteLimiter);
        router.get("/sms/settings", [AdminIdentityController, "smsSettings"]).as("admin.identity.sms.settings");
        router
            .patch("/sms/settings", [AdminIdentityController, "updateSmsSettings"])
            .as("admin.identity.sms.settings.update")
            .use(adminWriteLimiter);
        router.get("/access", [AdminIdentityController, "access"]).as("admin.identity.access");
        router
            .post("/access/preset", [AdminIdentityController, "applyAccessPreset"])
            .as("admin.identity.access.preset")
            .use(adminWriteLimiter);
        router.post("/step-up/verify", [AdminIdentityController, "stepUp"]).as("admin.identity.step_up").use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/identity")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
