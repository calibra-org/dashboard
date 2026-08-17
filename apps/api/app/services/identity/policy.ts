import { currentTenantId, currentTrx } from "#services/tenant_context";

export interface IdentityPolicyConfig {
    code_length: number;
    ttl_seconds: number;
    max_attempts: number;
    resend_cooldown_seconds: number;
    risk_block_score: number;
    step_up_freshness_seconds: number;
}

export const DEFAULT_IDENTITY_POLICY: IdentityPolicyConfig = {
    code_length: 6,
    ttl_seconds: 300,
    max_attempts: 5,
    resend_cooldown_seconds: 60,
    risk_block_score: 80,
    step_up_freshness_seconds: 600,
};

function clamp(value: unknown, min: number, max: number, fallback: number) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.round(numeric))) : fallback;
}

export function normalizePolicyConfig(value: Record<string, unknown> | null | undefined): IdentityPolicyConfig {
    const source = value ?? {};
    return {
        code_length: clamp(source.code_length, 4, 8, DEFAULT_IDENTITY_POLICY.code_length),
        ttl_seconds: clamp(source.ttl_seconds, 60, 1800, DEFAULT_IDENTITY_POLICY.ttl_seconds),
        max_attempts: clamp(source.max_attempts, 1, 10, DEFAULT_IDENTITY_POLICY.max_attempts),
        resend_cooldown_seconds: clamp(source.resend_cooldown_seconds, 10, 600, DEFAULT_IDENTITY_POLICY.resend_cooldown_seconds),
        risk_block_score: clamp(source.risk_block_score, 20, 100, DEFAULT_IDENTITY_POLICY.risk_block_score),
        step_up_freshness_seconds: clamp(
            source.step_up_freshness_seconds,
            60,
            3600,
            DEFAULT_IDENTITY_POLICY.step_up_freshness_seconds,
        ),
    };
}

export async function resolveIdentityPolicy(purpose: string) {
    const row = await currentTrx()
        .from("identity_policies")
        .where("tenant_id", Number(currentTenantId()))
        .where("purpose", purpose)
        .where("enabled", true)
        .orderBy("version", "desc")
        .first();
    if (!row) {
        return { policy_key: "default", version: 1, methods: ["sms_otp", "email_otp"], config: DEFAULT_IDENTITY_POLICY };
    }
    return {
        policy_key: String(row.policy_key),
        version: Number(row.version),
        methods: Array.isArray(row.methods) ? row.methods.map(String) : JSON.parse(String(row.methods ?? "[]")),
        config: normalizePolicyConfig(typeof row.config === "object" ? row.config : JSON.parse(String(row.config ?? "{}"))),
    };
}

export async function createIdentityPolicy(input: {
    actorUserId: number;
    policyKey: string;
    purpose: string;
    methods: string[];
    config: Record<string, unknown>;
    enabled: boolean;
}) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const latest = await trx
        .from("identity_policies")
        .where("tenant_id", tenantId)
        .where("policy_key", input.policyKey)
        .max("version as version")
        .first();
    const version = Number(latest?.version ?? 0) + 1;
    const rows = await trx
        .table("identity_policies")
        .insert({
            tenant_id: tenantId,
            policy_key: input.policyKey,
            purpose: input.purpose,
            version,
            enabled: input.enabled,
            methods: JSON.stringify(input.methods),
            config: JSON.stringify(normalizePolicyConfig(input.config)),
            created_by: input.actorUserId,
        })
        .returning(["id", "policy_key", "purpose", "version", "enabled", "methods", "config", "created_at"]);
    return rows[0];
}
