import cache from "@adonisjs/cache/services/main";
import { DateTime } from "luxon";

import Setting, { type SettingValueType } from "#models/setting";
import { CacheKeys, CacheTags } from "#services/cache_keys";
import { currentTenantId, maybeTenantContext, maybeTenantId } from "#services/tenant_context";

export default class SettingsService {
    async get<T>(group: string, key: string, fallback: T): Promise<T> {
        const groupMap = await this.all(group);
        if (Object.hasOwn(groupMap, key)) return groupMap[key] as T;
        return fallback;
    }

    async set(group: string, key: string, value: unknown, type: SettingValueType): Promise<void> {
        const now = DateTime.utc().toSQL();
        const tenantId = currentTenantId();
        const trx = maybeTenantContext()!.trx;
        await trx
            .table("settings")
            .insert({
                tenant_id: tenantId,
                group_key: group,
                key,
                value: JSON.stringify(value),
                type,
                created_at: now,
                updated_at: now,
            })
            .onConflict(["tenant_id", "group_key", "key"])
            .merge(["value", "type", "updated_at"]);
        await this.invalidate(group);
    }

    async unset(group: string, key: string): Promise<void> {
        const tenantId = currentTenantId();
        const trx = maybeTenantContext()!.trx;
        await trx
            .from("settings")
            .where("tenant_id", String(tenantId))
            .where("group_key", group)
            .where("key", key)
            .delete();
        await this.invalidate(group);
    }

    async all(group: string): Promise<Record<string, unknown>> {
        const tenantId = maybeTenantId();
        const ctx = maybeTenantContext();
        return cache.getOrSet({
            key: CacheKeys.settings.group(group, tenantId),
            ttl: "24h",
            tags: [CacheTags.settingsGroup(group, tenantId)],
            factory: async () => {
                const rows = await Setting.query(ctx ? { client: ctx.trx } : {}).where("group_key", group);
                const map: Record<string, unknown> = {};
                for (const row of rows) map[row.key] = row.value;
                return map;
            },
        });
    }

    async invalidate(group: string, _key?: string): Promise<void> {
        await cache.delete({ key: CacheKeys.settings.group(group, maybeTenantId()) });
    }

    async clearCache(): Promise<void> {
        await cache.clear();
    }
}
