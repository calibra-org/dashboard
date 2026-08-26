import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { contentPublicLimiter } from "#start/limiter";

const FulfillmentPromiseStorefrontController = () => import("#controllers/fulfillment_promise_storefront_controller");

router
    .post("/api/v1/fulfillment-promises/quote", [FulfillmentPromiseStorefrontController, "quote"])
    .as("fulfillment_promises.quote")
    .use(contentPublicLimiter)
    .use(middleware.cart());

router
    .post("/api/v1/fulfillment-promises/select", [FulfillmentPromiseStorefrontController, "select"])
    .as("fulfillment_promises.select")
    .use(contentPublicLimiter)
    .use(middleware.cart());
