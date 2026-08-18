import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const ProcurementController = () => import("#controllers/admin/procurement_controller");

router
    .group(() => {
        router.get("/overview", [ProcurementController, "overview"]).as("admin.procurement.overview");
        router.get("/suppliers", [ProcurementController, "suppliers"]).as("admin.procurement.suppliers.index");
        router.post("/suppliers", [ProcurementController, "createSupplier"]).as("admin.procurement.suppliers.create").use(adminWriteLimiter);
        router.get("/purchase-orders", [ProcurementController, "purchaseOrders"]).as("admin.procurement.purchase-orders.index");
        router.post("/purchase-orders", [ProcurementController, "createPurchaseOrder"]).as("admin.procurement.purchase-orders.create").use(adminWriteLimiter);
        router.post("/purchase-orders/:id/transition", [ProcurementController, "transition"]).as("admin.procurement.purchase-orders.transition").use(adminWriteLimiter);
        router.post("/purchase-orders/:id/receipts", [ProcurementController, "receive"]).as("admin.procurement.purchase-orders.receive").use(adminWriteLimiter);
        router.get("/recommendations", [ProcurementController, "recommendations"]).as("admin.procurement.recommendations");
        router.get("/health", [ProcurementController, "health"]).as("admin.procurement.health");
    })
    .prefix("/api/v1/admin/procurement")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
