import { randomUUID } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";

import Phase9PersonalizationService, {
    Phase9ConflictError,
    Phase9ValidationError,
    type Subject,
} from "#services/phase9_personalization_service";

const VISITOR_COOKIE = "calibra_personalization_vid";

export default class PersonalizationController {
    private service = new Phase9PersonalizationService();

    async amazingDeals(ctx: HttpContext) {
        const limit = Number(ctx.request.input("limit", 8));
        return { data: await this.service.amazingDeals(ctx.i18n.locale, limit) };
    }

    async recommendations(ctx: HttpContext) {
        const subject = this.resolveSubject(ctx, false);
        const result = await this.service.recommendations({
            placement: String(ctx.request.input("placement", "home")),
            limit: Number(ctx.request.input("limit", 8)),
            subject,
            locale: ctx.i18n.locale,
            exclude_product_ids: parseIds(ctx.request.input("exclude_product_ids")),
        });
        return { data: result };
    }

    async event(ctx: HttpContext) {
        const subject = this.resolveSubject(ctx, true);
        try {
            const result = await this.service.ingestEvent(ctx.request.body() as Record<string, unknown>, subject);
            return ctx.response.status(202).json({ data: result });
        } catch (error) {
            return this.handle(error, ctx);
        }
    }

    async consent(ctx: HttpContext) {
        const subject = this.resolveSubject(ctx, true);
        if (!subject) return ctx.response.status(400).json({ error: "subject_required" });
        return { data: await this.service.getConsent(subject) };
    }

    async updateConsent(ctx: HttpContext) {
        const subject = this.resolveSubject(ctx, true);
        if (!subject) return ctx.response.status(400).json({ error: "subject_required" });
        return { data: await this.service.updateConsent(subject, ctx.request.body() as Record<string, unknown>) };
    }

    async reset(ctx: HttpContext) {
        const subject = this.resolveSubject(ctx, false);
        if (!subject) return ctx.response.status(400).json({ error: "subject_required" });
        return { data: await this.service.resetProfile(subject) };
    }

    private resolveSubject(ctx: HttpContext, createVisitor: boolean): Subject | null {
        if (ctx.auth.user) {
            const customerId = (ctx.auth.user as unknown as { customer?: { id?: number | bigint } }).customer?.id;
            if (customerId) return { type: "customer", id: String(customerId) };
        }
        const supplied = ctx.request.header("x-calibra-visitor-id") ?? ctx.request.cookie(VISITOR_COOKIE);
        if (typeof supplied === "string" && /^[a-zA-Z0-9_-]{12,96}$/.test(supplied)) return { type: "visitor", id: supplied };
        if (!createVisitor) return null;
        const id = randomUUID();
        ctx.response.cookie(VISITOR_COOKIE, id, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 365,
            path: "/",
        });
        return { type: "visitor", id };
    }

    private handle(error: unknown, ctx: HttpContext) {
        if (error instanceof Phase9ValidationError) return ctx.response.status(422).json({ error: error.message });
        if (error instanceof Phase9ConflictError) return ctx.response.status(409).json({ error: error.message });
        throw error;
    }
}

function parseIds(value: unknown): number[] {
    if (Array.isArray(value)) return value.map(Number).filter((v) => Number.isInteger(v) && v > 0);
    if (typeof value === "string")
        return value
            .split(",")
            .map(Number)
            .filter((v) => Number.isInteger(v) && v > 0);
    return [];
}
