import { Exception } from "@adonisjs/core/exceptions";

import { currentTenantId, currentTrx } from "#services/tenant_context";

export const PRODUCT_PASSPORT_PERMISSIONS = [
    "product_passport.view",
    "product_passport.manage",
    "product_passport.evidence.manage",
    "product_passport.evidence.verify",
    "product_passport.publish",
    "product_passport.revoke",
    "product_passport.regulatory.manage",
    "product_passport.access.manage",
] as const;

export type ProductPassportPermission = (typeof PRODUCT_PASSPORT_PERMISSIONS)[number];
type AdminPrincipal = { id: string | number | bigint; role: string };

const ACCESS_PRESETS: Record<string, readonly ProductPassportPermission[]> = {
    owner: PRODUCT_PASSPORT_PERMISSIONS,
    compliance: [
        "product_passport.view",
        "product_passport.manage",
        "product_passport.evidence.manage",
        "product_passport.evidence.verify",
        "product_passport.publish",
        "product_passport.revoke",
        "product_passport.regulatory.manage",
    ],
    operator: ["product_passport.view", "product_passport.manage", "product_passport.evidence.manage"],
    viewer: ["product_passport.view"],
};

async function permissionRow(user: AdminPrincipal, permission: ProductPassportPermission) {
    return currentTrx()
        .from("admin_permissions")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", Number(user.id))
        .where("permission", permission)
        .first();
}

export async function requireProductPassportPermission(user: AdminPrincipal, permission: ProductPassportPermission) {
    if (user.role !== "admin") {
        throw new Exception("Admin access required", { status: 403, code: "E_PRODUCT_PASSPORT_ADMIN_REQUIRED" });
    }
    const row = await permissionRow(user, permission);
    if (row && !row.allowed) {
        throw new Exception("Product passport permission denied", {
            status: 403,
            code: "E_PRODUCT_PASSPORT_PERMISSION_DENIED",
        });
    }
}

function maskedIdentity(user: { id: number; email?: string | null; phone?: string | null }) {
    if (user.email) return user.email.replace(/^(.{2}).*(@.*)$/, "$1••••$2");
    if (user.phone) return `${user.phone.slice(0, 4)}••••${user.phone.slice(-3)}`;
    return `#${user.id}`;
}

export async function listProductPassportAccess() {
    const tenant = Number(currentTenantId());
    const trx = currentTrx();
    const [users, rows] = await Promise.all([
        trx.from("users").where({ tenant_id: tenant, role: "admin" }).whereNull("deleted_at").select("id", "email", "phone"),
        trx
            .from("admin_permissions")
            .where("tenant_id", tenant)
            .whereIn("permission", [...PRODUCT_PASSPORT_PERMISSIONS]),
    ]);
    return users.map((user) => {
        const map = new Map(
            rows
                .filter((row) => Number(row.user_id) === Number(user.id))
                .map((row) => [String(row.permission), Boolean(row.allowed)]),
        );
        return {
            id: Number(user.id),
            identity: maskedIdentity({ id: Number(user.id), email: user.email, phone: user.phone }),
            permissions: Object.fromEntries(
                PRODUCT_PASSPORT_PERMISSIONS.map((permission) => [permission, map.get(permission) ?? true]),
            ),
        };
    });
}

export async function applyProductPassportAccessPreset(actorUserId: number, targetUserId: number, preset: string) {
    if (actorUserId === targetUserId && preset !== "owner") {
        throw new Exception("Self lockout is forbidden", { status: 422, code: "E_PRODUCT_PASSPORT_SELF_LOCKOUT" });
    }
    const allowed = ACCESS_PRESETS[preset];
    if (!allowed) {
        throw new Exception("Unknown product passport access preset", {
            status: 422,
            code: "E_PRODUCT_PASSPORT_ACCESS_PRESET_INVALID",
        });
    }
    const tenant = Number(currentTenantId());
    const trx = currentTrx();
    const target = await trx
        .from("users")
        .where({ tenant_id: tenant, id: targetUserId, role: "admin" })
        .whereNull("deleted_at")
        .first();
    if (!target) {
        throw new Exception("Target admin not found in tenant", { status: 404, code: "E_PRODUCT_PASSPORT_ADMIN_NOT_FOUND" });
    }
    const allowedSet = new Set(allowed);
    for (const permission of PRODUCT_PASSPORT_PERMISSIONS) {
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
