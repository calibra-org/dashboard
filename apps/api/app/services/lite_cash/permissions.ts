import { Exception } from "@adonisjs/core/exceptions";

import { currentTenantId, currentTrx } from "#services/tenant_context";

export const LITE_CASH_PERMISSIONS = [
    "lite_cash.view",
    "lite_cash.policy.manage",
    "lite_cash.purge.execute",
    "lite_cash.purge.broad",
    "lite_cash.warm.manage",
    "lite_cash.profile.manage",
    "lite_cash.settings.manage",
    "lite_cash.observation.write",
    "lite_cash.snapshot.manage",
] as const;

export type LiteCashPermission = (typeof LITE_CASH_PERMISSIONS)[number];
type AdminPrincipal = { id: string | number | bigint; role: string };

export async function requireLiteCashPermission(user: AdminPrincipal, permission: LiteCashPermission) {
    if (user.role !== "admin") {
        throw new Exception("Admin access required", { status: 403, code: "E_LITE_CASH_ADMIN_REQUIRED" });
    }
    const row = await currentTrx()
        .from("admin_permissions")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", Number(user.id))
        .where("permission", permission)
        .first();
    if (row && !row.allowed) {
        throw new Exception("lite cash permission denied", { status: 403, code: "E_LITE_CASH_PERMISSION_DENIED" });
    }
}
