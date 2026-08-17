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
    type ConfigurationGroup,
    type ConfigurationScope,
    configurationCapabilities,
    configurationDefinitions,
    isConfigurationGroup,
    isConfigurationScope,
} from "#services/configuration_registry";
import ConfigurationRevisionService from "#services/configuration_revision_service";
import { calculateTax, fetchRates } from "#services/tax_calculator";
import { currentTenantId, currentTrx } from "#services/tenant_context";

function parseRevision(value: string): number | null {
    const revision = Number(value);
    return Number.isInteger(revision) && revision > 0 ? revision : null;
}

function parseContext(request: HttpContext["request"]): ConfigurationResolutionContext {
    const optional = (key: string) => {
        const value = request.input(key);
        return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
        await this.authorize(ctx, "configuration:read");
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
        await this.authorize(ctx, "configuration:read");
        return { data: this.engine.registry() };
    }

    async group(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:read");
        return { data: await this.engine.group(this.groupParam(ctx), parseContext(ctx.request)) };
    }

    async preview(ctx: HttpContext) {
        const group = this.groupParam(ctx);
        const input = this.changeInput(ctx);
        await this.authorize(ctx, this.permissionFor(group, input.key));
        return { data: await this.engine.preview(group, input) };
    }

    async test(ctx: HttpContext) {
        const group = this.groupParam(ctx);
        const input = this.changeInput(ctx);
        await this.authorize(ctx, this.permissionFor(group, input.key));
        return { data: await this.engine.test(group, input) };
    }

    async update(ctx: HttpContext) {
        const group = this.groupParam(ctx);
        const input = this.changeInput(ctx);
        const actor = await this.authorize(ctx, this.permissionFor(group, input.key));
        await this.revisions.ensureBaseline(group, Number(actor.id));
        const result = await this.engine.apply(group, input, Number(actor.id));
        const revision = await this.revisions.capture(group, { actorUserId: Number(actor.id) });
        await cache.deleteByTag({ tags: [CacheTags.storefrontTenant(currentTenantId())] });
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
            data: await this.engine.group(group, parseContext(ctx.request)),
            meta: { revision: revision.revision, version: result.version },
        };
    }

    async history(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:read");
        const rawScope = ctx.request.input("scope");
        let scope: ConfigurationScope | undefined;
        if (typeof rawScope === "string" && rawScope.length > 0) {
            if (!isConfigurationScope(rawScope)) {
                return ctx.response.unprocessableEntity({ errors: [{ message: "Unknown configuration scope" }] });
            }
            scope = rawScope;
        }
        const rawLimit = Number(ctx.request.input("limit", 50));
        const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.trunc(rawLimit))) : 50;
        return { data: await this.revisions.list(scope, limit) };
    }

    async show(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:read");
        const scope = String(ctx.params.scope ?? "");
        const revision = parseRevision(String(ctx.params.revision ?? ""));
        if (!isConfigurationScope(scope) || revision === null) {
            return ctx.response.notFound({ errors: [{ message: "Configuration revision not found" }] });
        }
        const detail = await this.revisions.detail(scope, revision);
        if (!detail) return ctx.response.notFound({ errors: [{ message: "Configuration revision not found" }] });
        return { data: detail };
    }

    async rollback(ctx: HttpContext) {
        const scope = String(ctx.params.scope ?? "");
        const revision = parseRevision(String(ctx.params.revision ?? ""));
        if (!isConfigurationScope(scope) || revision === null) {
            return ctx.response.notFound({ errors: [{ message: "Configuration revision not found" }] });
        }
        const actor = await this.authorize(
            ctx,
            isConfigurationGroup(scope) ? `configuration:${scope}:write` : "configuration:write",
        );
        const result = await this.revisions.rollback(scope, revision, Number(actor.id));
        if (!result) return ctx.response.notFound({ errors: [{ message: "Configuration revision not found" }] });
        if (result.changed) await cache.deleteByTag({ tags: [CacheTags.storefrontTenant(currentTenantId())] });
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

    async blueprint(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:blueprint:read");
        return { data: await this.engine.blueprint() };
    }

    async validateBlueprint(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:blueprint:apply");
        return { data: this.engine.validateBlueprint(ctx.request.body()) };
    }

    async applyBlueprint(ctx: HttpContext) {
        const actor = await this.authorize(ctx, "configuration:blueprint:apply");
        const body = ctx.request.body() as {
            schema_version?: number;
            entries?: Array<Record<string, unknown>>;
            reason?: string;
            approval_reference?: string;
        };
        const checked = this.engine.validateBlueprint(body);
        if (!checked.valid) {
            return ctx.response.unprocessableEntity({
                errors: [
                    {
                        message: "Invalid configuration blueprint",
                        rule: "configuration.blueprint.invalid",
                        details: checked.errors,
                    },
                ],
            });
        }
        const touched = new Set<ConfigurationGroup>();
        for (const entry of body.entries ?? []) {
            const group = String(entry.group) as ConfigurationGroup;
            const key = String(entry.key);
            const scopeType = String(entry.scope_type) as ConfigurationChangeInput["scope_type"];
            const scopeKey = typeof entry.scope_key === "string" ? entry.scope_key : undefined;
            const expectedVersion = await this.engine.exactVersion(key, scopeType, scopeKey);
            const rawValue = entry.value as unknown;
            const value =
                rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) && "env_ref" in rawValue
                    ? { env_ref: String((rawValue as { env_ref: unknown }).env_ref) }
                    : rawValue;
            await this.revisions.ensureBaseline(group, Number(actor.id));
            await this.engine.apply(
                group,
                {
                    key,
                    scope_type: scopeType,
                    scope_key: scopeKey,
                    value,
                    reason: String(body.reason ?? "configuration blueprint apply"),
                    expected_version: expectedVersion,
                    rollout_percent: Number(entry.rollout_percent ?? 100),
                    expires_at: typeof entry.expires_at === "string" ? entry.expires_at : null,
                    approval_reference: body.approval_reference ?? null,
                },
                Number(actor.id),
                { bypassPreview: true },
            );
            touched.add(group);
        }
        const revisions: Record<string, number> = {};
        for (const group of touched) {
            revisions[group] = (await this.revisions.capture(group, { actorUserId: Number(actor.id) })).revision;
        }
        await cache.deleteByTag({ tags: [CacheTags.storefrontTenant(currentTenantId())] });
        await recordAudit({
            ctx,
            actorUserId: Number(actor.id),
            action: "settings.configuration.blueprint.apply",
            entityKind: "configuration_blueprint",
            entityId: null,
            payload: { groups: [...touched], revisions },
            strict: true,
        });
        return { data: await this.engine.blueprint(), meta: { revisions } };
    }

    async drift(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:read");
        const expected = ctx.request.input("expected_fingerprint");
        return { data: await this.engine.drift(typeof expected === "string" ? expected : undefined) };
    }

    async urlRedirectHistory(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:urls:read");
        return { data: await this.engine.urlRedirectHistory(Number(ctx.request.input("limit", 100))) };
    }

    async taxSimulate(ctx: HttpContext) {
        await this.authorize(ctx, "configuration:tax:write");
        const body = ctx.request.body() as Record<string, unknown>;
        const amountMinor = Number(body.amount_minor);
        const taxClassId = Number(body.tax_class_id);
        const country = typeof body.country === "string" ? body.country.toUpperCase() : null;
        const regionId = body.region_id === null || body.region_id === undefined ? null : Number(body.region_id);
        const pricesIncludeTax = body.prices_include_tax === true;
        if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !Number.isSafeInteger(taxClassId) || taxClassId <= 0) {
            return ctx.response.unprocessableEntity({ errors: [{ message: "Invalid tax simulation input" }] });
        }
        const rates = await fetchRates(taxClassId, { country, regionId });
        const calculation = calculateTax(amountMinor, rates, { pricesIncludeTax });
        const impacted = await currentTrx()
            .from("products")
            .where("tenant_id", String(currentTenantId()))
            .where("tax_class_id", taxClassId)
            .whereNull("deleted_at")
            .count("id as count")
            .first();
        return {
            data: {
                amount_minor: amountMinor,
                tax_class_id: taxClassId,
                address: { country, region_id: regionId },
                prices_include_tax: pricesIncludeTax,
                rate_count: rates.length,
                calculation,
                impact: { products_using_tax_class: Number(impacted?.count ?? 0), source: "products.tax_class_id" },
            },
        };
    }

    private groupParam(ctx: HttpContext): ConfigurationGroup {
        const group = String(ctx.params.group ?? "");
        if (!isConfigurationGroup(group)) {
            throw new Exception("Configuration group not found", { status: 404, code: "E_CONFIGURATION_GROUP_NOT_FOUND" });
        }
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
            approval_reference:
                typeof body.approval_reference === "string"
                    ? body.approval_reference
                    : body.approval_reference === null
                      ? null
                      : undefined,
        };
    }

    private permissionFor(group: ConfigurationGroup, key: string): string {
        return (
            configurationDefinitions.find((definition) => definition.group === group && definition.key === key)
                ?.requiredPermission ?? `configuration:${group}:write`
        );
    }

    private async authorize(ctx: HttpContext, permission: string) {
        const user = await ctx.auth.authenticate();
        const token = user.currentAccessToken;
        const readPermission = permission.endsWith(":read") || permission === "configuration:read";
        const allowed =
            token !== undefined &&
            (token.allows("*") ||
                token.allows(permission) ||
                token.allows("configuration:write") ||
                (readPermission && token.allows("configuration:read")));
        if (!allowed) {
            throw new Exception("Configuration permission required", { status: 403, code: "E_CONFIGURATION_PERMISSION" });
        }
        return user;
    }
}
