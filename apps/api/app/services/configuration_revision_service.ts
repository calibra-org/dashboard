import { DateTime } from "luxon";

import type { SettingValueType } from "#models/setting";
import {
    configurationScopeForAuditAction,
    configurationScopeSettings,
    isConfigurationGroup,
    type ConfigurationScope,
    type ConfigurationScopeType,
} from "#services/configuration_registry";
import SettingsService from "#services/settings_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

interface SnapshotEntry {
    group: string;
    key: string;
    type: SettingValueType;
    exists: boolean;
    value: unknown;
    storage?: "settings" | "override";
    scope_type?: ConfigurationScopeType;
    scope_key?: string;
    version?: number;
}
interface StoredSnapshot {
    entries: SnapshotEntry[];
}
type RevisionSource = "baseline" | "update" | "rollback";
export interface ConfigurationRevisionView {
    id: number;
    scope: ConfigurationScope;
    revision: number;
    source: RevisionSource;
    rollback_of_revision: number | null;
    created_by_user_id: number | null;
    created_at: string;
    changed_keys: string[];
}
export interface ConfigurationDiffEntry {
    key: string;
    before: unknown;
    after: unknown;
    before_exists: boolean;
    after_exists: boolean;
}
export interface ConfigurationRevisionDetail extends ConfigurationRevisionView {
    snapshot: StoredSnapshot;
    diff: ConfigurationDiffEntry[];
}
interface CaptureOptions {
    source?: Exclude<RevisionSource, "baseline">;
    actorUserId?: bigint | number | null;
    rollbackOfRevision?: number | null;
}
interface RevisionRow {
    id: bigint | number | string;
    scope_key: ConfigurationScope;
    revision: number;
    source: RevisionSource;
    rollback_of_revision: number | null;
    snapshot: StoredSnapshot | string;
    created_by_user_id: bigint | number | string | null;
    created_at: Date | string;
}

function parseSnapshot(value: StoredSnapshot | string): StoredSnapshot {
    return typeof value === "string" ? (JSON.parse(value) as StoredSnapshot) : value;
}
function normalizeDate(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function sameValue(left: unknown, right: unknown): boolean {
    return left === right || JSON.stringify(left) === JSON.stringify(right);
}
function identity(entry: SnapshotEntry): string {
    return entry.storage === "override"
        ? `${entry.key}@${entry.scope_type}:${entry.scope_key}`
        : `${entry.group}.${entry.key}`;
}
function snapshotDiff(before: StoredSnapshot | null, after: StoredSnapshot): ConfigurationDiffEntry[] {
    if (before === null) return [];
    const beforeMap = new Map(before.entries.map((entry) => [identity(entry), entry]));
    const afterMap = new Map(after.entries.map((entry) => [identity(entry), entry]));
    const result: ConfigurationDiffEntry[] = [];
    for (const key of new Set([...beforeMap.keys(), ...afterMap.keys()])) {
        const previous = beforeMap.get(key);
        const next = afterMap.get(key);
        const beforeExists = previous?.exists ?? false;
        const afterExists = next?.exists ?? false;
        if (beforeExists === afterExists && sameValue(previous?.value, next?.value)) continue;
        result.push({
            key,
            before: previous?.value ?? null,
            after: next?.value ?? null,
            before_exists: beforeExists,
            after_exists: afterExists,
        });
    }
    return result.sort((left, right) => left.key.localeCompare(right.key));
}

export default class ConfigurationRevisionService {
    private settings = new SettingsService();

    async ensureBaseline(scope: ConfigurationScope, actorUserId?: bigint | number | null): Promise<void> {
        await this.lockScope(scope);
        if (await this.latest(scope)) return;
        await this.insert(scope, 1, await this.snapshot(scope), "baseline", actorUserId ?? null, null);
    }

    async capture(scope: ConfigurationScope, options: CaptureOptions = {}): Promise<ConfigurationRevisionDetail> {
        await this.lockScope(scope);
        return this.captureLocked(scope, options);
    }

    async list(scope?: ConfigurationScope, limit = 50): Promise<ConfigurationRevisionView[]> {
        const trx = currentTrx();
        const query = trx.from("configuration_revisions").where("tenant_id", String(currentTenantId()));
        if (scope) query.where("scope_key", scope);
        const rows = (await query.orderBy("created_at", "desc").orderBy("id", "desc").limit(limit)) as RevisionRow[];
        const result: ConfigurationRevisionView[] = [];
        for (const row of rows) {
            const previous = (await trx
                .from("configuration_revisions")
                .where("tenant_id", String(currentTenantId()))
                .where("scope_key", row.scope_key)
                .where("revision", "<", row.revision)
                .orderBy("revision", "desc")
                .first()) as RevisionRow | undefined;
            result.push(this.toView(row, previous ? parseSnapshot(previous.snapshot) : null));
        }
        return result;
    }

    async detail(scope: ConfigurationScope, revision: number): Promise<ConfigurationRevisionDetail | null> {
        const trx = currentTrx();
        const row = (await trx
            .from("configuration_revisions")
            .where("tenant_id", String(currentTenantId()))
            .where("scope_key", scope)
            .where("revision", revision)
            .first()) as RevisionRow | undefined;
        if (!row) return null;
        const previous = (await trx
            .from("configuration_revisions")
            .where("tenant_id", String(currentTenantId()))
            .where("scope_key", scope)
            .where("revision", "<", revision)
            .orderBy("revision", "desc")
            .first()) as RevisionRow | undefined;
        return this.toDetail(row, previous ? parseSnapshot(previous.snapshot) : null);
    }

    async rollback(
        scope: ConfigurationScope,
        revision: number,
        actorUserId?: bigint | number | null,
    ): Promise<{ changed: boolean; revision: ConfigurationRevisionDetail } | null> {
        await this.lockScope(scope);
        const target = await this.detail(scope, revision);
        if (!target) return null;
        const changed = isConfigurationGroup(scope)
            ? await this.restoreOverrides(scope, target.snapshot, Number(actorUserId ?? 0))
            : await this.restoreSettings(target.snapshot);
        const rollbackRevision = await this.captureLocked(scope, {
            source: "rollback",
            actorUserId,
            rollbackOfRevision: revision,
        });
        return { changed, revision: rollbackRevision };
    }

    private async captureLocked(scope: ConfigurationScope, options: CaptureOptions) {
        const latest = await this.latest(scope);
        const snapshot = await this.snapshot(scope);
        const row = await this.insert(
            scope,
            Number(latest?.revision ?? 0) + 1,
            snapshot,
            options.source ?? "update",
            options.actorUserId ?? null,
            options.rollbackOfRevision ?? null,
        );
        return this.toDetail(row, latest ? parseSnapshot(latest.snapshot) : null);
    }

    private async restoreSettings(snapshot: StoredSnapshot) {
        let changed = false;
        for (const entry of snapshot.entries.filter((candidate) => candidate.storage !== "override")) {
            const current = await this.settings.all(entry.group);
            const exists = Object.hasOwn(current, entry.key);
            if (entry.exists) {
                if (exists && sameValue(current[entry.key], entry.value)) continue;
                await this.settings.set(entry.group, entry.key, entry.value, entry.type);
                changed = true;
            } else if (exists) {
                await this.settings.unset(entry.group, entry.key);
                changed = true;
            }
        }
        return changed;
    }

    private async restoreOverrides(scope: ConfigurationScope, snapshot: StoredSnapshot, actorUserId: number) {
        const trx = currentTrx();
        const tenantId = currentTenantId();
        const targetEntries = snapshot.entries.filter(
            (entry) => entry.storage === "override" && entry.scope_type !== undefined && entry.scope_key !== undefined,
        );
        const targetMap = new Map(targetEntries.map((entry) => [identity(entry), entry]));
        const currentRows = await trx
            .from("configuration_overrides")
            .where("tenant_id", String(tenantId))
            .where("group_key", scope)
            .where("is_deleted", false);
        const currentMap = new Map(
            currentRows.map((row) => [`${row.definition_key}@${row.scope_type}:${row.scope_key}`, row]),
        );
        let changed = false;
        for (const key of new Set([...targetMap.keys(), ...currentMap.keys()])) {
            const target = targetMap.get(key);
            const current = currentMap.get(key);
            if (target && current && sameValue(target.value, current.value)) continue;
            changed = true;
            const now = DateTime.utc().toSQL();
            if (current) {
                await trx
                    .from("configuration_overrides")
                    .where("id", current.id)
                    .update({
                        value: target ? JSON.stringify(target.value) : null,
                        is_deleted: !target,
                        version: Number(current.version) + 1,
                        reason: "configuration rollback",
                        updated_by_user_id: actorUserId || null,
                        updated_at: now,
                    });
            } else if (target) {
                await trx.table("configuration_overrides").insert({
                    tenant_id: tenantId,
                    group_key: scope,
                    definition_key: target.key,
                    scope_type: target.scope_type,
                    scope_key: target.scope_key,
                    value: JSON.stringify(target.value),
                    value_type: target.type,
                    reason: "configuration rollback",
                    version: 1,
                    is_deleted: false,
                    rollout_percent: 100,
                    created_by_user_id: actorUserId || null,
                    updated_by_user_id: actorUserId || null,
                    created_at: now,
                    updated_at: now,
                });
            }
            if (scope === "urls") {
                await trx.table("configuration_url_redirect_history").insert({
                    tenant_id: tenantId,
                    definition_key: target?.key ?? String(current?.definition_key ?? "unknown"),
                    scope_type: target?.scope_type ?? current?.scope_type ?? "tenant",
                    scope_key: target?.scope_key ?? current?.scope_key ?? "default",
                    before_value: current ? JSON.stringify(current.value) : null,
                    after_value: target ? JSON.stringify(target.value) : null,
                    reason: "configuration rollback",
                    actor_user_id: actorUserId || null,
                    created_at: now,
                });
            }
        }
        return changed;
    }

    private async lockScope(scope: ConfigurationScope): Promise<void> {
        await currentTrx().rawQuery("SELECT pg_advisory_xact_lock(hashtext(?))", [
            `configuration:${String(currentTenantId())}:${scope}`,
        ]);
    }

    private async latest(scope: ConfigurationScope): Promise<RevisionRow | undefined> {
        return (await currentTrx()
            .from("configuration_revisions")
            .where("tenant_id", String(currentTenantId()))
            .where("scope_key", scope)
            .orderBy("revision", "desc")
            .first()) as RevisionRow | undefined;
    }

    private async insert(
        scope: ConfigurationScope,
        revision: number,
        snapshot: StoredSnapshot,
        source: RevisionSource,
        actorUserId: bigint | number | null,
        rollbackOfRevision: number | null,
    ): Promise<RevisionRow> {
        const rows = await currentTrx()
            .table("configuration_revisions")
            .insert({
                tenant_id: currentTenantId(),
                scope_key: scope,
                revision,
                source,
                rollback_of_revision: rollbackOfRevision,
                snapshot: JSON.stringify(snapshot),
                created_by_user_id: actorUserId,
                created_at: DateTime.utc().toSQL(),
            })
            .returning([
                "id",
                "scope_key",
                "revision",
                "source",
                "rollback_of_revision",
                "snapshot",
                "created_by_user_id",
                "created_at",
            ]);
        return rows[0] as RevisionRow;
    }

    private async snapshot(scope: ConfigurationScope): Promise<StoredSnapshot> {
        const trx = currentTrx();
        const tenantId = currentTenantId();
        const legacy = configurationScopeSettings(scope);
        const groups = [...new Set(legacy.map((definition) => definition.group))];
        const settingsRows = groups.length
            ? await trx
                  .from("settings")
                  .where("tenant_id", String(tenantId))
                  .whereIn("group_key", groups)
                  .select(["group_key", "key", "value"])
            : [];
        const settingsMap = new Map(settingsRows.map((row) => [`${row.group_key}.${row.key}`, row]));
        const entries: SnapshotEntry[] = legacy.map((definition) => {
            const row = settingsMap.get(`${definition.group}.${definition.key}`);
            return {
                ...definition,
                exists: row !== undefined,
                value: row?.value ?? null,
                storage: "settings",
            };
        });
        if (isConfigurationGroup(scope)) {
            const overrides = await trx
                .from("configuration_overrides")
                .where("tenant_id", String(tenantId))
                .where("group_key", scope)
                .where("is_deleted", false)
                .orderBy("definition_key", "asc")
                .orderBy("scope_type", "asc")
                .orderBy("scope_key", "asc");
            for (const row of overrides) {
                entries.push({
                    group: scope,
                    key: String(row.definition_key),
                    type: row.value_type as SettingValueType,
                    exists: true,
                    value: row.value,
                    storage: "override",
                    scope_type: row.scope_type as ConfigurationScopeType,
                    scope_key: String(row.scope_key),
                    version: Number(row.version),
                });
            }
        }
        return { entries };
    }

    private toView(row: RevisionRow, previous: StoredSnapshot | null): ConfigurationRevisionView {
        const snapshot = parseSnapshot(row.snapshot);
        return {
            id: Number(row.id),
            scope: row.scope_key,
            revision: Number(row.revision),
            source: row.source,
            rollback_of_revision: row.rollback_of_revision === null ? null : Number(row.rollback_of_revision),
            created_by_user_id: row.created_by_user_id === null ? null : Number(row.created_by_user_id),
            created_at: normalizeDate(row.created_at),
            changed_keys: snapshotDiff(previous, snapshot).map((entry) => entry.key),
        };
    }

    private toDetail(row: RevisionRow, previous: StoredSnapshot | null): ConfigurationRevisionDetail {
        const snapshot = parseSnapshot(row.snapshot);
        return { ...this.toView(row, previous), snapshot, diff: snapshotDiff(previous, snapshot) };
    }
}

export async function captureConfigurationRevisionForAuditAction(
    action: string,
    actorUserId?: bigint | number | null,
): Promise<void> {
    const scope = configurationScopeForAuditAction(action);
    if (scope) await new ConfigurationRevisionService().capture(scope, { actorUserId });
}
