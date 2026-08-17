import { randomUUID } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";

import Phase9MasterService from "#services/phase9_master_service";
import { Phase9ConflictError, Phase9ValidationError, type Subject } from "#services/phase9_personalization_service";

const VISITOR_COOKIE = "calibra_personalization_vid";

export default class Phase9MasterController {
    private service = new Phase9MasterService();

    async event(ctx: HttpContext) {
        try {
            const subject = this.resolveSubject(ctx, true);
            const data = await this.service.ingestEvent(ctx.request.body() as Record<string, unknown>, subject);
            return ctx.response.status(202).json({ data });
        } catch (error) { return this.handle(error, ctx); }
    }

    async batch(ctx: HttpContext) {
        try {
            const subject = this.resolveSubject(ctx, true);
            const body = ctx.request.body() as Record<string, unknown>;
            const data = await this.service.ingestBatch(body.events, subject);
            return ctx.response.status(202).json({ data });
        } catch (error) { return this.handle(error, ctx); }
    }

    async serve(ctx: HttpContext) {
        try {
            const subject = await this.resolveAndMerge(ctx, false);
            return { data: await this.service.serve(ctx.request.body() as Record<string, unknown>, subject, ctx.i18n.locale) };
        } catch (error) { return this.handle(error, ctx); }
    }

    async servePage(ctx: HttpContext) {
        try {
            const subject = await this.resolveAndMerge(ctx, false);
            return { data: await this.service.servePage(ctx.request.body() as Record<string, unknown>, subject, ctx.i18n.locale) };
        } catch (error) { return this.handle(error, ctx); }
    }

    async preferences(ctx: HttpContext) {
        const subject = await this.resolveAndMerge(ctx, true);
        if (!subject) return ctx.response.status(400).json({ error: "subject_required" });
        return { data: await this.service.getPreferences(subject) };
    }

    async updatePreferences(ctx: HttpContext) {
        try {
            const subject = await this.resolveAndMerge(ctx, true);
            if (!subject) return ctx.response.status(400).json({ error: "subject_required" });
            return { data: await this.service.updatePreferences(subject, ctx.request.body() as Record<string, unknown>) };
        } catch (error) { return this.handle(error, ctx); }
    }

    async notInterested(ctx: HttpContext) {
        try {
            const subject = await this.resolveAndMerge(ctx, true);
            if (!subject) return ctx.response.status(400).json({ error: "subject_required" });
            const current = await this.service.getPreferences(subject);
            const productId = Number(ctx.request.input("product_id"));
            const categoryId = Number(ctx.request.input("category_id"));
            const data = await this.service.updatePreferences(subject, {
                hidden_product_ids: Number.isInteger(productId) && productId > 0 ? [...current.hidden_product_ids, productId] : current.hidden_product_ids,
                hidden_category_ids: Number.isInteger(categoryId) && categoryId > 0 ? [...current.hidden_category_ids, categoryId] : current.hidden_category_ids,
                show_less_topics: current.show_less_topics,
            });
            await this.service.ingestEvent({
                event_id: randomUUID(), event_type: "not_interested", schema_version: 1,
                product_id: Number.isInteger(productId) && productId > 0 ? productId : undefined,
                payload: { category_id: Number.isInteger(categoryId) && categoryId > 0 ? categoryId : undefined },
            }, subject);
            return { data };
        } catch (error) { return this.handle(error, ctx); }
    }

    async reset(ctx: HttpContext) {
        const subject = await this.resolveAndMerge(ctx, false);
        if (!subject) return ctx.response.status(400).json({ error: "subject_required" });
        return { data: await this.service.reset(subject) };
    }

    private async resolveAndMerge(ctx: HttpContext, createVisitor: boolean): Promise<Subject | null> {
        const customerId = this.customerId(ctx);
        const visitorId = this.readVisitor(ctx);
        if (customerId) {
            if (visitorId) await this.service.mergeAnonymousIntoCustomer(visitorId, customerId);
            return { type: "customer", id: String(customerId) };
        }
        return this.resolveSubject(ctx, createVisitor);
    }

    private resolveSubject(ctx: HttpContext, createVisitor: boolean): Subject | null {
        const customerId = this.customerId(ctx);
        if (customerId) return { type: "customer", id: String(customerId) };
        const supplied = this.readVisitor(ctx);
        if (supplied) return { type: "visitor", id: supplied };
        if (!createVisitor) return null;
        const id = randomUUID();
        ctx.response.cookie(VISITOR_COOKIE, id, {
            httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 365, path: "/",
        });
        return { type: "visitor", id };
    }

    private customerId(ctx: HttpContext): number | null {
        if (!ctx.auth.user) return null;
        const customerId = (ctx.auth.user as unknown as { customer?: { id?: number | bigint } }).customer?.id;
        const value = Number(customerId ?? 0);
        return Number.isInteger(value) && value > 0 ? value : null;
    }

    private readVisitor(ctx: HttpContext): string | null {
        const value = ctx.request.header("x-calibra-visitor-id") ?? ctx.request.cookie(VISITOR_COOKIE);
        return typeof value === "string" && /^[a-zA-Z0-9_-]{12,96}$/.test(value) ? value : null;
    }

    private handle(error: unknown, ctx: HttpContext) {
        if (error instanceof Phase9ValidationError) return ctx.response.status(422).json({ error: error.message });
        if (error instanceof Phase9ConflictError) return ctx.response.status(409).json({ error: error.message });
        throw error;
    }
}
