import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { DISCOVERY_PERMISSIONS, type DiscoveryPermission } from "./domain.js";

function abilityName(permission: DiscoveryPermission) {
    return `discovery:${permission}`;
}
export async function discoveryPermissions(ctx: HttpContext): Promise<Record<DiscoveryPermission, boolean>> {
    const user = await ctx.auth.authenticate();
    const abilities = user.currentAccessToken?.abilities ?? ["*"];
    const unrestricted = abilities.length === 0 || abilities.includes("*") || abilities.includes("admin");
    return Object.fromEntries(
        DISCOVERY_PERMISSIONS.map((p) => [
            p,
            unrestricted || abilities.includes("discovery:*") || abilities.includes(abilityName(p)),
        ]),
    ) as Record<DiscoveryPermission, boolean>;
}
export async function requireDiscoveryPermission(ctx: HttpContext, permission: DiscoveryPermission) {
    const permissions = await discoveryPermissions(ctx);
    if (!permissions[permission])
        throw new Exception("شما دسترسی لازم برای این عملیات را ندارید", { status: 403, code: "E_DISCOVERY_FORBIDDEN" });
}
