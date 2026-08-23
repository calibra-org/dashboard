import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const MerchantMemoryController = () => import("#controllers/admin/merchant_memory_controller");

router
    .group(() => {
        router.get("/overview", [MerchantMemoryController, "overview"]).as("admin.merchant_memory.overview");
        router.get("/memories", [MerchantMemoryController, "index"]).as("admin.merchant_memory.index");
        router.get("/memories/:publicId", [MerchantMemoryController, "show"]).as("admin.merchant_memory.show");
        router
            .post("/memories", [MerchantMemoryController, "create"])
            .as("admin.merchant_memory.create")
            .use(adminWriteLimiter);
        router
            .post("/retrieve", [MerchantMemoryController, "retrieve"])
            .as("admin.merchant_memory.retrieve")
            .use(adminWriteLimiter);
        router
            .post("/memories/:publicId/supersede", [MerchantMemoryController, "supersede"])
            .as("admin.merchant_memory.supersede")
            .use(adminWriteLimiter);
        router
            .post("/retrievals/:retrievalPublicId/feedback", [MerchantMemoryController, "feedback"])
            .as("admin.merchant_memory.feedback")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/merchant-memory")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
