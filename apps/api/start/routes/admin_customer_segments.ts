import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const AdminCustomerSegmentsController = () => import("#controllers/admin/customer_segments_controller");

router
    .group(() => {
        router.get("/", [AdminCustomerSegmentsController, "index"]).as("admin.customer-segments.index");
        router.post("/", [AdminCustomerSegmentsController, "store"]).as("admin.customer-segments.store");
        router.patch("/:id", [AdminCustomerSegmentsController, "update"]).as("admin.customer-segments.update");
        router
            .get("/:id/intelligence-definition", [AdminCustomerSegmentsController, "definition"])
            .as("admin.customer-segments.definition");
        router
            .put("/:id/intelligence-definition", [AdminCustomerSegmentsController, "saveDefinition"])
            .as("admin.customer-segments.definition.update");
        router.post("/:id/preview", [AdminCustomerSegmentsController, "preview"]).as("admin.customer-segments.preview");
        router.post("/:id/evaluate", [AdminCustomerSegmentsController, "evaluate"]).as("admin.customer-segments.evaluate");
        router.get("/:id/members", [AdminCustomerSegmentsController, "members"]).as("admin.customer-segments.members");
        router.delete("/:id", [AdminCustomerSegmentsController, "destroy"]).as("admin.customer-segments.destroy");
    })
    .prefix("/api/v1/admin/customer-segments")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
