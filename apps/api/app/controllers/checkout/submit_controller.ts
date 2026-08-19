import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { OrderStatus } from "#enums/order_status";
import type Cart from "#models/cart";
import Order from "#models/order";
import { orderFinalizer } from "#services/order_finalizer";
import { paymentService } from "#services/payment_service";
import { phase20TrustRiskService } from "#services/phase20_trust_risk_service";
import OrderTransformer from "#transformers/order_transformer";

/**
 * Storefront checkout finalize handler. The idempotency middleware runs before this controller.
 * Phase 20 evaluates trust before order finalization or payment side effects, so a blocked/review
 * decision cannot accidentally reserve stock or initialize a gateway transaction first.
 */
export default class CheckoutSubmitController {
    async submit(ctx: HttpContext) {
        const cart = ctx.cart;
        const draft = await this.findDraft(cart);

        await phase20TrustRiskService.checkoutGuard({
            orderId: Number(draft.id),
            customerId: cart.customerId,
            idempotencyKey: ctx.idempotencyKey ?? null,
        });

        const result = await orderFinalizer.finalize(cart, draft, {
            idempotencyKey: ctx.idempotencyKey ?? null,
            actor: ctx.auth?.user ?? null,
            locale: ctx.i18n.locale,
            ipAddress: ctx.request.ip(),
            userAgent: ctx.request.header("user-agent") ?? null,
        });

        let redirectUrl: string | null = result.payment.redirectUrl;
        if (result.payment.gateway.id) {
            const idempotencyKey = ctx.idempotencyKey ? `${ctx.idempotencyKey}:pay` : null;
            const initResult = await paymentService.init(result.order, result.payment.gateway.id, idempotencyKey);
            redirectUrl = initResult.redirect_url;
            await result.order.refresh();
        }

        await this.loadForResponse(result.order);
        return {
            data: new OrderTransformer(result.order).forDetail(),
            payment: {
                gateway_id: result.payment.gateway.id,
                method_code: result.payment.gateway.code,
                redirect_url: redirectUrl,
            },
        };
    }

    private async findDraft(cart: Cart): Promise<Order> {
        if (cart.customerId !== null) {
            const own = await Order.query()
                .where("customer_id", Number(cart.customerId))
                .where("status", OrderStatus.Draft)
                .orderBy("id", "desc")
                .first();
            if (own) return own;
        }
        const byCart = await Order.query()
            .where("cart_hash", String(cart.id))
            .where("status", OrderStatus.Draft)
            .orderBy("id", "desc")
            .first();
        if (!byCart) {
            throw new Exception("No draft order to submit. Call GET /api/v1/checkout first.", {
                status: 422,
                code: "E_DRAFT_MISSING",
            });
        }
        return byCart;
    }

    private async loadForResponse(order: Order): Promise<void> {
        await order.load("lineItems");
        await order.load("billingAddress");
        await order.load("shippingAddress");
        await order.load("shippingLines");
        await order.load("taxLines");
        await order.load("statusHistory");
    }
}
