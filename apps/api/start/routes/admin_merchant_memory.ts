import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const MerchantMemoryController = () => import("#controllers/admin/merchant_memory_controller");

router
    .group(() => {
        router.get("/overview", [MerchantMemoryController, "overview"]).as("admin.merchant_memory.overview");
        router.get("/memories", [MerchantMemoryController, "memories"]).as("admin.merchant_memory.memories");
        router.get("/memories/:publicId", [MerchantMemoryController, "memory"]).as("admin.merchant_memory.memory");
        router
            .post("/memories", [MerchantMemoryController, "create"])
            .as("admin.merchant_memory.memories.create")
            .use(adminWriteLimiter);
        router
            .post("/memories/:publicId/evidence", [MerchantMemoryController, "addEvidence"])
            .as("admin.merchant_memory.evidence.create")
            .use(adminWriteLimiter);
        router
            .post("/memories/:publicId/supersede", [MerchantMemoryController, "supersede"])
            .as("admin.merchant_memory.supersede")
            .use(adminWriteLimiter);
        router
            .post("/retrieve", [MerchantMemoryController, "retrieve"])
            .as("admin.merchant_memory.retrieve")
            .use(adminWriteLimiter);
        router
            .post("/retrievals/:publicId/feedback", [MerchantMemoryController, "feedback"])
            .as("admin.merchant_memory.feedback")
            .use(adminWriteLimiter);
        router.get("/effectiveness", [MerchantMemoryController, "effectiveness"]).as("admin.merchant_memory.effectiveness");
    })
    .prefix("/api/v1/admin/merchant-memory")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
