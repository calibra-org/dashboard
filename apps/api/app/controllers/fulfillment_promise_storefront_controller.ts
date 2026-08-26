import type { HttpContext } from "@adonisjs/core/http";

import { releaseExpiredCapacityHolds } from "#services/fulfillment_promise/capacity_service";
import * as fulfillmentPromise from "#services/fulfillment_promise/promise_service";
import { fulfillmentPromiseSelectValidator } from "#validators/fulfillment_promise/fulfillment_promise_validator";

export default class FulfillmentPromiseStorefrontController {
    async quote(ctx: HttpContext) {
        await releaseExpiredCapacityHolds();
        return { data: await fulfillmentPromise.quoteCart(ctx.cart) };
    }

    async select(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(fulfillmentPromiseSelectValidator);
        return { data: await fulfillmentPromise.selectCartPromise(ctx.cart, payload.promise_public_id) };
    }
}
