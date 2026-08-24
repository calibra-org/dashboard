import { Exception } from "@adonisjs/core/exceptions";

import { currentTenantId, currentTrx } from "#services/tenant_context";

export const NETWORK_INTELLIGENCE_PERMISSIONS = [
    "network_intelligence.view",
    "network_intelligence.participation.manage",
    "network_intelligence.metrics.manage",
    "network_intelligence.contribute",
    "network_intelligence.export",
    "network_intelligence.security_review",
    "network_intelligence.access.manage",
] as const;

export type NetworkIntelligencePermission = (typeof NETWORK_INTELLIGENCE_PERMISSIONS)[number];

type AdminPrincipal = { id: string | number | bigint; role: string };

const ACCESS_PRESETS: Record<string, readonly NetworkIntelligencePermission[]> = {
    owner: NETWORK_INTELLIGENCE_PERMISSIONS,
    privacy_admin: [
        "network_intelligence.view",
        "network_intelligence.participation.manage",
        "network_intelligence.metrics.manage",
        "network_intelligence.export",
        "network_intelligence.security_review",
    ],
    contributor: ["network_intelligence.view", "network_intelligence.contribute"],
    viewer: ["network_intelligence.view"],
};

async function permissionRow(user: AdminPrincipal, permission: NetworkIntelligencePermission) {
    return currentTrx()
        .from("admin_permissions")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", Number(user.id))
        .where("permission", permission)
        .first();
}

export async function requireNetworkIntelligencePermission(user: AdminPrincipal, permission: NetworkIntelligencePermission) {
    if (user.role !== "admin") {
        throw new Exception("Admin access required", { status: 403, code: "E_NETWORK_ADMIN_REQUIRED" });
    }
    const row = await permissionRow(user, permission);
    if (row && !row.allowed) {
        throw new Exception("Network intelligence permission denied", {
            status: 403,
            code: "E_NETWORK_PERMISSION_DENIED",
        });
    }
}

function maskedIdentity(user: { id: number; email?: string | null; phone?: string | null }): string {
    if (user.email) return user.email.replace(/^(.{2}).*(@.*)$/, "$1••••$2");
    if (user.phone) return `${user.phone.slice(0, 4)}••••${user.phone.slice(-3)}`;
    return `#${user.id}`;
}

export async function listNetworkAccess() {
    const tenant = Number(currentTenantId());
    const trx = currentTrx();
    const [users, rows] = await Promise.all([
        trx.from("users").where({ tenant_id: tenant, role: "admin" }).whereNull("deleted_at").select("id", "email", "phone"),
        trx
            .from("admin_permissions")
            .where("tenant_id", tenant)
            .whereIn("permission", [...NETWORK_INTELLIGENCE_PERMISSIONS]),
    ]);
    return users.map((user) => {
        const own = rows.filter((row) => Number(row.user_id) === Number(user.id));
        const map = new Map(own.map((row) => [String(row.permission), Boolean(row.allowed)]));
        return {
            id: Number(user.id),
            identity: maskedIdentity({ id: Number(user.id), email: user.email, phone: user.phone }),
            permissions: Object.fromEntries(
                NETWORK_INTELLIGENCE_PERMISSIONS.map((permission) => [permission, map.get(permission) ?? true]),
            ),
        };
    });
}

export async function applyNetworkAccessPreset(actorUserId: number, targetUserId: number, preset: string) {
    if (actorUserId === targetUserId && preset !== "owner") {
        throw new Exception("Self lockout is forbidden", { status: 422, code: "E_NETWORK_SELF_LOCKOUT" });
    }
    const allowed = ACCESS_PRESETS[preset];
    if (!allowed) {
        throw new Exception("Unknown network access preset", { status: 422, code: "E_NETWORK_ACCESS_PRESET_INVALID" });
    }
    const tenant = Number(currentTenantId());
    const trx = currentTrx();
    const target = await trx
        .from("users")
        .where({ tenant_id: tenant, id: targetUserId, role: "admin" })
        .whereNull("deleted_at")
        .first();
    if (!target) {
        throw new Exception("Target admin not found in tenant", { status: 404, code: "E_NETWORK_ADMIN_NOT_FOUND" });
    }
    const allowedSet = new Set(allowed);
    for (const permission of NETWORK_INTELLIGENCE_PERMISSIONS) {
        await trx
            .table("admin_permissions")
            .insert({
                tenant_id: tenant,
                user_id: targetUserId,
                permission,
                allowed: allowedSet.has(permission),
                updated_by: actorUserId,
            })
            .onConflict(["tenant_id", "user_id", "permission"])
            .merge({ allowed: allowedSet.has(permission), updated_by: actorUserId, updated_at: new Date() });
    }
    return { updated: true, preset };
}
