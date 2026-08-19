import { currentTenantId, currentTrx } from "#services/tenant_context";

export const AGENTIC_GATEWAY_PERMISSIONS = [
    "agentic_gateway.view",
    "agentic_gateway.channels.manage",
    "agentic_gateway.principals.manage",
    "agentic_gateway.capabilities.manage",
    "agentic_gateway.conformance.run",
    "agentic_gateway.readiness.refresh",
    "agentic_gateway.access.manage",
] as const;
export type AgenticGatewayPermission = (typeof AGENTIC_GATEWAY_PERMISSIONS)[number];

export async function requireAgenticGatewayPermission(
    user: { id: string | number | bigint; role: string },
    permission: AgenticGatewayPermission,
) {
    if (user.role !== "admin")
        throw Object.assign(new Error("Admin access required"), { status: 403, code: "E_AGENTIC_ADMIN_REQUIRED" });
    const row = await currentTrx()
        .from("admin_permissions")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", Number(user.id))
        .where("permission", permission)
        .first();
    if (row && !Boolean(row.allowed))
        throw Object.assign(new Error("Agentic gateway permission denied"), { status: 403, code: "E_AGENTIC_PERMISSION_DENIED" });
}
