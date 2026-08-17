import { createHash } from "node:crypto";
import { DateTime } from "luxon";

import { BusinessRuleException } from "#exceptions/domain_exceptions";
import {
    type ConfigurationGroup,
    type ConfigurationScopeType,
    type ConfigurationSettingDefinition,
    configurationDefinition,
    configurationDefinitions,
    configurationDefinitionsForGroup,
} from "#services/configuration_registry";
import SettingsService from "#services/settings_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export interface ConfigurationResolutionContext {
    market?: string;
    channel?: string;
    environment?: string;
    temporary?: string;
    subjectKey?: string;
}

export interface ConfigurationChangeInput {
    key: string;
    scope_type: ConfigurationScopeType;
    scope_key?: string;
    value?: unknown;
    unset?: boolean;
    reason: string;
    expected_version: number;
    preview_hash?: string;
    rollout_percent?: number;
    expires_at?: string | null;
    approval_reference?: string | null;
}

interface OverrideRow {
    id: bigint | number | string;
    group_key: ConfigurationGroup;
    definition_key: string;
    scope_type: ConfigurationScopeType;
    scope_key: string;
    value: unknown;
    value_type: string;
    version: number;
    is_deleted: boolean;
    rollout_percent: number;
    expires_at: Date | string | null;
}

interface EffectiveOrigin {
    source: "default" | "settings" | "override";
    scope_type: string;
    scope_key: string;
    version: number;
}

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
    return createHash("sha256").update(canonical(value)).digest("hex");
}

function publicDefinition(definition: ConfigurationSettingDefinition) {
    return {
        key: definition.key,
        group: definition.group,
        type: definition.type,
        schema_version: definition.schemaVersion,
        default_value: redact(definition, definition.defaultValue),
        allowed_scopes: definition.allowedScopes,
        validation: definition.validation,
        secret_class: definition.secretClass,
        risk_level: definition.riskLevel,
        dependencies: definition.dependencies,
        side_effect_policy: definition.sideEffectPolicy,
        preview_capability: definition.previewCapability,
        test_capability: definition.testCapability,
        restart_requirement: definition.restartRequirement,
        approval_policy: definition.approvalPolicy,
        deprecation_policy: definition.deprecationPolicy,
        migration_policy: definition.migrationPolicy,
        required_permission: definition.requiredPermission,
        label_fa: definition.labelFa,
        label_en: definition.labelEn,
        description_fa: definition.descriptionFa,
        description_en: definition.descriptionEn,
        linked_href: definition.linkedHref ?? null,
        storage: definition.storage.kind,
    };
}

function redact(definition: ConfigurationSettingDefinition, value: unknown): unknown {
    if (definition.secretClass !== "reference") return value;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const envRef = String((value as { env_ref?: unknown }).env_ref ?? "");
    return envRef ? { configured: true, env_ref: envRef } : null;
}

function normalizedScopeKey(scopeType: ConfigurationScopeType, raw?: string): string {
    if (scopeType === "tenant") return "default";
    const value = raw?.trim();
    if (!value) throw new BusinessRuleException("scope_key is required", "configuration.scope_key.required");
    if (value.length > 160) throw new BusinessRuleException("scope_key is too long", "configuration.scope_key.too_long");
    return value;
}

function isExpired(row: OverrideRow): boolean {
    if (!row.expires_at) return false;
    return new Date(row.expires_at).getTime() <= Date.now();
}

function rolloutAllows(row: OverrideRow, subjectKey?: string): boolean {
    if (row.rollout_percent >= 100) return true;
    if (!subjectKey) return false;
    const digest = createHash("sha256").update(`${row.definition_key}:${row.scope_type}:${row.scope_key}:${subjectKey}`).digest();
    return digest.readUInt32BE(0) % 100 < row.rollout_percent;
}

export default class ConfigurationEngineService {
    private settings = new SettingsService();

    registry() {
        return configurationDefinitions.map(publicDefinition);
    }

    async group(group: ConfigurationGroup, context: ConfigurationResolutionContext = {}) {
        const definitions = [];
        for (const definition of configurationDefinitionsForGroup(group))
            definitions.push(await this.resolve(definition, context));
        return {
            group,
            definitions,
            fingerprint: fingerprint(definitions.map((item) => [item.definition.key, item.value, item.origin])),
        };
    }

    async exactVersion(key: string, scopeType: ConfigurationScopeType, scopeKey?: string): Promise<number> {
        const row = await this.currentOverride(key, scopeType, normalizedScopeKey(scopeType, scopeKey), false);
        return Number(row?.version ?? 0);
    }

    async preview(group: ConfigurationGroup, input: ConfigurationChangeInput) {
        const definition = this.requireDefinition(group, input.key);
        this.assertMutable(definition);
        const normalized = this.validateInput(definition, input);
        const current = await this.currentOverride(definition.key, input.scope_type, normalized.scopeKey, false);
        const version = Number(current?.version ?? 0);
        this.assertVersion(input.expected_version, version);
        const before = current && !current.is_deleted ? current.value : definition.defaultValue;
        const after = input.unset === true ? null : normalized.value;
        return {
            key: definition.key,
            scope_type: input.scope_type,
            scope_key: normalized.scopeKey,
            current_version: version,
            before: redact(definition, before),
            after: redact(definition, after),
            unset: input.unset === true,
            preview_hash: this.previewHash(group, input, normalized.scopeKey, version, after),
            impact: await this.impact(definition),
            requires_preview: definition.riskLevel === "high" || definition.riskLevel === "critical",
            requires_approval: definition.approvalPolicy === "governance_required",
            restart_requirement: definition.restartRequirement,
        };
    }

    async test(group: ConfigurationGroup, input: ConfigurationChangeInput) {
        const preview = await this.preview(group, input);
        return {
            passed: true,
            mode: "schema_policy_and_impact",
            provider_probe: "not_configured",
            note: "External provider health is not inferred by Configuration OS.",
            preview,
        };
    }

    async apply(
        group: ConfigurationGroup,
        input: ConfigurationChangeInput,
        actorUserId: number,
        options: { bypassPreview?: boolean } = {},
    ) {
        const definition = this.requireDefinition(group, input.key);
        this.assertMutable(definition);
        const normalized = this.validateInput(definition, input);
        await this.lock(definition.key, input.scope_type, normalized.scopeKey);
        const current = await this.currentOverride(definition.key, input.scope_type, normalized.scopeKey, true);
        const version = Number(current?.version ?? 0);
        this.assertVersion(input.expected_version, version);
        const after = input.unset === true ? null : normalized.value;

        if (!options.bypassPreview && (definition.riskLevel === "high" || definition.riskLevel === "critical")) {
            const expected = this.previewHash(group, input, normalized.scopeKey, version, after);
            if (!input.preview_hash || input.preview_hash !== expected) {
                throw new BusinessRuleException("A fresh impact preview is required", "configuration.preview_required");
            }
        }
        if (definition.approvalPolicy === "governance_required" && !input.approval_reference?.trim()) {
            throw new BusinessRuleException("Approval reference is required", "configuration.approval_required");
        }

        const now = DateTime.utc().toSQL();
        const nextVersion = version + 1;
        const payload = {
            tenant_id: currentTenantId(),
            group_key: group,
            definition_key: definition.key,
            scope_type: input.scope_type,
            scope_key: normalized.scopeKey,
            value: input.unset === true ? null : JSON.stringify(after),
            value_type: definition.type,
            reason: input.reason.trim(),
            version: nextVersion,
            is_deleted: input.unset === true,
            rollout_percent: normalized.rolloutPercent,
            expires_at: normalized.expiresAt,
            approval_reference: input.approval_reference?.trim() || null,
            updated_by_user_id: actorUserId,
            updated_at: now,
        };
        const trx = currentTrx();
        if (current) await trx.from("configuration_overrides").where("id", String(current.id)).update(payload);
        else
            await trx.table("configuration_overrides").insert({
                ...payload,
                created_by_user_id: actorUserId,
                created_at: now,
            });

        if (definition.sideEffectPolicy === "redirect_evidence") {
            await trx.table("configuration_url_redirect_history").insert({
                tenant_id: currentTenantId(),
                definition_key: definition.key,
                scope_type: input.scope_type,
                scope_key: normalized.scopeKey,
                before_value: current && !current.is_deleted ? JSON.stringify(current.value) : null,
                after_value: input.unset === true ? null : JSON.stringify(after),
                reason: input.reason.trim(),
                actor_user_id: actorUserId,
                created_at: now,
            });
        }
        return { key: definition.key, version: nextVersion, unset: input.unset === true };
    }

    async blueprint() {
        const rows = (await currentTrx()
            .from("configuration_overrides")
            .where("tenant_id", String(currentTenantId()))
            .where("is_deleted", false)
            .orderBy("group_key", "asc")
            .orderBy("definition_key", "asc")
            .orderBy("scope_type", "asc")
            .orderBy("scope_key", "asc")) as OverrideRow[];
        const entries = rows.map((row) => {
            const definition = configurationDefinition(row.definition_key);
            return {
                group: row.group_key,
                key: row.definition_key,
                schema_version: definition?.schemaVersion ?? 1,
                scope_type: row.scope_type,
                scope_key: row.scope_key,
                version: Number(row.version),
                value: definition ? redact(definition, row.value) : row.value,
                rollout_percent: Number(row.rollout_percent),
                expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
            };
        });
        return { schema_version: 1, entries, fingerprint: fingerprint(entries) };
    }

    validateBlueprint(raw: unknown) {
        const body = raw as { schema_version?: unknown; entries?: unknown };
        if (!body || typeof body !== "object" || Number(body.schema_version) !== 1 || !Array.isArray(body.entries)) {
            throw new BusinessRuleException("Invalid configuration blueprint", "configuration.blueprint.invalid");
        }
        const errors: Array<{ index: number; rule: string }> = [];
        body.entries.forEach((rawEntry, index) => {
            try {
                const entry = rawEntry as Record<string, unknown>;
                const group = String(entry.group ?? "") as ConfigurationGroup;
                const definition = this.requireDefinition(group, String(entry.key ?? ""));
                if (definition.storage.kind !== "override") throw new Error("linked");
                const scopeType = String(entry.scope_type ?? "") as ConfigurationScopeType;
                if (!definition.allowedScopes.includes(scopeType)) throw new Error("scope");
                if (definition.secretClass === "reference") {
                    const value = entry.value as Record<string, unknown> | null;
                    if (!value || typeof value !== "object" || typeof value.env_ref !== "string") throw new Error("secret");
                } else this.assertValue(definition, entry.value);
            } catch {
                errors.push({ index, rule: "configuration.blueprint.invalid_entry" });
            }
        });
        return { valid: errors.length === 0, errors };
    }

    async drift(expectedFingerprint?: string) {
        const current = await this.blueprint();
        return {
            fingerprint: current.fingerprint,
            expected_fingerprint: expectedFingerprint ?? null,
            drifted: expectedFingerprint ? expectedFingerprint !== current.fingerprint : null,
            source: "configuration_declared_state",
            provider_drift: "not_observed",
        };
    }

    async urlRedirectHistory(limit = 100) {
        const rows = await currentTrx()
            .from("configuration_url_redirect_history")
            .where("tenant_id", String(currentTenantId()))
            .orderBy("created_at", "desc")
            .limit(Math.max(1, Math.min(200, limit)));
        return rows.map((row) => ({
            id: Number(row.id),
            definition_key: String(row.definition_key),
            scope_type: String(row.scope_type),
            scope_key: String(row.scope_key),
            before_value: row.before_value ?? null,
            after_value: row.after_value ?? null,
            reason: String(row.reason),
            actor_user_id: row.actor_user_id === null ? null : Number(row.actor_user_id),
            created_at: new Date(row.created_at).toISOString(),
        }));
    }

    private async resolve(definition: ConfigurationSettingDefinition, context: ConfigurationResolutionContext) {
        if (definition.storage.kind === "settings") {
            const value = await this.settings.get(definition.storage.group, definition.storage.key, definition.defaultValue);
            return {
                definition: publicDefinition(definition),
                value: redact(definition, value),
                origin: { source: "settings", scope_type: "tenant", scope_key: "default", version: 0 } satisfies EffectiveOrigin,
                resolution_chain: [{ source: "settings", scope_type: "tenant", scope_key: "default", applied: true, version: 0 }],
                mutable: false,
            };
        }
        const rows = (await currentTrx()
            .from("configuration_overrides")
            .where("tenant_id", String(currentTenantId()))
            .where("definition_key", definition.key)
            .where("is_deleted", false)) as OverrideRow[];
        const chain: Array<{ source: string; scope_type: string; scope_key: string; applied: boolean; version: number }> = [
            { source: "default", scope_type: "global", scope_key: "default", applied: true, version: 0 },
        ];
        let value = definition.defaultValue;
        let origin: EffectiveOrigin = { source: "default", scope_type: "global", scope_key: "default", version: 0 };
        const scopes: Array<[ConfigurationScopeType, string | undefined]> = [
            ["tenant", "default"],
            ["market", context.market],
            ["channel", context.channel],
            ["environment", context.environment],
            ["temporary", context.temporary],
        ];
        for (const [scopeType, scopeKey] of scopes) {
            if (!scopeKey) continue;
            const row = rows.find((candidate) => candidate.scope_type === scopeType && candidate.scope_key === scopeKey);
            if (!row || isExpired(row)) continue;
            const applied = rolloutAllows(row, context.subjectKey);
            chain.push({ source: "override", scope_type: scopeType, scope_key: scopeKey, applied, version: Number(row.version) });
            if (!applied) continue;
            value = row.value;
            origin = { source: "override", scope_type: scopeType, scope_key: scopeKey, version: Number(row.version) };
        }
        return {
            definition: publicDefinition(definition),
            value: redact(definition, value),
            origin,
            resolution_chain: chain,
            mutable: true,
        };
    }

    private requireDefinition(group: ConfigurationGroup, key: string): ConfigurationSettingDefinition {
        const definition = configurationDefinition(key);
        if (!definition || definition.group !== group) {
            throw new BusinessRuleException("Unknown configuration definition", "configuration.definition.unknown", {
                group,
                key,
            });
        }
        return definition;
    }

    private assertMutable(definition: ConfigurationSettingDefinition) {
        if (definition.storage.kind !== "override") {
            throw new BusinessRuleException(
                "Setting is owned by its canonical domain",
                "configuration.definition.linked_read_only",
                {
                    href: definition.linkedHref,
                },
            );
        }
    }

    private validateInput(definition: ConfigurationSettingDefinition, input: ConfigurationChangeInput) {
        if (!definition.allowedScopes.includes(input.scope_type)) {
            throw new BusinessRuleException("Scope is not allowed", "configuration.scope.not_allowed");
        }
        const scopeKey = normalizedScopeKey(input.scope_type, input.scope_key);
        const reason = input.reason?.trim() ?? "";
        if (reason.length < 3 || reason.length > 500) {
            throw new BusinessRuleException("A reason between 3 and 500 characters is required", "configuration.reason.invalid");
        }
        if (!Number.isInteger(input.expected_version) || input.expected_version < 0) {
            throw new BusinessRuleException(
                "expected_version must be a non-negative integer",
                "configuration.expected_version.invalid",
            );
        }
        if (input.unset !== true) this.assertValue(definition, input.value);
        const rolloutPercent = input.rollout_percent ?? 100;
        if (!Number.isInteger(rolloutPercent) || rolloutPercent < 1 || rolloutPercent > 100) {
            throw new BusinessRuleException("rollout_percent must be 1..100", "configuration.rollout.invalid");
        }
        let expiresAt: string | null = null;
        if (input.expires_at) {
            if (input.scope_type !== "temporary") {
                throw new BusinessRuleException(
                    "expires_at is only valid for temporary overrides",
                    "configuration.expires_at.scope",
                );
            }
            const parsed = DateTime.fromISO(input.expires_at, { setZone: true });
            if (!parsed.isValid || parsed.toMillis() <= Date.now()) {
                throw new BusinessRuleException("expires_at must be a future ISO timestamp", "configuration.expires_at.invalid");
            }
            expiresAt = parsed.toUTC().toSQL();
        }
        return { value: input.value, scopeKey, rolloutPercent, expiresAt };
    }

    private assertValue(definition: ConfigurationSettingDefinition, value: unknown) {
        if (definition.secretClass === "reference") {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                throw new BusinessRuleException(
                    "Secret settings accept only env_ref objects",
                    "configuration.secret.reference_required",
                );
            }
            const envRef = String((value as { env_ref?: unknown }).env_ref ?? "");
            if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(envRef)) {
                throw new BusinessRuleException("Invalid env_ref", "configuration.secret.invalid_reference");
            }
            return;
        }
        if (definition.type === "string" && typeof value !== "string")
            throw new BusinessRuleException("Expected string", "configuration.value.type");
        if (definition.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
            throw new BusinessRuleException("Expected finite number", "configuration.value.type");
        }
        if (definition.type === "boolean" && typeof value !== "boolean")
            throw new BusinessRuleException("Expected boolean", "configuration.value.type");
        if (definition.type === "json" && value === undefined)
            throw new BusinessRuleException("Expected JSON value", "configuration.value.type");
        if (definition.validation.enum && !definition.validation.enum.includes(String(value))) {
            throw new BusinessRuleException("Value is outside the allowed enum", "configuration.value.enum");
        }
        if (typeof value === "number" && definition.validation.min !== undefined && value < definition.validation.min) {
            throw new BusinessRuleException("Value is below minimum", "configuration.value.min");
        }
        if (typeof value === "number" && definition.validation.max !== undefined && value > definition.validation.max) {
            throw new BusinessRuleException("Value is above maximum", "configuration.value.max");
        }
        if (
            typeof value === "string" &&
            definition.validation.pattern &&
            !new RegExp(definition.validation.pattern).test(value)
        ) {
            throw new BusinessRuleException("Value does not match the required pattern", "configuration.value.pattern");
        }
    }

    private assertVersion(expected: number, actual: number) {
        if (expected !== actual) {
            throw new BusinessRuleException("Configuration version conflict", "configuration.version_conflict", {
                expected,
                actual,
            });
        }
    }

    private async currentOverride(
        definitionKey: string,
        scopeType: ConfigurationScopeType,
        scopeKey: string,
        forUpdate: boolean,
    ): Promise<OverrideRow | undefined> {
        let query = currentTrx()
            .from("configuration_overrides")
            .where("tenant_id", String(currentTenantId()))
            .where("definition_key", definitionKey)
            .where("scope_type", scopeType)
            .where("scope_key", scopeKey);
        if (forUpdate) query = query.forUpdate();
        return (await query.first()) as OverrideRow | undefined;
    }

    private previewHash(
        group: ConfigurationGroup,
        input: ConfigurationChangeInput,
        scopeKey: string,
        version: number,
        after: unknown,
    ): string {
        return fingerprint({
            tenant: String(currentTenantId()),
            group,
            key: input.key,
            scope_type: input.scope_type,
            scope_key: scopeKey,
            version,
            after,
            unset: input.unset === true,
            rollout_percent: input.rollout_percent ?? 100,
            expires_at: input.expires_at ?? null,
            reason: input.reason.trim(),
            approval_reference: input.approval_reference?.trim() ?? null,
        });
    }

    private async lock(definitionKey: string, scopeType: ConfigurationScopeType, scopeKey: string) {
        await currentTrx().rawQuery("SELECT pg_advisory_xact_lock(hashtext(?))", [
            `configuration:${String(currentTenantId())}:${definitionKey}:${scopeType}:${scopeKey}`,
        ]);
    }

    private async impact(definition: ConfigurationSettingDefinition) {
        const evidence: Array<{ source: string; count: number }> = [];
        if (definition.group === "urls") {
            for (const table of ["products", "content_posts"]) {
                const row = await currentTrx()
                    .from(table)
                    .where("tenant_id", String(currentTenantId()))
                    .count("id as count")
                    .first();
                evidence.push({ source: table, count: Number(row?.count ?? 0) });
            }
        }
        return {
            risk_level: definition.riskLevel,
            dependencies: definition.dependencies,
            side_effect_policy: definition.sideEffectPolicy,
            restart_requirement: definition.restartRequirement,
            evidence,
        };
    }
}
