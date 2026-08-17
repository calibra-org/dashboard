import type { HttpContext } from "@adonisjs/core/http";
import Phase9PersonalizationService, {
    Phase9ConflictError,
    Phase9ValidationError,
} from "#services/phase9_personalization_service";
import { auditPhase9 } from "#services/phase9_audit_service";

export default class AdminPersonalizationController {
    private service = new Phase9PersonalizationService();

    async overview() {
        return { data: await this.service.overview() };
    }
    async health() {
        return { data: await this.service.health() };
    }
    async campaigns() {
        return { data: await this.service.listCampaigns() };
    }
    async settings() {
        return { data: await this.service.runtimeSettings() };
    }
    async placements() {
        return { data: await this.service.listPlacements() };
    }
    async events(ctx: HttpContext) {
        return { data: await this.service.recentEvents(Number(ctx.request.input("limit", 50))) };
    }
    async consents(ctx: HttpContext) {
        return { data: await this.service.recentConsents(Number(ctx.request.input("limit", 50))) };
    }

    async createCampaign(ctx: HttpContext) {
        try {
            const data = await this.service.createCampaign(
                ctx.request.body() as Parameters<Phase9PersonalizationService["createCampaign"]>[0],
                actorId(ctx),
            );
            await auditPhase9(
                "phase9.campaign.create",
                "deal_campaign",
                Number(data?.id ?? 0),
                actorId(ctx),
                { name: data?.name },
                ctx.request.ip(),
            );
            return ctx.response.status(201).json({ data });
        } catch (error) {
            return this.handle(error, ctx);
        }
    }

    async updateCampaign(ctx: HttpContext) {
        try {
            const id = positiveId(ctx.params.id);
            const data = await this.service.updateCampaign(
                id,
                ctx.request.body() as Parameters<Phase9PersonalizationService["updateCampaign"]>[1],
            );
            if (!data) return ctx.response.status(404).json({ error: "campaign_not_found" });
            await auditPhase9(
                "phase9.campaign.update",
                "deal_campaign",
                id,
                actorId(ctx),
                { version: data.version },
                ctx.request.ip(),
            );
            return { data };
        } catch (error) {
            return this.handle(error, ctx);
        }
    }

    async publishCampaign(ctx: HttpContext) {
        try {
            const id = positiveId(ctx.params.id);
            const data = await this.service.publishCampaign(id, optionalVersion(ctx.request.input("expected_version")));
            if (!data) return ctx.response.status(404).json({ error: "campaign_not_found" });
            await auditPhase9(
                "phase9.campaign.publish",
                "deal_campaign",
                id,
                actorId(ctx),
                { status: data.status, version: data.version },
                ctx.request.ip(),
            );
            return { data };
        } catch (error) {
            return this.handle(error, ctx);
        }
    }

    async pauseCampaign(ctx: HttpContext) {
        try {
            const id = positiveId(ctx.params.id);
            const data = await this.service.pauseCampaign(id, optionalVersion(ctx.request.input("expected_version")));
            if (!data) return ctx.response.status(404).json({ error: "campaign_not_found" });
            await auditPhase9(
                "phase9.campaign.pause",
                "deal_campaign",
                id,
                actorId(ctx),
                { version: data.version },
                ctx.request.ip(),
            );
            return { data };
        } catch (error) {
            return this.handle(error, ctx);
        }
    }

    async updateSettings(ctx: HttpContext) {
        const before = await this.service.runtimeSettings();
        const data = await this.service.updateRuntimeSettings(ctx.request.body());
        await auditPhase9(
            "phase9.settings.update",
            "personalization",
            null,
            actorId(ctx),
            { before, after: data },
            ctx.request.ip(),
        );
        return { data };
    }

    async updatePlacement(ctx: HttpContext) {
        try {
            const placement = String(ctx.params.placement ?? "").slice(0, 64);
            const data = await this.service.updatePlacement(placement, ctx.request.body());
            if (!data) return ctx.response.status(404).json({ error: "placement_not_found" });
            await auditPhase9(
                "phase9.placement.update",
                "placement",
                Number(data.id),
                actorId(ctx),
                { placement, version: data.version },
                ctx.request.ip(),
            );
            return { data };
        } catch (error) {
            return this.handle(error, ctx);
        }
    }

    async simulate(ctx: HttpContext) {
        try {
            return { data: await this.service.simulate(ctx.request.body(), ctx.i18n.locale) };
        } catch (error) {
            return this.handle(error, ctx);
        }
    }

    private handle(error: unknown, ctx: HttpContext) {
        if (error instanceof Phase9ValidationError) return ctx.response.status(422).json({ error: error.message });
        if (error instanceof Phase9ConflictError) return ctx.response.status(409).json({ error: error.message });
        throw error;
    }
}

function actorId(ctx: HttpContext) {
    return ctx.auth.user ? Number(ctx.auth.user.id) : null;
}
function positiveId(value: unknown) {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw new Phase9ValidationError("invalid_id");
    return id;
}
function optionalVersion(value: unknown) {
    if (value === undefined || value === null || value === "") return undefined;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) throw new Phase9ValidationError("invalid_version");
    return n;
}
