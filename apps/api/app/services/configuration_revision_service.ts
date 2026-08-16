import { DateTime } from "luxon";

import type { SettingValueType } from "#models/setting";
import {
    configurationScopeForAuditAction,
    configurationScopeSettings,
    type ConfigurationScope,
} from "#services/configuration_registry";
import SettingsService from "#services/settings_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

interface SnapshotEntry {
    group: string;
    key: string;
    type: SettingValueType;
    exists: boolean;
    value: unknown;
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
    id: string | number;
    scope_key: ConfigurationScope;
    revision: number;
    source: RevisionSource;
    rollback_of_revision: number | null;
    snapshot: StoredSnapshot | string;
    created_by_user_id: string | number | null;
    created_at: Date | string;
}

function parseSnapshot(value: StoredSnapshot | string): StoredSnapshot {
    if (typeof value === "string") return JSON.parse(value) as StoredSnapshot;
    return value;
}

function normalizeDate(value: Date | string): string {
    if (value instanceof Date) return value.toISOString();
    return new Date(value).toISOString();
}

function sameValue(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    return JSON.stringify(left) === JSON.stringify(right);
}

function snapshotDiff(before: StoredSnapshot | null, after: StoredSnapshot): ConfigurationDiffEntry[] {
    if (before === null) return [];
    const beforeMap = new Map(before.entries.map((entry) => [`${entry.group}.${entry.key}`, entry]));
    const changes: ConfigurationDiffEntry[] = [];
    for (const entry of after.entries) {
        const key = `${entry.group}.${entry.key}`;
        const previous = beforeMap.get(key);
        const beforeExists = previous?.exists ?? false;
        if (beforeExists === entry.exists && sameValue(previous?.value, entry.value)) continue;
        changes.push({
            key,
            before: previous?.value ?? null,
            after: entry.value,
            before_exists: beforeExists,
            after_exists: entry.exists,
        });
    }
    return changes;
}

export default class ConfigurationRevisionService {
    private settings = new SettingsService();

    async ensureBaseline(scope: ConfigurationScope, actorUserId?: bigint | number | null): Promise<void> {
        await this.lockScope(scope);
        const latest = await this.latest(scope);
        if (latest) return;
        const snapshot = await this.snapshot(scope);
        await this.insert(scope, 1, snapshot, "baseline", actorUserId ?? null, null);
    }

    async capture(scope: ConfigurationScope, options: CaptureOptions = {}): Promise<ConfigurationRevisionDetail> {
        await this.lockScope(scope);
        const latest = await this.latest(scope);
        const snapshot = await this.snapshot(scope);
        const revision = Number(latest?.revision ?? 0) + 1;
        const inserted = await this.insert(
            scope,
            revision,
            snapshot,
            options.source ?? "update",
            options.actorUserId ?? null,
            options.rollbackOfRevision ?? null,
        );
        return this.toDetail(inserted, latest ? parseSnapshot(latest.snapshot) : null);
    }

    async list(scope?: ConfigurationScope, limit = 50): Promise<ConfigurationRevisionView[]> {
        const trx = currentTrx();
        const tenantId = currentTenantId();
        const query = trx.from("configuration_revisions").where("tenant_id", String(tenantId));
        if (scope) query.where("scope_key", scope);
        const rows = (await query.orderBy("created_at", "desc").orderBy("id", "desc").limit(limit)) as RevisionRow[];
        const result: ConfigurationRevisionView[] = [];
        for (const row of rows) {
            const previous = (await trx
                .from("configuration_revisions")
                .where("tenant_id", String(tenantId))
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
        const tenantId = currentTenantId();
        const row = (await trx
            .from("configuration_revisions")
            .where("tenant_id", String(tenantId))
            .where("scope_key", scope)
            .where("revision", revision)
            .first()) as RevisionRow | undefined;
        if (!row) return null;
        const previous = (await trx
            .from("configuration_revisions")
            .where("tenant_id", String(tenantId))
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

        let changed = false;
        const grouped = new Map<string, Record<string, unknown>>();
        for (const entry of target.snapshot.entries) {
            if (!grouped.has(entry.group)) grouped.set(entry.group, await this.settings.all(entry.group));
            const current = grouped.get(entry.group)!;
            const exists = Object.hasOwn(current, entry.key);
            if (entry.exists) {
                if (exists && sameValue(current[entry.key], entry.value)) continue;
                await this.settings.set(entry.group, entry.key, entry.value, entry.type);
                current[entry.key] = entry.value;
                changed = true;
            } else if (exists) {
                await this.settings.unset(entry.group, entry.key);
                delete current[entry.key];
                changed = true;
            }
        }

        const rollbackRevision = await this.capture(scope, {
            source: "rollback",
            actorUserId,
            rollbackOfRevision: revision,
        });
        return { changed, revision: rollbackRevision };
    }

    private async lockScope(scope: ConfigurationScope): Promise<void> {
        const trx = currentTrx();
        const tenantId = currentTenantId();
        await trx.rawQuery("SELECT pg_advisory_xact_lock(hashtext(?))", [`configuration:${String(tenantId)}:${scope}`]);
    }

    private async latest(scope: ConfigurationScope): Promise<RevisionRow | undefined> {
        const trx = currentTrx();
        return (await trx
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
        const trx = currentTrx();
        const inserted = await trx
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
            .returning(["id", "scope_key", "revision", "source", "rollback_of_revision", "snapshot", "created_by_user_id", "created_at"]);
        return inserted[0] as RevisionRow;
    }

    private async snapshot(scope: ConfigurationScope): Promise<StoredSnapshot> {
        const trx = currentTrx();
        const tenantId = currentTenantId();
        const definitions = configurationScopeSettings(scope);
        const groups = [...new Set(definitions.map((definition) => definition.group))];
        const rows = (await trx
            .from("settings")
            .where("tenant_id", String(tenantId))
            .whereIn("group_key", groups)
            .select(["group_key", "key", "value"])) as Array<{ group_key: string; key: string; value: unknown }>;
        const rowMap = new Map(rows.map((row) => [`${row.group_key}.${row.key}`, row]));
        return {
            entries: definitions.map((definition) => {
                const row = rowMap.get(`${definition.group}.${definition.key}`);
                return { ...definition, exists: row !== undefined, value: row?.value ?? null };
            }),
        };
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
    if (!scope) return;
    await new ConfigurationRevisionService().capture(scope, { actorUserId });
}
