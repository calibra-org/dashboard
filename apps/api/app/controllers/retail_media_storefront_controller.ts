import type { HttpContext } from "@adonisjs/core/http";

import * as retailMedia from "#services/retail_media/retail_media_service";
import { retailMediaClickValidator, retailMediaServeValidator } from "#validators/retail_media/retail_media_validator";

export default class RetailMediaStorefrontController {
    async serve(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(retailMediaServeValidator);
        return retailMedia.servePlacement(ctx.params.placementKey, payload);
    }

    async click(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(retailMediaClickValidator);
        return retailMedia.recordClick(ctx.params.eventId, payload);
    }

    async touchAffiliate(ctx: HttpContext) {
        return { data: await retailMedia.touchAffiliate(ctx.params.code, ctx.cart) };
    }
}
