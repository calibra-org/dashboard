import { DateTime } from "luxon";

import { currentTenantId, currentTrx } from "#services/tenant_context";
import { Phase9ValidationError } from "#services/phase9_personalization_service";

export default class Phase9GovernanceService {
    async listFeatures() {
        return currentTrx().from("personalization_feature_registry").orderBy("feature_key", "asc");
    }

    async upsertFeature(input: Record<string, unknown>, _actorUserId?: number | null) {
        const key = registryKey(input.feature_key);
        const source = String(input.source ?? "").trim();
        if (source.length < 2 || source.length > 96) throw new Phase9ValidationError("invalid_feature_source");
        const freshness = input.freshness_seconds == null ? null : Number(input.freshness_seconds);
        if (freshness !== null && (!Number.isInteger(freshness) || freshness < 0))
            throw new Phase9ValidationError("invalid_feature_freshness");
        const now = DateTime.utc().toSQL();
        await currentTrx()
            .table("personalization_feature_registry")
            .insert({
                tenant_id: currentTenantId(),
                feature_key: key,
                source,
                freshness_seconds: freshness,
                sensitive: input.sensitive === true,
                enabled: input.enabled !== false,
                metadata: JSON.stringify(safeObject(input.metadata)),
                created_at: now,
                updated_at: now,
            })
            .onConflict(["tenant_id", "feature_key"])
            .merge({
                source,
                freshness_seconds: freshness,
                sensitive: input.sensitive === true,
                enabled: input.enabled !== false,
                metadata: JSON.stringify(safeObject(input.metadata)),
                updated_at: now,
            });
        return currentTrx().from("personalization_feature_registry").where("feature_key", key).first();
    }

    async listPolicies() {
        return currentTrx().from("personalization_policies").orderBy("policy_key", "asc").orderBy("version", "desc");
    }

    async createPolicy(input: Record<string, unknown>, actorUserId?: number | null) {
        const key = registryKey(input.policy_key);
        const trx = currentTrx();
        const latest = await trx.from("personalization_policies").where("policy_key", key).max("version as version").first();
        const [row] = await trx
            .table("personalization_policies")
            .insert({
                tenant_id: currentTenantId(),
                policy_key: key,
                version: Number(latest?.version ?? 0) + 1,
                status: "draft",
                config: JSON.stringify(safeObject(input.config)),
                reason_code_version: "v1",
                created_by_user_id: actorUserId ?? null,
                created_at: DateTime.utc().toSQL(),
            })
            .returning("*");
        return row;
    }

    async listModels() {
        return currentTrx().from("personalization_models").orderBy("model_key", "asc").orderBy("created_at", "desc");
    }

    async createModel(input: Record<string, unknown>, actorUserId?: number | null) {
        const key = registryKey(input.model_key);
        const version = String(input.version ?? "").trim();
        if (!/^[a-zA-Z0-9._-]{1,64}$/.test(version)) throw new Phase9ValidationError("invalid_model_version");
        const [row] = await currentTrx()
            .table("personalization_models")
            .insert({
                tenant_id: currentTenantId(),
                model_key: key,
                version,
                status: "draft",
                config: JSON.stringify(safeObject(input.config)),
                rollout_percent: 0,
                created_by_user_id: actorUserId ?? null,
                created_at: DateTime.utc().toSQL(),
            })
            .returning("*");
        return row;
    }

    async listRollouts() {
        return currentTrx().from("personalization_rollouts").orderBy("created_at", "desc");
    }

    async activate(
        kind: "policy" | "model",
        keyValue: string,
        versionValue: string,
        percentage: number,
        actorUserId?: number | null,
    ) {
        const key = registryKey(keyValue);
        const percentageSafe = Math.max(0, Math.min(100, Math.round(percentage)));
        const trx = currentTrx();
        const table = kind === "policy" ? "personalization_policies" : "personalization_models";
        const keyColumn = kind === "policy" ? "policy_key" : "model_key";
        const target = await trx
            .from(table)
            .where(keyColumn, key)
            .where("version", kind === "policy" ? Number(versionValue) : versionValue)
            .forUpdate()
            .first();
        if (!target) throw new Phase9ValidationError("registry_version_not_found");
        const active = await trx.from(table).where(keyColumn, key).where("status", "active").first();
        await trx.from(table).where(keyColumn, key).where("status", "active").update({ status: "retired" });
        await trx
            .from(table)
            .where("id", target.id)
            .update({
                status: "active",
                activated_at: DateTime.utc().toSQL(),
                ...(kind === "model" ? { rollout_percent: percentageSafe } : {}),
            });
        await trx
            .from("personalization_rollouts")
            .where("kind", kind)
            .where("registry_key", key)
            .where("status", "active")
            .update({
                status: "completed",
                ended_at: DateTime.utc().toSQL(),
            });
        await trx.table("personalization_rollouts").insert({
            tenant_id: currentTenantId(),
            kind,
            registry_key: key,
            from_version: active ? String(active.version) : null,
            to_version: String(target.version),
            percentage: percentageSafe,
            status: "active",
            created_by_user_id: actorUserId ?? null,
            started_at: DateTime.utc().toSQL(),
            created_at: DateTime.utc().toSQL(),
        });
        return trx.from(table).where("id", target.id).first();
    }

    async rollback(kind: "policy" | "model", keyValue: string, actorUserId?: number | null) {
        const key = registryKey(keyValue);
        const trx = currentTrx();
        const table = kind === "policy" ? "personalization_policies" : "personalization_models";
        const keyColumn = kind === "policy" ? "policy_key" : "model_key";
        const active = await trx.from(table).where(keyColumn, key).where("status", "active").forUpdate().first();
        if (!active) throw new Phase9ValidationError("active_registry_version_not_found");
        const previous = await trx
            .from(table)
            .where(keyColumn, key)
            .whereNot("id", active.id)
            .orderBy("activated_at", "desc")
            .orderBy("id", "desc")
            .first();
        if (!previous) throw new Phase9ValidationError("rollback_version_not_found");
        await trx.from(table).where("id", active.id).update({ status: "retired" });
        await trx
            .from(table)
            .where("id", previous.id)
            .update({
                status: "active",
                activated_at: DateTime.utc().toSQL(),
                ...(kind === "model" ? { rollout_percent: 100 } : {}),
            });
        await trx
            .from("personalization_rollouts")
            .where("kind", kind)
            .where("registry_key", key)
            .where("status", "active")
            .update({
                status: "rolled_back",
                ended_at: DateTime.utc().toSQL(),
            });
        await trx.table("personalization_rollouts").insert({
            tenant_id: currentTenantId(),
            kind,
            registry_key: key,
            from_version: String(active.version),
            to_version: String(previous.version),
            percentage: 100,
            status: "completed",
            created_by_user_id: actorUserId ?? null,
            started_at: DateTime.utc().toSQL(),
            ended_at: DateTime.utc().toSQL(),
            created_at: DateTime.utc().toSQL(),
        });
        return previous;
    }
}

function registryKey(value: unknown) {
    const key = String(value ?? "").trim();
    if (!/^[a-zA-Z0-9._-]{2,64}$/.test(key)) throw new Phase9ValidationError("invalid_registry_key");
    return key;
}
function safeObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
