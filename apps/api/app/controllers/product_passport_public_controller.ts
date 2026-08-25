import type { HttpContext } from "@adonisjs/core/http";

import { resolvePublicPassport } from "#services/product_passport/product_passport_service";

export default class ProductPassportPublicController {
    async resolve(ctx: HttpContext) {
        return { data: await resolvePublicPassport(ctx.params.resolverKey) };
    }
}
