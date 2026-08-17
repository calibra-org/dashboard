import { currentTenantId, currentTrx } from "#services/tenant_context";

export const IDENTITY_PERMISSIONS = [
    "identity.view",
    "identity.verifications.view",
    "identity.policies.manage",
    "identity.providers.view",
    "identity.providers.manage",
    "identity.sessions.view",
    "identity.sessions.revoke",
    "identity.credentials.view",
    "identity.credentials.revoke",
    "identity.risk.view",
    "identity.risk.manage",
    "identity.audit.view",
    "identity.analytics.view",
    "identity.settings.view",
    "identity.settings.manage",
    "identity.sms.view",
    "identity.sms.manage",
    "identity.sms.test",
] as const;

export type IdentityPermission = (typeof IDENTITY_PERMISSIONS)[number];

const PRESETS: Record<string, readonly IdentityPermission[]> = {
    owner: IDENTITY_PERMISSIONS,
    security: IDENTITY_PERMISSIONS.filter((permission) => !["identity.sms.manage"].includes(permission)),
    support: [
        "identity.view",
        "identity.verifications.view",
        "identity.providers.view",
        "identity.sessions.view",
        "identity.sessions.revoke",
        "identity.credentials.view",
        "identity.risk.view",
        "identity.audit.view",
        "identity.sms.view",
    ],
    viewer: [
        "identity.view",
        "identity.verifications.view",
        "identity.providers.view",
        "identity.sessions.view",
        "identity.credentials.view",
        "identity.risk.view",
        "identity.audit.view",
        "identity.analytics.view",
        "identity.settings.view",
        "identity.sms.view",
    ],
};

export async function hasIdentityPermission(
    user: { id: string | number | bigint; role: string },
    permission: IdentityPermission,
) {
    if (user.role !== "admin") return false;
    const row = await currentTrx()
        .from("admin_permissions")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", Number(user.id))
        .where("permission", permission)
        .first();
    return row ? Boolean(row.allowed) : true;
}

export async function requireIdentityPermission(
    user: { id: string | number | bigint; role: string },
    permission: IdentityPermission,
): Promise<void> {
    if (!(await hasIdentityPermission(user, permission))) {
        const error = new Error("Identity permission denied") as Error & { status?: number; code?: string };
        error.status = 403;
        error.code = "E_IDENTITY_PERMISSION_DENIED";
        throw error;
    }
}

export async function listIdentityAccess() {
    const tenantId = Number(currentTenantId());
    const users = await currentTrx()
        .from("users")
        .where("tenant_id", tenantId)
        .where("role", "admin")
        .whereNull("deleted_at")
        .select("id", "email", "phone");
    const overrides = await currentTrx().from("admin_permissions").where("tenant_id", tenantId);
    return users.map((user) => {
        const permissionMap = new Map<string, boolean>();
        for (const row of overrides)
            if (Number(row.user_id) === Number(user.id)) permissionMap.set(String(row.permission), Boolean(row.allowed));
        const permissions = Object.fromEntries(
            IDENTITY_PERMISSIONS.map((permission) => [permission, permissionMap.get(permission) ?? true]),
        );
        return {
            id: Number(user.id),
            identity: user.email
                ? String(user.email).replace(/^(.{2}).*(@.*)$/, "$1••••$2")
                : user.phone
                  ? `${String(user.phone).slice(0, 4)}••••${String(user.phone).slice(-3)}`
                  : `#${user.id}`,
            permissions,
        };
    });
}

export async function applyIdentityPreset(actorUserId: number, targetUserId: number, preset: keyof typeof PRESETS) {
    if (actorUserId === targetUserId && preset !== "owner") {
        const error = new Error("You cannot remove your own full identity access") as Error & { status?: number; code?: string };
        error.status = 422;
        error.code = "E_IDENTITY_SELF_LOCKOUT";
        throw error;
    }
    const allowed = new Set(PRESETS[preset] ?? PRESETS.viewer);
    const tenantId = Number(currentTenantId());
    const trx = currentTrx();
    const target = await trx
        .from("users")
        .where("tenant_id", tenantId)
        .where("id", targetUserId)
        .where("role", "admin")
        .whereNull("deleted_at")
        .first();
    if (!target) {
        const error = new Error("Target admin was not found in this tenant") as Error & { status?: number; code?: string };
        error.status = 404;
        error.code = "E_IDENTITY_ADMIN_NOT_FOUND";
        throw error;
    }
    for (const permission of IDENTITY_PERMISSIONS) {
        await trx
            .table("admin_permissions")
            .insert({
                tenant_id: tenantId,
                user_id: targetUserId,
                permission,
                allowed: allowed.has(permission),
                updated_by: actorUserId,
            })
            .onConflict(["tenant_id", "user_id", "permission"])
            .merge(["allowed", "updated_by", "updated_at"]);
    }
}
