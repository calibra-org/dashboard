import { currentTenantId, currentTrx } from "#services/tenant_context";

export const TRUST_PERMISSIONS = [
    "trust.view",
    "trust.cases.assign",
    "trust.cases.review",
    "trust.cases.override",
    "trust.sensitive.view",
    "trust.policies.manage",
    "trust.models.manage",
    "trust.outcomes.record",
    "trust.scan.run",
    "trust.access.manage",
] as const;

export type TrustPermission = (typeof TRUST_PERMISSIONS)[number];

const PRESETS: Record<string, readonly TrustPermission[]> = {
    owner: TRUST_PERMISSIONS,
    risk_admin: TRUST_PERMISSIONS.filter((permission) => permission !== "trust.access.manage"),
    reviewer: ["trust.view", "trust.cases.assign", "trust.cases.review", "trust.outcomes.record"],
    analyst: ["trust.view"],
};

export async function hasTrustPermission(user: { id: string | number | bigint; role: string }, permission: TrustPermission) {
    if (user.role !== "admin") return false;
    const row = await currentTrx()
        .from("admin_permissions")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", Number(user.id))
        .where("permission", permission)
        .first();
    return row ? Boolean(row.allowed) : true;
}

export async function requireTrustPermission(
    user: { id: string | number | bigint; role: string },
    permission: TrustPermission,
): Promise<void> {
    if (await hasTrustPermission(user, permission)) return;
    throw Object.assign(new Error("Trust permission denied"), { status: 403, code: "E_TRUST_PERMISSION_DENIED" });
}

export async function listTrustAccess() {
    const tenantId = Number(currentTenantId());
    const users = await currentTrx()
        .from("users")
        .where("tenant_id", tenantId)
        .where("role", "admin")
        .whereNull("deleted_at")
        .select("id", "email", "phone");
    const overrides = await currentTrx()
        .from("admin_permissions")
        .where("tenant_id", tenantId)
        .whereIn("permission", [...TRUST_PERMISSIONS]);
    return users.map((user) => {
        const permissionMap = new Map<string, boolean>();
        for (const row of overrides)
            if (Number(row.user_id) === Number(user.id)) permissionMap.set(String(row.permission), Boolean(row.allowed));
        return {
            id: Number(user.id),
            identity: user.email
                ? String(user.email).replace(/^(.{2}).*(@.*)$/, "$1••••$2")
                : user.phone
                  ? `${String(user.phone).slice(0, 4)}••••${String(user.phone).slice(-3)}`
                  : `#${user.id}`,
            permissions: Object.fromEntries(
                TRUST_PERMISSIONS.map((permission) => [permission, permissionMap.get(permission) ?? true]),
            ),
        };
    });
}

export async function applyTrustPreset(actorUserId: number, targetUserId: number, preset: keyof typeof PRESETS) {
    if (actorUserId === targetUserId && preset !== "owner") {
        throw Object.assign(new Error("You cannot remove your own full trust access"), {
            status: 422,
            code: "E_TRUST_SELF_LOCKOUT",
        });
    }
    const allowed = new Set(PRESETS[preset] ?? PRESETS.analyst);
    const tenantId = Number(currentTenantId());
    const trx = currentTrx();
    const target = await trx
        .from("users")
        .where("tenant_id", tenantId)
        .where("id", targetUserId)
        .where("role", "admin")
        .whereNull("deleted_at")
        .first();
    if (!target)
        throw Object.assign(new Error("Target admin was not found in this tenant"), {
            status: 404,
            code: "E_TRUST_ADMIN_NOT_FOUND",
        });
    for (const permission of TRUST_PERMISSIONS) {
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
