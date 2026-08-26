import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const FulfillmentPromiseController = () => import("#controllers/admin/fulfillment_promise_controller");

router
    .group(() => {
        router.get("/overview", [FulfillmentPromiseController, "overview"]).as("admin.fulfillment_promise.overview");
        router.get("/nodes", [FulfillmentPromiseController, "nodes"]).as("admin.fulfillment_promise.nodes");
        router
            .post("/nodes", [FulfillmentPromiseController, "createNode"])
            .as("admin.fulfillment_promise.nodes.create")
            .use(adminWriteLimiter);
        router
            .post("/nodes/:publicId/inventory-source", [FulfillmentPromiseController, "mapInventorySource"])
            .as("admin.fulfillment_promise.nodes.inventory_source")
            .use(adminWriteLimiter);
        router
            .post("/nodes/:publicId/capacity", [FulfillmentPromiseController, "upsertCapacity"])
            .as("admin.fulfillment_promise.nodes.capacity")
            .use(adminWriteLimiter);
        router
            .get("/service-profiles", [FulfillmentPromiseController, "serviceProfiles"])
            .as("admin.fulfillment_promise.service_profiles");
        router
            .post("/nodes/:publicId/service-profiles", [FulfillmentPromiseController, "upsertServiceProfile"])
            .as("admin.fulfillment_promise.service_profiles.upsert")
            .use(adminWriteLimiter);
        router
            .post("/transfer-lanes", [FulfillmentPromiseController, "upsertTransferLane"])
            .as("admin.fulfillment_promise.transfer_lanes.upsert")
            .use(adminWriteLimiter);
        router.get("/promises", [FulfillmentPromiseController, "promises"]).as("admin.fulfillment_promise.promises");
        router.get("/allocations", [FulfillmentPromiseController, "allocations"]).as("admin.fulfillment_promise.allocations");
        router.get("/accuracy", [FulfillmentPromiseController, "accuracy"]).as("admin.fulfillment_promise.accuracy");
        router
            .post("/outcomes/sync", [FulfillmentPromiseController, "syncOutcomes"])
            .as("admin.fulfillment_promise.outcomes.sync")
            .use(adminWriteLimiter);
        router.get("/access", [FulfillmentPromiseController, "access"]).as("admin.fulfillment_promise.access");
        router
            .post("/access/preset", [FulfillmentPromiseController, "accessPreset"])
            .as("admin.fulfillment_promise.access.preset")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/fulfillment-promise")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
