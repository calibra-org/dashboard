import router from "@adonisjs/core/services/router";
import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";
const C=()=>import("#controllers/admin/procurement_controller");
router.group(()=>{
  router.get("/overview",[C,"overview"]); router.get("/suppliers",[C,"suppliers"]); router.post("/suppliers",[C,"createSupplier"]).use(adminWriteLimiter);
  router.get("/purchase-orders",[C,"purchaseOrders"]); router.post("/purchase-orders",[C,"createPurchaseOrder"]).use(adminWriteLimiter); router.post("/purchase-orders/:id/transition",[C,"transition"]).use(adminWriteLimiter); router.post("/purchase-orders/:id/receipts",[C,"receive"]).use(adminWriteLimiter);
  router.get("/recommendations",[C,"recommendations"]); router.get("/health",[C,"health"]);
}).prefix("/api/v1/admin/procurement").use(middleware.auth({guards:["api"]})).use(middleware.admin());
