import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const OrderOperationsController = () => import("#controllers/admin/order_operations_controller");
const InventoryOperationsController = () => import("#controllers/admin/inventory_operations_controller");
const StoreOperationsConfigController = () => import("#controllers/admin/store_operations_config_controller");

router
    .group(() => {
        router.get("/orders/operations/summary", [OrderOperationsController, "summary"]).as("admin.orderOperations.summary");
        router.get("/orders/:orderId/operations", [OrderOperationsController, "show"]).as("admin.orderOperations.show");
        router
            .post("/orders/:orderId/fulfillments", [OrderOperationsController, "createFulfillment"])
            .as("admin.orderOperations.fulfillments.create");
        router
            .post("/fulfillments/:id/transition", [OrderOperationsController, "transitionFulfillment"])
            .as("admin.orderOperations.fulfillments.transition");
        router
            .post("/fulfillments/:fulfillmentId/shipments", [OrderOperationsController, "createShipment"])
            .as("admin.orderOperations.shipments.create");
        router
            .post("/shipments/:shipmentId/events", [OrderOperationsController, "shipmentEvent"])
            .as("admin.orderOperations.shipments.events.create");
        router
            .post("/orders/:orderId/returns", [OrderOperationsController, "createReturn"])
            .as("admin.orderOperations.returns.create");
        router.post("/returns/:id/approve", [OrderOperationsController, "approveReturn"]).as("admin.orderOperations.returns.approve");
        router.post("/returns/:id/receive", [OrderOperationsController, "receiveReturn"]).as("admin.orderOperations.returns.receive");
        router
            .post("/returns/:id/transition", [OrderOperationsController, "transitionReturn"])
            .as("admin.orderOperations.returns.transition");
        router.post("/returns/:id/refund", [OrderOperationsController, "refundReturn"]).as("admin.orderOperations.returns.refund");

        router.get("/inventory/movements", [InventoryOperationsController, "movements"]).as("admin.inventoryOperations.movements");
        router.post("/inventory/adjustments", [InventoryOperationsController, "adjust"]).as("admin.inventoryOperations.adjust");

        router.get("/shipping/zones", [StoreOperationsConfigController, "shippingZones"]).as("admin.shipping.zones.index");
        router.post("/shipping/zones", [StoreOperationsConfigController, "createShippingZone"]).as("admin.shipping.zones.create");
        router.get("/shipping/zones/:id", [StoreOperationsConfigController, "shippingZone"]).as("admin.shipping.zones.show");
        router.patch("/shipping/zones/:id", [StoreOperationsConfigController, "updateShippingZone"]).as("admin.shipping.zones.update");
        router.delete("/shipping/zones/:id", [StoreOperationsConfigController, "deleteShippingZone"]).as("admin.shipping.zones.delete");
        router
            .put("/shipping/zones/:id/locations", [StoreOperationsConfigController, "replaceShippingZoneLocations"])
            .as("admin.shipping.zones.locations.replace");
        router.get("/shipping/methods", [StoreOperationsConfigController, "shippingMethods"]).as("admin.shipping.methods.index");
        router
            .post("/shipping/zones/:zoneId/methods", [StoreOperationsConfigController, "addShippingZoneMethod"])
            .as("admin.shipping.zoneMethods.create");
        router
            .patch("/shipping/zones/:zoneId/methods/:id", [StoreOperationsConfigController, "updateShippingZoneMethod"])
            .as("admin.shipping.zoneMethods.update");
        router
            .delete("/shipping/zones/:zoneId/methods/:id", [StoreOperationsConfigController, "deleteShippingZoneMethod"])
            .as("admin.shipping.zoneMethods.delete");

        router.get("/tax/rates", [StoreOperationsConfigController, "taxRates"]).as("admin.tax.rates.index");
        router.post("/tax/rates", [StoreOperationsConfigController, "createTaxRate"]).as("admin.tax.rates.create");
        router.patch("/tax/rates/:id", [StoreOperationsConfigController, "updateTaxRate"]).as("admin.tax.rates.update");
        router.delete("/tax/rates/:id", [StoreOperationsConfigController, "deleteTaxRate"]).as("admin.tax.rates.delete");
    })
    .prefix("/api/v1/admin")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
