import { Exception } from "@adonisjs/core/exceptions";

import { currentTenantId, currentTrx } from "#services/tenant_context";

export const RELIABILITY_GUARDIAN_PERMISSIONS = [
    "reliability_guardian.view",
    "reliability_guardian.invariant.manage",
    "reliability_guardian.policy.manage",
    "reliability_guardian.cycle.run",
    "reliability_guardian.remediation.execute",
    "reliability_guardian.remediation.rollback",
] as const;

export type ReliabilityGuardianPermission = (typeof RELIABILITY_GUARDIAN_PERMISSIONS)[number];
type AdminPrincipal = { id: string | number | bigint; role: string };

export async function requireReliabilityGuardianPermission(user: AdminPrincipal, permission: ReliabilityGuardianPermission) {
    if (user.role !== "admin") {
        throw new Exception("Admin access required", { status: 403, code: "E_RELIABILITY_ADMIN_REQUIRED" });
    }
    const row = await currentTrx()
        .from("admin_permissions")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", Number(user.id))
        .where("permission", permission)
        .first();
    if (row && !row.allowed) {
        throw new Exception("Reliability Guardian permission denied", {
            status: 403,
            code: "E_RELIABILITY_PERMISSION_DENIED",
        });
    }
}
