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

async function permissionRow(user: HumanPrincipal, permission: MerchantMemoryPermission) {
    return currentTrx()
        .from("admin_permissions")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", Number(user.id))
        .where("permission", permission)
        .first();
}

export async function requireMerchantMemoryPermission(user: HumanPrincipal, permission: MerchantMemoryPermission) {
    if (user.role !== "admin") {
        throw new Exception("Admin access required", {
            status: 403,
            code: "E_MERCHANT_MEMORY_ADMIN_REQUIRED",
        });
    }

    const row = await permissionRow(user, permission);
    if (row && !row.allowed) {
        throw new Exception("Merchant memory permission denied", {
            status: 403,
            code: "E_MERCHANT_MEMORY_PERMISSION_DENIED",
        });
    }
}

export async function hasExplicitMerchantMemoryPermission(user: HumanPrincipal, permission: MerchantMemoryPermission) {
    if (user.role !== "admin") return false;
    const row = await permissionRow(user, permission);
    return Boolean(row?.allowed);
}

export async function requireExplicitMerchantMemoryPermission(user: HumanPrincipal, permission: MerchantMemoryPermission) {
    if (!(await hasExplicitMerchantMemoryPermission(user, permission))) {
        throw new Exception("Explicit merchant memory permission required", {
            status: 403,
            code: "E_MERCHANT_MEMORY_EXPLICIT_PERMISSION_REQUIRED",
        });
    }
}

export async function requireApprovedAgentPrincipal(principalKey: string) {
    const row = await currentTrx()
        .from("governance_agent_principals")
        .where("tenant_id", Number(currentTenantId()))
        .where("principal_key", principalKey)
        .where("enabled", true)
        .where("kill_switch", false)
        .first();

    if (!row) {
        throw new Exception("Approved agent principal required", {
            status: 403,
            code: "E_MERCHANT_MEMORY_AGENT_PRINCIPAL_REQUIRED",
        });
    }

    const access = Array.isArray(row.data_access_classes) ? row.data_access_classes.map(String) : [];
    if (!access.includes("merchant_memory") && !access.includes("merchant_memory.read")) {
        throw new Exception("Agent principal does not have merchant-memory data access", {
            status: 403,
            code: "E_MERCHANT_MEMORY_AGENT_SCOPE_DENIED",
        });
    }

    return { ...row, data_access_classes: access };
}
