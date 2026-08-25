import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { contentPublicLimiter } from "#start/limiter";

const RetailMediaStorefrontController = () => import("#controllers/retail_media_storefront_controller");

router
    .post("/api/v1/retail-media/placements/:placementKey/serve", [RetailMediaStorefrontController, "serve"])
    .as("retail_media.placements.serve")
    .use(contentPublicLimiter);

router
    .post("/api/v1/retail-media/impressions/:eventId/click", [RetailMediaStorefrontController, "click"])
    .as("retail_media.impressions.click")
    .use(contentPublicLimiter);

router
    .post("/api/v1/retail-media/affiliate/:code/touch", [RetailMediaStorefrontController, "touchAffiliate"])
    .as("retail_media.affiliate.touch")
    .use(contentPublicLimiter)
    .use(middleware.cart());
