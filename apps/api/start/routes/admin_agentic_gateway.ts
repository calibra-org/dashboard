import router from "@adonisjs/core/services/router";
import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const AdminAgenticGatewayController = () => import("#controllers/admin/agentic_gateway_controller");

router.group(() => {
    router.get("/overview", [AdminAgenticGatewayController, "overview"]).as("admin.agentic_gateway.overview");
    router.get("/channels", [AdminAgenticGatewayController, "channels"]).as("admin.agentic_gateway.channels");
    router.post("/channels", [AdminAgenticGatewayController, "saveChannel"]).as("admin.agentic_gateway.channels.save").use(adminWriteLimiter);
    router.post("/principals", [AdminAgenticGatewayController, "savePrincipal"]).as("admin.agentic_gateway.principals.save").use(adminWriteLimiter);
    router.post("/actions/authorize", [AdminAgenticGatewayController, "authorizeAction"]).as("admin.agentic_gateway.actions.authorize").use(adminWriteLimiter);
    router.post("/capabilities", [AdminAgenticGatewayController, "createCapability"]).as("admin.agentic_gateway.capabilities.create").use(adminWriteLimiter);
    router.post("/conformance", [AdminAgenticGatewayController, "conformance"]).as("admin.agentic_gateway.conformance").use(adminWriteLimiter);
    router.get("/readiness", [AdminAgenticGatewayController, "readiness"]).as("admin.agentic_gateway.readiness");
    router.post("/readiness/refresh", [AdminAgenticGatewayController, "refreshReadiness"]).as("admin.agentic_gateway.readiness.refresh").use(adminWriteLimiter);
    router.get("/product-graph", [AdminAgenticGatewayController, "graph"]).as("admin.agentic_gateway.product_graph");
}).prefix("/api/v1/admin/agentic-commerce").use(middleware.auth({ guards: ["api"] })).use(middleware.admin());
