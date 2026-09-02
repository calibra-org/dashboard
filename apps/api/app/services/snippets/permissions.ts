import { Exception } from "@adonisjs/core/exceptions";

import { currentTenantId, currentTrx } from "#services/tenant_context";

export const SNIPPETS_PERMISSIONS = [
    "snippets.view",
    "snippets.create",
    "snippets.edit",
    "snippets.validate",
    "snippets.publish",
    "snippets.rollback",
    "snippets.settings.manage",
    "snippets.safe_mode.manage",
    "snippets.execution.observe",
] as const;

export type SnippetsPermission = (typeof SNIPPETS_PERMISSIONS)[number];
type AdminPrincipal = { id: string | number | bigint; role: string };

export async function requireSnippetsPermission(user: AdminPrincipal, permission: SnippetsPermission) {
    if (user.role !== "admin") {
        throw new Exception("Admin access required", { status: 403, code: "E_SNIPPETS_ADMIN_REQUIRED" });
    }
    const row = await currentTrx()
        .from("admin_permissions")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", Number(user.id))
        .where("permission", permission)
        .first();
    if (row && !row.allowed) {
        throw new Exception("Snippets permission denied", { status: 403, code: "E_SNIPPETS_PERMISSION_DENIED" });
    }
}
