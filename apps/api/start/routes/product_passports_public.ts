import router from "@adonisjs/core/services/router";

import { contentPublicLimiter } from "#start/limiter";

const ProductPassportPublicController = () => import("#controllers/product_passport_public_controller");

router
    .get("/api/v1/product-passports/:resolverKey", [ProductPassportPublicController, "resolve"])
    .as("product_passport.public.resolve")
    .use(contentPublicLimiter);
