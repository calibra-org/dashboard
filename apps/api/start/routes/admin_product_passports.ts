import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const ProductPassportController = () => import("#controllers/admin/product_passport_controller");

router
    .group(() => {
        router.get("/overview", [ProductPassportController, "overview"]).as("admin.product_passport.overview");
        router.get("/passports", [ProductPassportController, "index"]).as("admin.product_passport.index");
        router.get("/passports/:publicId", [ProductPassportController, "show"]).as("admin.product_passport.show");
        router
            .post("/passports", [ProductPassportController, "create"])
            .as("admin.product_passport.create")
            .use(adminWriteLimiter);
        router
            .patch("/passports/:publicId", [ProductPassportController, "update"])
            .as("admin.product_passport.update")
            .use(adminWriteLimiter);
        router
            .post("/passports/:publicId/publish", [ProductPassportController, "publish"])
            .as("admin.product_passport.publish")
            .use(adminWriteLimiter);
        router
            .post("/passports/:publicId/revoke", [ProductPassportController, "revoke"])
            .as("admin.product_passport.revoke")
            .use(adminWriteLimiter);
        router
            .post("/passports/:publicId/evidence", [ProductPassportController, "addEvidence"])
            .as("admin.product_passport.evidence.create")
            .use(adminWriteLimiter);
        router
            .post("/passports/:publicId/evidence/:evidencePublicId/status", [ProductPassportController, "verifyEvidence"])
            .as("admin.product_passport.evidence.status")
            .use(adminWriteLimiter);
        router
            .post("/passports/:publicId/edges", [ProductPassportController, "addEdge"])
            .as("admin.product_passport.edges.create")
            .use(adminWriteLimiter);
        router
            .get("/regulatory-mappings", [ProductPassportController, "regulatoryMappings"])
            .as("admin.product_passport.regulatory.index");
        router
            .post("/regulatory-mappings", [ProductPassportController, "createRegulatoryMapping"])
            .as("admin.product_passport.regulatory.create")
            .use(adminWriteLimiter);
        router
            .post("/regulatory-mappings/:publicId/status", [ProductPassportController, "setRegulatoryStatus"])
            .as("admin.product_passport.regulatory.status")
            .use(adminWriteLimiter);
        router.get("/access", [ProductPassportController, "access"]).as("admin.product_passport.access");
        router
            .post("/access/preset", [ProductPassportController, "accessPreset"])
            .as("admin.product_passport.access.preset")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/product-passports")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
