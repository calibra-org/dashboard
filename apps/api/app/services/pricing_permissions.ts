import { Exception } from "@adonisjs/core/exceptions";

import { currentTenantId, currentTrx } from "#services/tenant_context";

export const PRICING_PERMISSIONS = [
    "pricing.view",
    "pricing.propose",
    "pricing.approve",
    "pricing.activate",
    "pricing.freeze",
    "pricing.rollback",
    "pricing.simulate",
] as const;

export type PricingPermission = (typeof PRICING_PERMISSIONS)[number];

export async function hasPricingPermission(
    user: { id: string | number | bigint; role: string },
    permission: PricingPermission,
): Promise<boolean> {
    if (user.role !== "admin") return false;
    const row = await currentTrx()
        .from("admin_permissions")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", Number(user.id))
        .where("permission", permission)
        .first();
    return row ? Boolean(row.allowed) : true;
}

export async function requirePricingPermission(
    user: { id: string | number | bigint; role: string },
    permission: PricingPermission,
): Promise<void> {
    if (await hasPricingPermission(user, permission)) return;
    throw new Exception("Pricing permission denied", {
        status: 403,
        code: "E_PRICING_PERMISSION_DENIED",
    });
}
