import type { HttpContext } from "@adonisjs/core/http";

import Phase9MasterService from "#services/phase9_master_service";
import { Phase9ConflictError, Phase9ValidationError, type Subject } from "#services/phase9_personalization_service";

export default class AdminPhase9MasterController {
    private service = new Phase9MasterService();

    async policies() { return { data: await this.service.listPolicies() }; }
    async models() { return { data: await this.service.listModels() }; }
    async rollouts() { return { data: await this.service.listRollouts() }; }
    async analytics() { return { data: await this.service.analytics() }; }

    async createPolicy(ctx: HttpContext) {
        try { return ctx.response.status(201).json({ data: await this.service.createPolicy(ctx.request.body(), actorId(ctx)) }); }
        catch (error) { return this.handle(error, ctx); }
    }
    async activatePolicy(ctx: HttpContext) {
        try {
            const data = await this.service.activatePolicy(id(ctx.params.id), actorId(ctx));
            return data ? { data } : ctx.response.status(404).json({ error: "policy_not_found" });
        } catch (error) { return this.handle(error, ctx); }
    }
    async rollbackPolicy(ctx: HttpContext) {
        try {
            const data = await this.service.rollbackPolicy(ctx.params.key, ctx.request.input("version"), actorId(ctx));
            return data ? { data } : ctx.response.status(404).json({ error: "policy_version_not_found" });
        } catch (error) { return this.handle(error, ctx); }
    }
    async createModel(ctx: HttpContext) {
        try { return ctx.response.status(201).json({ data: await this.service.createModel(ctx.request.body(), actorId(ctx)) }); }
        catch (error) { return this.handle(error, ctx); }
    }
    async activateModel(ctx: HttpContext) {
        try {
            const data = await this.service.activateModel(id(ctx.params.id), Number(ctx.request.input("rollout_percent", 100)), actorId(ctx));
            return data ? { data } : ctx.response.status(404).json({ error: "model_not_found" });
        } catch (error) { return this.handle(error, ctx); }
    }
    async rollbackModel(ctx: HttpContext) {
        try {
            const data = await this.service.rollbackModel(ctx.params.key, ctx.request.input("version"), actorId(ctx));
            return data ? { data } : ctx.response.status(404).json({ error: "model_version_not_found" });
        } catch (error) { return this.handle(error, ctx); }
    }
    async transitionCampaign(ctx: HttpContext) {
        try {
            const data = await this.service.transitionCampaign(id(ctx.params.id), String(ctx.params.status), optionalVersion(ctx.request.input("expected_version")));
            return data ? { data } : ctx.response.status(404).json({ error: "campaign_not_found" });
        } catch (error) { return this.handle(error, ctx); }
    }
    async allocation(ctx: HttpContext) {
        try {
            const data = await this.service.configureAllocation(id(ctx.params.id), ctx.request.body());
            return { data };
        } catch (error) { return this.handle(error, ctx); }
    }
    async reserve(ctx: HttpContext) {
        try {
            const body = ctx.request.body() as Record<string, unknown>;
            const subject = parseSubject(body);
            const data = await this.service.reserveDeal(id(ctx.params.id), body, subject);
            return data ? ctx.response.status(201).json({ data }) : ctx.response.status(404).json({ error: "campaign_not_found" });
        } catch (error) { return this.handle(error, ctx); }
    }
    async consume(ctx: HttpContext) {
        try {
            const data = await this.service.consumeReservation(String(ctx.params.reservationId), id(ctx.request.input("order_id")));
            return data ? { data } : ctx.response.status(404).json({ error: "reservation_not_found" });
        } catch (error) { return this.handle(error, ctx); }
    }
    async release(ctx: HttpContext) {
        try {
            const data = await this.service.releaseReservation(String(ctx.params.reservationId));
            return data ? { data } : ctx.response.status(404).json({ error: "reservation_not_found" });
        } catch (error) { return this.handle(error, ctx); }
    }
    async simulate(ctx: HttpContext) {
        try { return { data: await this.service.simulatePromotion(ctx.request.body()) }; }
        catch (error) { return this.handle(error, ctx); }
    }

    private handle(error: unknown, ctx: HttpContext) {
        if (error instanceof Phase9ValidationError) return ctx.response.status(422).json({ error: error.message });
        if (error instanceof Phase9ConflictError) return ctx.response.status(409).json({ error: error.message });
        throw error;
    }
}

function actorId(ctx: HttpContext) { return ctx.auth.user ? Number(ctx.auth.user.id) : null; }
function id(value: unknown) { const n = Number(value); if (!Number.isInteger(n) || n < 1) throw new Phase9ValidationError("invalid_id"); return n; }
function optionalVersion(value: unknown) { if (value === undefined || value === null || value === "") return undefined; return id(value); }
function parseSubject(input: Record<string, unknown>): Subject | null {
    const type = input.subject_type;
    const value = input.subject_id;
    if ((type === "visitor" || type === "customer") && typeof value === "string" && value.length > 0 && value.length <= 96) return { type, id: value };
    return null;
}
