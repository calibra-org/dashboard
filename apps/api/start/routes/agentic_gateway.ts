import router from "@adonisjs/core/services/router";

import { agenticPublicLimiter } from "#start/limiter";

const AgenticGatewayController = () => import("#controllers/agentic_gateway_controller");

router.get("/.well-known/calibra-agentic-commerce", [AgenticGatewayController, "profile"]).as("agentic_gateway.profile");

router
    .group(() => {
        router.get("/products/:productId", [AgenticGatewayController, "product"]).as("agentic_gateway.product");
        router.post("/actions/authorize", [AgenticGatewayController, "authorize"]).as("agentic_gateway.authorize");
        router.post("/events", [AgenticGatewayController, "event"]).as("agentic_gateway.events");
    })
    .prefix("/api/v1/agentic")
    .use(agenticPublicLimiter);
