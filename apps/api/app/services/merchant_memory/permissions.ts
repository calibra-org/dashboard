import { Exception } from "@adonisjs/core/exceptions";

import { currentTenantId, currentTrx } from "#services/tenant_context";

export const MERCHANT_MEMORY_PERMISSIONS = [
    "merchant_memory.view",
    "merchant_memory.create",
    "merchant_memory.supersede",
    "merchant_memory.retrieve",
    "merchant_memory.restricted",
    "merchant_memory.effectiveness",
] as const;

export type MerchantMemoryPermission = (typeof MERCHANT_MEMORY_PERMISSIONS)[number];

type HumanPrincipal = { id: string | number | bigint; role: string };

export async function hasMerchantMemoryPermission(user: HumanPrincipal, permission: MerchantMemoryPermission) {
    if (user.role !== "admin") return false;
    const row = await currentTrx()
        .from("admin_permissions")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", Number(user.id))
        .where("permission", permission)
        .first();
    return row ? Boolean(row.allowed) : permission !== "merchant_memory.restricted";
}

export async function requireMerchantMemoryPermission(user: HumanPrincipal, permission: MerchantMemoryPermission) {
    if (await hasMerchantMemoryPermission(user, permission)) return;
    throw new Exception("Merchant memory permission denied", {
        status: 403,
        code: "E_MERCHANT_MEMORY_PERMISSION_DENIED",
    });
}
