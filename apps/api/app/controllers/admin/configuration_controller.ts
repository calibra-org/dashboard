import cache from "@adonisjs/cache/services/main";
import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { CacheTags } from "#services/cache_keys";
import ConfigurationEngineService, {
    type ConfigurationChangeInput,
    type ConfigurationResolutionContext,
} from "#services/configuration_engine_service";
import {
    configurationCapabilities,
    configurationDefinition,
    isConfigurationGroup,
    isConfigurationScope,
    type ConfigurationGroup,
    type ConfigurationScope,
} from "#services/configuration_registry";
import ConfigurationRevisionService from "#services/configuration_revision_service";
import { currentTenantId } from "#services/tenant_context";

function parseRevision(value: string): number | null {
    const revision = Number(value);
    return Number.isInteger(revision) && revision > 0 ? revision : null;
}

function resolutionContext(ctx: HttpContext): ConfigurationResolutionContext {
    const optional = (key: string): string | undefined => {
        const value = ctx.request.input(key);
        return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
    };
    return {
        market: optional("market"),
        channel: optional("channel"),
        environment: optional("environment"),
        temporary: optional("temporary"),
        subjectKey: optional("subject_key"),
    };
}

export default class AdminConfigurationController {
    private revisions = new ConfigurationRevisionService();
    private engine = new ConfigurationEngineService();

    async registry(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:read", false);
        return {
            data: configurationCapabilities.map((capability) => ({
                key: capability.key,
                category: capability.category,
                mode: capability.mode,
                label_fa: capability.labelFa,
                label_en: capability.labelEn,
                description_fa: capability.descriptionFa,
                description_en: capability.descriptionEn,
                href: capability.href,
                api_path: capability.apiPath,
                history_enabled: capability.historyEnabled,
                definition_count: capability.definitionCount,
            })),
        };
    }

    async definitions(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:read", false);
        return { data: this.engine.registry() };
    }

    async group(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:read", false);
        const group = this.groupParam(ctx);
        return { data: await this.engine.group(group, resolutionContext(ctx)) };
    }

    async preview(ctx: HttpContext) {
        const group = this.groupParam(ctx);
        const input = this.changeInput(ctx);
        await this.authorize(ctx, this.permissionFor(group, input.key), true);
        return { data: await this.engine.preview(group, input) };
    }

    async test(ctx: HttpContext) {
        const group = this.groupParam(ctx);
        const input = this.changeInput(ctx);
        await this.authorize(ctx, this.permissionFor(group, input.key), true);
        return { data: await this.engine.test(group, input) };
    }

    async update(ctx: HttpContext) {
        const group = this.groupParam(ctx);
        const input = this.changeInput(ctx);
        const actor = await this.authorize(ctx, this.permissionFor(group, input.key), true);
        await this.revisions.ensureBaseline(group, Number(actor.id));
        const result = await this.engine.apply(group, input, Number(actor.id));
        const revision = await this.revisions.capture(group, { actorUserId: Number(actor.id) });
        await recordAudit({
            ctx,
            actorUserId: Number(actor.id),
            action: "settings.configuration.update",
            entityKind: "configuration",
            entityId: revision.id,
            payload: {
                group,
                key: input.key,
                scope_type: input.scope_type,
                scope_key: input.scope_key ?? null,
                version: result.version,
                reason: input.reason,
                revision: revision.revision,
            },
            strict: true,
        });
        return {
            data: await this.engine.group(group, resolutionContext(ctx)),
            meta: { revision: revision.revision, version: result.version },
        };
    }

    async history(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:read", false);
        const rawScope = ctx.request.input("scope");
        let scope: ConfigurationScope | undefined;
        if (typeof rawScope === "string" && rawScope.length > 0) {
            if (!isConfigurationScope(rawScope)) return ctx.response.unprocessableEntity({ error: "Unknown configuration scope" });
            scope = rawScope;
        }
        const rawLimit = Number(ctx.request.input("limit", 50));
        const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.trunc(rawLimit))) : 50;
        return { data: await this.revisions.list(scope, limit) };
    }

    async show(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:read", false);
        const scope = String(ctx.params.scope ?? "");
        const revision = parseRevision(String(ctx.params.revision ?? ""));
        if (!isConfigurationScope(scope) || revision === null) return ctx.response.notFound({ error: "Configuration revision not found" });
        const detail = await this.revisions.detail(scope, revision);
        if (!detail) return ctx.response.notFound({ error: "Configuration revision not found" });
        return { data: detail };
    }

    async rollback(ctx: HttpContext) {
        const scope = String(ctx.params.scope ?? "");
        const revision = parseRevision(String(ctx.params.revision ?? ""));
        if (!isConfigurationScope(scope) || revision === null) return ctx.response.notFound({ error: "Configuration revision not found" });
        const permission = isConfigurationGroup(scope) ? `configuration:${scope}:write` : "configuration:write";
        const actor = await this.authorize(ctx, permission, true);
        const result = await this.revisions.rollback(scope, revision, Number(actor.id));
        if (!result) return ctx.response.notFound({ error: "Configuration revision not found" });
        if (result.changed && scope === "general") await cache.deleteByTag({ tags: [CacheTags.currency(currentTenantId())] });
        if (result.changed && scope === "branding") await cache.deleteByTag({ tags: [CacheTags.storefrontTenant(currentTenantId())] });
        await recordAudit({
            ctx,
            actorUserId: Number(actor.id),
            action: "settings.configuration.rollback",
            entityKind: "configuration_revision",
            entityId: result.revision.id,
            payload: { scope, rollback_of_revision: revision, revision: result.revision.revision, changed: result.changed },
            strict: true,
        });
        return { data: result.revision, meta: { changed: result.changed } };
    }

    async blueprint(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:blueprint:read", false);
        return { data: await this.engine.blueprint() };
    }

    async validateBlueprint(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:blueprint:apply", true);
        return { data: this.engine.validateBlueprint(ctx.request.body()) };
    }

    async drift(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:read", false);
        const expected = ctx.request.input("expected_fingerprint");
        return { data: await this.engine.drift(typeof expected === "string" ? expected : undefined) };
    }

    async urlRedirectHistory(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:urls:read", false);
        return { data: await this.engine.urlRedirectHistory(Number(ctx.request.input("limit", 100))) };
    }

    private groupParam(ctx: HttpContext): ConfigurationGroup {
        const group = String(ctx.params.group ?? "");
        if (!isConfigurationGroup(group)) throw new Exception("Configuration group not found", { status: 404, code: "E_CONFIGURATION_GROUP_NOT_FOUND" });
        return group;
    }

    private changeInput(ctx: HttpContext): ConfigurationChangeInput {
        const body = ctx.request.body() as Record<string, unknown>;
        return {
            key: String(body.key ?? ""),
            scope_type: String(body.scope_type ?? "tenant") as ConfigurationChangeInput["scope_type"],
            scope_key: typeof body.scope_key === "string" ? body.scope_key : undefined,
            value: body.value,
            unset: body.unset === true,
            reason: String(body.reason ?? ""),
            expected_version: Number(body.expected_version ?? -1),
            preview_hash: typeof body.preview_hash === "string" ? body.preview_hash : undefined,
            rollout_percent: body.rollout_percent === undefined ? undefined : Number(body.rollout_percent),
            expires_at: typeof body.expires_at === "string" ? body.expires_at : body.expires_at === null ? null : undefined,
            approval_reference: typeof body.approval_reference === "string" ? body.approval_reference : body.approval_reference === null ? null : undefined,
        };
    }

    private permissionFor(group: ConfigurationGroup, key: string): string {
        return configurationDefinition(key)?.requiredPermission ?? `configuration:${group}:write`;
    }

    private async authorize(ctx: HttpContext, permission: string, write: boolean) {
        const user = await ctx.auth.authenticate();
        const token = user.currentAccessToken;
        if (!token) return user;
        const allowed = token.allows(permission) || token.allows("configuration:*") || token.allows("*") || (!write && token.allows("configuration:read")) || (write && token.allows("configuration:write"));
        if (!allowed) throw new Exception("Configuration permission required", { status: 403, code: "E_CONFIGURATION_PERMISSION" });
        return user;
    }
}
