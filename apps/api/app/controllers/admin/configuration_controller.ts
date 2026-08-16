import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { CacheTags } from "#services/cache_keys";
import {
    configurationCapabilities,
    isConfigurationScope,
    type ConfigurationScope,
} from "#services/configuration_registry";
import ConfigurationRevisionService from "#services/configuration_revision_service";
import { currentTenantId } from "#services/tenant_context";

function parseRevision(value: string): number | null {
    const revision = Number(value);
    return Number.isInteger(revision) && revision > 0 ? revision : null;
}

export default class AdminConfigurationController {
    private revisions = new ConfigurationRevisionService();

    async registry() {
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
            })),
        };
    }

    async history({ request, response }: HttpContext) {
        const rawScope = request.input("scope");
        let scope: ConfigurationScope | undefined;
        if (typeof rawScope === "string" && rawScope.length > 0) {
            if (!isConfigurationScope(rawScope)) return response.unprocessableEntity({ error: "Unknown configuration scope" });
            scope = rawScope;
        }
        const rawLimit = Number(request.input("limit", 50));
        const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.trunc(rawLimit))) : 50;
        return { data: await this.revisions.list(scope, limit) };
    }

    async show({ params, response }: HttpContext) {
        const scope = String(params.scope ?? "");
        const revision = parseRevision(String(params.revision ?? ""));
        if (!isConfigurationScope(scope) || revision === null) {
            return response.notFound({ error: "Configuration revision not found" });
        }
        const detail = await this.revisions.detail(scope, revision);
        if (!detail) return response.notFound({ error: "Configuration revision not found" });
        return { data: detail };
    }

    async rollback(ctx: HttpContext) {
        const scope = String(ctx.params.scope ?? "");
        const revision = parseRevision(String(ctx.params.revision ?? ""));
        if (!isConfigurationScope(scope) || revision === null) {
            return ctx.response.notFound({ error: "Configuration revision not found" });
        }
        const actor = await ctx.auth.authenticate();
        const result = await this.revisions.rollback(scope, revision, Number(actor.id));
        if (!result) return ctx.response.notFound({ error: "Configuration revision not found" });

        if (result.changed && scope === "general") {
            await cache.deleteByTag({ tags: [CacheTags.currency(currentTenantId())] });
        }
        if (result.changed && scope === "branding") {
            await cache.deleteByTag({ tags: [CacheTags.storefrontTenant(currentTenantId())] });
        }

        await recordAudit({
            ctx,
            actorUserId: Number(actor.id),
            action: "settings.configuration.rollback",
            entityKind: "configuration_revision",
            entityId: result.revision.id,
            payload: {
                scope,
                rollback_of_revision: revision,
                revision: result.revision.revision,
                changed: result.changed,
            },
            strict: true,
        });
        return { data: result.revision, meta: { changed: result.changed } };
    }
}
