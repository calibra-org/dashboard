import { randomUUID } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";

import Phase9EventIdentityService from "#services/phase9_event_identity_service";
import Phase9PersonalizationService, {
    Phase9ConflictError,
    Phase9ValidationError,
    type Subject,
} from "#services/phase9_personalization_service";

const VISITOR_COOKIE = "calibra_personalization_vid";

export default class PersonalizationController {
    private service = new Phase9PersonalizationService();
    private identity = new Phase9EventIdentityService();

    async amazingDeals(ctx: HttpContext) {
        const limit = Number(ctx.request.input("limit", 8));
        return { data: await this.service.amazingDeals(ctx.i18n.locale, limit) };
    }

    async recommendations(ctx: HttpContext) {
        const subject = await this.resolveSubject(ctx, false);
        const result = await this.serveRecommendations(ctx, subject, ctx.request.all());
        return { data: result };
    }

    async serve(ctx: HttpContext) {
        const subject = await this.resolveSubject(ctx, false);
        try {
            return { data: await this.serveRecommendations(ctx, subject, ctx.request.body() as Record<string, unknown>) };
        } catch (error) {
            return this.handle(error, ctx);
        }
    }

    async servePage(ctx: HttpContext) {
        const subject = await this.resolveSubject(ctx, false);
        try {
            const body = ctx.request.body() as Record<string, unknown>;
            const placements = Array.isArray(body.placements) ? body.placements.map(String).slice(0, 12) : ["home"];
            const data: Record<string, unknown> = {};
            for (const placement of placements) data[placement] = await this.serveRecommendations(ctx, subject, { ...body, placement });
            return { data: { page_request_id: randomUUID(), placements: data } };
        } catch (error) {
            return this.handle(error, ctx);
        }
    }

    async event(ctx: HttpContext) {
        const subject = await this.resolveSubject(ctx, true);
        try {
            const result = await this.identity.ingest(ctx.request.body() as Record<string, unknown>, subject);
            return ctx.response.status(202).json({ data: result });
        } catch (error) {
            return this.handle(error, ctx);
        }
    }

    async eventBatch(ctx: HttpContext) {
        const subject = await this.resolveSubject(ctx, true);
        try {
            const body = ctx.request.body() as Record<string, unknown>;
            const result = await this.identity.ingestBatch(body.events, subject);
            return ctx.response.status(202).json({ data: result });
        } catch (error) {
            return this.handle(error, ctx);
        }
    }

    async consent(ctx: HttpContext) {
        const subject = await this.resolveSubject(ctx, true);
        if (!subject) return ctx.response.status(400).json({ error: "subject_required" });
        return { data: await this.service.getConsent(subject) };
    }

    async updateConsent(ctx: HttpContext) {
        const subject = await this.resolveSubject(ctx, true);
        if (!subject) return ctx.response.status(400).json({ error: "subject_required" });
        const data = await this.service.updateConsent(subject, ctx.request.body() as Record<string, unknown>);
        await this.mergeCookieIdentity(ctx, subject);
        return { data };
    }

    async preferences(ctx: HttpContext) {
        const subject = await this.resolveSubject(ctx, true);
        if (!subject) return ctx.response.status(400).json({ error: "subject_required" });
        return { data: await this.identity.getPreferences(subject) };
    }

    async updatePreferences(ctx: HttpContext) {
        const subject = await this.resolveSubject(ctx, true);
        if (!subject) return ctx.response.status(400).json({ error: "subject_required" });
        return { data: await this.identity.updatePreferences(subject, ctx.request.body() as Record<string, unknown>) };
    }

    async reset(ctx: HttpContext) {
        const subject = await this.resolveSubject(ctx, false);
        if (!subject) return ctx.response.status(400).json({ error: "subject_required" });
        return { data: await this.identity.resetSubject(subject) };
    }

    private async serveRecommendations(ctx: HttpContext, subject: Subject | null, input: Record<string, unknown>) {
        const preferences = subject ? await this.identity.getPreferences(subject) : null;
        const hidden = Array.isArray(preferences?.hidden_product_ids) ? preferences.hidden_product_ids.map(Number) : [];
        return this.service.recommendations({
            placement: String(input.placement ?? "home"),
            limit: Number(input.limit ?? 8),
            subject,
            locale: ctx.i18n.locale,
            exclude_product_ids: [...new Set([...parseIds(input.exclude_product_ids), ...hidden])],
        });
    }

    private async resolveSubject(ctx: HttpContext, createVisitor: boolean): Promise<Subject | null> {
        if (ctx.auth.user) {
            const customerId = (ctx.auth.user as unknown as { customer?: { id?: number | bigint } }).customer?.id;
            if (customerId) {
                const subject: Subject = { type: "customer", id: String(customerId) };
                await this.mergeCookieIdentity(ctx, subject);
                return subject;
            }
        }
        const supplied = this.visitorId(ctx);
        if (supplied) return { type: "visitor", id: supplied };
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

    private async mergeCookieIdentity(ctx: HttpContext, subject: Subject) {
        if (subject.type !== "customer") return;
        const visitorId = this.visitorId(ctx);
        if (!visitorId) return;
        await this.identity.mergeAnonymousIntoCustomer(visitorId, Number(subject.id));
    }

    private visitorId(ctx: HttpContext) {
        const supplied = ctx.request.header("x-calibra-visitor-id") ?? ctx.request.cookie(VISITOR_COOKIE);
        return typeof supplied === "string" && /^[a-zA-Z0-9_-]{12,96}$/.test(supplied) ? supplied : null;
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
