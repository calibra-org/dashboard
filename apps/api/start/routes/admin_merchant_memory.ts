import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const MerchantMemoryController = () => import("#controllers/admin/merchant_memory_controller");

router
    .group(() => {
        router.get("/overview", [MerchantMemoryController, "overview"]).as("admin.merchant_memory.overview");
        router.get("/records", [MerchantMemoryController, "index"]).as("admin.merchant_memory.records");
        router.get("/records/:publicId", [MerchantMemoryController, "show"]).as("admin.merchant_memory.record");
        router
            .post("/records", [MerchantMemoryController, "create"])
            .as("admin.merchant_memory.records.create")
            .use(adminWriteLimiter);
        router
            .post("/records/:publicId/supersede", [MerchantMemoryController, "supersede"])
            .as("admin.merchant_memory.records.supersede")
            .use(adminWriteLimiter);
        router
            .post("/retrieve", [MerchantMemoryController, "retrieve"])
            .as("admin.merchant_memory.retrieve")
            .use(adminWriteLimiter);
        router
            .post("/retrievals/:publicId/effectiveness", [MerchantMemoryController, "effectiveness"])
            .as("admin.merchant_memory.effectiveness")
            .use(adminWriteLimiter);
        router
            .post("/records/:publicId/revoke", [MerchantMemoryController, "revoke"])
            .as("admin.merchant_memory.revoke")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/merchant-memory")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
