import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { GatewayNotImplementedException } from "#exceptions/payment_exceptions";
import Order from "#models/order";
import { MELLAT_START_PAY_URL } from "#services/adapters/mellat_gateway";
import { paymentService } from "#services/payment_service";
import { paymentInitValidator } from "#validators/payments/init_validator";

/** Storefront-facing payment endpoints. */
export default class PaymentController {
    async init(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(paymentInitValidator);
        const order = await Order.query().where("order_key", payload.order_key).first();
        if (!order) {
            throw new Exception("Order not found", { status: 404, code: "E_ORDER_NOT_FOUND" });
        }
        if (!order.paymentGatewayIdSnapshot) {
            throw new Exception("Order has no payment method", { status: 422, code: "E_PAYMENT_REQUIRED" });
        }
        const idempotencyKey = ctx.request.header("idempotency-key") ?? ctx.request.header("Idempotency-Key") ?? null;
        const result = await paymentService.init(order, order.paymentGatewayIdSnapshot, idempotencyKey ?? null);
        return {
            data: {
                order_id: Number(order.id),
                order_key: order.orderKey,
                redirect_url: result.redirect_url,
            },
        };
    }

    /**
     * Behpardakht's StartPay handoff is a form POST, not a normal location redirect. This bridge
     * receives only the non-secret RefId, validates it strictly, and auto-posts it to the fixed
     * Shaparak host under a locked-down one-page CSP. Merchant credentials never reach the browser.
     */
    async mellatRedirect(ctx: HttpContext) {
        const authority = String(ctx.request.input("authority") ?? "").trim();
        if (!/^[A-Za-z0-9_-]{6,128}$/.test(authority)) {
            throw new Exception("Invalid Mellat authority", { status: 400, code: "E_PAYMENT_AUTHORITY_INVALID" });
        }
        ctx.response.header(
            "Content-Security-Policy",
            `default-src 'none'; form-action ${new URL(MELLAT_START_PAY_URL).origin}; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'`,
        );
        ctx.response.header("Referrer-Policy", "no-referrer");
        ctx.response.header("X-Frame-Options", "DENY");
        ctx.response.header("Cache-Control", "no-store, max-age=0");
        ctx.response.header("Content-Type", "text/html; charset=utf-8");
        return ctx.response.send(
            `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>انتقال به درگاه بانکی</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f7fb;color:#15182b}main{max-width:28rem;padding:2rem;text-align:center;background:white;border:1px solid #e5e7eb;border-radius:1rem}button{padding:.8rem 1.2rem;border:0;border-radius:.65rem;background:#24264f;color:white;font:inherit}</style></head><body><main><p>در حال انتقال امن به درگاه به‌پرداخت ملت…</p><form id="mellat" method="post" action="${MELLAT_START_PAY_URL}"><input type="hidden" name="RefId" value="${authority}"><button type="submit">ادامه به درگاه</button></form></main><script>document.getElementById('mellat').submit()</script></body></html>`,
        );
    }

    async callback(ctx: HttpContext) {
        const code = ctx.params.gateway_code;
        try {
            const result = await paymentService.verifyCallback(String(code), ctx.request);
            return ctx.response.redirect(result.redirect);
        } catch (error) {
            /**
             * Callback failures must use the same operator-configured storefront destination as
             * normal verify failures. Keeping a localhost literal here made production exception
             * paths escape the configured checkout UX even though the service honored the setting.
             */
            const reason =
                error instanceof GatewayNotImplementedException
                    ? "gateway_not_implemented"
                    : ((error as Error)?.message ?? "callback_failed").slice(0, 200);
            return ctx.response.redirect(await paymentService.failureRedirect(reason));
        }
    }
}
