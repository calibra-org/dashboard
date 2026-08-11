import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { paymentLimiter, webhookLimiter } from "#start/limiter";

const PaymentController = () => import("#controllers/payment_controller");

/** Storefront payment surface. */
router
    .group(() => {
        router.post("/init", [PaymentController, "init"]).as("payment.init").use(paymentLimiter);
        router.get("/redirect/mellat", [PaymentController, "mellatRedirect"]).as("payment.redirect.mellat").use(webhookLimiter);
        router
            .get("/callback/:gateway_code", [PaymentController, "callback"])
            .as("payment.callback.get")
            .use([webhookLimiter, middleware.webhookSignature()]);
        router
            .post("/callback/:gateway_code", [PaymentController, "callback"])
            .as("payment.callback.post")
            .use([webhookLimiter, middleware.webhookSignature()]);
    })
    .prefix("/api/v1/payment");
