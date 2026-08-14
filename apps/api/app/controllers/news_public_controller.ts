import type { HttpContext } from "@adonisjs/core/http";

import { newsService } from "#services/content/news_service";
import { publicContentListValidator } from "#validators/admin/content_validator";

export default class NewsPublicController {
    async index(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(publicContentListValidator);
        const { type: _ignored, ...filters } = payload;
        return newsService.publicList(filters);
    }

    async show(ctx: HttpContext) {
        const locale = String(ctx.request.input("locale", "fa"));
        if (locale !== "fa" && locale !== "en") {
            return ctx.response
                .status(422)
                .json({ errors: [{ message: "locale must be fa or en", code: "E_VALIDATION_ERROR" }] });
        }
        return newsService.publicDetail(String(ctx.params.slug), locale);
    }
}
